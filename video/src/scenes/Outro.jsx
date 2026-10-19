import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { PERSON, STACK } from "../config";
import { LogoMark } from "./Reveal";

export function Outro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 15 } });
  const nameIn = interpolate(frame, [0.5 * fps, 1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const linkIn = interpolate(frame, [1.6 * fps, 2.1 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT.sans,
        justifyContent: "center",
        alignItems: "center",
        background: `radial-gradient(55% 45% at 50% 40%, rgba(232,134,58,0.16), transparent 70%), ${C.bg}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: pop, transform: `scale(${0.9 + pop * 0.1})` }}>
        <LogoMark size={96} />
        <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -2.5, color: C.text }}>Incident Triage</div>
      </div>

      <div style={{ marginTop: 40, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", maxWidth: 1400 }}>
        {STACK.map((s, i) => {
          const chip = spring({ frame: frame - 8 - i * 3, fps, config: { damping: 14 } });
          return (
            <span key={s} style={{ fontFamily: FONT.mono, fontSize: 26, color: C.muted, padding: "10px 22px", borderRadius: 999, border: `2px solid ${C.border}`, background: C.surface, opacity: chip, transform: `translateY(${(1 - chip) * 12}px)` }}>
              {s}
            </span>
          );
        })}
      </div>

      <div style={{ marginTop: 80, textAlign: "center", opacity: nameIn, transform: `translateY(${(1 - nameIn) * 16}px)` }}>
        <div style={{ fontSize: 40, color: C.muted }}>Built by</div>
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2.5, color: C.text }}>{PERSON.name}</div>
      </div>

      <div style={{ marginTop: 28, textAlign: "center", opacity: linkIn }}>
        <div style={{ fontSize: 34, fontFamily: FONT.mono, color: C.accent }}>{PERSON.github}</div>
        <div style={{ marginTop: 18, display: "inline-block", fontSize: 30, fontWeight: 600, color: C.success, padding: "10px 26px", borderRadius: 999, background: "rgba(61,186,126,0.12)" }}>
          {PERSON.role}
        </div>
      </div>
    </AbsoluteFill>
  );
}
