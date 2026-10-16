import { useCallback, useMemo, useState } from "react";
import { fetchAlerts, fetchAnalytics } from "../api";
import { usePolling } from "../lib/hooks";
import { MATCH_HELP, humanize, matchQuality } from "../lib/format";
import { PRIORITIES, TICKET_STATUSES } from "../lib/workflow";

const TREND_DAYS = 14;

// Stack order keeps green and amber apart (they are close for protan viewers).
const OUTCOMES = [
  { key: "autoFixed", label: "Fix suggested", className: "seg-success" },
  { key: "inProgress", label: "In progress", className: "seg-neutral" },
  { key: "escalated", label: "Escalated", className: "seg-warning" },
  { key: "failed", label: "Failed", className: "seg-danger" },
];

function outcomeOf(alert) {
  if (alert.decision === "auto_suggest_fix") return "autoFixed";
  if (alert.decision === "escalate") return "escalated";
  if (alert.status === "FAILED") return "failed";
  return "inProgress";
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildTrend(alerts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (TREND_DAYS - 1 - i));
    return { date, total: 0, autoFixed: 0, inProgress: 0, escalated: 0, failed: 0 };
  });
  const index = new Map(days.map((d, i) => [dayKey(d.date), i]));
  for (const alert of alerts) {
    const i = index.get(dayKey(new Date(alert.createdAt)));
    if (i === undefined) continue;
    days[i][outcomeOf(alert)] += 1;
    days[i].total += 1;
  }
  return days;
}

