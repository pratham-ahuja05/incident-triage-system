const AUTH_KEY = "incident-triage.session";

export const API_ORIGIN = import.meta.env.VITE_API_BASE || "http://localhost:8080";
export const AI_ORIGIN = import.meta.env.VITE_AI_BASE || "http://localhost:8000";

const WRITE_ROLES = new Set(["ANALYST", "MANAGER", "ADMIN"]);

export function normalizeRole(role) {
  return String(role || "").replace(/^ROLE_/, "");
}

export function canWrite(session) {
  return Boolean(session?.roles?.some((role) => WRITE_ROLES.has(normalizeRole(role))));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

async function readError(res, fallback) {
  const text = await res.text();
  if (!text) return fallback;
  try {
    const json = JSON.parse(text);
    return json.message || json.error || json.detail || text;
  } catch {
    return text;
  }
}

export async function apiFetch(path, options = {}) {
  const session = loadSession();
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const res = await fetch(`${API_ORIGIN}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("triage:unauthorized"));
  }
  return res;
}

export async function loginRequest(username, password) {
  const res = await fetch(`${API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Could not sign in. Check your username and password."));
  }
  return res.json();
}

export async function registerRequest(username, email, password) {
  const res = await fetch(`${API_ORIGIN}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Could not create an account."));
  }
  return res.json();
}

export async function fetchAlerts() {
  const res = await apiFetch("/api/alerts");
  if (!res.ok) throw new Error(await readError(res, `Server responded ${res.status}`));
  const data = await res.json();
  return Array.isArray(data) ? [...data].reverse() : [];
}

export async function fetchAnalytics() {
  const res = await apiFetch("/api/analytics");
  if (!res.ok) throw new Error(await readError(res, "Could not load analytics."));
  return res.json();
}

export async function searchKnowledge(query, limit = 8) {
  const res = await fetch(`${AI_ORIGIN}/incidents/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(await readError(res, "Knowledge base search failed."));
  return res.json();
}

export async function submitAlert({ source, message }) {
  const res = await apiFetch("/api/alerts", {
    method: "POST",
    body: JSON.stringify({ source, message }),
  });
  if (res.status === 429) throw new Error("Rate limit exceeded — wait a moment and try again.");
  if (res.status === 403) throw new Error("Your role cannot report issues.");
  if (!res.ok) throw new Error(await readError(res, "Could not submit the alert."));
  return res.json().catch(() => null);
}

export async function reviewDecision(triageResultId, decision) {
  const res = await apiFetch(`/api/triage-results/${triageResultId}/review?decision=${decision}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save the review."));
}

export async function resolveIncident(triageResultId, resolutionNote) {
  const res = await apiFetch(`/api/triage-results/${triageResultId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolutionNote }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save the resolution."));
}

export async function retryAlert(alertId) {
  const res = await apiFetch(`/api/alerts/${alertId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Retry failed."));
}
