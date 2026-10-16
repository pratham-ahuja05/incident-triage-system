import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";

// Boxes are laid out on a 1920x1080 canvas; arrows draw in, then packets travel along them.
const NODES = [
  { id: "ui", x: 150, y: 470, title: "Dashboard", sub: "React · Vite · SSE" },
  { id: "api", x: 560, y: 470, title: "API", sub: "Spring Boot · JWT" },
  { id: "queue", x: 970, y: 270, title: "Queue", sub: "Redis · retries" },
  { id: "pg", x: 970, y: 670, title: "PostgreSQL", sub: "incidents · audit" },
  { id: "ai", x: 1380, y: 270, title: "AI service", sub: "FastAPI · embeddings" },
  { id: "vec", x: 1380, y: 670, title: "pgvector", sub: "similar past fixes" },
  { id: "llm", x: 1380, y: 70, title: "LLM", sub: "verify · investigate" },
];
const W = 330;
const H = 130;
const EDGES = [
  ["ui", "api"],
  ["api", "queue"],
  ["api", "pg"],
  ["queue", "ai"],
  ["ai", "vec"],
  ["ai", "llm"],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

function edgePath(a, b) {
  const A = byId[a];
  const B = byId[b];
  const ax = A.x + W / 2;
  const ay = A.y + H / 2;
  const bx = B.x + W / 2;
  const by = B.y + H / 2;
  // leave/enter from the nearest sides
  const horizontal = Math.abs(bx - ax) > Math.abs(by - ay);
  const sx = horizontal ? A.x + (bx > ax ? W : 0) : ax;
  const sy = horizontal ? ay : A.y + (by > ay ? H : 0);
  const ex = horizontal ? B.x + (bx > ax ? 0 : W) : bx;
  const ey = horizontal ? by : B.y + (by > ay ? 0 : H);
  const mx = (sx + ex) / 2;
  return horizontal ? `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}` : `M${sx},${sy} L${ex},${ey}`;
}

export function Architecture() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const titleIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT.sans, opacity: out }}>
      <div style={{ position: "absolute", top: 60, left: 150, fontSize: 30, color: C.muted, letterSpacing: 4, textTransform: "uppercase", fontWeight: 600, opacity: titleIn }}>
        Under the hood
      </div>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        {EDGES.map(([a, b], i) => {
          const start = 12 + i * 8;
          const draw = interpolate(frame, [start, start + 18], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const d = edgePath(a, b);
          const t = ((frame - start - 18) % 40) / 40;
          return (
            <g key={`${a}-${b}`}>
              <path d={d} stroke={C.borderStrong} strokeWidth="3" fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={draw} />
              {frame > start + 18 && <Packet d={d} t={t} />}
            </g>
          );
        })}
      </svg>
      {NODES.map((n, i) => {
        const pop = spring({ frame: frame - i * 5, fps, config: { damping: 14 } });
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              width: W,
              height: H,
              borderRadius: 18,
              background: C.surface,
              border: `2px solid ${n.id === "ai" || n.id === "llm" ? "rgba(139,92,246,0.7)" : C.borderStrong}`,
              padding: "26px 28px",
              boxSizing: "border-box",
              opacity: pop,
              transform: `scale(${0.85 + pop * 0.15})`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 600, color: C.text }}>{n.title}</div>
            <div style={{ fontSize: 22, color: C.muted, fontFamily: FONT.mono, marginTop: 8, whiteSpace: "nowrap" }}>{n.sub}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// A short bright dash travelling along the edge: a 4% dash whose offset advances with time.
function Packet({ d, t }) {
  return (
    <path d={d} stroke={C.accent} strokeWidth="6" strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="0.04 0.96" strokeDashoffset={-t} opacity={0.95} />
  );
}
