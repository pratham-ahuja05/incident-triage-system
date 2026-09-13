import { useState } from "react";

function NewIssueModal({ onClose, onSubmit }) {
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!source.trim() || !message.trim()) return;
    setSubmitting(true);
    onSubmit({ source, message }).finally(() => setSubmitting(false));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="modal-title">Report an incident</h2>
        <p className="modal-sub">This goes through the same pipeline as a real monitoring alert.</p>

        <label className="field">
          <span>Source</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="payment-service" autoFocus />
        </label>

        <label className="field">
          <span>Log message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste the raw error or log line here…"
            rows={4}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit issue"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewIssueModal;