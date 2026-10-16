import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

const LINE = "[03:12:44.518] ERROR checkout-service  Unable to connect to Redis at cache-01:6379, connection refused";

// 0–3.5 s: black screen, an error types out, then the hook line.
export function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = Math.floor(interpolate(frame, [4, 1.4 * fps], [0, LINE.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = Math.floor(frame / 8) % 2 === 0;
  const titleIn = interpolate(frame, [1.6 * fps, 2.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subIn = interpolate(frame, [2.3 * fps, 2.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // a short red flicker when the error lands
  const flash = interpolate(frame, [1.4 * fps, 1.5 * fps, 1.75 * fps], [0, 0.22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: FONT.sans }}>
      <AbsoluteFill style={{ background: C.danger, opacity: flash }} />
      <div style={{ position: "absolute", top: 300, left: 160, right: 160, fontFamily: FONT.mono, fontSize: 25, color: C.danger, whiteSpace: "pre" }}>
        {LINE.slice(0, typed)}
        <span style={{ opacity: caret ? 1 : 0, color: C.text }}>▍</span>
      </div>
      <div style={{ position: "absolute", top: 470, left: 160, color: C.text }}>
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 24}px)` }}>
          It&apos;s 3 AM.
        </div>
        <div style={{ fontSize: 72, fontWeight: 600, color: C.danger, letterSpacing: -2, opacity: subIn, transform: `translateY(${(1 - subIn) * 18}px)` }}>
          Production is down.
        </div>
      </div>
    </AbsoluteFill>
  );
}
