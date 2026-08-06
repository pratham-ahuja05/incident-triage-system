from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

app = FastAPI(title="Incident Triage AI Service")




class AlertIn(BaseModel):
    source: str                          # e.g. "payment-service"
    message: str                         # raw log/error text
    severity: Optional[str] = "unknown"  # optional, defaults if missing
    timestamp: Optional[datetime] = None


class AlertAck(BaseModel):
    received: bool
    source: str
    message_preview: str


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