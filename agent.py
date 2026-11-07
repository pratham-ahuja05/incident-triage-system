"""Triage decision layer.

Default (AGENT_MODE=tools): an LLM agent with function calling. It searches the knowledge base
(possibly more than once, reformulating the query), then ends by calling suggest_fix or escalate,
classifying severity and category in the same call.

Guardrails are enforced in code, not trusted to the prompt:
- suggest_fix must cite an incident that search actually returned, within DISTANCE_THRESHOLD.
- The loop is capped at MAX_AGENT_STEPS.
- Provider down / rate limited -> escalate without AI. Malformed agent output -> the fixed pipeline below.

AGENT_MODE=pipeline runs the older fixed pipeline: retrieve top-1 -> threshold -> LLM yes/no -> classify.
"""

import os
import json
import time
import groq
import requests
from dotenv import load_dotenv
from classifier import classify_incident
from retrieval import retrieve_similar_incidents
from llm import LLMUnavailable, _extract_json, chat_json, chat_tools

load_dotenv()
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
AGENT_MODE = os.getenv("AGENT_MODE", "tools")

DISTANCE_THRESHOLD = 0.4
TOP_K = 3
MAX_AGENT_STEPS = 4
SEVERITIES = ["critical", "high", "medium", "low"]
CATEGORIES = ["database", "network", "authentication", "application-error", "infrastructure"]


class AgentError(Exception):
    """The agent produced something unusable (no tool call, bad arguments, step limit)."""


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def triage(alert_message: str) -> dict:
    """Full triage result: decision, matched incident, severity, category, timings."""
    if AGENT_MODE == "pipeline":
        return {**pipeline_triage(alert_message), "agent": "pipeline"}
    try:
        return {**agent_decision(alert_message), "agent": "tools"}
    except LLMUnavailable as e:
        print(f"[AGENT] LLM unavailable, escalating without AI: {e}")
        return {**_escalate_without_ai(alert_message, str(e)), "agent": "fallback"}
    except Exception as e:
        print(f"[AGENT] agent failed ({type(e).__name__}: {e}), falling back to the fixed pipeline")
        return {**pipeline_triage(alert_message), "agent": "pipeline-fallback"}


# --- Function-calling agent ---------------------------------------------------------------

_CLASSIFICATION_PARAMS = {
    "severity": {"type": "string", "enum": SEVERITIES},
    "category": {"type": "string", "enum": CATEGORIES},
    "reasoning": {"type": "string", "description": "One sentence explaining the decision."},
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_past_incidents",
            "description": "Semantic (vector) search over resolved past incidents. Returns the closest ones "
                           "with their resolution and cosine distance (0 = identical, lower = more similar).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The alert text, or a reformulation focused on the failing component and failure mode.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_fix",
            "description": "Final decision: the alert is the same underlying problem as a retrieved past incident, "
                           "so that incident's resolution applies.",
            "parameters": {
                "type": "object",
                "properties": {"incident_id": {"type": "integer"}, **_CLASSIFICATION_PARAMS},
                "required": ["incident_id", "severity", "category", "reasoning"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate",
            "description": "Final decision: no retrieved incident is genuinely the same problem; an engineer must investigate.",
            "parameters": {
                "type": "object",
                "properties": _CLASSIFICATION_PARAMS,
                "required": ["severity", "category", "reasoning"],
            },
        },
    },
]

SYSTEM_PROMPT = """You are an SRE triage agent. For each new alert:
1. Call search_past_incidents. If the results look off-topic, you may search once more with a reformulated query.
2. Finish by calling exactly one of suggest_fix or escalate.

Call suggest_fix only when a retrieved incident is genuinely the same underlying problem (same failing
component and same failure mode), so its resolution would fix this alert. Ignore incidental details that
differ between occurrences: hostnames, IPs, ports, IDs, timestamps, counts, file paths, line numbers.
A shared symptom is not enough: if the alert's cause is unknown or different from the past incident's
cause (e.g. both pods crash-loop, but one from a permission error), escalate.
When unsure, escalate: a wrong fix costs more than an escalation.

Classify every alert:
- severity: critical (outage, data loss or security breach), high (major degradation or a key dependency down),
  medium (partial or intermittent impact), low (minor issue or warning)
- category: database, network, authentication, application-error, infrastructure"""


def _parse_args(raw: str) -> dict:
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError as e:
        raise AgentError(f"tool arguments were not valid JSON: {e}") from e
    if not isinstance(args, dict):
        raise AgentError("tool arguments were not an object")
    return args


