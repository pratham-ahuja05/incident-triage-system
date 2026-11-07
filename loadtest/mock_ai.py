"""Stand-in for the Python AI service, used to load-test and fault-inject the Spring ingestion pipeline
without spending LLM quota. Implements /triage with configurable latency and failure modes.

Run:     uvicorn loadtest.mock_ai:app --port 8001
Tune:    POST /control {"latency_ms": 300, "error_rate": 0.2, "hang_rate": 0.05, "garbage_rate": 0.05}
"""

import asyncio
import random

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

app = FastAPI(title="Mock AI service")

config = {
    "latency_ms": 200,     # mean simulated triage time
    "error_rate": 0.0,     # HTTP 500
    "hang_rate": 0.0,      # never answers within the caller's timeout
    "garbage_rate": 0.0,   # 200 with a body that is not a triage result
    "hang_seconds": 600,
}
stats = {"requests": 0, "ok": 0, "errors": 0, "hangs": 0, "garbage": 0}


@app.get("/health")
def health():
    return {"status": "ok", "slack_configured": False}


@app.get("/control")
def get_control():
    return {"config": config, "stats": stats}


@app.post("/control")
async def set_control(request: Request):
    config.update({k: v for k, v in (await request.json()).items() if k in config})
    for k in stats:
        stats[k] = 0
    return {"config": config}


@app.post("/triage")
async def triage(request: Request):
    body = await request.json()
    stats["requests"] += 1
    await asyncio.sleep(random.uniform(0.5, 1.5) * config["latency_ms"] / 1000)

    roll = random.random()
    if roll < config["error_rate"]:
        stats["errors"] += 1
        return JSONResponse({"detail": "injected failure"}, status_code=500)
    roll -= config["error_rate"]
    if roll < config["hang_rate"]:
        stats["hangs"] += 1
        await asyncio.sleep(config["hang_seconds"])
        return JSONResponse({"detail": "too late"}, status_code=504)
    roll -= config["hang_rate"]
    if roll < config["garbage_rate"]:
        stats["garbage"] += 1
        return PlainTextResponse("<html>502 upstream garbage</html>", media_type="application/json")

    stats["ok"] += 1
    suggest = random.random() < 0.5
    return {
        "decision": "auto_suggest_fix" if suggest else "escalate",
        "alert": body.get("log_message", ""),
        "matched_incident_id": 1,
        "matched_log": "mock incident",
        "suggested_resolution": "mock resolution" if suggest else None,
        "confidence_distance": 0.12,
        "reasoning": "mock triage",
        "severity": "medium",
        "category": "infrastructure",
        "timings_ms": {"retrieval": 5, "ai_check": int(config["latency_ms"])},
        "agent": "mock",
    }
