// Display helpers shared across views.

const LABEL_OVERRIDES = {
  auto_suggest_fix: "Fix suggested",
  escalate: "Escalated",
  PENDING_REVIEW: "Pending review",
};

export function humanize(value) {
  if (value == null || value === "") return "";
  const raw = String(value);
  if (LABEL_OVERRIDES[raw]) return LABEL_OVERRIDES[raw];
  const words = raw.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SEVERITY_TONE = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  moderate: "warning",
  low: "neutral",
  info: "neutral",
};

export function severityTone(severity) {
  return SEVERITY_TONE[String(severity || "").toLowerCase()] || "neutral";
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, moderate: 2, low: 3, info: 4 };

export function severityRank(severity) {
  return SEVERITY_RANK[String(severity || "").toLowerCase()] ?? 5;
}

export function fullTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Cosine distance from the vector search: lower = closer match.
// Thresholds mirror agent.py (DISTANCE_THRESHOLD = 0.4 is the cut-off for suggesting a known fix).
export function matchQuality(distance) {
  if (distance == null || Number.isNaN(Number(distance))) return null;
  const d = Number(distance);
  const similarity = Math.max(0, Math.min(100, Math.round((1 - d) * 100)));
  if (d <= 0.25) return { label: "Strong match", tone: "success", similarity, distance: d };
  if (d <= 0.4) return { label: "Moderate match", tone: "warning", similarity, distance: d };
  return { label: "Weak match", tone: "danger", similarity, distance: d };
}

export const MATCH_HELP =
  "Similarity to the closest past incident (100% = identical). Below 60% the incident is escalated instead of getting a suggested fix.";
