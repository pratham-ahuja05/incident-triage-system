import json
from groq import Groq
from dotenv import load_dotenv
import os
from models import SessionLocal, PastIncident
from embeddings import generate_embedding

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


GENERATION_PROMPT = """Generate 10 realistic, diverse past production incident records for an SRE knowledge base.

Cover a MIX of these categories: database, network, authentication, application-error, infrastructure.
Cover a MIX of these severities: critical, high, medium, low.

Respond with ONLY a valid JSON array, no other text, no markdown formatting. Each object must have exactly these fields:
{{"log_message": "realistic raw error log text", "severity": "...", "category": "...", "resolution": "1-2 sentence description of how this was actually fixed"}}

Make log_messages varied in wording/style (some short, some verbose, some with stack traces, some with just error codes).
"""


def generate_batch():
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=2000,
        messages=[{"role": "user", "content": GENERATION_PROMPT}]
    )
    raw_text = response.choices[0].message.content.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`").replace("json", "", 1).strip()
    return json.loads(raw_text)


def seed_database(num_batches: int = 8):
    session = SessionLocal()
    total_inserted = 0

    for i in range(num_batches):
        print(f"Generating batch {i+1}/{num_batches}...")
        try:
            incidents = generate_batch()
        except json.JSONDecodeError:
            print(f"  Batch {i+1} failed to parse, skipping.")
            continue

        for incident in incidents:
            embedding = generate_embedding(incident["log_message"])
            record = PastIncident(
                log_message=incident["log_message"],
                severity=incident["severity"],
                category=incident["category"],
                resolution=incident["resolution"],
                embedding=embedding
            )
            session.add(record)
            total_inserted += 1

        session.commit()  # commit after each batch
        print(f"  Inserted {len(incidents)} incidents. Total so far: {total_inserted}")

    session.close()
    print(f"Done. Total incidents seeded: {total_inserted}")


if __name__ == "__main__":
    seed_database(num_batches=8)  # 8 batches x ~10 = ~80 incidents