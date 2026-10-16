"""Seed realistic demo data for screenshots and demo videos.

Every incident goes through the real pipeline (API -> Redis queue -> AI service -> decision), and every
follow-up (assign, comment, approve, resolve, investigate) is a real API call by a real demo user.
The only thing done directly in the database is moving timestamps, so two weeks of history appear
instead of everything happening in the last few minutes. Decisions, match scores and AI output are untouched.

Usage (from the project root, venv active):
    python demo_seed.py --archive-existing     # hide current incidents (soft delete), then seed
    python demo_seed.py                        # seed on top of what is there
    python demo_seed.py --reset-demo           # replace a previous demo run with a fresh one
    python demo_seed.py --restore              # bring back incidents hidden by --archive-existing

Safety:
- Refuses to run if the AI service has a Slack webhook configured (escalations would post to Slack),
  unless --allow-slack is given. Run the AI service with SLACK_WEBHOOK_URL= for seeding.
- --archive-existing only soft-deletes (reversible with --restore); nothing is hard-deleted.
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

ARCHIVE_FILE = "demo_archived_ids.json"
SEEDED_FILE = "demo_seeded_ids.json"
PASSWORD = "password123"
DEMO_ANALYSTS = ["priya", "rahul", "neha"]
SLA_HOURS = {"P1": 4, "P2": 24, "P3": 72, "P4": 168}

# human: what people do after the AI decides
#   loop    -> fix suggested: approve it; escalated: resolve with `note`
#   reject  -> fix suggested: reject it (then someone works it)
#   work    -> assigned and in progress, still open
#   review  -> fix in place, waiting in "In review"
#   none    -> untouched (shows up in "Needs attention")
INCIDENTS = [
    # ---- today: fresh, mostly untouched
    dict(day=0, hour=-1.2, source="checkout-service", message="Error: Unable to connect to Redis at cache-03:6379, connection refused", human="none"),
    dict(day=0, hour=-2.5, source="payments-api", message="Stripe webhook signature verification failed for 37 events in the last 5 minutes", human="none"),
    dict(day=0, hour=-3.4, source="edge-gateway", message="SSL certificate expired for domain api.shopwave.io, TLS handshake failures from 412 clients", human="work", assignee="rahul",
         comments=[("rahul", "Renewing via cert-manager now, ETA 10 min."), ("priya", "@rahul status page updated.")], labels=["customer-facing", "tls"]),
    dict(day=0, hour=-5.0, source="orders-worker", message="Consumer group orders-v2 lag exceeded 52000 messages on topic order-events partition 4", human="work", assignee="neha",
         comments=[("neha", "Lag started right after the 14:05 deploy. Scaling consumers 4 → 8 while I look.")], labels=["kafka"], investigate=True),
    dict(day=0, hour=-6.5, source="auth-service", message="java.lang.NullPointerException at com.shopwave.auth.TokenValidator.validate(TokenValidator.java:88)", human="none"),
    # ---- last few days: a mix, some overdue
    dict(day=1, hour=10.2, source="checkout-service", message="Timeout connecting to Postgres primary node db-primary-1, retrying after 30s", human="loop", assignee="priya", resolve_hours=0.8),
    dict(day=1, hour=14.7, source="search-api", message="Elasticsearch cluster health RED: 3 unassigned primary shards on index products-v7", human="work", assignee="analyst", priority="P1",
         comments=[("analyst", "Node es-data-2 ran out of disk. Freeing space and re-allocating shards."), ("rahul", "Search is degraded for ~8% of queries, not down.")], labels=["search", "disk"], investigate=True),
    dict(day=1, hour=19.1, source="cdn-proxy", message="Upstream 502 Bad Gateway from origin-eu-west, error rate 4.2% over 10 minutes", human="none"),
    dict(day=2, hour=9.4, source="payments-api", message="Timeout connecting to Postgres primary node, retrying after 30s", human="loop", assignee="analyst", resolve_hours=1.6),
    dict(day=2, hour=11.8, source="notification-svc", message="SMTP relay rejected 1,204 messages: 421 Too many connections from 10.4.2.17", human="loop", assignee="neha", resolve_hours=3.5,
         note="Raised the relay's per-host connection limit and added a connection pool cap of 20 in notification-svc."),
    dict(day=2, hour=16.3, source="checkout-service", message="Error: Unable to connect to Redis at cache-01:6379, connection refused", human="review", assignee="rahul"),
    dict(day=3, hour=8.9, source="inventory-api", message="Deadlock detected while updating stock_levels; transaction rolled back (SQLSTATE 40P01)", human="loop", assignee="priya", resolve_hours=6.0,
         note="Two jobs updated stock_levels in different row orders. Made both lock rows ordered by sku_id; no deadlocks since."),
    dict(day=3, hour=13.5, source="k8s-cluster", message="Pod payments-api-7d9f8 in CrashLoopBackOff: liveness probe failed, exit code 137 (OOMKilled)", human="work", assignee="analyst", priority="P2",
         comments=[("analyst", "Memory limit is 512Mi, heap is set to 480m — no headroom. Bumping limit to 1Gi in the next release.")], labels=["kubernetes", "memory"]),
    dict(day=3, hour=20.2, source="edge-gateway", message="Rate limiter returning 429 to 18% of requests from partner integration acme-retail", human="none"),
    dict(day=4, hour=10.0, source="auth-service", message="Spike in failed logins: 3,400 attempts from 214 IPs in 5 minutes against /api/login", human="loop", assignee="neha", resolve_hours=2.2,
         note="Credential-stuffing burst. Enabled the WAF bot rule for /api/login and lowered per-IP attempts to 5/min."),
    dict(day=4, hour=15.6, source="billing-cron", message="Nightly invoice job exceeded 2h runtime, 1,930 invoices still pending", human="reject", assignee="rahul"),
    dict(day=5, hour=9.1, source="checkout-service", message="Timeout connecting to Postgres primary node, retrying after 10s", human="loop", assignee="priya", resolve_hours=0.6),
    dict(day=5, hour=12.4, source="storage-svc", message="S3 PutObject AccessDenied for bucket shopwave-uploads-prod after IAM role rotation", human="loop", assignee="analyst", resolve_hours=1.1,
         note="The rotated role was missing s3:PutObject on the uploads bucket. Restored the policy statement from the previous role version."),
    dict(day=6, hour=14.0, source="dns", message="NXDOMAIN for internal.payments.svc.cluster.local from 12% of pods in namespace payments", human="loop", assignee="rahul", resolve_hours=4.0,
         note="CoreDNS was OOMKilled under load. Raised its memory limit and added a second replica."),
    dict(day=7, hour=10.5, source="edge-gateway", message="SSL certificate expired for domain cdn.shopwave.io", human="loop", assignee="neha", resolve_hours=0.5),
    dict(day=7, hour=17.8, source="orders-worker", message="Message processing failed: JSON parse error at line 1 column 512 in order-events payload", human="loop", assignee="priya", resolve_hours=9.0,
         note="A producer started sending a new optional field as a string. Made the consumer schema tolerant and added a contract test."),
    dict(day=8, hour=11.3, source="checkout-service", message="Error: Unable to connect to Redis at cache-02:6379, connection refused", human="loop", assignee="analyst", resolve_hours=0.4),
    dict(day=9, hour=9.7, source="search-api", message="p99 latency for /search rose from 180ms to 2.4s after deploy 2026.10.07-1", human="loop", assignee="rahul", resolve_hours=3.0,
         note="New ranking feature did an N+1 query per result. Rolled back, fixed with a batched lookup, re-deployed."),
    dict(day=10, hour=13.2, source="payments-api", message="Timeout connecting to Postgres primary node, retrying after 30s", human="loop", assignee="neha", resolve_hours=1.3),
    dict(day=11, hour=15.5, source="k8s-cluster", message="Node ip-10-4-7-21 NotReady: kubelet stopped posting node status", human="loop", assignee="priya", resolve_hours=2.8,
         note="EC2 host had a failing EBS volume. Cordoned and drained the node; the autoscaler replaced it."),
    dict(day=12, hour=10.1, source="auth-service", message="java.lang.NullPointerException at com.shopwave.auth.SessionStore.get(SessionStore.java:41)", human="loop", assignee="analyst", resolve_hours=5.5,
         note="Session lookups for expired SSO users returned null. Added a null guard and a metric for expired-session hits."),
    dict(day=13, hour=12.0, source="checkout-service", message="Error: Unable to connect to Redis at cache-01:6379, connection refused", human="loop", assignee="rahul", resolve_hours=0.7),
]


class Api:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.tokens = {}

    def login(self, user):
        if user not in self.tokens:
            r = requests.post(f"{self.base}/auth/login", json={"username": user, "password": PASSWORD}, timeout=15)
            r.raise_for_status()
            self.tokens[user] = r.json()["token"]
        return self.tokens[user]

    def call(self, user, method, path, **kw):
        for attempt in range(8):
            r = requests.request(method, f"{self.base}{path}", headers={"Authorization": f"Bearer {self.login(user)}"}, timeout=60, **kw)
            if r.status_code != 429:
                break
            # The API allows 10 new alerts per minute; wait for the bucket to refill instead of failing.
            wait = 8 + attempt * 4
            print(f"    rate limited by the API, waiting {wait}s…")
            time.sleep(wait)
        if not r.ok:
            raise RuntimeError(f"{method} {path} as {user} -> {r.status_code}: {r.text[:200]}")
        return r.json() if r.content and "json" in r.headers.get("content-type", "") else None


def db():
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (see .env).")
    return psycopg2.connect(url)


def ensure_demo_users(api):
    """Register demo analysts and grant ANALYST (registration alone creates VIEWERs)."""
    for name in DEMO_ANALYSTS:
        r = requests.post(f"{api.base}/auth/register", json={"username": name, "email": f"{name}@demo.local", "password": PASSWORD}, timeout=15)
        if r.status_code not in (200, 201, 400, 409):
            r.raise_for_status()
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM roles WHERE name = 'ANALYST'")
        analyst_role = cur.fetchone()[0]
        for name in DEMO_ANALYSTS:
            cur.execute("SELECT id FROM users WHERE username = %s", (name,))
            row = cur.fetchone()
            if not row:
                continue
            cur.execute("DELETE FROM user_roles WHERE user_id = %s", (row[0],))
            cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", (row[0], analyst_role))
    print(f"  demo analysts ready: {', '.join(DEMO_ANALYSTS)} (password {PASSWORD})")


def archive_existing(api):
    alerts = api.call("admin", "GET", "/api/alerts")
    ids = [a["id"] for a in alerts]
    for i in ids:
        api.call("admin", "DELETE", f"/api/alerts/{i}")
    previous = json.load(open(ARCHIVE_FILE)) if os.path.exists(ARCHIVE_FILE) else []
    json.dump(sorted(set(previous + ids)), open(ARCHIVE_FILE, "w"))
    print(f"  archived {len(ids)} existing incidents (soft delete; restore with --restore)")


def restore(api):
    if not os.path.exists(ARCHIVE_FILE):
        sys.exit("Nothing to restore.")
    ids = json.load(open(ARCHIVE_FILE))
    for i in ids:
        try:
            api.call("admin", "PUT", f"/api/alerts/{i}/restore")
        except RuntimeError as e:
            print("  skip", i, e)
    os.remove(ARCHIVE_FILE)
    print(f"  restored {len(ids)} incidents")


def remember_seeded(ids):
    previous = json.load(open(SEEDED_FILE)) if os.path.exists(SEEDED_FILE) else []
    json.dump(sorted(set(previous + ids)), open(SEEDED_FILE, "w"))


def reset_demo(api):
    """Soft-delete incidents created by previous demo runs."""
    if not os.path.exists(SEEDED_FILE):
        return
    ids = json.load(open(SEEDED_FILE))
    for i in ids:
        try:
            api.call("admin", "DELETE", f"/api/alerts/{i}")
        except RuntimeError:
            pass  # already deleted
    os.remove(SEEDED_FILE)
    print(f"  hid {len(ids)} incidents from the previous demo run")


def wait_for_decision(api, alert_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        a = next((x for x in api.call("admin", "GET", "/api/alerts") if x["id"] == alert_id), None)
        if a and (a["decision"] or a["status"] == "FAILED"):
            return a
        time.sleep(1.5)
    raise RuntimeError(f"INC-{alert_id} was not triaged within {timeout}s — is the AI service running?")


def play(api, spec):
    reporter = random.choice(["admin", "analyst", "priya", "rahul", "neha"])
    created = api.call(reporter, "POST", "/api/alerts", json={"source": spec["source"], "message": spec["message"]})
    remember_seeded([created["id"]])
    a = wait_for_decision(api, created["id"])
    aid, who = a["id"], spec.get("assignee")
    print(f"  INC-{aid:<4} {a['decision'] or a['status']:<17} {spec['source']}")

    if spec.get("priority"):
        api.call(who or "admin", "PATCH", f"/api/alerts/{aid}", json={"priority": spec["priority"]})
    if who and spec["human"] != "none":
        api.call(who, "PATCH", f"/api/alerts/{aid}", json={"assignee": who})
    if spec.get("labels"):
        api.call(who or "admin", "PATCH", f"/api/alerts/{aid}", json={"labels": spec["labels"]})
    for user, text in spec.get("comments", []):
        api.call(user, "POST", f"/api/alerts/{aid}/comments", json={"body": text})
    if spec.get("investigate"):
        try:
            api.call(who or "analyst", "POST", f"/api/alerts/{aid}/investigation")
        except RuntimeError as e:
            print("    investigation skipped:", e)

    human, fix = spec["human"], a["decision"] == "auto_suggest_fix"
    if human == "loop":
        if fix:
            api.call(who, "POST", f"/api/triage-results/{a['triageResultId']}/review", params={"decision": "APPROVED"})
        elif a["decision"] == "escalate":
            note = spec.get("note") or "Restarted the affected dependency and confirmed recovery on the dashboards."
            api.call(who, "POST", f"/api/triage-results/{a['triageResultId']}/resolve", json={"resolutionNote": note})
    elif human == "reject" and fix:
        api.call(who, "POST", f"/api/triage-results/{a['triageResultId']}/review", params={"decision": "REJECTED"})
    elif human == "review":
        api.call(who, "PATCH", f"/api/alerts/{aid}", json={"ticketStatus": "IN_REVIEW"})
    return aid


def spread_in_time(placed):
    """Move each seeded incident (and its activity) to its planned point in the last two weeks."""
    now = datetime.now()
    system_types = ("CREATED", "PROCESSING", "TRIAGED", "ATTEMPT_FAILED", "FAILED")
    with db() as conn, conn.cursor() as cur:
        for aid, spec in placed:
            day0 = (now - timedelta(days=spec["day"])).replace(hour=0, minute=0, second=0, microsecond=0)
            target = now + timedelta(hours=spec["hour"]) if spec["day"] == 0 else day0 + timedelta(hours=spec["hour"])
            target = min(target, now - timedelta(minutes=20))

            cur.execute("SELECT created_at, priority, resolved_at FROM alerts WHERE id = %s", (aid,))
            created_old, priority, resolved_old = cur.fetchone()
            delta = target - created_old
            resolved_new = target + timedelta(hours=spec["resolve_hours"]) if resolved_old and spec.get("resolve_hours") else None
            if resolved_new and resolved_new > now:
                resolved_new = now - timedelta(minutes=5)
            due = target + timedelta(hours=SLA_HOURS[priority]) if priority in SLA_HOURS else None

            cur.execute("UPDATE alerts SET created_at = %s, due_at = %s, resolved_at = %s WHERE id = %s", (target, due, resolved_new, aid))
            cur.execute("UPDATE triage_results SET created_at = created_at + %s WHERE alert_id = %s", (delta, aid))
            # pipeline events keep their real second-level spacing
            cur.execute("UPDATE incident_events SET created_at = created_at + %s WHERE alert_id = %s AND type = ANY(%s)", (delta, aid, list(system_types)))
            # people's actions are spread between triage and resolution (or the next few hours if still open)
            cur.execute("SELECT id, type FROM incident_events WHERE alert_id = %s AND NOT (type = ANY(%s)) ORDER BY created_at, id", (aid, list(system_types)))
            human_events = cur.fetchall()
            end = resolved_new or min(now - timedelta(minutes=2), target + timedelta(hours=random.uniform(1.5, 5)))
            start = target + timedelta(minutes=3)
            for k, (eid, etype) in enumerate(human_events):
                is_final = resolved_new and etype in ("REVIEW", "RESOLVED") or (resolved_new and k == len(human_events) - 1)
                at = end if is_final else start + (end - start) * (k + 1) / (len(human_events) + 1)
                cur.execute("UPDATE incident_events SET created_at = %s WHERE id = %s", (at, eid))
            cur.execute(
                "UPDATE alerts SET investigated_at = (SELECT max(created_at) FROM incident_events WHERE alert_id = %s AND type = 'INVESTIGATED') "
                "WHERE id = %s AND investigated_at IS NOT NULL", (aid, aid))
    print(f"  spread {len(placed)} incidents over the last 14 days")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api", default="http://localhost:8080")
    p.add_argument("--ai", default="http://localhost:8000")
    p.add_argument("--archive-existing", action="store_true", help="soft-delete current incidents first")
    p.add_argument("--restore", action="store_true", help="restore incidents archived by a previous run")
    p.add_argument("--reset-demo", action="store_true", help="hide incidents from previous demo runs before seeding")
    p.add_argument("--allow-slack", action="store_true", help="seed even if escalations would post to Slack")
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()
    random.seed(args.seed)
    api = Api(args.api)

    if args.restore:
        restore(api)
        return

    try:
        health = requests.get(f"{args.ai}/health", timeout=5).json()
    except requests.RequestException:
        sys.exit(f"AI service not reachable at {args.ai}")
    if health.get("slack_configured") and not args.allow_slack:
        sys.exit("The AI service has SLACK_WEBHOOK_URL set, so every escalation would post to Slack.\n"
                 "Restart it with SLACK_WEBHOOK_URL= (empty), or pass --allow-slack.")

    print("Preparing demo users…")
    ensure_demo_users(api)
    if args.reset_demo:
        print("Removing the previous demo run…")
        reset_demo(api)
    if args.archive_existing:
        print("Archiving existing incidents…")
        archive_existing(api)

    print(f"Running {len(INCIDENTS)} incidents through the real pipeline (oldest first)…")
    placed = []
    for spec in sorted(INCIDENTS, key=lambda s: -s["day"]):
        placed.append((play(api, spec), spec))
    spread_in_time(placed)
    print("Done. Open the dashboard — Overview, Kanban and Calendar now have two weeks of history.")


if __name__ == "__main__":
    main()
