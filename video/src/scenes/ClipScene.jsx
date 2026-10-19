import React from "react";
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

// A screen recording inside a browser frame, slowly zooming, with a caption.
// Without a recording it shows a labelled placeholder so timing can still be previewed.
export function ClipScene({ clip }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06]);
  const inOut = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capIn = interpolate(frame, [0.3 * fps, 0.8 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 60% at 50% 30%, rgba(232,134,58,0.12), transparent 70%), ${C.bg}`, fontFamily: FONT.sans, alignItems: "center", opacity: inOut }}>
      <div
        style={{
          marginTop: 70,
          width: 1560,
          height: 878,
          borderRadius: 18,
          overflow: "hidden",
          border: `2px solid ${C.borderStrong}`,
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
          background: C.surface,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: C.bgElevated, borderBottom: `1px solid ${C.border}` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
          ))}
          <span style={{ marginLeft: 20, fontFamily: FONT.mono, fontSize: 18, color: C.dim }}>localhost/#/incident-triage</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {clip.file ? (
            <OffthreadVideo src={staticFile(`recordings/${clip.file}`)} startFrom={Math.round((clip.start || 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
          ) : (
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", color: C.dim, gap: 16, background: `repeating-linear-gradient(135deg, ${C.surface} 0 22px, ${C.surface2} 22px 44px)` }}>
              <div style={{ fontSize: 36, fontWeight: 600, color: C.muted }}>Screen recording goes here</div>
              <div style={{ fontSize: 26, fontFamily: FONT.mono }}>{clip.hint}</div>
              <div style={{ fontSize: 22 }}>set the file name in src/config.js → CLIPS</div>
            </AbsoluteFill>
          )}
        </div>
      </div>
      <div style={{ marginTop: 40, fontSize: 50, fontWeight: 600, letterSpacing: -1, color: C.text, opacity: capIn, transform: `translateY(${(1 - capIn) * 14}px)` }}>
        {clip.caption}
      </div>
    </AbsoluteFill>
  );
}
