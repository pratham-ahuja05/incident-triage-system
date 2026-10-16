import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

export function LogoMark({ size = 120 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.26, background: C.surface2, border: `2px solid ${C.border}`, display: "grid", placeItems: "center", color: C.accent }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <path d="M8 2.5 14 13.5H2L8 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 6.5v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
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
        background: `radial-gradient(60% 50% at 50% 35%, rgba(91,141,239,${0.18 * pop}), transparent 70%), ${C.bg}`,
      }}
    >
      <div style={{ transform: `scale(${0.6 + pop * 0.4})`, opacity: pop }}>
        <LogoMark size={150} />
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
