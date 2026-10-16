import { useState } from "react";
import { addComment } from "../api";
import { Avatar } from "./TicketBits";
import { IconSparkle } from "./Icons";
import { fullTime, relativeTime } from "../lib/format";
import { STATUS_BY_KEY } from "../lib/workflow";
import { useToast } from "../lib/toast";

const statusLabel = (key) => STATUS_BY_KEY[key]?.label || key;

function describe(event) {
  switch (event.type) {
    case "CREATED":
      return "reported this incident";
    case "STATUS": {
      const [from, to] = (event.message || "").split(" → ");
      return (
        <>
          moved this from <strong>{statusLabel(from)}</strong> to <strong>{statusLabel(to)}</strong>
        </>
      );
    }
    case "PRIORITY":
      return <>changed priority: {event.message}</>;
    case "RETRY":
      return "re-queued triage";
    case "RESOLVED":
      return "resolved it and taught the knowledge base:";
    case "DELETED":
      return "deleted this incident";
    case "INVESTIGATED":
      return "ran an AI investigation";
    default:
      return event.message;
  }
}

// Highlight @mentions in comment text.
function CommentText({ text }) {
  return text.split(/(@[a-zA-Z0-9._-]+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function ActivityPanel({ alertId, events, error, onAdded }) {
  const notify = useToast();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [show, setShow] = useState("all");

  const post = () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    addComment(alertId, text)
      .then((saved) => {
        setDraft("");
        onAdded(saved);
      })
      .catch((err) => notify(err.message, "danger"))
      .finally(() => setPosting(false));
  };

  const visible = (events || [])
    .filter((e) => show === "all" || (show === "comments" ? e.type === "COMMENT" : e.type !== "COMMENT"))
    .slice()
    .reverse();

  return (
    <div className="activity">
      <div className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post();
          }}
          placeholder="Add a comment… use @name to mention someone"
          rows={2}
          maxLength={5000}
          aria-label="Add a comment"
        />
        <div className="composer-actions">
          <span className="field-muted">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to post
          </span>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={post}
            disabled={posting || !draft.trim()}
          >
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>

      <div className="activity-filter" role="group" aria-label="Show">
        {[
          ["all", "All"],
          ["comments", "Comments"],
          ["history", "History"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`seg-btn ${show === key ? "seg-btn-active" : ""}`}
            onClick={() => setShow(key)}
            aria-pressed={show === key}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {!events && !error && <div className="skeleton skeleton-row" />}
      {events && visible.length === 0 && <p className="field-muted activity-empty">Nothing here yet.</p>}

      <ol className="feed">
        {visible.map((e) => (
          <li key={e.id} className={`feed-item feed-${e.type.toLowerCase()}`}>
            {e.actor === "system" ? (
              <span className="avatar avatar-system" aria-label="AI pipeline">
                <IconSparkle size={12} />
              </span>
            ) : (
              <Avatar name={e.actor} size={24} />
            )}
            <div className="feed-body">
              <p className="feed-line">
                <strong>{e.actor === "system" ? "Triage AI" : e.actor}</strong>{" "}
                {e.type !== "COMMENT" && <span className="feed-text">{describe(e)}</span>}
                <time className="feed-time" dateTime={e.createdAt} title={fullTime(e.createdAt)}>
                  {relativeTime(e.createdAt)}
                </time>
              </p>
              {(e.type === "COMMENT" || e.type === "RESOLVED") && (
                <p className="comment-bubble">
                  <CommentText text={e.message || ""} />
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default ActivityPanel;
