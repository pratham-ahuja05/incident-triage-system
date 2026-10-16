import { useEffect, useRef } from "react";
import StatusTag from "./StatusTag";
import { Avatar, DueBadge, PriorityIcon, TicketStatus } from "./TicketBits";
import { IconComment } from "./Icons";
import { fullTime, humanize, relativeTime } from "../lib/format";

const DECISION_TONE = { auto_suggest_fix: "success", escalate: "warning" };
const STATUS_TONE = { PENDING: "neutral", PROCESSING: "neutral", COMPLETED: "neutral", FAILED: "danger" };

function IssueList({ alerts, selectedId, onSelect, onRetry, canRetry, checkedIds, onToggle }) {
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="issue-list" role="list">
      {alerts.map((a) => {
        const isSelected = selectedId === a.id;
        return (
          <div
            key={a.id}
            ref={isSelected ? selectedRef : undefined}
            className={`issue-row ${isSelected ? "issue-row-active" : ""} ${checkedIds?.has(a.id) ? "issue-row-checked" : ""}`}
            role="listitem"
          >
            {checkedIds && (
              <label className="issue-check">
                <input
                  type="checkbox"
                  checked={checkedIds.has(a.id)}
                  onChange={() => onToggle(a.id)}
                  aria-label={`Select INC-${a.id}`}
                />
              </label>
            )}
            <button type="button" className="issue-row-btn" onClick={() => onSelect(a.id)} aria-pressed={isSelected}>
              <span className="issue-key">
                <PriorityIcon priority={a.priority} />
                INC-{a.id}
                {a.retryCount > 0 && <span className="issue-retry"> ↻{a.retryCount}</span>}
              </span>
              <time className="issue-time" dateTime={a.createdAt} title={fullTime(a.createdAt)}>
                {relativeTime(a.createdAt)}
              </time>
              <span className="issue-summary">
                <span className="issue-source">{a.source}</span>
                <span className="issue-message">{a.message}</span>
              </span>
              <span className="issue-tags">
                <TicketStatus status={a.ticketStatus} />
                {a.decision && <StatusTag label={humanize(a.decision)} tone={DECISION_TONE[a.decision]} />}
                {a.status !== "COMPLETED" && (
                  <StatusTag label={humanize(a.status)} tone={STATUS_TONE[a.status] || "neutral"} />
                )}
                <DueBadge alert={a} />
                <span className="issue-meta-right">
                  {a.commentCount > 0 && (
                    <span className="issue-comments" title={`${a.commentCount} comments`}>
                      <IconComment size={12} />
                      {a.commentCount}
                    </span>
                  )}
                  <Avatar name={a.assignee} size={20} />
                </span>
              </span>
            </button>
            {a.status === "FAILED" && canRetry && (
              <button type="button" className="issue-retry-btn" onClick={() => onRetry(a.id)}>
                Retry
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default IssueList;
