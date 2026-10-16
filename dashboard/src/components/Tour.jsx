import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PAD = 6;
const POP_W = 320;
const GAP = 12;

function findTarget(step) {
  const el = document.querySelector(`[data-tour="${step.target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= window.innerWidth) return null;
  return el;
}

function popoverPosition(rect, placement, popHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POP_W, vw - 32);
  const clampX = (x) => Math.max(16, Math.min(x, vw - width - 16));
  const clampY = (y) => Math.max(16, Math.min(y, vh - popHeight - 16));

  if (placement === "right" && rect.right + GAP + width < vw - 16) {
    return { left: rect.right + GAP + PAD, top: clampY(rect.top + rect.height / 2 - popHeight / 2), width };
  }
  if (rect.bottom + GAP + popHeight < vh - 16) {
    return { left: clampX(rect.left + rect.width / 2 - width / 2), top: rect.bottom + GAP + PAD, width };
  }
  if (rect.top - GAP - popHeight > 16) {
    return { left: clampX(rect.left + rect.width / 2 - width / 2), top: rect.top - GAP - PAD - popHeight, width };
  }
  // Target fills the screen: float the card inside it.
  return { left: clampX(rect.left + rect.width / 2 - width / 2), top: clampY(rect.top + 24), width };
}

// Spotlight tour: dims the page, highlights one element, explains it.
function Tour({ steps, onClose }) {
  const [validSteps] = useState(() => steps.filter(findTarget));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [popHeight, setPopHeight] = useState(180);
  const popRef = useRef(null);
  const nextRef = useRef(null);
  const step = validSteps[index];
  const last = index === validSteps.length - 1;

  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = findTarget(step);
    if (!el) return undefined;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setRect(el.getBoundingClientRect());
        if (popRef.current) setPopHeight(popRef.current.offsetHeight);
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(validSteps.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, validSteps.length]);

  if (!step) {
    return null;
  }

  const pos = rect ? popoverPosition(rect, step.placement, popHeight) : null;

  return (
    <div className="tour-layer">
      <div className="tour-blocker" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}
      <div
        ref={popRef}
        className="tour-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }}
        key={step.target}
      >
        <div className="tour-progress" aria-hidden="true">
          {validSteps.map((s, i) => (
            <span key={s.target} className={i <= index ? "on" : ""} />
          ))}
        </div>
        <span className="tour-count">
          Step {index + 1} of {validSteps.length}
        </span>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="link-btn tour-skip" onClick={onClose}>
            Skip tour
          </button>
          {index > 0 && (
            <button type="button" className="btn btn-small" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Tour;
