import { useState, useEffect } from "react";
import { fetchAnalytics } from "../api";

function Bar({ label, value, max, tone }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-row">
      <span className="bar-label" title={label}>
        {label}
      </span>
      <div className="bar-track" aria-hidden="true">
        <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

function AnalyticsView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    fetchAnalytics()
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error && !data) {
    return <p className="empty-state empty-error">{error}</p>;
  }

  if (!data) {
    return (
      <div>
        <div className="stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat">
              <div className="skeleton skeleton-stat-value" />
              <div className="skeleton skeleton-stat-label" />
            </div>
          ))}
        </div>
        <p className="empty-state">Loading analytics…</p>
      </div>
    );
  }

  const categoryEntries = Object.entries(data.byCategory || {});
  const severityEntries = Object.entries(data.bySeverity || {});
  const reviewEntries = Object.entries(data.byReviewStatus || {});
  const maxCategory = Math.max(1, ...categoryEntries.map(([, v]) => v));
  const maxSeverity = Math.max(1, ...severityEntries.map(([, v]) => v));
  const maxReview = Math.max(1, ...reviewEntries.map(([, v]) => v));
  const autoFixRate = data.totalAlerts > 0 ? ((data.autoFixed / data.totalAlerts) * 100).toFixed(1) : "0.0";

  return (
    <div className="analytics">
      {error && <p className="form-error form-error-spaced" role="alert">{error}</p>}

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{data.totalAlerts}</span>
          <span className="stat-label">Total issues</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-success">{autoFixRate}%</span>
          <span className="stat-label">Auto-fix rate</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-danger">{data.escalated}</span>
          <span className="stat-label">Escalated</span>
        </div>
        <div className="stat">
          <span className="stat-value">{data.avgConfidenceDistance ?? "—"}</span>
          <span className="stat-label">Avg. match distance</span>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h3 className="panel-title">By category</h3>
          {categoryEntries.length === 0 && <p className="empty-state">No classified incidents yet.</p>}
          {categoryEntries.map(([label, value]) => (
            <Bar key={label} label={label} value={value} max={maxCategory} tone="accent" />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">By severity</h3>
          {severityEntries.length === 0 && <p className="empty-state">No severity data yet.</p>}
          {severityEntries.map(([label, value]) => (
            <Bar key={label} label={label} value={value} max={maxSeverity} tone="warning" />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">Human review outcomes</h3>
          {reviewEntries.length === 0 && <p className="empty-state">No reviews recorded yet.</p>}
          {reviewEntries.map(([label, value]) => (
            <Bar
              key={label}
              label={String(label).replace("_", " ").toLowerCase()}
              value={value}
              max={maxReview}
              tone={label === "REJECTED" ? "danger" : label === "APPROVED" || label === "RESOLVED" ? "success" : "accent"}
            />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">Pipeline health</h3>
          <div className="health-row">
            <span>Pending / in progress</span>
            <strong>{data.pending}</strong>
          </div>
          <div className="health-row">
            <span>Dead-lettered (failed)</span>
            <strong className={data.failed > 0 ? "text-danger" : ""}>{data.failed}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsView;
