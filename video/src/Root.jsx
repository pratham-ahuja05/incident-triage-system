import React from "react";
import { AbsoluteFill, Audio, Composition, Series, staticFile } from "remotion";
import { FPS } from "./theme";
import { CLIPS, MUSIC } from "./config";
import { Hook } from "./scenes/Hook";
import { LogRush } from "./scenes/LogRush";
import { Reveal } from "./scenes/Reveal";
import { PipelineScene } from "./scenes/PipelineScene";
import { ClipScene } from "./scenes/ClipScene";
import { Architecture } from "./scenes/Architecture";
import { Outro } from "./scenes/Outro";

const s = (seconds) => Math.round(seconds * FPS);

// The 70-second ad. Durations follow the script: hook, problem, reveal, proof, features, tech, CTA.
const TIMELINE = [
  { key: "hook", sec: 3.5, el: <Hook /> },
  { key: "logs", sec: 4.5, el: <LogRush /> },
  { key: "reveal", sec: 4, el: <Reveal /> },
  { key: "pipeline", sec: 11, el: <PipelineScene /> },
  { key: "investigation", sec: CLIPS.investigation.seconds ?? 8, el: <ClipScene clip={CLIPS.investigation} /> },
  { key: "approve", sec: CLIPS.approve.seconds ?? 7, el: <ClipScene clip={CLIPS.approve} /> },
  { key: "overview", sec: CLIPS.overview.seconds ?? 6, el: <ClipScene clip={CLIPS.overview} /> },
  { key: "calendar", sec: CLIPS.calendar.seconds ?? 5, el: <ClipScene clip={CLIPS.calendar} /> },
  { key: "search", sec: CLIPS.search.seconds ?? 4, el: <ClipScene clip={CLIPS.search} /> },
  { key: "architecture", sec: 8, el: <Architecture /> },
  { key: "outro", sec: 9, el: <Outro /> },
];

const TOTAL = TIMELINE.reduce((sum, t) => sum + s(t.sec), 0);

function Ad() {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {MUSIC && <Audio src={staticFile(MUSIC)} />}
      <Series>
        {TIMELINE.map((t) => (
          <Series.Sequence key={t.key} durationInFrames={s(t.sec)}>
            {t.el}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}

// 9:16 for Reels/Shorts: the same 16:9 film, scaled into the centre with the brand around it.
function AdVertical() {
  return (
    <AbsoluteFill style={{ background: "#12100e", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 1920, height: 1080, transform: "scale(0.5625)", flexShrink: 0 }}>
        <Ad />
      </div>
    </AbsoluteFill>
  );
}

export function RemotionRoot() {
  return (
    <>
      <Composition id="Ad" component={Ad} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="AdVertical" component={AdVertical} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
      {/* individual scenes, handy in Remotion Studio */}
      {TIMELINE.filter((t) => !t.key.match(/investigation|approve|overview|calendar|search/)).map((t) => (
        <Composition key={t.key} id={`Scene-${t.key}`} component={() => t.el} durationInFrames={s(t.sec)} fps={FPS} width={1920} height={1080} />
      ))}
    </>
  );
}
