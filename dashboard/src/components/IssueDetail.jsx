import { useState } from "react";
import { IconBack } from "./Icons";

function IssueDetail({ alert, onReview, onResolve, onBack, canWrite, actionError }) {
  const [note, setNote] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!alert) {
    return (
      <div className="detail-empty">
        <p className="detail-empty-title">No issue selected</p>
        <p>Choose an incident from the board to inspect retrieval, reasoning, and the decision trail.</p>
      </div>
    );
  }

  const hasCandidate = Boolean(alert.matchedLog);
  const isAutoFix = alert.decision === "auto_suggest_fix";
  const isEscalated = alert.decision === "escalate";
  const stillProcessing = !alert.decision && alert.status !== "FAILED";
  const canResolve = isEscalated && alert.humanReviewStatus !== "RESOLVED";

  const submitResolve = () => {
    if (!note.trim()) return;
    setBusy(true);
    Promise.resolve(onResolve(alert.triageResultId, note))
      .then(() => {
        setNote("");
        setShowResolveForm(false);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="detail">
      {onBack && (
        <button type="button" className="detail-back btn" onClick={onBack}>
          <IconBack />
          Back to list
        </button>
      )}

      <div className="detail-top">
        <span className="detail-key">INC-{alert.id}</span>
        <h2 className="detail-title">{alert.message}</h2>
        <span className="detail-source">
          reported by {alert.source}
          {alert.retryCount > 0 && <span className="detail-retry"> · retried {alert.retryCount}×</span>}
        </span>
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
                  <span className="candidate-label">Knowledge base match</span>
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
                {(alert.severity || alert.category) && (
                  <div className="decision-meta">
                    {alert.severity && <span className="tag tag-warning">{alert.severity}</span>}
                    {alert.category && <span className="tag tag-neutral">{alert.category}</span>}
                  </div>
                )}
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
                <span className="decision-heading">Processing failed — dead-lettered</span>
                <p className="tl-text">
                  Retried {alert.retryCount} times, then gave up. Retry from the board if you have Analyst access.
                </p>
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
              {alert.humanReviewStatus === "PENDING_REVIEW" && canWrite && (
                <div className="detail-actions">
                  <button type="button" className="btn btn-approve" onClick={() => onReview(alert.triageResultId, "APPROVED")}>
                    Approve fix
                  </button>
                  <button type="button" className="btn btn-reject" onClick={() => onReview(alert.triageResultId, "REJECTED")}>
                    Reject
                  </button>
                </div>
              )}
              {alert.humanReviewStatus === "PENDING_REVIEW" && !canWrite && (
                <p className="tl-text tl-muted">Waiting on an Analyst or Manager to review this suggestion.</p>
              )}
              {alert.humanReviewStatus === "APPROVED" && (
                <p className="tl-text tl-muted">This fix was added back into the knowledge base.</p>
              )}
            </div>
          </div>
        )}

        {isEscalated && (
          <div className="tl-step">
            <div className="tl-marker" />
            <div className="tl-body">
              <span className="tl-title">Resolution</span>
              {alert.humanReviewStatus === "RESOLVED" ? (
                <>
                  <p className="tl-text tl-muted">Manually resolved — added to the knowledge base.</p>
                  <div className="candidate-card">
                    <span className="candidate-label">Resolution note</span>
                    <p className="candidate-log">{alert.humanResolutionNote}</p>
                  </div>
                </>
              ) : canResolve && canWrite ? (
                showResolveForm ? (
                  <div className="resolve-form">
                    <label className="field">
                      <span>How was this actually fixed?</span>
                      <textarea
                        className="resolve-textarea"
                        placeholder="This teaches the system for next time."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                      />
                    </label>
                    <div className="detail-actions">
                      <button type="button" className="btn" onClick={() => setShowResolveForm(false)}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary" onClick={submitResolve} disabled={busy || !note.trim()}>
                        {busy ? "Saving…" : "Save & teach system"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setShowResolveForm(true)}>
                    Mark as resolved
                  </button>
                )
              ) : (
                <p className="tl-text tl-muted">
                  {canWrite ? "Not yet resolved." : "Waiting on an Analyst or Manager to record a resolution."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {actionError && (
        <p className="form-error detail-error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}

export default IssueDetail;
