import { useEffect, useMemo, useState } from "react";
import { fetchRecentActivity } from "../api";
import { Avatar, PriorityIcon, TicketStatus } from "./TicketBits";
import { IconSparkle } from "./Icons";
import { relativeTime } from "../lib/format";
import { useNow } from "../lib/pipeline";
import { useCountUp } from "../lib/hooks";
import { TICKET_STATUSES, dueState, formatDue, isDone, toDate } from "../lib/workflow";

const DAYS = 14;
const DAY = 864e5;

// ---------- data helpers (all derived from real incidents) ----------

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayBuckets(now) {
  const today = startOfDay(now);
  return Array.from({ length: DAYS }, (_, i) => today - (DAYS - 1 - i) * DAY);
}

function bucketIndex(days, iso) {
  if (!iso) return -1;
  const t = startOfDay(toDate(iso).getTime());
  return days.indexOf(t);
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function mttrHours(list) {
  const done = list.filter((a) => a.resolvedAt);
  if (done.length === 0) return null;
  return sum(done.map((a) => (toDate(a.resolvedAt) - toDate(a.createdAt)) / 36e5)) / done.length;
}

function formatHours(h) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ---------- small chart pieces ----------

function Sparkline({ values, label }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return <div className="spark spark-empty">Not enough data yet</div>;
  const max = Math.max(1, ...pts.map(([, v]) => v));
  const w = 120;
  const h = 32;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => h - 3 - (v / max) * (h - 6);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(li)} cy={y(lv)} r="3" className="spark-dot" />
    </svg>
  );
}

function Delta({ current, previous, goodWhen = "down", unit = "", suffix = "vs last week" }) {
  if (current == null || previous == null) return <span className="kpi-delta kpi-delta-flat">— {suffix}</span>;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return <span className="kpi-delta kpi-delta-flat">No change {suffix}</span>;
  const good = goodWhen === "down" ? diff < 0 : diff > 0;
  return (
    <span className={`kpi-delta ${good ? "kpi-delta-good" : "kpi-delta-bad"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {unit} {suffix}
    </span>
  );
}

function Kpi({ label, value, tone, delta, spark, sparkLabel, children }) {
  const shown = useCountUp(value);
  return (
    <article className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone ? `kpi-${tone}` : ""}`}>{shown}</span>
      {delta}
      {spark && (
        <div className="kpi-trend">
          {spark}
          <span className="kpi-trend-label">{sparkLabel}</span>
        </div>
      )}
      {children}
    </article>
  );
}

function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`ov-panel ${className}`}>
      <header className="ov-panel-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

// ---------- needs attention ----------

function attentionReasons(a, me, now) {
  const reasons = [];
  let score = 0;
  if (a.status === "FAILED") {
    reasons.push({ label: "Triage failed", tone: "danger" });
    score += 90;
  }
  const due = dueState(a, now);
  if (due === "overdue") {
    reasons.push({ label: formatDue(a, now), tone: "danger" });
    score += 80;
  } else if (due === "soon") {
    reasons.push({ label: "Due soon", tone: "warning" });
    score += 45;
  }
  if (a.priority === "P1") {
    reasons.push({ label: "P1", tone: "danger" });
    score += 70;
  }
  if (a.decision === "auto_suggest_fix" && a.humanReviewStatus === "PENDING_REVIEW") {
    reasons.push({ label: "Fix awaiting review", tone: "warning" });
    score += 50;
  }
  if (a.decision === "escalate" && !a.assignee) {
    reasons.push({ label: "Unassigned escalation", tone: "warning" });
    score += 40;
  }
  if (a.assignee === me) {
    reasons.push({ label: "Yours", tone: "accent" });
    score += 15;
  }
  return { reasons, score };
}

// ---------- activity feed ----------

