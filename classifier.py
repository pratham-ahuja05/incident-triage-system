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

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",  # good balance of speed + quality on Groq
        max_tokens=200,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    raw_text = response.choices[0].message.content.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`").replace("json", "", 1).strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        result = {"severity": "unknown", "category": "unknown", "reasoning": "parse_failed"}

    return result


if __name__ == "__main__":
    test_log = "Connection timeout: Unable to reach PostgreSQL database at db-primary-01 after 30s. Retrying..."
    result = classify_incident(test_log)
    print(json.dumps(result, indent=2))