"""Open-loop load test for alert ingestion (POST /api/alerts -> Postgres -> Redis queue -> workers).

Requests fire on a fixed schedule at --rate per second regardless of how fast earlier ones return,
so a slow server shows up as latency and errors instead of silently lowering the offered load.
After sending, it tracks the run's alerts in Postgres until every one is triaged (end-to-end drain).

Usage: python -m loadtest.ingest_load --rate 50 --duration 60 [--rates 25,50,100] [--api http://localhost:8080]
"""

import argparse
import asyncio
import json
import os
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
RESULTS = ROOT / "loadtest" / "results"
RESULTS.mkdir(exist_ok=True)

SAMPLE_ALERTS = [
    "Timeout connecting to Postgres primary node, retrying after 30s",
    "Error: Unable to connect to Redis at cache-01:6379, connection refused",
    "SSL certificate expired for domain cdn.example.io",
    "java.lang.OutOfMemoryError: Java heap space at com.example.billing.InvoiceJob.run",
    "Node ip-10-4-7-21 NotReady: kubelet stopped posting node status",
    "Spike in failed logins: 3,400 attempts from 214 IPs in 5 minutes against /api/login",
]


def login(api: str, user: str, password: str) -> str:
    r = httpx.post(f"{api}/auth/login", json={"username": user, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def pct(values: list[float], p: float):
    if not values:
        return None
    values = sorted(values)
    return round(values[min(len(values) - 1, int(p * len(values)))], 1)


async def fire(rate: float, duration: float, api: str, token: str, tag: str) -> dict:
    latencies, statuses, ids = [], {}, []
    limits = httpx.Limits(max_connections=1000, max_keepalive_connections=200)
    async with httpx.AsyncClient(base_url=api, headers={"Authorization": f"Bearer {token}"},
                                 timeout=30, limits=limits) as client:
        async def one(i: int):
            t = time.perf_counter()
            try:
                r = await client.post("/api/alerts", json={"source": tag, "message": SAMPLE_ALERTS[i % len(SAMPLE_ALERTS)]})
                code = str(r.status_code)
                if r.status_code == 202:
                    ids.append(r.json()["id"])
            except httpx.HTTPError as e:
                code = type(e).__name__
            latencies.append((time.perf_counter() - t) * 1000)
            statuses[code] = statuses.get(code, 0) + 1

        total = int(rate * duration)
        start = time.perf_counter()
        tasks = []
        for i in range(total):
            delay = start + i / rate - time.perf_counter()
            if delay > 0:
                await asyncio.sleep(delay)
            tasks.append(asyncio.create_task(one(i)))
        send_window = time.perf_counter() - start
        await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start

    accepted = statuses.get("202", 0)
    return {
        "target_rate": rate,
        "duration_s": duration,
        "sent": total,
        "accepted": accepted,
        "status_counts": statuses,
        "send_window_s": round(send_window, 2),
        "accepted_per_s": round(accepted / elapsed, 1),
        "latency_ms": {"p50": pct(latencies, 0.50), "p95": pct(latencies, 0.95), "p99": pct(latencies, 0.99),
                       "max": round(max(latencies), 1) if latencies else None},
        "_ids": ids,
        "_start": start,
    }


def drain(tag: str, expected: int, timeout: float, started: float) -> dict:
    """Poll Postgres until every alert from this run reached a terminal state."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    deadline = time.time() + timeout
    counts = {}
    try:
        while time.time() < deadline:
            with conn.cursor() as cur:
                cur.execute("SELECT status, count(*) FROM alerts WHERE source = %s GROUP BY status", (tag,))
                counts = dict(cur.fetchall())
            if sum(counts.get(s, 0) for s in ("COMPLETED", "FAILED")) >= expected:
                break
            time.sleep(1)
        with conn.cursor() as cur:
            cur.execute("""SELECT count(*) FROM (SELECT alert_id FROM triage_results tr JOIN alerts a ON a.id = tr.alert_id
                           WHERE a.source = %s GROUP BY alert_id HAVING count(*) > 1) d""", (tag,))
            duplicates = cur.fetchone()[0]
    finally:
        conn.close()
    elapsed = time.perf_counter() - started
    done = sum(counts.get(s, 0) for s in ("COMPLETED", "FAILED"))
    return {
        "status_counts": counts,
        "terminal": done,
        "stuck": expected - done,
        "duplicate_triage_results": duplicates,
        "end_to_end_s": round(elapsed, 1),
        "end_to_end_per_s": round(done / elapsed, 1) if elapsed else None,
    }


def cleanup(prefix: str):
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("""DELETE FROM triage_results WHERE alert_id IN (SELECT id FROM alerts WHERE source LIKE %s)""", (prefix + "%",))
        cur.execute("""DELETE FROM incident_events WHERE alert_id IN (SELECT id FROM alerts WHERE source LIKE %s)""", (prefix + "%",))
        cur.execute("DELETE FROM alerts WHERE source LIKE %s", (prefix + "%",))
        print(f"cleaned up {cur.rowcount} load-test alerts")
    conn.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8080")
    parser.add_argument("--user", default="analyst")
    parser.add_argument("--password", default="password123")
    parser.add_argument("--rate", type=float, default=50)
    parser.add_argument("--rates", help="comma-separated rates to step through, overrides --rate")
    parser.add_argument("--duration", type=float, default=60)
    parser.add_argument("--drain-timeout", type=float, default=600)
    parser.add_argument("--no-drain", action="store_true")
    parser.add_argument("--cleanup", action="store_true", help="delete all load-test alerts and exit")
    args = parser.parse_args()

    if args.cleanup:
        cleanup("loadtest-")
        return

    token = login(args.api, args.user, args.password)
    rates = [float(r) for r in args.rates.split(",")] if args.rates else [args.rate]
    runs = []
    for rate in rates:
        tag = f"loadtest-{uuid.uuid4().hex[:8]}"
        print(f"--- {rate:g} alerts/s for {args.duration:g}s (source={tag})")
        result = asyncio.run(fire(rate, args.duration, args.api, token, tag))
        ids, started = result.pop("_ids"), result.pop("_start")
        if not args.no_drain:
            result["drain"] = drain(tag, len(ids), args.drain_timeout, started)
        result["tag"] = tag
        print(json.dumps(result, indent=2))
        runs.append(result)

    out = RESULTS / f"ingest_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "api": args.api, "runs": runs}, indent=2))
    print(f"saved {out}")


if __name__ == "__main__":
    main()
