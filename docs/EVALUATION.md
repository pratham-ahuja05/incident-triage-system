# Evaluation

How well IncidentSense retrieves, decides and survives failures, measured on 2026-11-07. Every number
here comes from a script in this repo, and the raw outputs are committed under `eval/results/` and
`loadtest/results/`.

| What | Result | Raw output |
|---|---|---|
| Retrieval, top-3 hit rate (strict: the exact source incident) | **91%** (Hit@1 71%, MRR 0.945 issue-level) | `eval/results/retrieval.json` |
| Retrieval, top-3 hit rate (issue-level: an incident with the same problem and fix) | **96%** | same |
| Triage decision agreement with labels (100 cases) | **85%** | `eval/results/decision_tools.json` |
| Fixes suggested automatically | **45%** of alerts, **0 wrong** (precision 100%) | same |
| Novel failures correctly escalated | **40 / 40** | same |
| Alert ingestion under load | **100 alerts/s**, 0 errors, p99 52 ms | `loadtest/results/ingest_20261107_232658.json` |
| Failure injection | **350 alerts, 14 rounds, 0 unhandled failures** | `loadtest/results/chaos_20261107_234151.json` |
| Fallback and guardrail unit tests | **49 passing** (offline, run in CI) | `tests/` |

## Data

The knowledge base holds **193 resolved incidents** (169 distinct texts; the rest are verbatim copies
left by the demo seeder). The incidents are synthetic: an LLM generated them. Every result below is on
synthetic data, not real production logs.

Two models play two roles, so the system never grades itself:

- **System under test:** `openai/gpt-oss-120b` (the triage agent).
- **Generator and judge:** `qwen/qwen3.8-27b`, which writes the test alerts and decides relevance.

### Test alerts ([eval/build_eval_set.py](../eval/build_eval_set.py))

1. Sample 100 distinct knowledge-base incidents (seed 42). Each becomes a "source".
2. The generator rewrites each source as the same failure would look on another day: different hosts,
   IPs, IDs and numbers, and different wording and format.
3. The judge checks that each rewrite still describes the source's failure. It rejected 19 rewrites
   that drifted (e.g. "Java heap space" rewritten as "GC overhead limit exceeded", Redis rewritten as
   Memcached). Those are logged in `eval/data/rejected_rewrites.jsonl` and replaced with fresh sources.
4. **Decision set** ([eval/data/decision_set.jsonl](../eval/data/decision_set.jsonl)) has 100 cases:
   - 60 rewrites of known incidents. Expected answer: suggest a fix.
   - 40 hand-written alerts for failures the knowledge base does not cover
     ([eval/data/novel_alerts.jsonl](../eval/data/novel_alerts.jsonl)). Expected answer: escalate.
     Several are deliberate near-misses: inode exhaustion vs. the disk-space incidents, Redis OOM vs.
     Redis connection refused, certificate renewal failing vs. an expired certificate.

### Relevance

Because the knowledge base contains duplicates, "the right incident" is a set, not a single id.
Retrieved incidents are judged with pooled relevance judgments, the standard TREC approach: a
retrieved incident counts as correct if it is the source, has identical text, or the judge rules it
is the same failing component and failure mode with the same fix. Verdicts are cached in
`eval/data/relevance_judgments.json`. The strict metric uses no judge at all.

## Retrieval ([eval/retrieval_eval.py](../eval/retrieval_eval.py))

Embedding search only (all-MiniLM-L6-v2, 384 dimensions, pgvector cosine distance), with no LLM in
the measured path. The test set is 100 rewritten alerts.

| Metric | Strict (source only) | Issue-level (judged) |
|---|---|---|
| Hit@1 | 71% | 92% |
| Hit@3 | **91%** | **96%** |
| Hit@5 | 98% | 99% |
| MRR | | 0.945 |

Strict Hit@1 is low because several sources have identical copies in the knowledge base, and search
can rank a copy first.

