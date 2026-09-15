import StatusTag from "./StatusTag";

const DECISION_TONE = { auto_suggest_fix: "success", escalate: "danger" };
const STATUS_TONE = { PENDING: "warning", PROCESSING: "warning", COMPLETED: "neutral", FAILED: "danger" };

function shortTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function IssueList({ alerts, selectedId, onSelect, onRetry }) {
  return (
    <div className="issue-list">
      {alerts.map((a) => (
        <div key={a.id} className={`issue-row ${selectedId === a.id ? "issue-row-active" : ""}`}>
          <button className="issue-row-btn" onClick={() => onSelect(a.id)}>
            <span className="issue-key">
              INC-{a.id} {a.retryCount > 0 && <span className="issue-retry">↻{a.retryCount}</span>}
            </span>
            <span className="issue-summary">
              <span className="issue-source">{a.source}</span>
              <span className="issue-message">{a.message}</span>
            </span>
            <span className="issue-tags">
              {a.decision && (
                <StatusTag label={a.decision === "auto_suggest_fix" ? "Auto-fix" : "Escalated"} tone={DECISION_TONE[a.decision]} />
              )}
              <StatusTag label={a.status} tone={STATUS_TONE[a.status] || "neutral"} />
            </span>
            <span className="issue-time">{shortTime(a.createdAt)}</span>
          </button>
          {a.status === "FAILED" && (
            <button className="issue-retry-btn" onClick={() => onRetry(a.id)} title="Retry this alert">
              Retry
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default IssueList;