const dayLabel = (date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function TrendChart({ days }) {
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.total));
  const total = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="panel panel-wide">
      <div className="panel-head">
        <h3 className="panel-title">Issues per day — last {TREND_DAYS} days</h3>
        <button type="button" className="link-btn" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      <ul className="chart-legend" aria-label="Legend">
        {OUTCOMES.map((o) => (
          <li key={o.key}>
            <span className={`legend-swatch ${o.className}`} aria-hidden="true" />
            {o.label}
          </li>
        ))}
      </ul>

      {total === 0 ? (
        <p className="empty-state">No issues in the last {TREND_DAYS} days.</p>
      ) : showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                {OUTCOMES.map((o) => (
                  <th key={o.key} scope="col">
                    {o.label}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date.toISOString()}>
                  <th scope="row">{dayLabel(d.date)}</th>
                  {OUTCOMES.map((o) => (
                    <td key={o.key}>{d[o.key]}</td>
                  ))}
                  <td>{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" role="img" aria-label={`Stacked bar chart of ${total} issues over ${TREND_DAYS} days`}>
          <div className="chart-y" aria-hidden="true">
            <span>{max}</span>
            <span>0</span>
          </div>
          <div className="chart-plot">
            <div className="chart-gridline" aria-hidden="true" />
            {days.map((d, i) => (
              <div key={d.date.toISOString()} className="chart-col" tabIndex={0} aria-label={`${dayLabel(d.date)}: ${d.total} issues`}>
                <div className="chart-stack" style={{ height: `${(d.total / max) * 100}%` }}>
                  {OUTCOMES.filter((o) => d[o.key] > 0).map((o) => (
                    <div key={o.key} className={`chart-seg ${o.className}`} style={{ flexGrow: d[o.key] }} />
                  ))}
                </div>
                <div className={`chart-tip ${i > TREND_DAYS - 4 ? "chart-tip-left" : ""}`} role="tooltip">
                  <strong>{dayLabel(d.date)}</strong>
                  {OUTCOMES.map((o) => (
                    <span key={o.key} className="chart-tip-row">
                      <span className={`legend-swatch ${o.className}`} aria-hidden="true" />
                      {o.label}
                      <span className="chart-tip-val">{d[o.key]}</span>
                    </span>
                  ))}
                  <span className="chart-tip-row chart-tip-total">
                    Total <span className="chart-tip-val">{d.total}</span>
                  </span>
                </div>
                {(TREND_DAYS - 1 - i) % 2 === 0 && (
                  <span className={`chart-x ${(TREND_DAYS - 1 - i) % 4 === 0 ? "chart-x-major" : ""}`} aria-hidden="true">
                    {dayLabel(d.date)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    Promise.all([fetchAnalytics(), fetchAlerts()])
      .then(([payload, alertList]) => {
        setData(payload);
        setAlerts(alertList);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  usePolling(load, 10000);

  const trend = useMemo(() => buildTrend(alerts), [alerts]);

  if (error && !data) {
    return (
      <div className="empty-state empty-error">
        <p>{error}</p>
        <button type="button" className="btn btn-small" onClick={load}>
          Try again
        </button>
      </div>
    );
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
  const maxStatus = Math.max(1, ...Object.values(data.byTicketStatus || {}));
  const maxPriority = Math.max(1, ...Object.values(data.byPriority || {}));
  const triaged = data.autoFixed + data.escalated;
  const autoFixRate = triaged > 0 ? ((data.autoFixed / triaged) * 100).toFixed(1) : "0.0";
  const quality = matchQuality(data.avgConfidenceDistance);
  const unclassified = alerts.filter((a) => a.decision && !a.category).length;

  return (
    <div className="analytics">
      {error && (
        <p className="form-error form-error-spaced" role="alert">
          {error} — showing the last loaded data.
        </p>
      )}

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{data.totalAlerts}</span>
          <span className="stat-label">Total issues</span>
        </div>
        <div className="stat" title="Share of triaged incidents where the AI matched a known fix (still needs human approval).">
          <span className="stat-value stat-success">{autoFixRate}%</span>
          <span className="stat-label">Known-fix match rate</span>
        </div>
        <div className="stat" title="Open incidents past their SLA due date.">
          <span className={`stat-value ${data.overdue > 0 ? "stat-danger" : ""}`}>{data.overdue ?? 0}</span>
          <span className="stat-label">Overdue (SLA)</span>
        </div>
        <div className="stat" title="Mean time from report to resolved.">
          <span className="stat-value">{data.mttrHours == null ? "—" : data.mttrHours < 1 ? `${Math.round(data.mttrHours * 60)}m` : `${data.mttrHours}h`}</span>
          <span className="stat-label">Mean time to resolve</span>
        </div>
      </div>

      <div className="panel-grid">
        <TrendChart days={trend} />

        <div className="panel">
          <h3 className="panel-title">Workflow status</h3>
          {TICKET_STATUSES.map((s) => (
            <Bar
              key={s.key}
              label={s.label}
              value={data.byTicketStatus?.[s.key] || 0}
              max={maxStatus}
              tone={s.key === "RESOLVED" || s.key === "CLOSED" ? "success" : "accent"}
            />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">By priority</h3>
          {PRIORITIES.map((p) => (
            <Bar
              key={p.key}
              label={`${p.key} · ${p.label}`}
              value={data.byPriority?.[p.key] || 0}
              max={maxPriority}
              tone={p.key === "P1" ? "danger" : "accent"}
            />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">By category</h3>
          {categoryEntries.length === 0 && <p className="empty-state">No classified incidents yet.</p>}
          {categoryEntries.map(([label, value]) => (
            <Bar key={label} label={humanize(label)} value={value} max={maxCategory} tone="accent" />
          ))}
          {unclassified > 0 && <p className="panel-note">{unclassified} triaged issues predate classification.</p>}
        </div>

        <div className="panel">
          <h3 className="panel-title">By severity</h3>
          {severityEntries.length === 0 && <p className="empty-state">No severity data yet.</p>}
          {severityEntries.map(([label, value]) => (
            <Bar key={label} label={humanize(label)} value={value} max={maxSeverity} tone="accent" />
          ))}
          {unclassified > 0 && <p className="panel-note">{unclassified} triaged issues have no severity.</p>}
        </div>

        <div className="panel">
          <h3 className="panel-title">Human review outcomes</h3>
          {reviewEntries.length === 0 && <p className="empty-state">No reviews recorded yet.</p>}
          {reviewEntries.map(([label, value]) => (
            <Bar
              key={label}
              label={humanize(label)}
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
          <div className="health-row" title={MATCH_HELP}>
            <span>Avg. match similarity</span>
            <strong>{quality ? `${quality.similarity}%` : "—"}</strong>
          </div>
          <div className="health-row">
            <span>Escalated to engineers</span>
            <strong>{data.escalated}</strong>
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
