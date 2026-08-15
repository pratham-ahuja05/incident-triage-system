from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from classifier import classify_incident
from agent import make_decision

app = FastAPI(title="Incident Triage AI Service")


# ---- Pydantic models (request/response schemas) ----

class AlertIn(BaseModel):
    source: str                          # e.g. "payment-service"
    message: str                         # raw log/error text
    severity: Optional[str] = "unknown"  # optional, defaults if missing
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
    log_message: str


# ---- Routes ----

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/alerts/ingest", response_model=AlertAck)
async def ingest_alert(alert: AlertIn):
    preview = alert.message[:50]
    return AlertAck(
        received=True,
        source=alert.source,
        message_preview=preview
    )


@app.post("/alerts/classify", response_model=ClassifyResponse)
async def classify_alert(request: ClassifyRequest):
    result = classify_incident(request.log_message)
    return ClassifyResponse(**result)


@app.post("/triage")
async def triage_alert(request: TriageRequest):
    result = make_decision(request.log_message)
    return result