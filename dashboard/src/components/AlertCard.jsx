function AlertCard({ alert }) {
  const isAutoFix = alert.decision === "auto_suggest_fix";
  const isEscalated = alert.decision === "escalate";

  return (
    <div className="alert-card">
      <div className="alert-header">
        <span className="alert-source">{alert.source}</span>
        <span className={`status-badge status-${alert.status.toLowerCase()}`}>
          {alert.status}
        </span>
      </div>

      <p className="alert-message">{alert.message}</p>

      {isAutoFix && (
        <div className="decision-box decision-fix">
          <strong>✅ Auto-Suggested Fix</strong>
          <p>{alert.suggestedResolution}</p>
          <p className="reasoning">Why: {alert.reasoning}</p>
          <p className="confidence">
            Confidence distance: {alert.confidenceDistance?.toFixed(3)}
          </p>
        </div>
      )}

      {isEscalated && (
        <div className="decision-box decision-escalate">
          <strong>🚨 Escalated to Human</strong>
          <p className="reasoning">{alert.reasoning}</p>
        </div>
      )}

      {!alert.decision && alert.status !== "FAILED" && (
        <div className="decision-box decision-pending">
          <em>Still processing...</em>
        </div>
      )}

      {alert.status === "FAILED" && (
        <div className="decision-box decision-escalate">
          <strong>⚠️ Processing Failed</strong>
          <p className="reasoning">This alert could not be processed (service may have been down).</p>
        </div>
      )}
    </div>
  );
}

export default AlertCard;