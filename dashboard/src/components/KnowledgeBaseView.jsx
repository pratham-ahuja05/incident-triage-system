import { useState, useEffect } from "react";
import { searchKnowledge } from "../api";

function KnowledgeBaseView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        setSearched(false);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      searchKnowledge(query)
        .then((data) => {
          setResults(Array.isArray(data) ? data : []);
          setSearched(true);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
          setResults([]);
          setSearched(true);
        })
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="kb">
      <div className="kb-intro">
        <p className="kb-sub">
          Search resolved incidents semantically — the same retrieval the triage agent uses before it decides to auto-fix
          or escalate.
        </p>
      </div>

      <label className="field">
        <span className="sr-only">Search knowledge base</span>
        <input
          className="search kb-search"
          placeholder="Try: database timeout, memory leak, auth token expired…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {loading && <p className="empty-state">Searching…</p>}
      {error && !loading && <p className="empty-state empty-error">{error}</p>}
      {!loading && !error && searched && results.length === 0 && (
        <p className="empty-state">No incidents matched that phrasing.</p>
      )}
      {!loading && !error && !searched && (
        <p className="empty-state">Start typing to search the incident history semantically.</p>
      )}

      <div className="kb-results">
        {!loading &&
          results.map((r) => (
            <article key={r.id} className="kb-card">
              <div className="kb-card-top">
                <span className="tag tag-neutral">{r.category}</span>
                <span className="tag tag-warning">{r.severity}</span>
                <span className="kb-distance">distance {Number(r.distance).toFixed(3)}</span>
              </div>
              <p className="kb-log">{r.log_message}</p>
              <div className="kb-resolution">
                <span className="detail-label">Resolution</span>
                <p className="detail-text">{r.resolution}</p>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}

export default KnowledgeBaseView;
