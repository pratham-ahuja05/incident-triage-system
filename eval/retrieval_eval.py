"""Retrieval accuracy of the pgvector semantic search (no LLM in the loop being measured).

For each query (a rewrite of a known incident), take the top-k results and count a hit when a result is
relevant: the source incident itself, or one the judge model rules is the same problem with the same fix
(pooled relevance judgments, cached in data/relevance_judgments.json). The knowledge base holds
verbatim duplicates, so source-only ("strict") numbers are reported alongside.

Usage: python -m eval.retrieval_eval [--k 5]
"""

import argparse
import json
from datetime import datetime, timezone

from eval.common import RESULTS, DATA, Judge, load_kb, read_jsonl
from retrieval import retrieve_similar_incidents


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()

    kb = load_kb()
    judge = Judge(kb)
    queries = read_jsonl(DATA / "retrieval_queries.jsonl")
    cutoffs = [c for c in (1, 3, 5) if c <= args.k]

    hits = {c: 0 for c in cutoffs}
    strict = {c: 0 for c in cutoffs}
    rr_sum = 0.0
    misses = []
    for n, q in enumerate(queries, 1):
        results = retrieve_similar_incidents(q["alert"], top_k=args.k)
        ids = [r["id"] for r in results]
        relevant = judge.same(q["source_id"], ids)
        ranks = [i for i, rid in enumerate(ids, 1) if relevant[rid]]
        first = ranks[0] if ranks else None
        for c in cutoffs:
            hits[c] += bool(first and first <= c)
            strict[c] += q["source_id"] in ids[:c]
        rr_sum += 1 / first if first else 0
        if not first or first > 3:
            misses.append({"source_id": q["source_id"], "alert": q["alert"], "retrieved": ids,
                           "distances": [round(r["distance"], 3) for r in results]})
        if n % 20 == 0:
            print(f"  {n}/{len(queries)}")

    total = len(queries)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queries": total,
        "knowledge_base_size": len(kb),
        "embedding_model": "all-MiniLM-L6-v2 (384-d), pgvector cosine distance",
        **{f"hit@{c}": round(hits[c] / total, 3) for c in cutoffs},
        "mrr": round(rr_sum / total, 3),
        **{f"strict_hit@{c}": round(strict[c] / total, 3) for c in cutoffs},
        "misses_top3": misses,
    }
    (RESULTS / "retrieval.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "misses_top3"}, indent=2))


if __name__ == "__main__":
    main()
