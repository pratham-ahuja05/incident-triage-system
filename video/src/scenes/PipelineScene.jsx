import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { PIPELINE_RUN } from "../config";

const STEP_FRAMES = 30; // one stage per second on screen
const START = 45;

function Node({ index, frame, fps, label, note, success, last }) {
  const at = START + index * STEP_FRAMES;
  const pop = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 160 } });
  const done = frame >= at;
  const active = last && done;
  const pulse = active ? 1 + 0.12 * Math.sin((frame - at) / 4) : 1;
  const color = success ? C.success : C.accent;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 230 }}>
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: done ? (active ? "rgba(232,134,58,0.16)" : color) : C.surface,
          border: `3px solid ${done ? color : C.border}`,
          transform: `scale(${(done ? 0.75 + pop * 0.25 : 1) * pulse})`,
          boxShadow: active ? `0 0 0 ${10 + 6 * Math.sin((frame - at) / 4)}px rgba(232,134,58,0.15)` : "none",
          zIndex: 1,
        }}
      >
        {done && !active ? (
          <svg width="34" height="34" viewBox="0 0 16 16" fill="none">
            <path d="m3.5 8.5 3 3 6-7" stroke={C.onAccent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: done ? C.accent : C.border }} />
        )}
      </div>
      <div style={{ marginTop: 18, fontSize: 30, fontWeight: 600, color: done ? C.text : C.dim }}>{label}</div>
      <div style={{ marginTop: 6, minHeight: 60, fontSize: 22, lineHeight: "30px", textAlign: "center", fontFamily: FONT.mono, color: active ? C.accent : C.muted, opacity: interpolate(pop, [0, 1], [0, 1]) }}>
        {done ? note.split(" · ").map((part) => <div key={part}>{part}</div>) : ""}
      </div>
    </div>
  );
}

// 12–25 s: one real incident, stage by stage, with the timings measured in testing.
export function PipelineScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = PIPELINE_RUN.stages.length;
  const progress = interpolate(frame, [START, START + (n - 1) * STEP_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardIn = spring({ frame, fps, config: { damping: 16 } });
  const seconds = interpolate(frame, [START, START + 4 * STEP_FRAMES], [0, PIPELINE_RUN.totalSeconds], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const capIn = interpolate(frame, [START + n * STEP_FRAMES, START + n * STEP_FRAMES + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT.sans, alignItems: "center" }}>
      <div style={{ marginTop: 110, fontSize: 30, color: C.muted, letterSpacing: 4, textTransform: "uppercase", fontWeight: 600 }}>
        One real alert, end to end
      </div>

      <div
        style={{
          marginTop: 40,
          width: 1500,
          padding: "34px 44px 48px",
          borderRadius: 24,
          background: C.surface,
          border: `2px solid ${C.border}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 40}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 26 }}>
          <span style={{ fontFamily: FONT.mono, color: C.accent }}>{PIPELINE_RUN.id}</span>
          <span style={{ fontWeight: 600, color: C.text }}>{PIPELINE_RUN.service}</span>
          <span style={{ marginLeft: "auto", fontFamily: FONT.mono, color: C.accent, fontSize: 28 }}>
            ● {seconds.toFixed(1)} s
          </span>
        </div>
        <div style={{ marginTop: 14, fontFamily: FONT.mono, fontSize: 28, color: C.muted }}>{PIPELINE_RUN.message}</div>

        <div style={{ position: "relative", marginTop: 56, display: "flex", justifyContent: "space-between" }}>
          <div style={{ position: "absolute", top: 37, left: 115, right: 115, height: 4, background: C.border, borderRadius: 2 }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.success})`, borderRadius: 2 }} />
          </div>
          {PIPELINE_RUN.stages.map((s, i) => (
            <Node key={s.label} index={i} frame={frame} fps={fps} label={s.label} note={s.note} success={i === 4} last={i === n - 1} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 70, fontSize: 52, fontWeight: 600, color: C.text, letterSpacing: -1, opacity: capIn, textAlign: "center" }}>
        Matched to a past fix in <span style={{ color: C.success }}>{PIPELINE_RUN.totalSeconds} seconds</span>.
        <div style={{ fontSize: 34, fontWeight: 500, color: C.muted, marginTop: 12 }}>Measured, not mocked — from a real run.</div>
      </div>
    </AbsoluteFill>
  );
}
