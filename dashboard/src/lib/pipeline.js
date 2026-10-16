import { useEffect, useState } from "react";

// The triage pipeline as the user sees it. Order matters: the stepper fills left to right.
export const STAGES = [
  { key: "received", label: "Received", hint: "The API accepted the alert and stored it." },
  { key: "queued", label: "Queued", hint: "Waiting in the Redis queue for a triage worker." },
  { key: "retrieval", label: "Retrieval", hint: "Vector search finds the most similar past incident." },
  { key: "reasoning", label: "AI check", hint: "An LLM verifies the match is really the same problem." },
  { key: "decision", label: "Decision", hint: "Auto-suggest the known fix, or escalate to an engineer." },
  { key: "human", label: "Human loop", hint: "People approve or resolve — confirmed fixes are learned." },
];

export const MAX_RETRIES = 3;

export function isInFlight(alert) {
  return Boolean(alert) && !alert.decision && alert.status !== "FAILED";
}

// Returns one { state, note, tone } per stage. state: done | active | failed | pending
export function deriveStages(alert) {
  const failed = alert.status === "FAILED" && !alert.decision;
  const processing = alert.status === "PROCESSING";
  const decided = Boolean(alert.decision);
  const review = alert.humanReviewStatus;

  const queued =
    decided || processing || failed
      ? {
          state: "done",
          note: alert.retryCount > 0 ? `${alert.retryCount} retr${alert.retryCount === 1 ? "y" : "ies"}` : "Picked up",
        }
      : {
          state: "active",
          note:
            alert.retryCount > 0 ? `Retry ${alert.retryCount}/${MAX_RETRIES} after backoff` : "Waiting for a worker",
        };

  let human = { state: "pending", note: "" };
  const closed = alert.ticketStatus === "CLOSED" || alert.ticketStatus === "RESOLVED";
  if (alert.duplicateOfId) {
    human = { state: "done", note: `Duplicate of INC-${alert.duplicateOfId}` };
  } else if (closed && !["APPROVED", "REJECTED", "RESOLVED"].includes(review)) {
    human = { state: "done", note: alert.ticketStatus === "CLOSED" ? "Closed" : "Resolved" };
  } else if (alert.decision === "auto_suggest_fix") {
    if (review === "APPROVED") human = { state: "done", note: "Approved & learned", tone: "success" };
    else if (review === "REJECTED") human = { state: "done", note: "Rejected", tone: "danger" };
    else human = { state: "active", note: "Awaiting review" };
  } else if (alert.decision === "escalate") {
    human =
      review === "RESOLVED"
        ? { state: "done", note: "Resolved & learned", tone: "success" }
        : { state: "active", note: "Awaiting a fix" };
  }

  return [
    { state: "done", note: "Stored" },
    queued,
    decided
      ? { state: "done", note: alert.matchedLog ? "Match found" : "No close match" }
      : failed
        ? { state: "failed", note: "Service unreachable" }
        : processing
          ? { state: "active", note: "Searching…" }
          : { state: "pending", note: "" },
    decided
      ? { state: "done", note: alert.decision === "auto_suggest_fix" ? "Match confirmed" : "Not a safe match" }
      : processing
        ? { state: "active", note: "Thinking…" }
        : { state: "pending", note: failed ? "Skipped" : "" },
    decided
      ? alert.decision === "auto_suggest_fix"
        ? { state: "done", note: "Fix suggested", tone: "success" }
        : { state: "done", note: "Escalated", tone: "warning" }
      : failed
        ? { state: "failed", note: "Dead-lettered", tone: "danger" }
        : { state: "pending", note: "" },
    human,
  ].map((s, i) => ({ ...STAGES[i], ...s }));
}

// How many stages have something to show (done, active or failed).
export function reachedCount(stages) {
  let last = 0;
  stages.forEach((s, i) => {
    if (s.state !== "pending") last = i + 1;
  });
  return last;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const OPEN_SPEED = 140; // quick sweep when an issue is opened
const LIVE_SPEED = 450; // live progress while you watch
const REPLAY_SPEED = 700; // "replay" walkthrough pace

// Reveals stages one at a time up to `target`. Returns [visibleCount, replay].
export function useStagedReveal(target) {
  const [reveal, setReveal] = useState(() => ({
    count: prefersReducedMotion() ? target : 1,
    speed: OPEN_SPEED,
  }));

  useEffect(() => {
    if (reveal.count >= target) return undefined;
    const timer = setTimeout(() => {
      setReveal((r) => {
        const count = r.count + 1;
        return { count, speed: count >= target ? LIVE_SPEED : r.speed };
      });
    }, reveal.speed);
    return () => clearTimeout(timer);
  }, [reveal, target]);

  const replay = () => setReveal({ count: prefersReducedMotion() ? target : 0, speed: REPLAY_SPEED });
  return [Math.min(reveal.count, target), replay, reveal.speed === REPLAY_SPEED && reveal.count < target];
}

export function useNow(intervalMs, enabled) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total >= 3600) return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Loops a reveal 1..max (with a short pause) for demo animations.
export function useLoopingCount(max, ms) {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const timer = setInterval(() => setCount((c) => (c >= max + 2 ? 1 : c + 1)), ms);
    return () => clearInterval(timer);
  }, [max, ms]);
  return Math.min(count, max);
}
