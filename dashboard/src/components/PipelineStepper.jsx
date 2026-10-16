import { IconBranch, IconCheck, IconInbox, IconQueue, IconSearch, IconSparkle, IconUserCheck, IconX } from "./Icons";

const STAGE_ICONS = {
  received: IconInbox,
  queued: IconQueue,
  retrieval: IconSearch,
  reasoning: IconSparkle,
  decision: IconBranch,
  human: IconUserCheck,
};

// Horizontal pipeline: nodes light up in order, the connecting rail fills behind them.
function PipelineStepper({ stages, visible, compact = false, onSelect, selectedKey }) {
  const lastShown = Math.max(0, visible - 1);
  const fill = stages.length > 1 ? (lastShown / (stages.length - 1)) * 100 : 0;

  return (
    <ol className={`pipeline ${compact ? "pipeline-compact" : ""}`} aria-label="Triage pipeline">
      <span className="pipeline-rail" aria-hidden="true">
        <span className="pipeline-rail-fill" style={{ width: `${fill}%` }} />
      </span>
      {stages.map((stage, i) => {
        const shown = i < visible;
        const state = shown ? stage.state : "pending";
        const Icon = state === "done" ? IconCheck : state === "failed" ? IconX : STAGE_ICONS[stage.key];
        return (
          <li
            key={stage.key}
            className={`pipeline-step step-${state} ${stage.tone ? `step-tone-${stage.tone}` : ""} ${
              selectedKey === stage.key ? "step-selected" : ""
            }`}
            title={stage.hint}
            aria-current={state === "active" ? "step" : undefined}
          >
            {onSelect ? (
              <button
                type="button"
                className="pipeline-node pipeline-node-btn"
                onClick={() => onSelect(stage.key)}
                aria-pressed={selectedKey === stage.key}
                aria-label={`Inspect ${stage.label}`}
              >
                <Icon size={compact ? 13 : 15} />
              </button>
            ) : (
              <span className="pipeline-node">
                <Icon size={compact ? 13 : 15} />
              </span>
            )}
            <span className="pipeline-label">{stage.label}</span>
            {!compact && <span className="pipeline-note">{shown ? stage.note : ""}</span>}
            <span className="sr-only">
              {stage.label}: {state}
              {stage.note ? `, ${stage.note}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default PipelineStepper;
