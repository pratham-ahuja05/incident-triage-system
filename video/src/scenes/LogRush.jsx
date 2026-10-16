import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

const SERVICES = ["checkout-svc", "payment-svc", "edge-gateway", "auth-svc", "orders-worker", "search-api"];
const MSGS = [
  ["INFO", "GET /api/cart 200 in 41ms"],
  ["WARN", "retrying request to inventory-api (attempt 2/3)"],
  ["ERROR", "Timeout connecting to Postgres primary node after 30000ms"],
  ["INFO", "worker 3 processed batch of 1200 events"],
  ["ERROR", "Unable to connect to Redis at cache-01:6379, connection refused"],
  ["WARN", "heap usage at 91% of limit"],
  ["ERROR", "SSL certificate expired for api.shop.example"],
  ["INFO", "POST /api/orders 201 in 88ms"],
];
const LEVEL_COLOR = { INFO: C.accent, WARN: C.warning, ERROR: C.danger };

const LINES = Array.from({ length: 90 }, (_, i) => {
  const [level, msg] = MSGS[Math.floor(random(`m${i}`) * MSGS.length)];
  return { level, msg, svc: SERVICES[Math.floor(random(`s${i}`) * SERVICES.length)], t: `03:1${2 + (i % 7)}:${String(10 + (i % 50)).padStart(2, "0")}.${String(Math.floor(random(`t${i}`) * 999)).padStart(3, "0")}` };
});

// 3.5–8 s: the wall of logs an on-call engineer faces.
export function LogRush() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const scroll = interpolate(frame, [0, durationInFrames], [0, -1500]);
  const textIn = interpolate(frame, [0.6 * fps, 1.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: out }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${scroll}px)`, padding: "40px 120px", fontFamily: FONT.mono, fontSize: 24, lineHeight: "40px" }}>
        {LINES.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 28, whiteSpace: "nowrap", color: C.dim, opacity: 0.55 }}>
            <span>{l.t}</span>
            <span style={{ color: LEVEL_COLOR[l.level], width: 90, fontWeight: 600 }}>{l.level}</span>
            <span style={{ width: 230, color: C.muted }}>{l.svc}</span>
            <span style={{ color: l.level === "ERROR" ? C.danger : C.muted }}>{l.msg}</span>
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(11,13,16,0.55) 0%, rgba(11,13,16,0.92) 70%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT.sans }}>
        <div style={{ maxWidth: 1300, textAlign: "center", fontSize: 64, fontWeight: 600, color: C.text, letterSpacing: -1.5, lineHeight: 1.2, opacity: textIn, transform: `scale(${0.96 + textIn * 0.04})` }}>
          Thousands of log lines.
          <br />
          <span style={{ color: C.muted, fontWeight: 500 }}>Old Slack threads. Guesswork.</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