def _classification(args: dict) -> dict:
    severity = str(args.get("severity", "")).lower()
    category = str(args.get("category", "")).lower()
    return {
        "severity": severity if severity in SEVERITIES else "unknown",
        "category": category if category in CATEGORIES else "unknown",
    }


def agent_decision(alert_message: str) -> dict:
    timings = {"retrieval": 0, "ai_check": 0}
    seen: dict[int, dict] = {}  # every incident search returned, by id
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"New alert:\n{alert_message}"},
    ]

    for _ in range(MAX_AGENT_STEPS):
        t = time.perf_counter()
        try:
            msg = chat_tools(messages, TOOLS)
        except groq.BadRequestError as e:
            timings["ai_check"] += _ms(t)
            recovered = _recover_tool_call(e)
            if recovered is None:
                raise
            result = _finalize(alert_message, *recovered, seen)
            result["timings_ms"] = timings
            return result
        timings["ai_check"] += _ms(t)
        calls = msg.tool_calls or []
        if not calls:
            raise AgentError("model answered without calling a tool")

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in calls
            ],
        })

        for call in calls:
            name = call.function.name
            args = _parse_args(call.function.arguments)

            if name == "search_past_incidents":
                t = time.perf_counter()
                results = retrieve_similar_incidents(str(args.get("query") or alert_message), top_k=TOP_K)
                timings["retrieval"] += _ms(t)
                for r in results:
                    seen[r["id"]] = r
                payload = [
                    {"id": r["id"], "distance": round(r["distance"], 3),
                     "log": r["log_message"][:400], "resolution": r["resolution"][:300]}
                    for r in results
                ]
                messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(payload)})

            elif name in ("suggest_fix", "escalate"):
                result = _finalize(alert_message, name, args, seen)
                result["timings_ms"] = timings
                return result

            else:
                raise AgentError(f"unknown tool {name!r}")

    raise AgentError(f"no decision after {MAX_AGENT_STEPS} steps")


def _recover_tool_call(error: "groq.BadRequestError") -> tuple[str, dict] | None:
    """gpt-oss sometimes emits a final decision's arguments without the tool-call wrapper, which the
    provider rejects as tool_use_failed. Recover the decision from the failed generation when its
    shape is unambiguous; anything else returns None and the caller falls back to the pipeline."""
    body = error.body if isinstance(error.body, dict) else {}
    body = body.get("error", body)
    if body.get("code") != "tool_use_failed" or not body.get("failed_generation"):
        return None
    try:
        args = _extract_json(body["failed_generation"])
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(args, dict) or "severity" not in args or "category" not in args:
        return None
    return ("suggest_fix" if "incident_id" in args else "escalate"), args


def _finalize(alert_message: str, name: str, args: dict, seen: dict[int, dict]) -> dict:
    labels = _classification(args)
    reasoning = str(args.get("reasoning", ""))[:600]
    closest = min(seen.values(), key=lambda r: r["distance"]) if seen else None

    if name == "escalate":
        return {**escalate(alert_message, reasoning, candidate=closest), **labels}

    try:
        incident = seen.get(int(args.get("incident_id")))
    except (TypeError, ValueError):
        incident = None
    if incident is None:
        reason = f"Guardrail: the agent cited incident {args.get('incident_id')!r}, which search never returned. {reasoning}"
        return {**escalate(alert_message, reason, candidate=closest), **labels}
    if incident["distance"] > DISTANCE_THRESHOLD:
        reason = (f"Guardrail: the agent picked incident #{incident['id']}, but it is too dissimilar "
                  f"(distance={incident['distance']:.3f}, threshold={DISTANCE_THRESHOLD}). {reasoning}")
        return {**escalate(alert_message, reason, candidate=incident), **labels}
    return {**auto_suggest_fix(alert_message, incident, reasoning), **labels}


def _escalate_without_ai(alert_message: str, error: str) -> dict:
    t = time.perf_counter()
    try:
        results = retrieve_similar_incidents(alert_message, top_k=1)
    except Exception:
        results = []
    retrieval_ms = _ms(t)
    result = escalate(alert_message, f"AI unavailable ({error}); escalated without an AI check.",
                      candidate=results[0] if results else None)
    return {**result, "severity": "unknown", "category": "unknown", "timings_ms": {"retrieval": retrieval_ms}}


# --- Fixed pipeline (AGENT_MODE=pipeline, and the fallback when the agent misbehaves) -------

