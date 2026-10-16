import { useEffect, useMemo, useRef, useState } from "react";
import IssueList from "./IssueList";
import IssueDetail from "./IssueDetail";
import PageHeader from "./PageHeader";
import PipelineStepper from "./PipelineStepper";
import { IconPlay } from "./Icons";
import { relativeTime, severityRank } from "../lib/format";
import { STAGES, useNow } from "../lib/pipeline";
import { PRIORITIES, TICKET_STATUSES, dueState, isDone, priorityRank } from "../lib/workflow";

const needsReview = (a) => a.decision === "auto_suggest_fix" && a.humanReviewStatus === "PENDING_REVIEW" && !isDone(a);
const openEscalation = (a) => a.decision === "escalate" && !isDone(a);
const inProgress = (a) => !a.decision && a.status !== "FAILED";
const failed = (a) => a.status === "FAILED";

function makeFilters(me, now) {
  const mine = (a) => a.assignee === me && !isDone(a);
  const overdue = (a) => dueState(a, now) === "overdue";
  return {
    list: [
      { key: "all", label: "All", test: () => true },
      { key: "mine", label: "Assigned to me", test: mine },
      { key: "needs_review", label: "Needs review", test: needsReview },
      { key: "open_escalations", label: "Open escalations", test: openEscalation },
      { key: "overdue", label: "Overdue", test: overdue },
      { key: "pending", label: "Processing", test: inProgress },
      { key: "FAILED", label: "Failed", test: failed },
      { key: "done", label: "Done", test: isDone },
    ],
    tiles: [
      { filter: "needs_review", label: "Needs review", test: needsReview },
      { filter: "open_escalations", label: "Open escalations", test: openEscalation },
      { filter: "overdue", label: "Overdue (SLA)", test: overdue, danger: true },
      { filter: "mine", label: "Assigned to me", test: mine },
    ],
  };
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const SORTS = {
  newest: byNewest,
  oldest: (a, b) => -byNewest(a, b),
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || byNewest(a, b),
  due: (a, b) => (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity) || byNewest(a, b),
  severity: (a, b) => severityRank(a.severity) - severityRank(b.severity) || byNewest(a, b),
};

const PAGE_SIZE = 50;

const SEVERITIES = ["critical", "high", "medium", "low"];
const RANGES = { all: null, "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };
const NO_FACETS = { severity: "all", service: "all", status: "all", range: "all" };

function isTypingTarget(el) {
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable='true'], dialog"));
}

function BoardView({ store, writeAccess, me, onOpenNav, selectedId, onSelect, onReport, onDemo, onStartTour, live }) {
  const { alerts, loading, error, lastUpdated, refresh } = store;
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [paging, setPaging] = useState({ key: "", count: PAGE_SIZE });
  const [facets, setFacets] = useState(NO_FACETS);
  const [checked, setChecked] = useState(() => new Set());
  const facetActive = Object.keys(NO_FACETS).some((k) => facets[k] !== NO_FACETS[k]);
  const setFacet = (key) => (e) => setFacets((f) => ({ ...f, [key]: e.target.value }));
  const searchRef = useRef(null);
  const now = useNow(30000, true);

  const { list: FILTERS, tiles: STAT_TILES } = useMemo(() => makeFilters(me, now), [me, now]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, alerts.filter(f.test).length])),
    [alerts, FILTERS],
  );

  const services = useMemo(() => [...new Set(alerts.map((a) => a.source))].sort(), [alerts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)?.test || (() => true);
    const maxAge = RANGES[facets.range];
    return alerts
      .filter((a) => {
        if (facets.severity !== "all") {
          const sev = (a.severity || "").toLowerCase();
          if (facets.severity === "none" ? SEVERITIES.includes(sev) : sev !== facets.severity) return false;
        }
        if (facets.service !== "all" && a.source !== facets.service) return false;
        if (facets.status !== "all" && (a.ticketStatus || "OPEN") !== facets.status) return false;
        if (maxAge && now - new Date(a.createdAt).getTime() > maxAge) return false;
        if (
          q &&
          !a.message.toLowerCase().includes(q) &&
          !a.source.toLowerCase().includes(q) &&
          !(a.labels || "").includes(q) &&
          `inc-${a.id}` !== q
        ) {
          return false;
        }
        return test(a);
      })
      .sort(SORTS[sort]);
  }, [alerts, filter, query, sort, FILTERS, facets, now]);

  const pageKey = `${filter}|${query}|${sort}|${JSON.stringify(facets)}`;
  const visibleCount = paging.key === pageKey ? paging.count : PAGE_SIZE;
  const showMore = () => setPaging({ key: pageKey, count: visibleCount + PAGE_SIZE });

  const visible = filtered.slice(0, visibleCount);
  const selected = alerts.find((a) => a.id === selectedId) || null;

  // Bulk selection only ever contains incidents that are currently listed.
  const visibleIds = visible.map((a) => a.id);
  const checkedIds = visibleIds.filter((id) => checked.has(id));
  const allChecked = visibleIds.length > 0 && checkedIds.length === visibleIds.length;
  const toggle = (id) =>
    setChecked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(visibleIds));
  const bulk = (patch, label) => {
    if (checkedIds.length === 0) return;
    store.bulkUpdate(checkedIds, patch, label).finally(() => setChecked(new Set()));
  };
  const resetAll = () => {
    setFilter("all");
    setQuery("");
    setFacets(NO_FACETS);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "j" || e.key === "k") {
        if (visible.length === 0) return;
        const idx = visible.findIndex((a) => a.id === selectedId);
        const next = e.key === "j" ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx === -1 ? 0 : idx - 1);
        onSelect(visible[next].id);
      } else if (e.key === "Escape" && selectedId) {
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, onSelect]);

  return (
    <>
      <PageHeader
        title="Triage queue"
        subtitle="Every incident, live — the AI's verdict, the SLA clock, and who owns it."
        onOpenNav={onOpenNav}
        meta={
          <span
            className="live-badge"
            title={lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}` : undefined}
          >
            <span className={`live-dot ${live ? "" : "poll"}`} />
            {live ? "Live updates" : "Polling every 8s"}
          </span>
        }
        actions={
          writeAccess && (
            <button type="button" className="btn btn-primary" onClick={onReport} data-tour="report">
              Report issue
            </button>
          )
        }
      />

      {!writeAccess && (
        <p className="role-note">
          You are signed in as a Viewer. You can browse and comment; reporting, assigning, approving and resolving need
          Analyst, Manager or Admin.
        </p>
      )}

      {error && alerts.length > 0 && (
        <div className="stale-banner" role="status">
          <span>Connection lost — showing data from {relativeTime(lastUpdated)}. Retrying automatically.</span>
          <button type="button" className="btn btn-small" onClick={refresh}>
            Retry now
          </button>
        </div>
      )}

      <section className="stats" aria-label="Queue summary" data-tour="stats">
        {STAT_TILES.map((tile) => {
          const value = alerts.filter(tile.test).length;
          const active = filter === tile.filter;
          return (
            <button
              key={tile.filter}
              type="button"
              className={`stat stat-button ${active ? "stat-active" : ""}`}
              onClick={() => setFilter(active ? "all" : tile.filter)}
              aria-pressed={active}
            >
              <span className={`stat-value ${tile.danger && value > 0 ? "stat-danger" : ""}`}>
                {loading ? "–" : value}
              </span>
              <span className="stat-label">{tile.label}</span>
            </button>
          );
        })}
      </section>

      <section className="toolbar" data-tour="toolbar">
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="Search source, message, label or INC-id…  ( / )"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          aria-label="Search issues"
        />
        <label className="sort">
          <span className="sr-only">Sort issues</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="severity">Severity</option>
          </select>
        </label>
        <div className="filters" aria-label="Issue filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`filter-chip ${filter === f.key ? "filter-chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {f.label}
              <span className="filter-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="facets" aria-label="More filters">
        <label>
          <span>Severity</span>
          <select value={facets.severity} onChange={setFacet("severity")}>
            <option value="all">Any</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
            <option value="none">Not classified</option>
          </select>
        </label>
        <label>
          <span>Service</span>
          <select value={facets.service} onChange={setFacet("service")}>
            <option value="all">Any</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={facets.status} onChange={setFacet("status")}>
            <option value="all">Any</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Reported</span>
          <select value={facets.range} onChange={setFacet("range")}>
            <option value="all">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <span className="facet-count" aria-live="polite">
          {filtered.length} of {alerts.length}
        </span>
        {(facetActive || filter !== "all" || query) && (
          <button type="button" className="link-btn" onClick={resetAll}>
            Reset filters
          </button>
        )}
      </section>

      <section className="board">
        <div className="board-left" data-tour="list">
          {writeAccess && visible.length > 0 && (
            <div className={`bulk-bar ${checkedIds.length ? "bulk-bar-active" : ""}`}>
              <label className="bulk-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all listed incidents"
                />
                {checkedIds.length ? `${checkedIds.length} selected` : "Select"}
              </label>
              {checkedIds.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => bulk({ assignee: me }, "Assigned to you")}
                  >
                    Assign to me
                  </button>
                  <select
                    className="field-select"
                    value=""
                    onChange={(e) => e.target.value && bulk({ ticketStatus: e.target.value }, "Status updated")}
                    aria-label="Set status for selected"
                  >
                    <option value="">Status…</option>
                    {TICKET_STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field-select"
                    value=""
                    onChange={(e) => e.target.value && bulk({ priority: e.target.value }, "Priority updated")}
                    aria-label="Set priority for selected"
                  >
                    <option value="">Priority…</option>
                    {PRIORITIES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.key} · {p.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="link-btn" onClick={() => setChecked(new Set())}>
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
          {loading && (
            <>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </>
          )}
          {!loading && error && alerts.length === 0 && (
            <div className="empty-state empty-error">
              <p>{error}</p>
              <button type="button" className="btn btn-small" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {!loading && !error && alerts.length === 0 && (
            <div className="empty-onboard">
              <PipelineStepper stages={STAGES.map((s) => ({ ...s, state: "pending" }))} visible={0} compact />
              <p className="detail-empty-title">No incidents yet</p>
              <p>Report one, or run a demo incident to watch the whole triage pipeline in action.</p>
              <div className="detail-actions">
                {writeAccess && (
                  <button type="button" className="btn btn-primary btn-icon" onClick={onDemo}>
                    <IconPlay size={13} />
                    Run a demo
                  </button>
                )}
                <button type="button" className="btn" onClick={onStartTour}>
                  Take the tour
                </button>
              </div>
            </div>
          )}
          {!loading && alerts.length > 0 && filtered.length === 0 && (
            <div className="empty-state">
              <p>No issues match this view.</p>
              <button type="button" className="btn btn-small" onClick={resetAll}>
                Clear filters
              </button>
            </div>
          )}
          {!loading && visible.length > 0 && (
            <IssueList
              alerts={visible}
              selectedId={selectedId}
              onSelect={onSelect}
              onRetry={store.retry}
              canRetry={writeAccess}
              checkedIds={writeAccess ? checked : null}
              onToggle={toggle}
            />
          )}
          {filtered.length > visibleCount && (
            <div className="list-more">
              <span>
                Showing {visibleCount} of {filtered.length}
              </span>
              <button type="button" className="btn btn-small" onClick={showMore}>
                Show more
              </button>
            </div>
          )}
          <p className="kbd-hint">
            <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>/</kbd> search · <kbd>Ctrl</kbd>+<kbd>K</kbd> jump · <kbd>a</kbd>{" "}
            approve · <kbd>r</kbd> reject · <kbd>n</kbd> new
          </p>
        </div>
        <div className={`board-right ${selectedId ? "open" : ""}`} data-tour="detail">
          <IssueDetail
            key={selected ? selected.id : `empty-${selectedId}`}
            alert={selected}
            missingId={!loading && selectedId && !selected ? selectedId : null}
            onReview={store.review}
            onResolve={store.resolve}
            onRetry={store.retry}
            onUpdate={store.update}
            onInvestigate={store.investigate}
            onCloseDuplicate={store.closeAsDuplicate}
            users={store.users}
            me={me}
            refreshKey={lastUpdated}
            onBack={() => onSelect(null)}
            canWrite={writeAccess}
          />
        </div>
      </section>
    </>
  );
}

export default BoardView;
