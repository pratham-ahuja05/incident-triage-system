// Jira-style ticket workflow shared by the list, Kanban and Calendar views.

export const TICKET_STATUSES = [
  { key: "OPEN", label: "To do", tone: "neutral" },
  { key: "IN_PROGRESS", label: "In progress", tone: "accent" },
  { key: "IN_REVIEW", label: "In review", tone: "warning" },
  { key: "RESOLVED", label: "Resolved", tone: "success" },
  { key: "CLOSED", label: "Closed", tone: "neutral" },
];

export const STATUS_BY_KEY = Object.fromEntries(TICKET_STATUSES.map((s) => [s.key, s]));

export const PRIORITIES = [
  { key: "P1", label: "Highest", sla: "4 hours" },
  { key: "P2", label: "High", sla: "1 day" },
  { key: "P3", label: "Medium", sla: "3 days" },
  { key: "P4", label: "Low", sla: "7 days" },
];

export const PRIORITY_BY_KEY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

export const priorityRank = (p) => ({ P1: 0, P2: 1, P3: 2, P4: 3 })[p] ?? 4;

export const isDone = (a) => a.ticketStatus === "RESOLVED" || a.ticketStatus === "CLOSED";

// Server sends LocalDateTime without a zone; it is the server's local time, which matches the browser in dev
// and is fine for relative display. Date.parse treats zone-less ISO date-times as local.
export function toDate(value) {
  return value ? new Date(value) : null;
}

export function dueState(alert, now = Date.now()) {
  const due = toDate(alert.dueAt);
  if (!due || isDone(alert)) return null;
  const ms = due.getTime() - now;
  if (ms < 0) return "overdue";
  if (ms < 4 * 3600 * 1000) return "soon";
  return "ok";
}

export function formatDue(alert, now = Date.now()) {
  const due = toDate(alert.dueAt);
  if (!due) return "";
  const diff = due.getTime() - now;
  const abs = Math.abs(diff);
  const unit = abs < 3600e3 ? [Math.round(abs / 60e3), "m"] : abs < 86400e3 ? [Math.round(abs / 3600e3), "h"] : [Math.round(abs / 86400e3), "d"];
  if (isDone(alert)) return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return diff < 0 ? `${unit[0]}${unit[1]} overdue` : `due in ${unit[0]}${unit[1]}`;
}

export function labelsOf(alert) {
  return alert.labels ? alert.labels.split(",").filter(Boolean) : [];
}

// For <input type="datetime-local">: "2026-10-20T17:00"
export function toLocalInput(value) {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name) {
  if (!name) return "?";
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Stable color per person, from a small palette that reads on both themes.
const AVATAR_HUES = [212, 152, 32, 280, 350, 190, 100, 250];
export function avatarHue(name) {
  let h = 0;
  for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}
