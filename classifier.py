import os
import json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


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
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=200,
            messages=[
                {"role": "user", "content": prompt}
            ],
            timeout=10
        )
    except Exception as e:
        # LLM API call itself failed (network, timeout, rate limit, service down)
        print(f"[LLM ERROR] API call failed: {e}")
        return {"severity": "unknown", "category": "unknown", "reasoning": "api_call_failed"}

    raw_text = response.choices[0].message.content.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`").replace("json", "", 1).strip()

    try:
        result = json.loads(raw_text)
        # Sanity check: valid JSON but wrong/missing keys should also fall back safely
        if not all(k in result for k in ("severity", "category", "reasoning")):
            raise ValueError("Missing expected keys in LLM response")
    except (json.JSONDecodeError, ValueError):
        result = {"severity": "unknown", "category": "unknown", "reasoning": "parse_failed"}

    return result


if __name__ == "__main__":
    test_log = "Connection timeout: Unable to reach PostgreSQL database at db-primary-01 after 30s. Retrying..."
    result = classify_incident(test_log)
    print(json.dumps(result, indent=2))