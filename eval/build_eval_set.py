"""Build the evaluation sets.

retrieval_queries.jsonl: 100 alerts, each a rewrite of a distinct knowledge-base incident (the "source")
    as the same failure would look on another day: different hosts/IPs/IDs/numbers and wording.
    The judge model writes them, not the triage model.
decision_set.jsonl: 60 of those rewrites (expected: auto_suggest_fix) + the 40 hand-written alerts in
    novel_alerts.jsonl, whose failures the knowledge base does not cover (expected: escalate).
    Severity/category labels: the source incident's labels for known alerts, hand labels for novel ones.

Usage: python -m eval.build_eval_set [--n 100] [--known 60] [--seed 42]
"""

import argparse
import random

from eval.common import DATA, append_jsonl, judge_json, load_kb, normalize, read_jsonl, write_jsonl

REWRITE_PROMPT = """You are building a test set for an incident-triage system.

Rewrite each production log below as the SAME failure would appear in a different occurrence:
- change hostnames, IPs, ports, IDs, timestamps, numbers and file paths
- reword or reformat it, as a different service or logging library would print it
- keep the failing component and the failure mode exactly the same; do not add a new cause
- keep it a single realistic log line or alert, similar in length to the original

Logs:
{logs}

Respond with JSON: {{"items": [{{"id": <id>, "alert": "<rewritten log>"}}, ...]}} with one item per log."""


def rewrite(batch: list[dict]) -> dict[int, str]:
    logs = "\n".join(f"[{r['id']}] {r['log_message'][:600]}" for r in batch)
    items = judge_json(REWRITE_PROMPT.format(logs=logs), max_tokens=3000).get("items", [])
    return {int(i["id"]): str(i["alert"]).strip() for i in items if isinstance(i, dict) and i.get("alert")}


VALIDATE_PROMPT = """Quality-check rewritten production logs. For each pair, does the rewrite describe the
SAME failure as the original (same failing component, same failure mode, no new or different cause)?
Different hostnames, numbers and wording are fine.

{pairs}

Respond with JSON: {{"valid": {{"<id>": true or false, ...}}}}"""


def validate(queries: list[dict], kb: dict[int, dict]) -> list[dict]:
    """Drop rewrites that drifted to a different failure (e.g. 'heap space' -> 'GC overhead limit')."""
    kept = []
    for i in range(0, len(queries), 10):
        batch = queries[i:i + 10]
        pairs = "\n".join(
            f"[{q['source_id']}] original: {kb[q['source_id']]['log_message'][:600]}\n      rewrite: {q['alert']}" for q in batch
        )
        verdict = judge_json(VALIDATE_PROMPT.format(pairs=pairs)).get("valid", {})
        for q in batch:
            if verdict.get(str(q["source_id"])) is True:
                kept.append(q)
            else:
                append_jsonl(DATA / "rejected_rewrites.jsonl", q)
                print(f"  dropped rewrite of #{q['source_id']}: {q['alert'][:100]}")
    return kept


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=100)
    parser.add_argument("--known", type=int, default=60)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--top-up", action="store_true", help="keep existing valid rewrites, add new ones up to --n")
    args = parser.parse_args()

    kb = load_kb()
    # One source per distinct incident text, so verbatim duplicates can't dominate the sample.
    distinct = {}
    for inc in kb.values():
        distinct.setdefault(normalize(inc["log_message"]), inc)
    pool = sorted(distinct.values(), key=lambda r: r["id"])
    random.Random(args.seed).shuffle(pool)
    print(f"{len(kb)} incidents, {len(distinct)} distinct texts")

    queries = read_jsonl(DATA / "retrieval_queries.jsonl") if args.top_up else []
    used = {q["source_id"] for q in queries}
    # Sources whose rewrite was rejected stay used, so a top-up moves on to fresh incidents.
    used |= {q["source_id"] for q in read_jsonl(DATA / "rejected_rewrites.jsonl")}
    remaining = [r for r in pool if r["id"] not in used]

    while len(queries) < args.n and remaining:
        batch, remaining = remaining[:10], remaining[10:]
        rewrites = rewrite(batch)
        missing = [r for r in batch if r["id"] not in rewrites]
        if missing:
            rewrites.update(rewrite(missing))  # one retry for items the model skipped
        candidates = [{"source_id": r["id"], "alert": rewrites[r["id"]]} for r in batch if r["id"] in rewrites]
        valid = validate(candidates, kb)
        queries += valid[: args.n - len(queries)]
        print(f"  {len(queries)}/{args.n} valid rewrites")
    write_outputs(queries, kb, args.known)


def write_outputs(queries: list[dict], kb: dict[int, dict], known: int):
    write_jsonl(DATA / "retrieval_queries.jsonl", queries)

    decision = [
        {"alert": q["alert"], "expected": "auto_suggest_fix", "source_id": q["source_id"],
         "severity": kb[q["source_id"]]["severity"], "category": kb[q["source_id"]]["category"]}
        for q in queries[:known]
    ]
    decision += [
        {"alert": n["alert"], "expected": "escalate", "source_id": None, "severity": n["severity"], "category": n["category"]}
        for n in read_jsonl(DATA / "novel_alerts.jsonl")
    ]
    write_jsonl(DATA / "decision_set.jsonl", decision)
    print(f"wrote {len(queries)} retrieval queries and {len(decision)} decision cases to {DATA}")


if __name__ == "__main__":
    main()
