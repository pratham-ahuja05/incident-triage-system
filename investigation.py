"""Explainable AI investigation for one incident.

Grounding rules (enforced in code, not just in the prompt):
- The model only sees past incidents that vector search actually returned.
- Evidence references to anything else are dropped before the result leaves this module.
- Remediation steps are suggestions; each carries a risk level and nothing here executes them.
"""

from datetime import datetime, timezone

from embeddings import generate_embedding
from llm import MODEL, LLMUnavailable, chat_json
from models import SessionLocal, PastIncident

TOP_K = 3
LIKELIHOODS = {"high", "medium", "low"}
RISKS = {"safe", "caution", "destructive"}


def similar_incidents(log_message: str, k: int = TOP_K) -> list[dict]:
    query = generate_embedding(log_message)
    session = SessionLocal()
    try:
        rows = (
            session.query(PastIncident, PastIncident.embedding.cosine_distance(query).label("distance"))
            .order_by("distance")
            .limit(k)
            .all()
        )
        return [
            {
                "id": inc.id,
                "log_message": inc.log_message,
                "resolution": inc.resolution,
                "severity": inc.severity,
                "category": inc.category,
                "distance": round(float(dist), 4),
            }
            for inc, dist in rows
        ]
    finally:
        session.close()


PROMPT = """You are an SRE assisting an on-call engineer. Investigate the incident below.

Use ONLY the incident text and the numbered past incidents as evidence. Do not invent logs,
metrics, deployments or events that are not shown. When evidence is thin, say so and lower
your likelihood rather than guessing.

Incident (service: {source}):
{message}

Past incidents found by vector search (lower distance = more similar):
{evidence}

Respond with a JSON object exactly in this shape:
{{
  "summary": "1-2 sentences: what is failing and the likely impact",
  "hypotheses": [
    {{"cause": "probable root cause", "likelihood": "high|medium|low",
      "reasoning": "why, referring to the evidence", "evidence_ids": [past incident ids that support it]}}
  ],
  "remediation": [
    {{"step": "concrete action", "risk": "safe|caution|destructive"}}
  ],
  "uncertainty": "what is unknown and what an engineer should check to confirm"
}}
Give 1-3 hypotheses ordered by likelihood and 2-5 remediation steps, investigation steps first.
Mark restarts, failovers, data changes or deletions as "caution" or "destructive".
"""


def _clean(result: dict, allowed_ids: set[int]) -> dict:
    hypotheses = []
    for h in result.get("hypotheses") or []:
        if not isinstance(h, dict) or not h.get("cause"):
            continue
        ids = []
        for i in h.get("evidence_ids") or []:
            i = int(i) if isinstance(i, str) and i.strip().isdigit() else i
            if isinstance(i, int) and i in allowed_ids and i not in ids:
                ids.append(i)
        likelihood = str(h.get("likelihood", "low")).lower()
        hypotheses.append({
            "cause": str(h["cause"])[:300],
            "likelihood": likelihood if likelihood in LIKELIHOODS else "low",
            "reasoning": str(h.get("reasoning", ""))[:600],
            "evidence_ids": ids,
        })

    remediation = []
    for r in result.get("remediation") or []:
        if not isinstance(r, dict) or not r.get("step"):
            continue
        risk = str(r.get("risk", "caution")).lower()
        remediation.append({"step": str(r["step"])[:300], "risk": risk if risk in RISKS else "caution"})

    return {
        "summary": str(result.get("summary", ""))[:600],
        "hypotheses": hypotheses[:3],
        "remediation": remediation[:5],
        "uncertainty": str(result.get("uncertainty", ""))[:600],
    }


def investigate(log_message: str, source: str = "unknown") -> dict:
    """Raises LLMUnavailable when the provider is down/rate limited, ValueError on unusable output."""
    evidence = similar_incidents(log_message)
    evidence_text = "\n".join(
        f"[{e['id']}] distance={e['distance']} | log: {e['log_message']} | resolution: {e['resolution']}"
        for e in evidence
    ) or "(none — the knowledge base is empty)"

    raw = chat_json(PROMPT.format(source=source, message=log_message, evidence=evidence_text), timeout=30)
    cleaned = _clean(raw, {e["id"] for e in evidence})
    if not cleaned["summary"] and not cleaned["hypotheses"]:
        raise ValueError("The model returned an empty investigation.")

    return {
        **cleaned,
        "similar_incidents": evidence,
        "model": MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


__all__ = ["investigate", "similar_incidents", "LLMUnavailable"]