## Triage decisions ([eval/decision_eval.py](../eval/decision_eval.py))

Each case runs end to end through `agent.triage()`, the same function `/triage` serves. A case counts
as correct when:

- **known issue:** the agent suggests a fix **and** the incident it cites is relevant (so the
  suggested resolution is actually right);
- **novel issue:** the agent escalates.

| Metric | Result |
|---|---|
| Decision agreement | **85%** (85 / 100) |
| Auto-suggest rate | 45% of all alerts (45 / 100) |
| Auto-suggest precision | **100%**: every suggested fix cited a correct incident |
| Recall on known issues | 75% (45 / 60) |
| Escalation of novel issues | **100%** (40 / 40) |
| Category agreement | 83% |
| Severity agreement | 47% (see caveats) |
| Execution path | 97 tool-calling agent, 3 pipeline fallback |
| Latency | p50 1.6 s, p95 6.7 s (free-tier Groq, includes rate-limit waits) |

**All 15 errors are conservative.** In every one, a known issue was escalated instead of getting a
fix suggested. Six of them are NullPointerExceptions where the rewrite named a different class than
the source, so escalating there is arguably correct. Three were blocked by the distance guardrail at
0.40 to 0.59. The agent never suggested a wrong fix.

The auto-suggest rate depends on the mix of the test set (60% known issues). The rates that don't
depend on the mix are recall on known issues (75%) and false suggestions on novel issues (0%).

**What the eval caught.** The first run exposed a real bug. For escalations, `gpt-oss` sometimes
emitted the tool arguments without the tool-call wrapper, and the provider rejected the call with
`tool_use_failed`. The pipeline fallback handled these safely (27 of 85 cases on that run). The agent
now recovers the decision from the failed generation, and the recovered decision still passes the
guardrails (`_recover_tool_call` in [agent.py](../agent.py)).

## Ingestion load ([loadtest/ingest_load.py](../loadtest/ingest_load.py))

**Setup:**

- **What's measured:** `POST /api/alerts` → Postgres insert + audit event → Redis `LPUSH` → `202`.
- **Load generator:** open loop. Requests fire on schedule regardless of responses, so a slow server
  shows up as latency and errors instead of lowering the offered load.
- **Environment:** one laptop (Windows, Docker Postgres/Redis), the per-client rate limiter set high
  (`RATE_LIMIT_PER_MINUTE=100000`), 8 queue workers, and the mock AI service
  ([loadtest/mock_ai.py](../loadtest/mock_ai.py), about 200 ms per triage) so the run spends no LLM
  quota.

| Offered rate (60 s each) | Accepted | Errors | p50 | p95 | p99 | Drained end to end |
|---|---|---|---|---|---|---|
| 25 / s | 1,500 | 0 | 28 ms | 67 ms | 165 ms | 24.6 / s |
| 50 / s | 3,000 | 0 | 23 ms | 83 ms | 496 ms | 31.5 / s |
| 75 / s | 4,500 | 0 | 20 ms | 42 ms | 50 ms | 33.2 / s |
| 100 / s | 6,000 | 0 | 23 ms | 43 ms | 52 ms | 33.2 / s |

All 15,000 alerts were triaged, with no alert stuck and no alert triaged twice.

**Ingestion and triage are separate limits.** Ingestion stays flat at 100 alerts/s. Draining is
bounded by workers × AI latency (8 workers ÷ 0.2 s is about 40 / s theoretical), so the queue absorbs
the burst and drains behind it. With the real LLM, triage throughput is set by the provider's rate
limit (the free tier allows 8k tokens/min, which is a few alerts per minute), not by this pipeline.

## Failure injection ([loadtest/chaos_test.py](../loadtest/chaos_test.py))

Each round sends 25 alerts while one fault is active, then waits for every alert to reach a terminal
state. A round records an unhandled failure for any of:

- a non-202 ingest response;
- an accepted alert missing from Postgres;
- an alert still `PENDING`/`PROCESSING` after 3 minutes;
- more than one triage result for an alert;
- the API becoming unreachable.

| Scenario | Fault |
|---|---|
| ai-errors | 30% of triage calls return HTTP 500 |
| ai-hangs | 15% of calls never answer (cut off by the 5 s triage timeout) |
| ai-garbage | 30% of calls return a non-JSON body |
| ai-outage | the AI service fails every call for the first half of the round |
| redis-restart | `docker restart` of Redis mid-round |
| mixed | 15% errors + 5% hangs + 10% garbage |
| queue-loss | slow AI builds a backlog, then the Redis queue is deleted |

The test ran 14 rounds (each scenario twice), **350 alerts in total**:

- 350 completed;
- 0 lost, 0 stuck, 0 duplicates, so **0 unhandled failures**;
- 11 alerts were wiped from Redis in the queue-loss rounds and recovered by the sweeper.

An earlier 12-round run without queue-loss (300 alerts) also had 0 unhandled failures. In that run,
126 triage attempts failed (100 HTTP 500s, 20 garbage bodies, 6 timeouts) and all were retried to
completion.

### Hardening made while building these tests

| Problem found | Fix |
|---|---|
| No timeout on the AI call: a hung AI service would pin a worker forever | `app.triage.timeout-seconds` (default 90) |
| An alert could be stranded in `PENDING` if Redis failed during a retry's re-enqueue, or in `PROCESSING` after a crash | recovery sweeper re-queues alerts idle past `app.queue.stale-after-seconds`, skipping any still in the queue |
| Re-queueing could cause double processing | workers atomically claim an alert (`UPDATE … WHERE status = 'PENDING'`); duplicate queue entries become no-ops |
| Ingest returned 500 when Redis was down, though the alert was saved | ingest returns 202 and leaves the alert to the sweeper |
| One global rate-limit bucket at 10 alerts/min: a single client blocked everyone | per-client buckets, `RATE_LIMIT_PER_MINUTE` (default 60) |
| A single consumer thread | `QUEUE_CONSUMERS` workers (default 4) |

## Caveats

- **Synthetic data.** Both the knowledge base and the rewrites are LLM-written, which likely makes
  retrieval easier than real logs would.
- **Labels.** Labels for known issues come from their source incident. The 40 novel alerts and their
  labels were written for this evaluation. Review `eval/data/decision_set.jsonl` before calling these
  labels manually verified.
- **Severity agreement is low (47%).** The reference severities were assigned by the model that
  generated the knowledge base, without a rubric. The agent uses an explicit rubric. Treat this number
  as "no shared standard" rather than as accuracy.
- **Single run.** LLM outputs vary; expect a few points of run-to-run variance in the decision metrics.
- **Laptop numbers.** Load numbers come from one machine with a mock AI service, not the Azure VM.

## Reproduce

```bash
# Python side (repo root, venv active, Postgres with the knowledge base running)
python -m pytest tests -q                                  # 49 offline tests
python -m eval.build_eval_set                              # regenerate test alerts (uses Groq)
python -m eval.retrieval_eval
python -m eval.decision_eval --mode tools                  # resumable; ~100 cases, rate-limited
python -m eval.decision_eval --mode pipeline               # baseline: the fixed pipeline

# Load and chaos (Spring API on :8080 pointed at the mock AI on :8001)
uvicorn loadtest.mock_ai:app --port 8001
#   start Spring with: PYTHON_SERVICE_URL=http://localhost:8001 RATE_LIMIT_PER_MINUTE=100000 QUEUE_CONSUMERS=8
#                      TRIAGE_TIMEOUT_SECONDS=5 QUEUE_STALE_AFTER_SECONDS=30 QUEUE_SWEEP_INTERVAL_SECONDS=10
python -m loadtest.ingest_load --rates 25,50,75,100 --duration 60
python -m loadtest.chaos_test
python -m loadtest.ingest_load --cleanup                   # remove load-test alerts
```
