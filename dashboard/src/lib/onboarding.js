// First-run onboarding state (per user, per browser) and demo content.

const KEY_PREFIX = "incident-triage.onboarded.";

export function hasOnboarded(username) {
  try {
    return localStorage.getItem(KEY_PREFIX + username) === "1";
  } catch {
    return true; // storage blocked: don't nag on every load
  }
}

export function markOnboarded(username) {
  try {
    localStorage.setItem(KEY_PREFIX + username, "1");
  } catch {
    // ignore
  }
}

// Example alerts. The first two resemble incidents already in the seeded knowledge base,
// so they usually get an auto-suggested fix; the last one is novel and usually escalates.
export const SAMPLE_INCIDENTS = [
  {
    label: "Redis refused",
    outcome: "likely fix suggested",
    source: "checkout-service",
    message: "Error: Unable to connect to Redis at cache-01:6379, connection refused",
  },
  {
    label: "SSL expired",
    outcome: "likely fix suggested",
    source: "edge-gateway",
    message: "SSL certificate expired for domain api.shop.example, handshake failed for 312 clients",
  },
  {
    label: "Kafka lag",
    outcome: "likely escalation",
    source: "orders-consumer",
    message: "Consumer group orders-v2 lag exceeded 50000 messages on topic order-events partition 7",
  },
];

export const DEMO_INCIDENT = SAMPLE_INCIDENTS[0];

// Guided tour. Targets are [data-tour] attributes; steps whose target is hidden are skipped.
export const TOUR_STEPS = [
  {
    target: "report",
    title: "Report an incident",
    body: "Alerts normally arrive from monitoring automatically. You can also report one by hand — the form has ready-made examples.",
  },
  {
    target: "stats",
    title: "Your queue at a glance",
    body: "Needs review: the AI suggested a known fix that a person must confirm. Open escalations: new problems waiting for an engineer. Click a tile to filter.",
  },
  {
    target: "toolbar",
    title: "Search, sort and filter",
    body: "Search by service, message or INC number. Press / to jump here from anywhere on the board.",
  },
  {
    target: "list",
    title: "Incident list",
    body: "Each row shows where the incident ended up. Press j / k to move through the list.",
  },
  {
    target: "detail",
    title: "Watch the triage pipeline",
    body: "Open an incident to follow it live: Received → Queued → Retrieval → AI check → Decision → Human loop. Press Replay to walk through any incident again.",
  },
  {
    target: "nav-kanban",
    title: "Kanban board",
    body: "Drag incidents through To do → In progress → In review → Resolved. Approving an AI fix or recording a resolution moves the card for you.",
    placement: "right",
  },
  {
    target: "nav-calendar",
    title: "Calendar",
    body: "Every incident gets an SLA due date from its priority (P1 = 4 h … P4 = 7 days). The calendar shows what is due and what is overdue.",
    placement: "right",
  },
  {
    target: "search",
    title: "Find anything fast",
    body: "Press Ctrl + K anywhere to jump to an incident or a view.",
    placement: "right",
  },
  {
    target: "nav-analytics",
    title: "Is it learning?",
    body: "Analytics shows how often a known fix matches, SLA health and daily trends — every approved or resolved fix makes the next match better.",
    placement: "right",
  },
  {
    target: "nav-knowledge",
    title: "The evidence",
    body: "The Knowledge Base holds every past fix the AI compares new alerts against. Search it in plain English.",
    placement: "right",
  },
  {
    target: "health",
    title: "Service status",
    body: "If the AI service shows offline, new alerts fail after a few retries — you can retry them once it is back.",
    placement: "right",
  },
];
