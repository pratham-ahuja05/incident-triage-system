"""Shared helpers for the offline evaluations (run from the repo root: python -m eval.<script>)."""

import json
import os
import re
import sys
from pathlib import Path

# Evaluations must never page a real Slack channel. Set before agent.py is imported.
os.environ["SLACK_WEBHOOK_URL"] = ""

# Model output contains characters (e.g. U+2011) the Windows console codepage cannot print.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import llm  # noqa: E402

DATA = ROOT / "eval" / "data"
RESULTS = ROOT / "eval" / "results"
DATA.mkdir(exist_ok=True)
RESULTS.mkdir(exist_ok=True)

# Generator and judge use a different model from the system under test (llm.MODEL), so the
# system never grades itself, and the two draw on separate Groq rate-limit buckets.
JUDGE_MODEL = os.getenv("EVAL_JUDGE_MODEL", "qwen/qwen3.8-27b")

# Free-tier Groq rate limits are tight; let the SDK wait out 429s (it honours retry-after).
llm.client = llm.client.with_options(max_retries=10)


def judge_json(prompt: str, max_tokens: int = 1500) -> dict:
    response = llm.client.chat.completions.create(
        model=JUDGE_MODEL,
        max_tokens=max_tokens,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
        timeout=60,
    )
    return llm._extract_json(response.choices[0].message.content or "")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_jsonl(path: Path, row: dict):
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_jsonl(path: Path, rows: list[dict]):
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def load_kb() -> dict[int, dict]:
    from models import SessionLocal, PastIncident
    session = SessionLocal()
    try:
        return {
            r.id: {"id": r.id, "log_message": r.log_message, "resolution": r.resolution,
                   "severity": r.severity, "category": r.category}
            for r in session.query(PastIncident).order_by(PastIncident.id)
        }
    finally:
        session.close()


def normalize(text: str) -> str:
    """Collapse incidental differences (numbers, whitespace, case) to spot verbatim duplicates."""
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", text.lower())).strip()


# --- Relevance judgments (pooled, cached) -------------------------------------------------

JUDGMENTS_PATH = DATA / "relevance_judgments.json"

JUDGE_PROMPT = """You are labelling an evaluation set for an incident-triage system.

Reference past incident:
log: {ref_log}
resolution: {ref_res}

Candidate past incidents:
{candidates}

For each candidate decide: is it the SAME underlying problem as the reference (same failing component
and same failure mode), so that the reference's resolution would also fix it? Ignore hostnames, IPs,
IDs, timestamps, counts and wording. A shared symptom with a different cause is NOT the same problem.

Respond with JSON: {{"same": {{"<candidate id>": true or false, ...}}}}"""


class Judge:
    """Answers 'is candidate the same problem as source?' with an LLM, caching every verdict on disk."""

    def __init__(self, kb: dict[int, dict]):
        self.kb = kb
        self.cache: dict[str, bool] = json.loads(JUDGMENTS_PATH.read_text()) if JUDGMENTS_PATH.exists() else {}

    @staticmethod
    def _key(a: int, b: int) -> str:
        return f"{min(a, b)}-{max(a, b)}"

    def same(self, source_id: int, candidate_ids: list[int]) -> dict[int, bool]:
        out, todo = {}, []
        for c in candidate_ids:
            if c == source_id or normalize(self.kb[c]["log_message"]) == normalize(self.kb[source_id]["log_message"]):
                out[c] = True  # identical incident text: trivially the same problem
            elif self._key(source_id, c) in self.cache:
                out[c] = self.cache[self._key(source_id, c)]
            else:
                todo.append(c)
        if todo:
            ref = self.kb[source_id]
            candidates = "\n".join(
                f"[{c}] log: {self.kb[c]['log_message'][:400]} | resolution: {self.kb[c]['resolution'][:300]}" for c in todo
            )
            verdict = judge_json(JUDGE_PROMPT.format(ref_log=ref["log_message"][:600], ref_res=ref["resolution"][:400],
                                                     candidates=candidates)).get("same", {})
            for c in todo:
                v = verdict.get(str(c), verdict.get(c))
                out[c] = bool(v) if isinstance(v, bool) else False
                self.cache[self._key(source_id, c)] = out[c]
            JUDGMENTS_PATH.write_text(json.dumps(self.cache, indent=0, sort_keys=True))
        return out
