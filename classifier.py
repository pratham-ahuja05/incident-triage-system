import json
from llm import chat_json


CLASSIFICATION_PROMPT = """You are an SRE assistant classifying production incident logs.

Given a raw error log, classify it into:
- severity: one of ["critical", "high", "medium", "low"]
- category: one of ["database", "network", "authentication", "application-error", "infrastructure"]

Respond with ONLY a valid JSON object in this exact format, no other text, no markdown formatting:
{{"severity": "...", "category": "...", "reasoning": "one sentence explanation"}}

Log message:
{log_message}
"""


def classify_incident(log_message: str) -> dict:
    prompt = CLASSIFICATION_PROMPT.format(log_message=log_message)

    try:
        result = chat_json(prompt)
    except Exception as e:
        # API failure (network, timeout, rate limit) or unparseable output
        print(f"[LLM ERROR] classification failed: {type(e).__name__}: {e}")
        return {"severity": "unknown", "category": "unknown", "reasoning": "llm_failed"}

    if not all(k in result for k in ("severity", "category", "reasoning")):
        result = {"severity": "unknown", "category": "unknown", "reasoning": "parse_failed"}

    return result


if __name__ == "__main__":
    test_log = "Connection timeout: Unable to reach PostgreSQL database at db-primary-01 after 30s. Retrying..."
    result = classify_incident(test_log)
    print(json.dumps(result, indent=2))