import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from classifier import classify_incident
from agent import make_decision
from embeddings import generate_embedding
from investigation import LLMUnavailable, investigate
from models import SessionLocal, PastIncident, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()  # idempotent: pgvector extension + past_incidents table
    yield


app = FastAPI(title="Incident Triage AI Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlertIn(BaseModel):
    source: str
    message: str
    severity: Optional[str] = "unknown"
    timestamp: Optional[datetime] = None


class AlertAck(BaseModel):
    received: bool
    source: str
    message_preview: str


class ClassifyRequest(BaseModel):
    log_message: str


class ClassifyResponse(BaseModel):
    severity: str
    category: str
    reasoning: str


class TriageRequest(BaseModel):
    log_message: str = Field(..., min_length=1, max_length=5000)


class LearnRequest(BaseModel):
    log_message: str
    resolution: str
    severity: str = "unknown"
    category: str = "unknown"


class SearchResult(BaseModel):
    id: int
    log_message: str
    severity: str
    category: str
    resolution: str
    distance: float


@app.get("/health")
def health_check():
    # slack_configured lets tools (e.g. demo_seed.py) avoid spamming a real channel
    return {"status": "ok", "slack_configured": bool(os.getenv("SLACK_WEBHOOK_URL"))}


@app.post("/alerts/ingest", response_model=AlertAck)
async def ingest_alert(alert: AlertIn):
    preview = alert.message[:50]
    return AlertAck(received=True, source=alert.source, message_preview=preview)


@app.post("/alerts/classify", response_model=ClassifyResponse)
async def classify_alert(request: ClassifyRequest):
    result = classify_incident(request.log_message)
    return ClassifyResponse(**result)


@app.post("/triage")
async def triage_alert(request: TriageRequest):
    result = make_decision(request.log_message)
    t = time.perf_counter()
    classification = classify_incident(request.log_message)
    result["timings_ms"]["classify"] = int((time.perf_counter() - t) * 1000)
    result["severity"] = classification.get("severity", "unknown")
    result["category"] = classification.get("category", "unknown")
    return result


class InvestigateRequest(BaseModel):
    log_message: str = Field(..., min_length=1, max_length=5000)
    source: str = "unknown"


# Explainable investigation: summary, root-cause hypotheses tied to real evidence, remediation with risk levels.
@app.post("/investigate")
def investigate_incident(request: InvestigateRequest):
    try:
        return investigate(request.log_message, request.source)
    except LLMUnavailable as e:
        raise HTTPException(status_code=429 if e.rate_limited else 503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"The AI returned an unusable answer: {e}")


# Feature 1 — feedback loop: teach the knowledge base a newly resolved incident
@app.post("/incidents/learn")
async def learn_incident(request: LearnRequest):
    embedding = generate_embedding(request.log_message)
    session = SessionLocal()
    try:
        record = PastIncident(
            log_message=request.log_message,
            severity=request.severity,
            category=request.category,
            resolution=request.resolution,
            embedding=embedding
        )
        session.add(record)
        session.commit()
        return {"status": "learned", "id": record.id}
    finally:
        session.close()


# Feature 6 — semantic search over the knowledge base
@app.get("/incidents/search", response_model=List[SearchResult])
async def search_incidents(q: str, limit: int = 5):
    query_embedding = generate_embedding(q)
    session = SessionLocal()
    try:
        results = (
            session.query(
                PastIncident,
                PastIncident.embedding.cosine_distance(query_embedding).label("distance")
            )
            .order_by("distance")
            .limit(limit)
            .all()
        )
        return [
            SearchResult(
                id=incident.id,
                log_message=incident.log_message,
                severity=incident.severity,
                category=incident.category,
                resolution=incident.resolution,
                distance=round(distance, 4)
            )
            for incident, distance in results
        ]
    finally:
        session.close()