"""Chaos test for the ingestion pipeline: inject faults while alerts flow, then verify nothing was
lost, stuck or triaged twice.

Each round sends a batch of alerts while one fault is active (AI errors, hangs, garbage responses,
a full AI outage, or a Redis restart), then waits for every alert to reach a terminal state:
COMPLETED, or FAILED (dead-lettered after the retry budget, visible for manual retry).

An unhandled failure is any of: a non-202 ingest response, an accepted alert missing from Postgres,
an alert still PENDING/PROCESSING after the settle deadline, more than one triage result per alert,
or the API becoming unreachable.

Needs: Spring API on --api using the mock AI (loadtest/mock_ai.py) on --mock, with short timeouts:
  TRIAGE_TIMEOUT_SECONDS=5 QUEUE_STALE_AFTER_SECONDS=30 QUEUE_SWEEP_INTERVAL_SECONDS=10
and Redis in the Docker container --redis-container.

Usage: python -m loadtest.chaos_test [--rounds 14] [--alerts 25]
"""

import argparse
import asyncio
import json
import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone

import httpx
import psycopg2

from loadtest.ingest_load import RESULTS, cleanup, fire, login

QUEUE_KEY = os.getenv("QUEUE_KEY", "alert_queue")
CLEAN = {"latency_ms": 200, "error_rate": 0.0, "hang_rate": 0.0, "garbage_rate": 0.0}

SCENARIOS = [
    ("ai-errors", {"error_rate": 0.3}, None),
    ("ai-hangs", {"hang_rate": 0.15}, None),
    ("ai-garbage", {"garbage_rate": 0.3}, None),
    ("ai-outage", {"error_rate": 1.0}, "restore-ai"),
    ("redis-restart", {}, "restart-redis"),
    ("mixed", {"error_rate": 0.15, "hang_rate": 0.05, "garbage_rate": 0.1}, None),
    # Slow AI builds a backlog, then the queue is wiped: queued alerts exist only in Postgres
    # and must be found and re-queued by the recovery sweeper.
    ("queue-loss", {"latency_ms": 3000}, "drop-queue"),
]


def set_mock(mock: str, **overrides):
    httpx.post(f"{mock}/control", json={**CLEAN, **overrides}, timeout=5).raise_for_status()


def inject(event: str, mock: str, container: str, delay: float):
    time.sleep(delay)
    if event == "restore-ai":
        set_mock(mock)  # AI comes back mid-round; retries with backoff should then succeed
    elif event == "restart-redis":
        subprocess.run(["docker", "restart", container], check=True, capture_output=True)
    elif event == "drop-queue":
        subprocess.run(["docker", "exec", container, "redis-cli", "DEL", QUEUE_KEY], check=True, capture_output=True)


def settle(tag: str, ids: list[int], timeout: float) -> dict:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    deadline = time.time() + timeout
    try:
        while True:
            with conn.cursor() as cur:
                cur.execute("SELECT status, count(*) FROM alerts WHERE source = %s GROUP BY status", (tag,))
                counts = dict(cur.fetchall())
            in_flight = counts.get("PENDING", 0) + counts.get("PROCESSING", 0)
            if in_flight == 0 or time.time() > deadline:
                break
            time.sleep(2)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM alerts WHERE id = ANY(%s)", (ids,))
            found = cur.fetchone()[0]
            cur.execute("""SELECT count(*) FROM (SELECT tr.alert_id FROM triage_results tr JOIN alerts a ON a.id = tr.alert_id
                           WHERE a.source = %s GROUP BY tr.alert_id HAVING count(*) > 1) d""", (tag,))
            duplicates = cur.fetchone()[0]
            cur.execute("""SELECT count(*) FROM incident_events e JOIN alerts a ON a.id = e.alert_id
                           WHERE a.source = %s AND e.type = 'RECOVERED'""", (tag,))
            recovered = cur.fetchone()[0]
    finally:
        conn.close()
    return {"status_counts": counts, "stuck": in_flight, "lost": len(ids) - found,
            "duplicate_triage_results": duplicates, "recovered_by_sweeper": recovered}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8080")
    parser.add_argument("--mock", default="http://localhost:8001")
    parser.add_argument("--redis-container", default="triage-redis")
    parser.add_argument("--rounds", type=int, default=14)
    parser.add_argument("--alerts", type=int, default=25)
    parser.add_argument("--rate", type=float, default=10)
    parser.add_argument("--settle-timeout", type=float, default=180)
    parser.add_argument("--keep", action="store_true", help="keep chaos alerts in the database")
    args = parser.parse_args()

    token = login(args.api, "analyst", "password123")
    rounds, totals = [], {"alerts": 0, "unhandled": 0}
    for r in range(args.rounds):
        name, faults, event = SCENARIOS[r % len(SCENARIOS)]
        tag = f"loadtest-chaos-{uuid.uuid4().hex[:6]}"
        set_mock(args.mock, **faults)
        injector = None
        if event:
            window = args.alerts / args.rate
            # Drop the queue near the end of sending, when the backlog is largest.
            delay = window * 0.9 if event == "drop-queue" else window / 2
            injector = threading.Thread(target=inject, args=(event, args.mock, args.redis_container, delay))
            injector.start()

        sent = asyncio.run(fire(args.rate, args.alerts / args.rate, args.api, token, tag))
        if injector:
            injector.join()
        ids = sent.pop("_ids")
        sent.pop("_start")
        set_mock(args.mock)  # stop injecting so retries can finish; the round's faults already hit
        outcome = settle(tag, ids, args.settle_timeout)

        try:
            api_alive = httpx.post(f"{args.api}/auth/login", json={"username": "analyst", "password": "password123"},
                                   timeout=10).status_code == 200
        except httpx.HTTPError:
            api_alive = False
        rejected = sent["sent"] - sent["accepted"]
        unhandled = rejected + outcome["lost"] + outcome["stuck"] + outcome["duplicate_triage_results"] + (0 if api_alive else 1)
        row = {"round": r + 1, "scenario": name, "sent": sent["sent"], "accepted": sent["accepted"],
               "ingest_status_counts": sent["status_counts"], **outcome, "api_alive": api_alive, "unhandled": unhandled}
        rounds.append(row)
        totals["alerts"] += sent["sent"]
        totals["unhandled"] += unhandled
        print(json.dumps(row))

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rounds": len(rounds),
        "alerts": totals["alerts"],
        "unhandled_failures": totals["unhandled"],
        "completed": sum(r["status_counts"].get("COMPLETED", 0) for r in rounds),
        "dead_lettered": sum(r["status_counts"].get("FAILED", 0) for r in rounds),
        "recovered_by_sweeper": sum(r["recovered_by_sweeper"] for r in rounds),
        "rounds_detail": rounds,
    }
    out = RESULTS / f"chaos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if k != "rounds_detail"}, indent=2))
    print(f"saved {out}")
    if not args.keep:
        cleanup("loadtest-")


if __name__ == "__main__":
    main()
