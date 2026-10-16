import { useState, useEffect } from "react";
import { searchKnowledge } from "../api";
import StatusTag from "./StatusTag";
import { MATCH_HELP, humanize, matchQuality, severityTone } from "../lib/format";

function KnowledgeBaseView({ aiStatus }) {
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
          Search resolved incidents semantically — the same retrieval the triage agent uses before it decides to
          suggest a fix or escalate.
        </p>
      </div>

      {aiStatus === "down" && (
        <div className="stale-banner" role="status">
          <span>
            The AI service is offline, so search is unavailable. Start it with{" "}
            <code>uvicorn main:app --reload --port 8000</code>.
          </span>
        </div>
      )}

      <label className="field">
        <span className="sr-only">Search knowledge base</span>
        <input
          className="search kb-search"
          type="search"
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
          results.map((r) => {
            const quality = matchQuality(r.distance);
            return (
              <article key={r.id} className="kb-card">
                <div className="kb-card-top">
                  {r.category && <StatusTag label={humanize(r.category)} tone="neutral" />}
                  {r.severity && <StatusTag label={humanize(r.severity)} tone={severityTone(r.severity)} />}
                  {quality && (
                    <span className="kb-distance" title={`${MATCH_HELP} (distance ${quality.distance.toFixed(3)})`}>
                      <strong>{quality.similarity}%</strong> similar
                    </span>
                  )}
                </div>
                <p className="kb-log">{r.log_message}</p>
                <div className="kb-resolution">
                  <span className="detail-label">Resolution</span>
                  <p className="detail-text">{r.resolution}</p>
                </div>
              </article>
            );
          })}
      </div>
    </div>
  );
}

export default KnowledgeBaseView;
