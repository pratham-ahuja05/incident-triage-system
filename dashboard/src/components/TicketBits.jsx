import { PRIORITY_BY_KEY, STATUS_BY_KEY, avatarHue, dueState, formatDue, initials } from "../lib/workflow";

export function Avatar({ name, size = 22 }) {
  if (!name) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Unassigned" aria-label="Unassigned">
        ?
      </span>
    );
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, "--hue": avatarHue(name), fontSize: size * 0.42 }}
      title={name}
      aria-label={`Assignee ${name}`}
    >
      {initials(name)}
    </span>
  );
}

// Jira-style chevrons: ↑↑ highest … ↓ low. Shape + label carry meaning, not only color.
export function PriorityIcon({ priority, withLabel = false }) {
  const p = PRIORITY_BY_KEY[priority];
  if (!p) return null;
  const paths = {
    P1: "M4 9.5 8 5.5l4 4M4 13 8 9l4 4",
    P2: "M4 11 8 7l4 4",
    P3: "M4 6.5h8M4 10.5h8",
    P4: "M4 7l4 4 4-4",
  };
  return (
    <span className={`priority priority-${priority}`} title={`${p.label} priority (${priority}) · SLA ${p.sla}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={paths[priority]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withLabel ? <span>{p.label}</span> : <span className="sr-only">{p.label} priority</span>}
    </span>
  );
}

export function DueBadge({ alert, now }) {
  if (!alert.dueAt) return null;
  const state = dueState(alert, now);
  return (
    <span className={`due due-${state || "done"}`} title={`Due ${new Date(alert.dueAt).toLocaleString()}`}>
      {formatDue(alert, now)}
    </span>
  );
}

export function TicketStatus({ status }) {
  const s = STATUS_BY_KEY[status] || STATUS_BY_KEY.OPEN;
  return <span className={`ticket-status ticket-${s.tone}`}>{s.label}</span>;
}
