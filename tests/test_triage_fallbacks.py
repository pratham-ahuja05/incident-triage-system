"""Every path from a misbehaving LLM to a safe triage outcome, with the provider and vector search mocked."""

import json
from types import SimpleNamespace

import groq
import httpx
import pytest

import agent
import classifier
import investigation
import llm
from llm import LLMUnavailable

KB = {
    7: {"id": 7, "log_message": "Error: Unable to connect to Redis at cache-01:6379, connection refused",
        "resolution": "Restarted the Redis service and fixed its systemd unit.", "severity": "high",
        "category": "database", "distance": 0.08},
    9: {"id": 9, "log_message": "Redis replica out of sync",
        "resolution": "Re-synced the replica.", "severity": "medium", "category": "database", "distance": 0.55},
}


def call(name: str, args, call_id: str = "c1"):
    arguments = args if isinstance(args, str) else json.dumps(args)
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=arguments))


def message(*calls):
    return SimpleNamespace(content="", tool_calls=list(calls))


def provider_error(cls, status: int, body=None):
    response = httpx.Response(status, request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"))
    return cls("provider error", response=response, body=body)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Vector search returns the fixture KB; any un-mocked LLM call fails the test loudly."""
    def search(query, top_k=3):
        return sorted(KB.values(), key=lambda r: r["distance"])[:top_k]

    def no_llm(*a, **k):
        raise AssertionError("unexpected LLM call")

    monkeypatch.setattr(agent, "retrieve_similar_incidents", search)
    monkeypatch.setattr(agent, "chat_tools", no_llm)
    monkeypatch.setattr(agent, "chat_json", no_llm)
    monkeypatch.setattr(classifier, "chat_json", no_llm)
    monkeypatch.setattr(agent, "AGENT_MODE", "tools")


def script(monkeypatch, *steps):
    """Make chat_tools return (or raise) each step in order."""
    steps = list(steps)

    def fake(messages, tools, timeout=20):
        step = steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return step

    monkeypatch.setattr(agent, "chat_tools", fake)


def pipeline_llm(monkeypatch, verdict=None, classification=None):
    monkeypatch.setattr(agent, "chat_json", lambda prompt, timeout=20: verdict or {"is_match": False, "reasoning": "no"})
    monkeypatch.setattr(classifier, "chat_json", lambda prompt, timeout=20: classification or
                        {"severity": "high", "category": "database", "reasoning": "r"})


SEARCH = message(call("search_past_incidents", {"query": "redis connection refused"}))


# --- Happy paths of the tool-calling agent --------------------------------------------------

def test_agent_suggests_fix_for_close_verified_match(monkeypatch):
    script(monkeypatch, SEARCH, message(call("suggest_fix", {"incident_id": 7, "severity": "high",
                                                             "category": "database", "reasoning": "same"}, "c2")))
    result = agent.triage("Redis cache-02:6379 connection refused")
    assert result["decision"] == "auto_suggest_fix"
    assert result["matched_incident_id"] == 7
    assert result["suggested_resolution"] == KB[7]["resolution"]
    assert (result["severity"], result["category"], result["agent"]) == ("high", "database", "tools")
    assert set(result["timings_ms"]) == {"retrieval", "ai_check"}


def test_agent_escalates_and_reports_closest_candidate(monkeypatch):
    script(monkeypatch, SEARCH, message(call("escalate", {"severity": "critical", "category": "network",
                                                          "reasoning": "new failure"}, "c2")))
    result = agent.triage("BGP session flapping")
    assert result["decision"] == "escalate"
    assert result["matched_incident_id"] == 7
    assert result["suggested_resolution"] is None


def test_agent_may_search_twice_before_deciding(monkeypatch):
    script(monkeypatch, SEARCH, message(call("search_past_incidents", {"query": "redis refused"}, "c2")),
           message(call("escalate", {"severity": "low", "category": "database", "reasoning": "r"}, "c3")))
    assert agent.triage("redis")["decision"] == "escalate"


# --- Guardrails enforced in code -----------------------------------------------------------

def test_guardrail_rejects_incident_search_never_returned(monkeypatch):
    script(monkeypatch, SEARCH, message(call("suggest_fix", {"incident_id": 999, "severity": "high",
                                                             "category": "database", "reasoning": "r"}, "c2")))
    result = agent.triage("redis down")
    assert result["decision"] == "escalate"
    assert "never returned" in result["reasoning"]


def test_guardrail_rejects_match_beyond_distance_threshold(monkeypatch):
    script(monkeypatch, SEARCH, message(call("suggest_fix", {"incident_id": 9, "severity": "high",
                                                             "category": "database", "reasoning": "r"}, "c2")))
    result = agent.triage("redis replica lag")
    assert result["decision"] == "escalate"
    assert "too dissimilar" in result["reasoning"]


def test_guardrail_rejects_suggestion_made_before_any_search(monkeypatch):
    script(monkeypatch, message(call("suggest_fix", {"incident_id": 7, "severity": "high",
                                                     "category": "database", "reasoning": "r"})))
    assert agent.triage("redis down")["decision"] == "escalate"


@pytest.mark.parametrize("severity,category", [("SEV1", "database"), ("high", "storage"), (None, None), (5, [])])
def test_out_of_vocabulary_labels_become_unknown(monkeypatch, severity, category):
    script(monkeypatch, SEARCH, message(call("escalate", {"severity": severity, "category": category,
                                                          "reasoning": "r"}, "c2")))
    result = agent.triage("x")
    assert result["severity"] in agent.SEVERITIES + ["unknown"]
    assert result["category"] in agent.CATEGORIES + ["unknown"]


@pytest.mark.parametrize("incident_id", ["7", "seven", None, 7.0])
def test_odd_incident_id_types_never_crash(monkeypatch, incident_id):
    script(monkeypatch, SEARCH, message(call("suggest_fix", {"incident_id": incident_id, "severity": "high",
                                                             "category": "database", "reasoning": "r"}, "c2")))
    assert agent.triage("redis")["decision"] in ("auto_suggest_fix", "escalate")


# --- Provider failures: escalate without AI ------------------------------------------------

@pytest.mark.parametrize("rate_limited", [True, False])
def test_provider_unavailable_escalates_without_llm(monkeypatch, rate_limited):
    script(monkeypatch, LLMUnavailable("provider down", rate_limited=rate_limited))
    result = agent.triage("redis down")
    assert result["decision"] == "escalate"
    assert result["agent"] == "fallback"
    assert result["severity"] == "unknown"
    assert "AI unavailable" in result["reasoning"]


def test_provider_unavailable_mid_loop_escalates(monkeypatch):
    script(monkeypatch, SEARCH, LLMUnavailable("timeout"))
    assert agent.triage("redis down")["agent"] == "fallback"


def test_provider_and_vector_db_both_down_still_escalates(monkeypatch):
    script(monkeypatch, LLMUnavailable("down"))

    def broken_search(query, top_k=3):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(agent, "retrieve_similar_incidents", broken_search)
    result = agent.triage("redis down")
    assert result["decision"] == "escalate"
    assert result["matched_incident_id"] is None


# --- Malformed agent output: fall back to the fixed pipeline -------------------------------

@pytest.mark.parametrize("bad_step", [
    message(),                                                  # answered without a tool call
    message(call("search_past_incidents", "{not json")),        # invalid JSON arguments
    message(call("search_past_incidents", "[1, 2]")),           # arguments not an object
    message(call("delete_database", {})),                       # hallucinated tool
], ids=["no-tool-call", "invalid-json", "non-object-args", "unknown-tool"])
def test_malformed_agent_output_falls_back_to_pipeline(monkeypatch, bad_step):
    script(monkeypatch, bad_step)
    pipeline_llm(monkeypatch, verdict={"is_match": True, "reasoning": "same"})
    result = agent.triage("Redis cache-02:6379 connection refused")
    assert result["agent"] == "pipeline-fallback"
    assert result["decision"] == "auto_suggest_fix"
    assert "classify" in result["timings_ms"]


def test_step_limit_falls_back_to_pipeline(monkeypatch):
    script(monkeypatch, *[message(call("search_past_incidents", {"query": "q"}, f"c{i}")) for i in range(agent.MAX_AGENT_STEPS)])
    pipeline_llm(monkeypatch)
    assert agent.triage("redis")["agent"] == "pipeline-fallback"


def test_tool_use_failed_escalation_is_recovered(monkeypatch):
    failed = json.dumps({"severity": "high", "category": "network", "reasoning": "no match"})
    error = provider_error(groq.BadRequestError, 400, {"error": {"code": "tool_use_failed", "failed_generation": failed}})
    script(monkeypatch, SEARCH, error)
    result = agent.triage("IPv6 RA storm")
    assert (result["decision"], result["agent"], result["category"]) == ("escalate", "tools", "network")


def test_recovered_suggestion_still_passes_guardrails(monkeypatch):
    failed = json.dumps({"incident_id": 9, "severity": "high", "category": "database", "reasoning": "r"})
    error = provider_error(groq.BadRequestError, 400, {"error": {"code": "tool_use_failed", "failed_generation": failed}})
    script(monkeypatch, SEARCH, error)
    assert agent.triage("redis")["decision"] == "escalate"  # incident 9 is beyond the threshold


@pytest.mark.parametrize("body", [
    {"error": {"code": "tool_use_failed", "failed_generation": "I think we should escalate"}},
    {"error": {"code": "invalid_request_error"}},
    None,
], ids=["unparseable-generation", "other-400", "no-body"])
def test_unrecoverable_bad_request_falls_back_to_pipeline(monkeypatch, body):
    script(monkeypatch, provider_error(groq.BadRequestError, 400, body))
    pipeline_llm(monkeypatch)
    assert agent.triage("redis")["agent"] == "pipeline-fallback"


# --- Fixed pipeline's own safety defaults ---------------------------------------------------

@pytest.mark.parametrize("verdict", [
    LLMUnavailable("down"), ValueError("bad json"), {"is_match": "yes"}, {"reasoning": "missing"}, {},
], ids=["provider-down", "unparseable", "non-bool", "missing-key", "empty"])
def test_pipeline_defaults_to_escalation_when_match_check_fails(monkeypatch, verdict):
    def fake(prompt, timeout=20):
        if isinstance(verdict, Exception):
            raise verdict
        return verdict

    monkeypatch.setattr(agent, "chat_json", fake)
    assert agent.make_decision("Redis cache-02:6379 connection refused")["decision"] == "escalate"


def test_pipeline_skips_llm_when_nothing_is_close(monkeypatch):
    monkeypatch.setattr(agent, "retrieve_similar_incidents", lambda q, top_k=3: [KB[9]])
    result = agent.make_decision("totally new failure")  # chat_json would raise via the autouse fixture
    assert result["decision"] == "escalate"
    assert "ai_check" not in result["timings_ms"]


def test_pipeline_with_empty_knowledge_base(monkeypatch):
    monkeypatch.setattr(agent, "retrieve_similar_incidents", lambda q, top_k=3: [])
    assert agent.make_decision("anything")["decision"] == "escalate"


# --- Classifier ---------------------------------------------------------------------------

@pytest.mark.parametrize("failure,reason", [
    (LLMUnavailable("down"), "llm_failed"), (ValueError("bad"), "llm_failed"),
    ({"severity": "high"}, "parse_failed"), ({}, "parse_failed"),
])
def test_classifier_degrades_to_unknown(monkeypatch, failure, reason):
    def fake(prompt, timeout=20):
        if isinstance(failure, Exception):
            raise failure
        return failure

    monkeypatch.setattr(classifier, "chat_json", fake)
    result = classifier.classify_incident("log")
    assert (result["severity"], result["category"], result["reasoning"]) == ("unknown", "unknown", reason)


# --- LLM wrapper --------------------------------------------------------------------------

@pytest.mark.parametrize("error,rate_limited", [
    (provider_error(groq.RateLimitError, 429), True),
    (provider_error(groq.InternalServerError, 500), False),
    (provider_error(groq.AuthenticationError, 401), False),
    (groq.APITimeoutError(request=httpx.Request("POST", "https://api.groq.com")), False),
    (groq.APIConnectionError(request=httpx.Request("POST", "https://api.groq.com")), False),
], ids=["429", "500", "401", "timeout", "connection"])
def test_provider_errors_map_to_llm_unavailable(monkeypatch, error, rate_limited):
    def raise_error(**kwargs):
        raise error

    monkeypatch.setattr(llm, "client", SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=raise_error))))
    with pytest.raises(LLMUnavailable) as exc:
        llm.chat_json("prompt")
    assert exc.value.rate_limited is rate_limited


@pytest.mark.parametrize("text,expected", [
    ('{"a": 1}', {"a": 1}),
    ('```json\n{"a": 1}\n```', {"a": 1}),
    ('Sure! Here it is: {"a": 1} hope that helps', {"a": 1}),
])
def test_extract_json_tolerates_wrapping(text, expected):
    assert llm._extract_json(text) == expected


def test_extract_json_raises_on_no_json():
    with pytest.raises(ValueError):
        llm._extract_json("no json here")


# --- Investigation grounding --------------------------------------------------------------

def test_investigation_drops_evidence_not_retrieved():
    cleaned = investigation._clean({
        "summary": "s",
        "hypotheses": [{"cause": "c", "likelihood": "certain", "evidence_ids": [7, "7", 999, "x"]}, "junk"],
        "remediation": [{"step": "restart", "risk": "yolo"}, {}],
    }, allowed_ids={7})
    assert cleaned["hypotheses"] == [{"cause": "c", "likelihood": "low", "reasoning": "", "evidence_ids": [7]}]
    assert cleaned["remediation"] == [{"step": "restart", "risk": "caution"}]
