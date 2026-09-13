import { useState, useEffect, useMemo } from "react";
import IssueList from "./components/IssueList";
import IssueDetail from "./components/IssueDetail";
import NewIssueModal from "./components/NewIssueModal";
import "./App.css";

const BASE = "http://localhost:8080/api";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "auto_suggest_fix", label: "Auto-fixed" },
  { key: "escalate", label: "Escalated" },
  { key: "pending", label: "In progress" },
  { key: "FAILED", label: "Failed" },
];

function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchAlerts = () => {
    fetch(`${BASE}/alerts`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const sorted = data.reverse();
        setAlerts(sorted);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleReview = (triageResultId, decision) => {
    fetch(`${BASE}/triage-results/${triageResultId}/review?decision=${decision}`, { method: "POST" }).then(fetchAlerts);
  };

  const handleSubmitIssue = ({ source, message }) => {
    return fetch(`${BASE}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, message }),
    }).then((res) => {
      if (res.status === 429) throw new Error("Rate limit exceeded — slow down a little.");
      setShowModal(false);
      fetchAlerts();
    });
  };

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

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const matchesQuery =
        !query || a.message.toLowerCase().includes(query.toLowerCase()) || a.source.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      if (filter === "all") return true;
      if (filter === "pending") return !a.decision && a.status !== "FAILED";
      if (filter === "FAILED") return a.status === "FAILED";
      return a.decision === filter;
    });
  }, [alerts, filter, query]);

  const selected = alerts.find((a) => a.id === selectedId) || null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">Incident Triage</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          Report issue
        </button>
      </header>

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
        <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-chip ${filter === f.key ? "filter-chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="board">
        <div className="board-left">
          {loading && <p className="empty-state">Loading…</p>}
          {error && <p className="empty-state empty-error">{error}</p>}
          {!loading && !error && filtered.length === 0 && <p className="empty-state">No issues match this view.</p>}
          {!loading && !error && (
            <IssueList alerts={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <div className="board-right">
          <IssueDetail alert={selected} onReview={handleReview} />
        </div>
      </section>

      {showModal && <NewIssueModal onClose={() => setShowModal(false)} onSubmit={handleSubmitIssue} />}
    </div>
  );
}

export default App;