def pipeline_triage(alert_message: str) -> dict:
    result = make_decision(alert_message)
    t = time.perf_counter()
    classification = classify_incident(alert_message)
    result["timings_ms"]["classify"] = _ms(t)
    result["severity"] = classification.get("severity", "unknown")
    result["category"] = classification.get("category", "unknown")
    return result


def make_decision(alert_message: str) -> dict:
    timings = {}
    t = time.perf_counter()
    matches = retrieve_similar_incidents(alert_message, top_k=1)
    timings["retrieval"] = _ms(t)
    top_match = matches[0] if matches else None

    if top_match is None:
        result = escalate(alert_message, reason="No past incidents in database to compare against.")
    elif top_match["distance"] > DISTANCE_THRESHOLD:
        # No LLM call: the closest match is not similar enough to be worth verifying
        result = escalate(
            alert_message,
            reason=f"Closest past incident was too dissimilar (distance={top_match['distance']:.3f}, threshold={DISTANCE_THRESHOLD}).",
            candidate=top_match,
        )
    else:
        t = time.perf_counter()
        llm_verdict = llm_confirm_match(alert_message, top_match)
        timings["ai_check"] = _ms(t)
        if llm_verdict["is_match"]:
            result = auto_suggest_fix(alert_message, top_match, llm_verdict["reasoning"])
        else:
            result = escalate(
                alert_message,
                reason=f"A close vector match was found, but the LLM determined it wasn't genuinely the same issue: {llm_verdict['reasoning']}",
                candidate=top_match,
            )

    result["timings_ms"] = timings
    return result


def llm_confirm_match(alert_message: str, candidate: dict) -> dict:
    prompt = f"""You are an SRE assistant. A new incident alert has come in, and a vector search
found a potentially similar past incident. Decide whether they are the same underlying problem,
so the past fix would also work for the new alert.

Ignore incidental details that differ between occurrences of the same problem: hostnames, IPs,
ports, IDs, timestamps, counts, file paths and line numbers. Focus on the failing component and
the failure mode.

New alert: {alert_message}

Candidate past incident: {candidate['log_message']}
Candidate resolution: {candidate['resolution']}

Respond with a JSON object: {{"is_match": true or false, "reasoning": "one sentence explanation"}}
"""
    try:
        result = chat_json(prompt)
    except Exception as e:
        print(f"[LLM ERROR] match check failed: {type(e).__name__}: {e}")
        return {"is_match": False, "reasoning": f"LLM check failed ({type(e).__name__}), defaulting to escalation for safety."}

    if not isinstance(result.get("is_match"), bool):
        return {"is_match": False, "reasoning": "LLM verdict was malformed, defaulting to escalation for safety."}
    return result


# --- Outcomes ---------------------------------------------------------------------------------

def auto_suggest_fix(alert_message: str, matched_incident: dict, reasoning: str) -> dict:
    return {
        "decision": "auto_suggest_fix",
        "alert": alert_message,
        "matched_incident_id": matched_incident["id"],
        "matched_log": matched_incident["log_message"],
        "suggested_resolution": matched_incident["resolution"],
        "confidence_distance": round(matched_incident["distance"], 4),
        "reasoning": reasoning,
    }


def escalate(alert_message: str, reason: str, candidate: dict = None) -> dict:
    _send_slack_alert(alert_message, reason)
    return {
        "decision": "escalate",
        "alert": alert_message,
        "matched_incident_id": candidate["id"] if candidate else None,
        "matched_log": candidate["log_message"] if candidate else None,
        "suggested_resolution": None,
        "confidence_distance": round(candidate["distance"], 4) if candidate else None,
        "reasoning": reason,
    }


def _send_slack_alert(alert_message: str, reason: str):
    if not SLACK_WEBHOOK_URL:
        print(f"[SLACK MOCK] Would escalate: {alert_message} | Reason: {reason}")
        return
    payload = {"text": f":rotating_light: *Incident Escalated*\n*Alert:* {alert_message}\n*Reason:* {reason}"}
    try:
        response = requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=5)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"[SLACK ERROR] Failed to send alert: {e}")


if __name__ == "__main__":
    test_alerts = [
        "Timeout connecting to Postgres primary node, retrying after 30s",
        "Kubernetes pod stuck in CrashLoopBackOff due to unknown startup script error XZ992",
    ]
    for alert in test_alerts:
        print(f"\n{'='*60}\nAlert: {alert}")
        print(json.dumps(triage(alert), indent=2))
