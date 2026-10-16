import { useEffect, useMemo, useState } from "react";
import { fetchDuplicates } from "../api";
import { IconSparkle } from "./Icons";
import { fullTime, relativeTime } from "../lib/format";
import { matchQuality } from "../lib/format";
import { TicketStatus } from "./TicketBits";

const LIKELIHOOD_TONE = { high: "danger", medium: "warning", low: "neutral" };
const RISK = {
  safe: { label: "Safe to check", tone: "success" },
  caution: { label: "Caution — changes a system", tone: "warning" },
  destructive: { label: "Destructive — needs sign-off", tone: "danger" },
};

function parse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function Duplicates({ alert, canWrite, onCloseDuplicate }) {
  const [state, setState] = useState({ list: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchDuplicates(alert.id)
      .then((list) => !cancelled && setState({ list, error: null }))
      .catch((err) => !cancelled && setState({ list: [], error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [alert.id]);

  if (alert.duplicateOfId) return null;
  if (!state.list) return <div className="skeleton skeleton-row" />;
  if (state.error) return <p className="form-error">{state.error}</p>;
  if (state.list.length === 0) return null;

  return (
    <section className="inv-section">
      <h3 className="inv-heading">
        Possible duplicates <span className="prov prov-observed">Pattern match</span>
      </h3>
      <p className="field-muted inv-note">
        Same service and the same message once numbers and IDs are masked, within 7 days. Check before closing.
      </p>
      <ul className="dup-list">
        {state.list.map((d) => (
          <li key={d.id} className="dup-item">
            <a href={`#/board/${d.id}`} className="dup-key">
              INC-{d.id}
            </a>
            <span className="dup-msg">{d.message}</span>
            <TicketStatus status={d.ticketStatus} />
            <span className="field-muted">{relativeTime(d.createdAt)}</span>
            {canWrite && d.id < alert.id && (
              <button type="button" className="btn btn-small" onClick={() => onCloseDuplicate(alert.id, d.id)}>
                Close this as duplicate of INC-{d.id}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvestigationPanel({ alert, canWrite, onInvestigate, onCloseDuplicate }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [openEvidence, setOpenEvidence] = useState(null);
  const inv = useMemo(() => parse(alert.investigation), [alert.investigation]);
  const evidenceById = useMemo(() => Object.fromEntries((inv?.similar_incidents || []).map((e) => [e.id, e])), [inv]);

  const run = () => {
    setRunning(true);
    setError(null);
    Promise.resolve(onInvestigate(alert.id))
      .catch((err) => setError(err.message))
      .finally(() => setRunning(false));
  };

  return (
    <div className="investigation">
      {alert.duplicateOfId && (
        <p className="stale-banner">
          <span>
            Closed as a duplicate of <a href={`#/board/${alert.duplicateOfId}`}>INC-{alert.duplicateOfId}</a>.
          </span>
        </p>
      )}

      <Duplicates alert={alert} canWrite={canWrite} onCloseDuplicate={onCloseDuplicate} />

      {!inv && (
        <section className="inv-empty">
          <span className="inv-empty-icon" aria-hidden="true">
            <IconSparkle size={18} />
          </span>
          <div>
            <p className="detail-empty-title">No AI investigation yet</p>
            <p className="field-muted">
              The AI reads this alert and the most similar past incidents, then proposes a summary, likely root causes
              tied to that evidence, and next steps. It never changes anything in your systems.
            </p>
            {canWrite ? (
              <button type="button" className="btn btn-primary btn-icon" onClick={run} disabled={running}>
                <IconSparkle size={13} />
                {running ? "Investigating… (up to 30 s)" : "Run AI investigation"}
              </button>
            ) : (
              <p className="field-muted">An Analyst or Manager can run one.</p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      )}

      {inv && (
        <>
          <div className="inv-meta">
            <span className="prov prov-ai">AI-generated</span>
            <span className="field-muted" title={inv.model}>
              {inv.model} · {alert.investigatedAt ? fullTime(alert.investigatedAt) : ""}
            </span>
            {canWrite && (
              <button type="button" className="btn btn-small" onClick={run} disabled={running}>
                {running ? "Re-running…" : "Re-run"}
              </button>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <section className="inv-section">
            <h3 className="inv-heading">Summary</h3>
            <p className="tl-text">{inv.summary}</p>
          </section>

          <section className="inv-section">
            <h3 className="inv-heading">Root-cause hypotheses</h3>
            <p className="field-muted inv-note">
              Likelihood is the model&apos;s own judgement from the evidence below, not a measured probability.
            </p>
            <ol className="hyp-list">
              {(inv.hypotheses || []).map((h, i) => (
                <li key={i} className="hyp">
                  <div className="hyp-head">
                    <span className={`tag tag-${LIKELIHOOD_TONE[h.likelihood] || "neutral"}`}>
                      {h.likelihood} likelihood
                    </span>
                    <strong>{h.cause}</strong>
                  </div>
                  <p className="tl-text tl-muted">{h.reasoning}</p>
                  {h.evidence_ids?.length > 0 ? (
                    <div className="hyp-evidence">
                      Evidence:
                      {h.evidence_ids.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={`evidence-chip ${openEvidence === id ? "evidence-chip-open" : ""}`}
                          onClick={() => setOpenEvidence(openEvidence === id ? null : id)}
                          aria-expanded={openEvidence === id}
                        >
                          past incident #{id}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="field-muted">No supporting past incident — reasoning from the alert text only.</p>
                  )}
                  {openEvidence != null && h.evidence_ids?.includes(openEvidence) && evidenceById[openEvidence] && (
                    <div className="evidence-detail">
                      <code className="insp-code">{evidenceById[openEvidence].log_message}</code>
                      <p className="tl-text">
                        <strong>Recorded fix:</strong> {evidenceById[openEvidence].resolution}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="inv-section">
            <h3 className="inv-heading">Suggested next steps</h3>
            <p className="field-muted inv-note">Suggestions only — nothing here is executed automatically.</p>
            <ol className="remed-list">
              {(inv.remediation || []).map((r, i) => (
                <li key={i} className={`remed remed-${r.risk}`}>
                  <span>{r.step}</span>
                  <span className={`tag tag-${RISK[r.risk]?.tone || "warning"}`}>{RISK[r.risk]?.label || r.risk}</span>
                </li>
              ))}
            </ol>
          </section>

          {inv.uncertainty && (
            <section className="inv-section inv-uncertainty">
              <h3 className="inv-heading">What is still unknown</h3>
              <p className="tl-text">{inv.uncertainty}</p>
            </section>
          )}

          <section className="inv-section">
            <h3 className="inv-heading">
              Similar past incidents <span className="prov prov-observed">Vector search</span>
            </h3>
            {(inv.similar_incidents || []).length === 0 ? (
              <p className="field-muted">The knowledge base returned nothing.</p>
            ) : (
              <ul className="similar-list">
                {inv.similar_incidents.map((e) => {
                  const q = matchQuality(e.distance);
                  return (
                    <li key={e.id} className="similar-item">
                      <div className="similar-head">
                        <span className="dup-key">#{e.id}</span>
                        {q && <span className={`tag tag-${q.tone}`}>{q.similarity}% similar</span>}
                        <span className="field-muted">
                          {e.category} · {e.severity}
                        </span>
                      </div>
                      <code className="insp-code">{e.log_message}</code>
                      <p className="tl-text">
                        <strong>Recorded fix:</strong> {e.resolution}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default InvestigationPanel;
