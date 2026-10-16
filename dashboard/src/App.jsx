import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import IssueList from "./components/IssueList";
import IssueDetail from "./components/IssueDetail";
import NewIssueModal from "./components/NewIssueModal";
import AnalyticsView from "./components/AnalyticsView";
import KnowledgeBaseView from "./components/KnowledgeBaseView";
import AuthScreen from "./components/AuthScreen";
import { IconMenu } from "./components/Icons";
import {
  API_ORIGIN,
  canWrite,
  clearSession,
  fetchAlerts as fetchAlertsApi,
  loadSession,
  resolveIncident,
  retryAlert,
  reviewDecision,
  saveSession,
  submitAlert,
} from "./api";
import "./App.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "auto_suggest_fix", label: "Auto-fixed" },
  { key: "escalate", label: "Escalated" },
  { key: "pending", label: "In progress" },
  { key: "FAILED", label: "Failed" },
];

function BoardView({ writeAccess, onOpenNav }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [live, setLive] = useState(false);
  const [actionError, setActionError] = useState(null);
  const sseRef = useRef(null);

  const refreshAlerts = useCallback(() => {
    return fetchAlertsApi()
      .then((data) => {
        setAlerts(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshAlerts();
    try {
      const es = new EventSource(`${API_ORIGIN}/api/alerts/stream`);
      es.addEventListener("update", refreshAlerts);
      es.onopen = () => setLive(true);
      es.onerror = () => {
        setLive(false);
        es.close();
      };
      sseRef.current = es;
    } catch {
      // EventSource unavailable — 8s polling still covers updates.
    }
    const interval = setInterval(refreshAlerts, 8000);
    return () => {
      clearInterval(interval);
      sseRef.current?.close();
    };
  }, [refreshAlerts]);

  const handleReview = (triageResultId, decision) => {
    setActionError(null);
    reviewDecision(triageResultId, decision)
      .then(refreshAlerts)
      .catch((err) => setActionError(err.message));
  };

  const handleResolve = (triageResultId, resolutionNote) => {
    setActionError(null);
    return resolveIncident(triageResultId, resolutionNote)
      .then(refreshAlerts)
      .catch((err) => {
        setActionError(err.message);
        throw err;
      });
  };

  const handleRetry = (alertId) => {
    setActionError(null);
    retryAlert(alertId)
      .then(refreshAlerts)
      .catch((err) => setActionError(err.message));
  };

  const handleSubmitIssue = ({ source, message }) => submitAlert({ source, message }).then(refreshAlerts);

  const stats = useMemo(() => {
    const total = alerts.length;
    const fixed = alerts.filter((a) => a.decision === "auto_suggest_fix").length;
    const escalated = alerts.filter((a) => a.decision === "escalate").length;
    const confidences = alerts.filter((a) => a.confidenceDistance != null).map((a) => a.confidenceDistance);
    const avgConfidence = confidences.length
      ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3)
      : "—";
    return { total, fixed, escalated, avgConfidence };
  }, [alerts]);

  const counts = useMemo(
    () => ({
      all: alerts.length,
      auto_suggest_fix: alerts.filter((a) => a.decision === "auto_suggest_fix").length,
      escalate: alerts.filter((a) => a.decision === "escalate").length,
      pending: alerts.filter((a) => !a.decision && a.status !== "FAILED").length,
      FAILED: alerts.filter((a) => a.status === "FAILED").length,
    }),
    [alerts]
  );

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const matchesQuery =
        !query ||
        a.message.toLowerCase().includes(query.toLowerCase()) ||
        a.source.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (filter === "all") return true;
      if (filter === "pending") return !a.decision && a.status !== "FAILED";
      if (filter === "FAILED") return a.status === "FAILED";
      return a.decision === filter;
    });
  }, [alerts, filter, query]);

  const selected = alerts.find((a) => a.id === selectedId) || null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="menu-toggle" onClick={onOpenNav} aria-label="Open navigation">
            <IconMenu />
          </button>
          <div>
            <h1 className="view-title">Board</h1>
            <p className="view-sub">Live triage queue for ingested alerts.</p>
            <span className="live-badge">
              <span className={`live-dot ${live ? "" : "poll"}`} />
              {live ? "Live updates" : "Polling every 8s"}
            </span>
          </div>
        </div>
        {writeAccess && (
          <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
            Report issue
          </button>
        )}
      </header>

      {!writeAccess && (
        <p className="role-note">
          You are signed in as a Viewer. Reporting, retry, approval, and resolution require Analyst, Manager, or Admin.
        </p>
      )}

      <section className="stats">
        <div className="stat">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total issues</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-success">{stats.fixed}</span>
          <span className="stat-label">Auto-resolved</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-danger">{stats.escalated}</span>
          <span className="stat-label">Escalated</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.avgConfidence}</span>
          <span className="stat-label">Avg. match distance</span>
        </div>
      </section>

      <section className="toolbar">
        <input
          className="search"
          placeholder="Search source or message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search issues"
        />
        <div className="filters" role="tablist" aria-label="Issue filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`filter-chip ${filter === f.key ? "filter-chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
              aria-selected={filter === f.key}
            >
              {f.label}
              <span className="filter-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="board">
        <div className="board-left">
          {loading && (
            <>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </>
          )}
          {error && <p className="empty-state empty-error">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="empty-state">No issues match this view.</p>
          )}
          {!loading && !error && (
            <IssueList
              alerts={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRetry={handleRetry}
              canRetry={writeAccess}
            />
          )}
        </div>
        <div className={`board-right ${selected ? "open" : ""}`}>
          <IssueDetail
            key={selected ? selected.id : "empty"}
            alert={selected}
            onReview={handleReview}
            onResolve={handleResolve}
            onBack={() => setSelectedId(null)}
            canWrite={writeAccess}
            actionError={actionError}
          />
        </div>
      </section>

      {showModal && <NewIssueModal onClose={() => setShowModal(false)} onSubmit={handleSubmitIssue} />}
    </>
  );
}

function App() {
  const [view, setView] = useState("board");
  const [session, setSession] = useState(() => loadSession());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onUnauthorized = () => setSession(null);
    window.addEventListener("triage:unauthorized", onUnauthorized);
    return () => window.removeEventListener("triage:unauthorized", onUnauthorized);
  }, []);

  const authenticate = (payload) => {
    saveSession(payload);
    setSession(payload);
  };

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  const navigate = (next) => {
    setView(next);
    setNavOpen(false);
  };

  if (!session?.token) {
    return <AuthScreen onAuthenticated={authenticate} />;
  }

  const writeAccess = canWrite(session);

  return (
    <div className="app-shell">
      <Sidebar
        active={view}
        onNavigate={navigate}
        session={session}
        onSignOut={signOut}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <main className="main">
        {view === "board" && <BoardView writeAccess={writeAccess} onOpenNav={() => setNavOpen(true)} />}
        {view === "analytics" && (
          <>
            <header className="topbar">
              <div className="topbar-left">
                <button type="button" className="menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation">
                  <IconMenu />
                </button>
                <div>
                  <h1 className="view-title">Analytics</h1>
                  <p className="view-sub">Pipeline volume, outcomes, and review health.</p>
                </div>
              </div>
            </header>
            <AnalyticsView />
          </>
        )}
        {view === "knowledge" && (
          <>
            <header className="topbar">
              <div className="topbar-left">
                <button type="button" className="menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation">
                  <IconMenu />
                </button>
                <div>
                  <h1 className="view-title">Knowledge Base</h1>
                  <p className="view-sub">Semantic search over past resolved incidents.</p>
                </div>
              </div>
            </header>
            <KnowledgeBaseView />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
