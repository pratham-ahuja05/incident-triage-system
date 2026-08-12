import os
import json
import requests
from dotenv import load_dotenv
from groq import Groq
from retrieval import retrieve_similar_incidents
from embeddings import generate_embedding
from models import SessionLocal, PastIncident

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")

DISTANCE_THRESHOLD = 0.4  # below this = "close enough" to consider auto-fix; tune this after testing


def get_top_match_with_distance(log_message: str):
    """Retrieve top-1 similar incident AND its raw cosine distance (not just the record)."""
    query_embedding = generate_embedding(log_message)
    session = SessionLocal()
    try:
        result = (
            session.query(
                PastIncident,
                PastIncident.embedding.cosine_distance(query_embedding).label("distance")
            )
            .order_by("distance")
            .limit(1)
            .first()
        )
        if result is None:
            return None, None
        incident, distance = result
        return incident, distance
    finally:
        session.close()


def make_decision(alert_message: str) -> dict:
    top_match, distance = get_top_match_with_distance(alert_message)

    if top_match is None:
        return escalate(alert_message, reason="No past incidents in database to compare against.")

    # Step 1: fast threshold pre-filter
    if distance > DISTANCE_THRESHOLD:
        return escalate(
            alert_message,
            reason=f"No sufficiently similar past incident found (distance={distance:.3f}, threshold={DISTANCE_THRESHOLD})."
        )

    # Step 2: close match found — let LLM reason about whether it's genuinely the same issue
    llm_verdict = llm_confirm_match(alert_message, top_match)

    if llm_verdict["is_match"]:
        return auto_suggest_fix(alert_message, top_match, distance, llm_verdict["reasoning"])
    else:
        return escalate(
            alert_message,
            reason=f"Vector search found a candidate, but LLM determined it's not a genuine match: {llm_verdict['reasoning']}"
        )


def llm_confirm_match(alert_message: str, candidate: PastIncident) -> dict:
    prompt = f"""You are an SRE assistant. A new incident alert has come in, and a vector search
found a potentially similar past incident. Determine if they are genuinely the same underlying issue.

New alert: {alert_message}

Candidate past incident: {candidate.log_message}
Candidate resolution: {candidate.resolution}

Respond with ONLY valid JSON, no other text:
{{"is_match": true or false, "reasoning": "one sentence explanation"}}
"""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").replace("json", "", 1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: if LLM response fails to parse, don't silently trust the match — escalate instead
        return {"is_match": False, "reasoning": "LLM verdict parsing failed, defaulting to escalation for safety."}


def auto_suggest_fix(alert_message: str, matched_incident: PastIncident, distance: float, reasoning: str) -> dict:
    return {
        "decision": "auto_suggest_fix",
        "alert": alert_message,
        "matched_incident_id": matched_incident.id,
        "matched_log": matched_incident.log_message,
        "suggested_resolution": matched_incident.resolution,
        "confidence_distance": round(distance, 4),
        "reasoning": reasoning,
    }


def escalate(alert_message: str, reason: str) -> dict:
    _send_slack_alert(alert_message, reason)
    return {
        "decision": "escalate",
        "alert": alert_message,
        "reasoning": reason,
    }


def _send_slack_alert(alert_message: str, reason: str):
    if not SLACK_WEBHOOK_URL:
        print(f"[SLACK MOCK] Would escalate: {alert_message} | Reason: {reason}")
        return

    payload = {
        "text": f":rotating_light: *Incident Escalated*\n*Alert:* {alert_message}\n*Reason:* {reason}"
    }
    try:
        response = requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=5)
        response.raise_for_status()
    except requests.RequestException as e:
        # Network/webhook failure shouldn't crash the whole triage flow — log and move on
        print(f"[SLACK ERROR] Failed to send alert: {e}")


if __name__ == "__main__":
    test_alerts = [
        "Timeout connecting to Postgres primary node, retrying after 30s",   # should closely match seeded data
        "Kubernetes pod stuck in CrashLoopBackOff due to unknown startup script error XZ992",  # likely novel
    ]
    for alert in test_alerts:
        print(f"\n{'='*60}")
        print(f"Alert: {alert}")
        result = make_decision(alert)
        print(json.dumps(result, indent=2))       