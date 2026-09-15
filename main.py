from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from classifier import classify_incident
from agent import make_decision
from embeddings import generate_embedding
from models import SessionLocal, PastIncident

app = FastAPI(title="Incident Triage AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    return {"status": "ok"}


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
    classification = classify_incident(request.log_message)
    result["severity"] = classification.get("severity", "unknown")
    result["category"] = classification.get("category", "unknown")
    return result


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