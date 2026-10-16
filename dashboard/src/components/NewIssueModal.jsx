import { useEffect, useRef, useState } from "react";
import { SAMPLE_INCIDENTS } from "../lib/onboarding";

function NewIssueModal({ onClose, onSubmit, sources = [] }) {
  const dialogRef = useRef(null);
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = Boolean(source.trim() || message.trim());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Closing with a draft asks first instead of silently throwing it away.
  const requestClose = () => {
    if (submitting) return;
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const handleCancel = (e) => {
    e.preventDefault(); // Escape
    requestClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) requestClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!source.trim() || !message.trim()) return;
    setSubmitting(true);
    setError("");
    onSubmit({ source: source.trim(), message: message.trim() })
      .then(() => onClose())
      .catch((err) => setError(err.message || "Submit failed."))
      .finally(() => setSubmitting(false));
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="new-issue-title"
    >
      <form className="modal" onSubmit={handleSubmit}>
        <h2 id="new-issue-title" className="modal-title">
          Report an incident
        </h2>
        <p className="modal-sub">This goes through the same pipeline as a real monitoring alert.</p>

        <div className="sample-row" role="group" aria-label="Example incidents">
          <span className="detail-label">Try an example</span>
          <div className="sample-chips">
            {SAMPLE_INCIDENTS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                className={`sample-chip ${message === sample.message ? "sample-chip-active" : ""}`}
                onClick={() => {
                  setSource(sample.source);
                  setMessage(sample.message);
                  setConfirmDiscard(false);
                }}
              >
                {sample.label}
                <span className="sample-outcome">{sample.outcome}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Source</span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="payment-service"
            list="known-sources"
            autoFocus
            required
          />
          <datalist id="known-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Log message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste the raw error or log line here…"
            rows={4}
            maxLength={5000}
            required
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {confirmDiscard ? (
          <div className="confirm-box modal-confirm" role="group" aria-label="Discard draft">
            <span>Discard this draft?</span>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </button>
              <button type="button" className="btn btn-reject" onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn" onClick={requestClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit issue"}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}

export default NewIssueModal;
