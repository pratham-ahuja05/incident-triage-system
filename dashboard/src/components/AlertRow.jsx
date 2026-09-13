import { useState } from "react";
import StatusTag from "./StatusTag";

const DECISION_TONE = {
  auto_suggest_fix: "success",
  escalate: "danger",
};

const STATUS_TONE = {
  PENDING: "warning",
  PROCESSING: "warning",
  COMPLETED: "neutral",
  FAILED: "danger",
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AlertRow({ alert, onReview }) {
  const [open, setOpen] = useState(false);
  const hasDecision = Boolean(alert.decision);
  const decisionLabel =
    alert.decision === "auto_suggest_fix" ? "Auto-fix" : alert.decision === "escalate" ? "Escalated" : null;

  return (
    <div className={`row ${open ? "row-open" : ""}`}>
      <button className="row-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row-chevron">{open ? "▾" : "▸"}</span>

        <span className="row-source">{alert.source}</span>

        <span className="row-message">{alert.message}</span>

        <span className="row-tags">
          {hasDecision && <StatusTag label={decisionLabel} tone={DECISION_TONE[alert.decision]} />}
          <StatusTag label={alert.status} tone={STATUS_TONE[alert.status] || "neutral"} />
        </span>

        <span className="row-time">{formatTime(alert.createdAt)}</span>
      </button>

      {open && (
        <div className="row-detail">
          {alert.decision === "auto_suggest_fix" && (
            <>
              <div className="detail-block">
                <span className="detail-label">Suggested fix</span>
                <p className="detail-text">{alert.suggestedResolution}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Why this match</span>
                <p className="detail-text detail-muted">{alert.reasoning}</p>
              </div>
              <div className="detail-meta">
                <span>
                  Confidence distance <strong>{alert.confidenceDistance?.toFixed(3)}</strong>
                </span>
                <span className="detail-review">
                  Review: <strong>{alert.humanReviewStatus?.replace("_", " ") || "pending review"}</strong>
                </span>
              </div>
              {alert.humanReviewStatus === "PENDING_REVIEW" && (
                <div className="detail-actions">
                  <button className="btn btn-approve" onClick={() => onReview(alert.triageResultId, "APPROVED")}>
                    Approve fix
                  </button>
                  <button className="btn btn-reject" onClick={() => onReview(alert.triageResultId, "REJECTED")}>
                    Reject
                  </button>
                </div>
              )}
            </>
          )}

          {alert.decision === "escalate" && (
            <div className="detail-block">
              <span className="detail-label">Escalation reason</span>
              <p className="detail-text detail-muted">{alert.reasoning}</p>
            </div>
          )}

          {!hasDecision && alert.status !== "FAILED" && (
            <p className="detail-text detail-muted">Still being triaged — check back shortly.</p>
          )}

          {alert.status === "FAILED" && (
            <p className="detail-text detail-muted">
              Processing failed. The AI service may have been unreachable when this alert was queued.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertRow;