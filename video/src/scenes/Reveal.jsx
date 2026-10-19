import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, accentGlow } from "../theme";

// Same mark as the dashboard: a pulse spikes and resolves into a decision dot.
// `draw` (0–1) traces the pulse; the dot lands once the line is complete.
export function LogoMark({ size = 120, draw = 1 }) {
  const dot = Math.max(0, Math.min(1, (draw - 0.85) / 0.15));
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.22, background: C.accent, display: "grid", placeItems: "center", color: C.onAccent, boxShadow: `0 0 0 ${size * 0.08}px ${accentGlow(0.15)}` }}>
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none">
        <path d="M2.5 13h4l2.2-6.5 3.6 11 2.6-8 1.6 3.5h1.5" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - Math.min(1, draw / 0.85)} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20.4" cy="13" r={1.9 * dot} fill="currentColor" />
      </svg>
    </div>
  );
}

// 8–12 s: the product appears.
export function Reveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const nameIn = interpolate(frame, [0.4 * fps, 0.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineIn = interpolate(frame, [1.4 * fps, 2 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT.sans,
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(60% 50% at 50% 35%, ${accentGlow(0.18 * pop)}, transparent 70%), ${C.bg}`,
      }}
    >
      <div style={{ transform: `scale(${0.6 + pop * 0.4})`, opacity: pop }}>
        <LogoMark size={150} draw={interpolate(frame, [0.2 * fps, 1.3 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      </div>
      <div style={{ marginTop: 48, fontSize: 96, fontWeight: 700, letterSpacing: -3, color: C.text, opacity: nameIn, transform: `translateY(${(1 - nameIn) * 20}px)` }}>
        Incident Triage
      </div>
      <div style={{ marginTop: 18, fontSize: 52, fontWeight: 500, color: C.accent, letterSpacing: -1, opacity: lineIn, transform: `translateY(${(1 - lineIn) * 16}px)` }}>
        What if the fix was already waiting?
      </div>
    </AbsoluteFill>
  );
}
