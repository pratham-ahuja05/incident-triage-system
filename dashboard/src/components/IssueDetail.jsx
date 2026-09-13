function IssueDetail({ alert, onReview }) {
  if (!alert) {
    return (
      <div className="detail-empty">
        <p>Select an issue on the left to see its full triage process.</p>
      </div>
    );
  }

  const hasCandidate = Boolean(alert.matchedLog);
  const isAutoFix = alert.decision === "auto_suggest_fix";
  const isEscalated = alert.decision === "escalate";
  const stillProcessing = !alert.decision && alert.status !== "FAILED";

  return (
    <div className="detail">
      <div className="detail-top">
        <span className="detail-key">INC-{alert.id}</span>
        <h2 className="detail-title">{alert.message}</h2>
        <span className="detail-source">reported by {alert.source}</span>
      </div>

      <div className="timeline">
        <div className="tl-step tl-done">
          <div className="tl-marker" />
          <div className="tl-body">
            <span className="tl-title">Issue ingested</span>
            <p className="tl-text">
              Alert queued for triage from <strong>{alert.source}</strong>.
            </p>
          </div>
        </div>

        <div className={`tl-step ${alert.status !== "PENDING" ? "tl-done" : ""}`}>
          <div className="tl-marker" />
          <div className="tl-body">
            <span className="tl-title">Retrieval</span>
            {hasCandidate ? (
              <>
                <p className="tl-text">Closest past incident found:</p>
                <div className="candidate-card">
                  <span className="candidate-label">INC history match</span>
                  <p className="candidate-log">{alert.matchedLog}</p>
                  <span className="candidate-distance">
                    distance <strong>{alert.confidenceDistance?.toFixed(3)}</strong>
                  </span>
                </div>
              </>
            ) : stillProcessing ? (
              <p className="tl-text tl-muted">Searching the incident knowledge base…</p>
            ) : (
              <p className="tl-text tl-muted">No comparable past incident existed in the knowledge base.</p>
            )}
          </div>
        </div>

        <div className={`tl-step ${alert.decision ? "tl-done" : ""}`}>
          <div className="tl-marker" />
          <div className="tl-body">
            <span className="tl-title">Reasoning</span>
            {alert.reasoning ? (
              <p className="tl-text tl-mono">{alert.reasoning}</p>
            ) : (
              <p className="tl-text tl-muted">Not yet reasoned over.</p>
            )}
          </div>
        </div>

        <div className={`tl-step ${alert.decision ? "tl-done" : ""}`}>
          <div className="tl-marker" />
          <div className="tl-body">
            <span className="tl-title">Decision</span>

            {isAutoFix && (
              <div className="decision-card decision-success">
                <span className="decision-heading">Auto-suggested fix</span>
                <p className="tl-text">{alert.suggestedResolution}</p>
              </div>
            )}

            {isEscalated && (
              <div className="decision-card decision-danger">
                <span className="decision-heading">Escalated to on-call</span>
                <p className="tl-text">Sent to Slack for human review.</p>
              </div>
            )}

            {stillProcessing && <p className="tl-text tl-muted">Awaiting decision…</p>}

            {alert.status === "FAILED" && (
              <div className="decision-card decision-danger">
                <span className="decision-heading">Processing failed</span>
                <p className="tl-text">The AI service could not be reached when this alert was queued.</p>
              </div>
            )}
          </div>
        </div>

        {isAutoFix && (
          <div className="tl-step tl-done">
            <div className="tl-marker" />
            <div className="tl-body">
              <span className="tl-title">Human review</span>
              <p className="tl-text">
                Status: <strong>{alert.humanReviewStatus?.replace("_", " ").toLowerCase()}</strong>
              </p>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IssueDetail;