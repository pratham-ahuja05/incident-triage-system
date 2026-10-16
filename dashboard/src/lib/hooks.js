import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AI_ORIGIN, API_ORIGIN, apiFetch } from "../api";

// Location hash as the route: #/board, #/board/42, #/kanban/42, #/calendar, #/analytics, #/knowledge
const VIEWS = ["board", "kanban", "calendar", "analytics", "knowledge"];
const VIEWS_WITH_ISSUE = ["board", "kanban", "calendar"];

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const view = VIEWS.includes(parts[0]) ? parts[0] : "board";
  const id = VIEWS_WITH_ISSUE.includes(view) && parts[1] ? Number(parts[1]) || null : null;
  return { view, id };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((view, id = null) => {
    const next = id ? `#/${view}/${id}` : `#/${view}`;
    if (window.location.hash !== next) window.location.hash = next;
  }, []);

  return [route, navigate];
}

export function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

// Runs fn now and every `ms` while the tab is visible; refreshes on return to the tab.
export function usePolling(fn, ms, enabled = true) {
  const visible = usePageVisible();
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled || !visible) return undefined;
    fnRef.current();
    const interval = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(interval);
  }, [ms, enabled, visible]);
}

// Server-sent events with exponential-backoff reconnect. Returns whether the stream is live.
export function useEventStream(path, eventName, onEvent) {
  const [live, setLive] = useState(false);
  const handlerRef = useRef(onEvent);
  useLayoutEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;
    let es = null;
    let retryTimer = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      es = new EventSource(`${API_ORIGIN}${path}`);
      es.addEventListener(eventName, () => handlerRef.current());
      es.onopen = () => {
        attempt = 0;
        setLive(true);
      };
      es.onerror = () => {
        setLive(false);
        es.close();
        if (disposed) return;
        const delay = Math.min(30000, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [path, eventName]);

  return live;
}

async function probe(fn) {
  try {
    return (await fn()) ? "up" : "down";
  } catch {
    return "down";
  }
}

export function useServiceHealth() {
  const [health, setHealth] = useState({ api: "unknown", ai: "unknown" });

  const check = useCallback(async () => {
    const [api, ai] = await Promise.all([
      probe(async () => (await apiFetch("/api/analytics")).ok),
      probe(async () => (await fetch(`${AI_ORIGIN}/health`)).ok),
    ]);
    setHealth({ api, ai });
  }, []);

  usePolling(check, 30000);
  return health;
}

const THEME_KEY = "incident-triage.theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // storage unavailable — fall through to system preference
    }
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f6f7f9" : "#0b0d10");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  return [theme, toggle];
}
