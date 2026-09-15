import { useState, useEffect } from "react";

const AI_BASE = "http://localhost:8000";

function KnowledgeBaseView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = (q) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    fetch(`${AI_BASE}/incidents/search?q=${encodeURIComponent(q)}&limit=8`)
      .then((res) => res.json())
      .then((data) => {
        setResults(data);
        setSearched(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    const timeout = setTimeout(() => runSearch(query), 400); // debounce
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="kb">
      <div className="kb-intro">
        <h2 className="panel-title">Knowledge base</h2>
        <p className="kb-sub">
          Every resolved incident the system has learned from — search it semantically, the same way the triage agent does.
        </p>
      </div>

      <input
        className="search kb-search"
        placeholder="Try: database timeout, memory leak, auth token expired…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="empty-state">Searching…</p>}
      {!loading && searched && results.length === 0 && (
        <p className="empty-state">No incidents matched that phrasing.</p>
      )}
      {!loading && !searched && (
        <p className="empty-state">Start typing to search the incident history semantically.</p>
      )}

      <div className="kb-results">
        {results.map((r) => (
          <div key={r.id} className="kb-card">
            <div className="kb-card-top">
              <span className="tag tag-neutral">{r.category}</span>
              <span className="tag tag-warning">{r.severity}</span>
              <span className="kb-distance">distance {r.distance.toFixed(3)}</span>
            </div>
            <p className="kb-log">{r.log_message}</p>
            <div className="kb-resolution">
              <span className="detail-label">Resolution</span>
              <p className="detail-text">{r.resolution}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default KnowledgeBaseView;