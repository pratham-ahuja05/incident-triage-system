import { useEffect, useMemo, useRef } from "react";

// Decorative, illustrative log stream for the sign-in screen (labelled "sample" in the UI).
// Motion is pure CSS; the cursor only updates two CSS variables per animation frame.

const SERVICES = ["checkout-svc", "payment-svc", "edge-gateway", "auth-svc", "orders-worker", "search-api", "billing-cron", "cdn-proxy"];

const TEMPLATES = [
  ["INFO", "GET /api/cart 200 in {ms}ms"],
  ["INFO", "POST /api/orders 201 in {ms}ms"],
  ["INFO", "health check ok · {n} upstreams healthy"],
  ["INFO", "cache hit ratio {pct}% over last 60s"],
  ["INFO", "worker {n} processed batch of {big} events"],
  ["INFO", "jwt refreshed for session s-{hex}"],
  ["DEBUG", "pool stats active={n} idle={n} waiting=0"],
  ["DEBUG", "feature flag checkout_v2 evaluated → on"],
  ["WARN", "slow query on orders ({big}ms) — consider index", "→ deduplicated"],
  ["WARN", "retrying request to inventory-api (attempt {n}/3)", "→ watching"],
  ["WARN", "heap usage at {pct}% of limit", "→ watching"],
  ["ERROR", "Unable to connect to Redis at cache-0{n}:6379, connection refused", "→ fix suggested · 85% match"],
  ["ERROR", "Timeout connecting to Postgres primary node after 30000ms", "→ fix suggested · 80% match"],
  ["ERROR", "SSL certificate expired for api.shop.example", "→ fix suggested · 64% match"],
  ["ERROR", "Consumer lag exceeded {big} on topic order-events", "→ escalated · new problem"],
  ["ERROR", "NullPointerException at PaymentService.capture:{n}", "→ escalated · needs engineer"],
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeLines(count, seed) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  let t = 9 * 3600 + 41 * 60;
  return Array.from({ length: count }, (_, i) => {
    // errors are rarer than info, like a real stream
    const roll = r();
    const pool = roll < 0.14 ? TEMPLATES.slice(11) : roll < 0.32 ? TEMPLATES.slice(8, 11) : TEMPLATES.slice(0, 8);
    const [level, text, tag] = pick(pool);
    t += Math.floor(r() * 4);
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, "0");
    const mm = String(Math.floor(t / 60) % 60).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    const msg = text
      .replace("{ms}", String(8 + Math.floor(r() * 240)))
      .replace("{big}", String(1200 + Math.floor(r() * 48000)))
      .replaceAll("{n}", () => String(1 + Math.floor(r() * 9)))
      .replace("{pct}", String(61 + Math.floor(r() * 37)))
      .replace("{hex}", Math.floor(r() * 0xffffff).toString(16).padStart(6, "0"));
    return {
      id: i,
      time: `${hh}:${mm}:${ss}.${String(Math.floor(r() * 1000)).padStart(3, "0")}`,
      level,
      service: pick(SERVICES),
      msg,
      tag,
    };
  });
}

function Stream({ lines, className }) {
  // Rendered twice so the CSS scroll (translateY -50%) loops seamlessly.
  const doubled = [...lines, ...lines];
  return (
    <div className={`logwall-layer ${className}`}>
      <ol className="logwall-track">
        {doubled.map((l, i) => (
          <li key={i} className={`log-line log-${l.level}`}>
            <span className="log-time">{l.time}</span>
            <span className="log-level">{l.level}</span>
            <span className="log-svc">{l.service}</span>
            <span className="log-msg">
              {l.msg}
              {/* Overlays the start of the message on hover — right next to the cursor */}
              {l.tag && <span className="log-tag">{l.tag}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LogWall() {
  const ref = useRef(null);
  const back = useMemo(() => makeLines(46, 7), []);
  const front = useMemo(() => makeLines(34, 42), []);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    let frame = 0;
    let target = null;
    const apply = () => {
      frame = 0;
      if (!target) return;
      const rect = el.getBoundingClientRect();
      const x = target.x - rect.left;
      const y = target.y - rect.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      // -1..1 from the centre, for parallax
      el.style.setProperty("--px", ((x / rect.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--py", ((y / rect.height) * 2 - 1).toFixed(3));
    };
    const onMove = (e) => {
      target = { x: e.clientX, y: e.clientY };
      el.classList.add("logwall-active");
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => el.classList.remove("logwall-active");

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="logwall" aria-hidden="true">
      <Stream lines={back} className="logwall-back" />
      <Stream lines={front} className="logwall-front" />
      <div className="logwall-shade" />
      <span className="logwall-label">
        <span className="logwall-dot" />
        sample log stream · hover a line
      </span>
    </div>
  );
}

export default LogWall;
