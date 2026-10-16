import { useState } from "react";
import { Avatar, DueBadge, PriorityIcon } from "./TicketBits";
import { fullTime } from "../lib/format";
import { PRIORITIES, TICKET_STATUSES, labelsOf, toLocalInput } from "../lib/workflow";

// Jira's "details" panel: every field editable in place for Analyst+.
function IssueFields({ alert, users, me, canWrite, onUpdate }) {
  const [labelDraft, setLabelDraft] = useState("");
  const labels = labelsOf(alert);
  const save = (patch, message) => onUpdate(alert.id, patch, message).catch(() => {});

  const addLabel = () => {
    const next = labelDraft.trim().toLowerCase();
    setLabelDraft("");
    if (!next || labels.includes(next)) return;
    save({ labels: [...labels, next] }, `Label “${next}” added`);
  };

  return (
    <dl className="fields">
      <div className="field-row">
        <dt>Status</dt>
        <dd>
          <select
            className={`field-select status-select status-${alert.ticketStatus}`}
            value={alert.ticketStatus || "OPEN"}
            disabled={!canWrite}
            onChange={(e) => save({ ticketStatus: e.target.value })}
            aria-label="Status"
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </dd>
      </div>

      <div className="field-row">
        <dt>Assignee</dt>
        <dd className="field-inline">
          <Avatar name={alert.assignee} />
          <select
            className="field-select"
            value={alert.assignee || ""}
            disabled={!canWrite}
            onChange={(e) => save({ assignee: e.target.value || null })}
            aria-label="Assignee"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.username}
              </option>
            ))}
          </select>
          {canWrite && alert.assignee !== me && (
            <button type="button" className="link-btn" onClick={() => save({ assignee: me }, "Assigned to you")}>
              Assign to me
            </button>
          )}
        </dd>
      </div>

      <div className="field-row">
        <dt>Priority</dt>
        <dd className="field-inline">
          <PriorityIcon priority={alert.priority} />
          <select
            className="field-select"
            value={alert.priority || ""}
            disabled={!canWrite}
            onChange={(e) => save({ priority: e.target.value }, "Priority updated — SLA due date recalculated")}
            aria-label="Priority"
          >
            {!alert.priority && <option value="">Set after triage</option>}
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} · {p.label}
              </option>
            ))}
          </select>
        </dd>
      </div>

      <div className="field-row">
        <dt>Due</dt>
        <dd className="field-inline">
          <input
            type="datetime-local"
            className="field-select"
            value={toLocalInput(alert.dueAt)}
            disabled={!canWrite}
            onChange={(e) => save({ dueAt: e.target.value ? `${e.target.value}:00` : null })}
            aria-label="Due date"
          />
          <DueBadge alert={alert} />
        </dd>
      </div>

      <div className="field-row">
        <dt>Labels</dt>
        <dd className="label-editor">
          {labels.map((l) => (
            <span key={l} className="label-chip">
              {l}
              {canWrite && (
                <button
                  type="button"
                  aria-label={`Remove label ${l}`}
                  onClick={() => save({ labels: labels.filter((x) => x !== l) })}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canWrite && (
            <input
              className="label-input"
              value={labelDraft}
              placeholder={labels.length ? "+ label" : "Add label…"}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addLabel();
                }
              }}
              onBlur={addLabel}
              maxLength={30}
              aria-label="Add label"
            />
          )}
          {!canWrite && labels.length === 0 && <span className="field-muted">None</span>}
        </dd>
      </div>

      <div className="field-row">
        <dt>Reporter</dt>
        <dd className="field-inline">
          <Avatar name={alert.reporter} size={20} />
          <span>{alert.reporter || "monitoring"}</span>
        </dd>
      </div>

      <div className="field-row">
        <dt>Created</dt>
        <dd className="field-muted">{fullTime(alert.createdAt)}</dd>
      </div>

      {alert.resolvedAt && (
        <div className="field-row">
          <dt>Resolved</dt>
          <dd className="field-muted">{fullTime(alert.resolvedAt)}</dd>
        </div>
      )}
    </dl>
  );
}

export default IssueFields;
