"""End-to-end decision quality of the triage agent against the labelled decision set.

A case is correct when:
- known issue (expected auto_suggest_fix): the agent suggests a fix AND the incident it cites is the
  source or one the judge rules is the same problem (so the suggested resolution is actually right);
- novel issue (expected escalate): the agent escalates.

Results stream to results/decisions_<mode>.jsonl so an interrupted run (rate limits) resumes where it stopped.
Cases where the provider was unavailable (agent == "fallback") are not scored; rerun to fill them in.

Usage: python -m eval.decision_eval [--mode tools|pipeline] [--limit N] [--pace SECONDS]
"""

import argparse
import json
import os
import statistics
import time
from datetime import datetime, timezone

from eval.common import RESULTS, DATA, Judge, append_jsonl, load_kb, read_jsonl, write_jsonl


def run(mode: str, limit: int | None, pace: float):
    os.environ["AGENT_MODE"] = mode
    import agent  # after AGENT_MODE is set
    agent.AGENT_MODE = mode

    cases = read_jsonl(DATA / "decision_set.jsonl")[:limit]
    out = RESULTS / f"decisions_{mode}.jsonl"
    done = {r["alert"]: r for r in read_jsonl(out) if r.get("agent") != "fallback"}
    write_jsonl(out, list(done.values()))  # drop unscored fallback rows before resuming

    for n, case in enumerate(cases, 1):
        if case["alert"] in done:
            continue
        t = time.perf_counter()
        result = agent.triage(case["alert"])
        row = {**case, "latency_ms": int((time.perf_counter() - t) * 1000),
               **{k: result.get(k) for k in ("decision", "matched_incident_id", "confidence_distance",
                                             "severity", "category", "reasoning", "agent")}}
        row["predicted_severity"], row["predicted_category"] = row.pop("severity"), row.pop("category")
        row["severity"], row["category"] = case["severity"], case["category"]
        append_jsonl(out, row)
        print(f"  [{n}/{len(cases)}] expected={case['expected']:<16} got={row['decision']:<16} "
              f"agent={row['agent']:<17} {case['alert'][:60]!r}")
        if row["agent"] == "fallback" and "rate" in (row["reasoning"] or "").lower():
            print("  provider is rate-limiting; stopping. Rerun later to resume.")
            break
        time.sleep(pace)


def score(mode: str):
    kb = load_kb()
    judge = Judge(kb)
    rows = [r for r in read_jsonl(RESULTS / f"decisions_{mode}.jsonl") if r.get("agent") != "fallback"]
    known = [r for r in rows if r["expected"] == "auto_suggest_fix"]
    novel = [r for r in rows if r["expected"] == "escalate"]

    for r in rows:
        r["right_incident"] = (
            r["decision"] == "auto_suggest_fix" and r["source_id"] is not None and r["matched_incident_id"] is not None
            and judge.same(r["source_id"], [r["matched_incident_id"]])[r["matched_incident_id"]]
        )
        r["correct"] = r["right_incident"] if r["expected"] == "auto_suggest_fix" else r["decision"] == "escalate"

    suggested = [r for r in rows if r["decision"] == "auto_suggest_fix"]
    pct = lambda num, den: round(num / den, 3) if den else None  # noqa: E731
    latencies = sorted(r["latency_ms"] for r in rows)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "model": __import__("llm").MODEL,
        "cases_scored": len(rows),
        "known_issue_cases": len(known),
        "novel_issue_cases": len(novel),
        "decision_agreement": pct(sum(r["correct"] for r in rows), len(rows)),
        "auto_suggest_rate": pct(len(suggested), len(rows)),
        "auto_suggest_precision": pct(sum(r["right_incident"] for r in suggested), len(suggested)),
        "known_issue_recall": pct(sum(r["right_incident"] for r in known), len(known)),
        "novel_issue_escalation_rate": pct(sum(r["decision"] == "escalate" for r in novel), len(novel)),
        "severity_agreement": pct(sum(r["predicted_severity"] == r["severity"] for r in rows), len(rows)),
        "category_agreement": pct(sum(r["predicted_category"] == r["category"] for r in rows), len(rows)),
        "agent_paths": {p: sum(r["agent"] == p for r in rows) for p in sorted({r["agent"] for r in rows})},
        "latency_ms_p50": statistics.median(latencies) if latencies else None,
        "latency_ms_p95": latencies[int(0.95 * (len(latencies) - 1))] if latencies else None,
        "errors": [
            {k: r[k] for k in ("alert", "expected", "decision", "source_id", "matched_incident_id", "reasoning")}
            for r in rows if not r["correct"]
        ],
    }
    (RESULTS / f"decision_{mode}.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "errors"}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="tools", choices=["tools", "pipeline"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--pace", type=float, default=8.0, help="seconds between cases (free-tier token limits)")
    parser.add_argument("--score-only", action="store_true")
    args = parser.parse_args()
    if not args.score_only:
        run(args.mode, args.limit, args.pace)
    score(args.mode)


if __name__ == "__main__":
    main()
