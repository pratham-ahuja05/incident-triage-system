import { useState, useEffect } from "react";

const BASE = "http://localhost:8080/api";

function Bar({ label, value, max, tone }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

function AnalyticsView() {
  const [data, setData] = useState(null);

  const fetchData = () => {
    fetch(`${BASE}/analytics`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <p className="empty-state">Loading analytics…</p>;

  const categoryEntries = Object.entries(data.byCategory || {});
  const severityEntries = Object.entries(data.bySeverity || {});
  const reviewEntries = Object.entries(data.byReviewStatus || {});
  const maxCategory = Math.max(1, ...categoryEntries.map(([, v]) => v));
  const maxSeverity = Math.max(1, ...severityEntries.map(([, v]) => v));
  const maxReview = Math.max(1, ...reviewEntries.map(([, v]) => v));

  const autoFixRate = data.totalAlerts > 0 ? ((data.autoFixed / data.totalAlerts) * 100).toFixed(1) : "0.0";

  return (
    <div className="analytics">
      <div className="stats stats-wide">
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
          {categoryEntries.length === 0 && <p className="empty-state">No data yet.</p>}
          {categoryEntries.map(([label, value]) => (
            <Bar key={label} label={label} value={value} max={maxCategory} tone="accent" />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">By severity</h3>
          {severityEntries.length === 0 && <p className="empty-state">No data yet.</p>}
          {severityEntries.map(([label, value]) => (
            <Bar key={label} label={label} value={value} max={maxSeverity} tone="warning" />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">Human review outcomes</h3>
          {reviewEntries.length === 0 && <p className="empty-state">No data yet.</p>}
          {reviewEntries.map(([label, value]) => (
            <Bar
              key={label}
              label={label.replace("_", " ").toLowerCase()}
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