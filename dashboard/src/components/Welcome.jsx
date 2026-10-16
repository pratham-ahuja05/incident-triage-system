import { useEffect, useRef } from "react";
import PipelineStepper from "./PipelineStepper";
import { IconPlay } from "./Icons";
import { STAGES, useLoopingCount } from "../lib/pipeline";
import { normalizeRole } from "../api";

const DEMO_STAGES = STAGES.map((s, i) => ({
  ...s,
  state: "done",
  tone: i === 4 ? "success" : undefined,
  note: ["Stored", "Picked up", "Match found", "Match confirmed", "Fix suggested", "Approved & learned"][i],
}));

const STEPS = [
  {
    title: "Alerts come in",
    body: "From your monitoring, or reported by hand. Each one is stored and queued in seconds.",
  },
  {
    title: "AI triages them",
    body: "It finds the most similar past incident and asks an LLM to confirm it. Known problem → the proven fix is suggested. New problem → escalated to a person.",
  },
  {
    title: "People close the loop",
    body: "Approve a suggested fix, or record how an escalation was fixed. Every confirmed fix is learned, so the next one is automatic.",
  },
];

function Welcome({ session, canWrite, onTour, onDemo, onClose }) {
  const dialogRef = useRef(null);
  const visible = useLoopingCount(DEMO_STAGES.length, 800);
  const role = session?.roles?.map(normalizeRole)[0] || "VIEWER";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog welcome-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="welcome-title"
    >
      <div className="welcome">
        <p className="auth-kicker">How it works</p>
        <h2 id="welcome-title" className="welcome-title">
          Welcome{session?.username ? `, ${session.username}` : ""}. Here is what this console does.
        </h2>
        <p className="welcome-sub">
          Incident Triage reads production error alerts, matches them against problems your team has already solved, and
          only pages a human when it is genuinely new.
        </p>

        <div className="welcome-pipeline">
          <PipelineStepper stages={DEMO_STAGES} visible={visible} />
        </div>

        <ol className="welcome-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ "--stagger": i }}>
              <span className="stage-num">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="welcome-role">
          You are signed in as <strong>{role.toLowerCase()}</strong>.{" "}
          {canWrite
            ? "You can report incidents, review suggested fixes, and record resolutions."
            : "You can watch everything; reporting and reviewing need Analyst access."}
        </p>

        <div className="welcome-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Skip for now
          </button>
          <button type="button" className="btn" onClick={onTour}>
            Take the 1-minute tour
          </button>
          {canWrite && (
            <button type="button" className="btn btn-primary btn-icon" onClick={onDemo} autoFocus>
              <IconPlay size={13} />
              Run a demo incident
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default Welcome;