const VERB = {
  CREATED: "reported",
  TRIAGED: "triaged",
  PROCESSING: "picked up",
  ATTEMPT_FAILED: "hit an error on",
  FAILED: "dead-lettered",
  RETRY: "re-queued",
  COMMENT: "commented on",
  STATUS: "moved",
  ASSIGNEE: "reassigned",
  PRIORITY: "re-prioritised",
  DUE: "changed the due date of",
  LABELS: "labelled",
  REVIEW: "reviewed",
  RESOLVED: "resolved",
  INVESTIGATED: "investigated",
  DUPLICATE: "linked a duplicate on",
};

function ActivityFeed({ refreshKey, onOpen }) {
  const [state, setState] = useState({ events: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchRecentActivity()
      .then((events) => !cancelled && setState({ events, error: null }))
      .catch((err) => !cancelled && setState((s) => ({ events: s.events || [], error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!state.events) return <div className="skeleton skeleton-row" />;
  return (
    <>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.events.length === 0 && <p className="field-muted">No activity yet.</p>}
      <ol className="ov-feed">
        {state.events.slice(0, 14).map((e) => (
          <li key={e.id}>
            <button type="button" className="ov-feed-item" onClick={() => onOpen(e.alertId)}>
              {e.actor === "system" ? (
                <span className="avatar avatar-system" aria-hidden="true">
                  <IconSparkle size={12} />
                </span>
              ) : (
                <Avatar name={e.actor} size={24} />
              )}
              <span className="ov-feed-text">
                <span>
                  <strong>{e.actor === "system" ? "Triage AI" : e.actor}</strong> {VERB[e.type] || "updated"}{" "}
                  <span className="dup-key">INC-{e.alertId}</span>
                </span>
                <span className="ov-feed-sub">
                  {e.type === "COMMENT" ? `“${e.message}”` : e.message || e.alertMessage}
                </span>
              </span>
              <time className="feed-time" dateTime={e.createdAt}>
                {relativeTime(e.createdAt)}
              </time>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

// ---------- heatmap ----------

function ServiceHeatmap({ alerts, days }) {
  const [tip, setTip] = useState(null);
  const rows = useMemo(() => {
    const bySource = new Map();
    for (const a of alerts) {
      const i = bucketIndex(days, a.createdAt);
      if (i < 0) continue;
      if (!bySource.has(a.source)) bySource.set(a.source, Array(DAYS).fill(0));
      bySource.get(a.source)[i] += 1;
    }
    return [...bySource.entries()]
      .map(([source, counts]) => ({ source, counts, total: sum(counts) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [alerts, days]);
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

  if (rows.length === 0) return <p className="field-muted">No incidents in the last {DAYS} days.</p>;

  return (
    <div className="heat-wrap" onMouseLeave={() => setTip(null)}>
      <div
        className="heat"
        style={{ "--cols": DAYS }}
        role="table"
        aria-label={`Incidents per service per day, last ${DAYS} days`}
      >
        {rows.map((r) => (
          <div key={r.source} className="heat-row" role="row">
            <span className="heat-label" role="rowheader" title={r.source}>
              {r.source}
            </span>
            {r.counts.map((n, i) => (
              <span
                key={i}
                role="cell"
                className={`heat-cell heat-${level(n)}`}
                aria-label={`${r.source}, ${new Date(days[i]).toDateString()}: ${n}`}
                onMouseEnter={(e) =>
                  setTip({
                    x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2,
                    y: e.currentTarget.offsetTop,
                    text: `${r.source} · ${new Date(days[i]).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
                    n,
                  })
                }
              />
            ))}
            <span className="heat-total">{r.total}</span>
          </div>
        ))}
        <div className="heat-row heat-axis" aria-hidden="true">
          <span />
          {days.map((d, i) => (
            <span key={d} className="heat-day">
              {i % 3 === (DAYS - 1) % 3
                ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : ""}
            </span>
          ))}
          <span />
        </div>
      </div>
      {tip && (
        <div className="heat-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <span>
            <strong>{tip.n}</strong> incident{tip.n === 1 ? "" : "s"}
          </span>
          <span>{tip.text}</span>
        </div>
      )}
      <div className="heat-legend" aria-hidden="true">
        Fewer
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat-cell heat-${l}`} />
        ))}
        More
      </div>
    </div>
  );
}

// ---------- main view ----------

function OverviewView({ store, me, onOpen, onNavigate }) {
  const now = useNow(60000, true);
  const { alerts, loading } = store;
  const days = useMemo(() => dayBuckets(now), [now]);

  const m = useMemo(() => {
    const open = alerts.filter((a) => !isDone(a));
    const created = Array(DAYS).fill(0);
    const resolved = Array(DAYS).fill(0);
    const decided = Array(DAYS).fill(0);
    const suggested = Array(DAYS).fill(0);
    for (const a of alerts) {
      const ci = bucketIndex(days, a.createdAt);
      if (ci >= 0) {
        created[ci] += 1;
        if (a.decision) decided[ci] += 1;
        if (a.decision === "auto_suggest_fix") suggested[ci] += 1;
      }
      const ri = bucketIndex(days, a.resolvedAt);
      if (ri >= 0) resolved[ri] += 1;
    }
    const thisWeek = (arr) => sum(arr.slice(7));
    const lastWeek = (arr) => sum(arr.slice(0, 7));
    const inWeek = (a, from, to) => {
      const t = toDate(a.createdAt).getTime();
      return t >= from && t < to;
    };
    const weekStart = days[7];
    const prevStart = days[0];

    const withDue = alerts.filter((a) => a.dueAt);
    const breached = withDue.filter((a) =>
      a.resolvedAt ? toDate(a.resolvedAt) > toDate(a.dueAt) : !isDone(a) && toDate(a.dueAt).getTime() < now,
    ).length;
    const decidedAll = alerts.filter((a) => a.decision);

    return {
      open,
      overdue: open.filter((a) => dueState(a, now) === "overdue"),
      created,
      resolved,
      fixRateDaily: decided.map((d, i) => (d ? Math.round((suggested[i] / d) * 100) : null)),
      newThisWeek: thisWeek(created),
      newLastWeek: lastWeek(created),
      fixRate: pct(decidedAll.filter((a) => a.decision === "auto_suggest_fix").length, decidedAll.length),
      fixRateThis: pct(thisWeek(suggested), thisWeek(decided)),
      fixRateLast: pct(lastWeek(suggested), lastWeek(decided)),
      mttr: mttrHours(alerts),
      mttrThis: mttrHours(alerts.filter((a) => inWeek(a, weekStart, Infinity))),
      mttrLast: mttrHours(alerts.filter((a) => inWeek(a, prevStart, weekStart))),
      sla: pct(withDue.length - breached, withDue.length),
      slaN: withDue.length,
      funnel: [
        { label: "Reported", n: alerts.length },
        { label: "Triaged by AI", n: decidedAll.length },
        { label: "Known fix suggested", n: decidedAll.filter((a) => a.decision === "auto_suggest_fix").length },
        { label: "Fix approved by a person", n: alerts.filter((a) => a.humanReviewStatus === "APPROVED").length },
      ],
      escalationFunnel: [
        { label: "Escalated", n: decidedAll.filter((a) => a.decision === "escalate").length },
        { label: "Resolved & taught", n: alerts.filter((a) => a.humanReviewStatus === "RESOLVED").length },
      ],
      byStatus: TICKET_STATUSES.map((s) => ({
        ...s,
        n: alerts.filter((a) => (a.ticketStatus || "OPEN") === s.key).length,
      })),
      workload: Object.entries(
        open.reduce((acc, a) => {
          const k = a.assignee || "";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {}),
      )
        .map(([name, n]) => ({
          name,
          n,
          p1: open.filter((a) => (a.assignee || "") === name && a.priority === "P1").length,
        }))
        .sort((a, b) => (a.name === "") - (b.name === "") || b.n - a.n),
    };
  }, [alerts, days, now]);

  const attention = useMemo(
    () =>
      m.open
        .map((a) => ({ alert: a, ...attentionReasons(a, me, now) }))
        .filter((x) => x.score > 15)
        .sort((x, y) => y.score - x.score || new Date(y.alert.createdAt) - new Date(x.alert.createdAt))
        .slice(0, 8),
    [m.open, me, now],
  );

  const greeting = (() => {
    const h = new Date(now).getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  if (loading) {
    return (
      <div className="ov-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi">
            <div className="skeleton skeleton-stat-value" />
            <div className="skeleton skeleton-stat-label" />
          </div>
        ))}
      </div>
    );
  }

  const maxFunnel = Math.max(1, m.funnel[0].n);
  const maxWork = Math.max(1, ...m.workload.map((w) => w.n));
  const totalStatus = Math.max(1, sum(m.byStatus.map((s) => s.n)));

  return (
    <div className="overview">
      <div className="ov-hero">
        <div>
          <p className="ov-greeting">
            {greeting}, {me}
          </p>
          <p className="ov-hero-line">
            <span className="ov-hero-num">{m.open.length}</span>
            <span>
              open incident{m.open.length === 1 ? "" : "s"}
              {m.overdue.length > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" className="link-btn ov-danger-link" onClick={() => onNavigate("calendar")}>
                    {m.overdue.length} past SLA
                  </button>
                </>
              ) : (
                " · all within SLA"
              )}
            </span>
          </p>
        </div>
        <div className="ov-hero-actions">
          <button type="button" className="btn" onClick={() => onNavigate("kanban")}>
            Open Kanban
          </button>
          <button type="button" className="btn" onClick={() => onNavigate("board")}>
            Triage queue
          </button>
        </div>
      </div>

      <section className="ov-kpis" aria-label="Key metrics">
        <Kpi
          label="New incidents this week"
          value={m.newThisWeek}
          delta={<Delta current={m.newThisWeek} previous={m.newLastWeek} goodWhen="down" />}
          spark={<Sparkline values={m.created} label="New incidents per day, last 14 days" />}
          sparkLabel="per day · 14 d"
        />
        <Kpi label="Overdue (SLA)" value={m.overdue.length} tone={m.overdue.length ? "danger" : undefined}>
          <div
            className="kpi-meter"
            title="Incidents with a due date that are not past it (open) or were resolved before it"
          >
            <div className="meter-track">
              <div
                className={`meter-fill ${m.sla == null ? "" : m.sla >= 90 ? "meter-good" : m.sla >= 70 ? "meter-warn" : "meter-bad"}`}
                style={{ width: `${m.sla ?? 0}%` }}
              />
            </div>
            <span className="kpi-trend-label">
              {m.sla == null ? "No incidents have a due date yet" : `${m.sla}% within SLA · ${m.slaN} with a due date`}
            </span>
          </div>
        </Kpi>
        <Kpi
          label="Known-fix match rate"
          value={m.fixRate == null ? "—" : `${m.fixRate}%`}
          tone="success"
          delta={<Delta current={m.fixRateThis} previous={m.fixRateLast} goodWhen="up" unit=" pts" />}
          spark={<Sparkline values={m.fixRateDaily} label="Daily known-fix match rate, last 14 days" />}
          sparkLabel="daily rate · 14 d"
        />
        <Kpi
          label="Mean time to resolve"
          value={formatHours(m.mttr)}
          delta={
            m.mttrThis != null && m.mttrLast != null ? (
              <Delta
                current={Math.round(m.mttrThis * 10) / 10}
                previous={Math.round(m.mttrLast * 10) / 10}
                goodWhen="down"
                unit="h"
              />
            ) : (
              <span className="kpi-delta kpi-delta-flat">Needs two weeks of resolutions to compare</span>
            )
          }
          spark={<Sparkline values={m.resolved} label="Incidents resolved per day, last 14 days" />}
          sparkLabel="resolved per day · 14 d"
        />
      </section>

      <div className="ov-main">
        <Panel
          title="Needs attention"
          className="ov-attention"
          action={<span className="field-muted">Ranked by urgency · {attention.length} shown</span>}
        >
          {attention.length === 0 ? (
            <div className="ov-clear">
              <span className="ov-clear-mark" aria-hidden="true">
                ✓
              </span>
              Nothing urgent. No failures, overdue items, P1s or fixes waiting for review.
            </div>
          ) : (
            <ol className="attn-list">
              {attention.map(({ alert: a, reasons }) => (
                <li key={a.id}>
                  <button type="button" className="attn-item" onClick={() => onOpen(a.id)}>
                    <PriorityIcon priority={a.priority} />
                    <span className="attn-main">
                      <span className="attn-top">
                        <span className="dup-key">INC-{a.id}</span>
                        <span className="attn-source">{a.source}</span>
                        <TicketStatus status={a.ticketStatus} />
                      </span>
                      <span className="attn-msg">{a.message}</span>
                      <span className="attn-reasons">
                        {reasons.map((r) => (
                          <span key={r.label} className={`attn-reason attn-${r.tone}`}>
                            {r.label}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="attn-side">
                      <Avatar name={a.assignee} size={24} />
                      <span className="field-muted">{relativeTime(a.createdAt, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title="Live activity"
          className="ov-activity"
          action={
            <span className="live-chip">
              <span className="live-chip-dot" aria-hidden="true" />
              {store.live ? "Live" : "Polling"}
            </span>
          }
        >
          <ActivityFeed refreshKey={store.lastUpdated} onOpen={onOpen} />
        </Panel>
      </div>

      <div className="ov-grid">
        <Panel title={`Incidents by service · last ${DAYS} days`} className="ov-span-2">
          <ServiceHeatmap alerts={alerts} days={days} />
        </Panel>

        <Panel title="Triage funnel">
          <ol className="funnel">
            {m.funnel.map((f) => (
              <li key={f.label} className="funnel-row">
                <span className="funnel-label">{f.label}</span>
                <span className="funnel-track">
                  <span className="funnel-fill" style={{ width: `${(f.n / maxFunnel) * 100}%` }} />
                </span>
                <span className="funnel-n">
                  {f.n}
                  <span className="field-muted"> {pct(f.n, m.funnel[0].n) ?? 0}%</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="field-muted funnel-note">
            Escalated {m.escalationFunnel[0].n} · resolved and taught to the knowledge base {m.escalationFunnel[1].n}
          </p>
        </Panel>

        <Panel title="Workflow">
          <div className="mix-bar" role="img" aria-label={m.byStatus.map((s) => `${s.label} ${s.n}`).join(", ")}>
            {m.byStatus
              .filter((s) => s.n > 0)
              .map((s) => (
                <span
                  key={s.key}
                  className={`mix-seg mix-${s.key}`}
                  style={{ flexGrow: s.n }}
                  title={`${s.label}: ${s.n}`}
                />
              ))}
          </div>
          <ul className="mix-legend">
            {m.byStatus.map((s) => (
              <li key={s.key}>
                <span className={`legend-swatch mix-${s.key}`} aria-hidden="true" />
                {s.label}
                <strong>{s.n}</strong>
                <span className="field-muted">{Math.round((s.n / totalStatus) * 100)}%</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Team workload · open incidents" className="ov-span-2">
          {m.workload.length === 0 ? (
            <p className="field-muted">No open incidents.</p>
          ) : (
            <ul className="workload">
              {m.workload.map((w) => (
                <li key={w.name || "unassigned"}>
                  <Avatar name={w.name || null} size={22} />
                  <span className="workload-name">{w.name || "Unassigned"}</span>
                  <span className="funnel-track">
                    <span
                      className={`funnel-fill ${w.name ? "" : "funnel-fill-muted"}`}
                      style={{ width: `${(w.n / maxWork) * 100}%` }}
                    />
                  </span>
                  <span className="funnel-n">
                    {w.n}
                    {w.p1 > 0 && <span className="attn-reason attn-danger workload-p1">{w.p1} P1</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default OverviewView;
