import { useEffect, useMemo, useRef, useState } from "react";
import { PriorityIcon, TicketStatus } from "./TicketBits";

// Ctrl/Cmd+K: jump to any incident or view by typing.
function CommandPalette({ alerts, actions, onOpenIncident, onClose }) {
  const dialogRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const idMatch = q.match(/^(?:inc-?)?(\d+)$/);
    const matchingActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
    const incidents = alerts
      .filter((a) => {
        if (!q) return true;
        if (idMatch && String(a.id) === idMatch[1]) return true;
        return a.message.toLowerCase().includes(q) || a.source.toLowerCase().includes(q) || (a.labels || "").includes(q);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8)
      .map((a) => ({ kind: "incident", key: `inc-${a.id}`, alert: a }));
    return [...matchingActions.map((a) => ({ kind: "action", key: a.key, action: a })), ...incidents];
  }, [query, alerts, actions]);

  const current = Math.min(active, Math.max(0, results.length - 1));

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.kind === "action") item.action.run();
    else onOpenIncident(item.alert.id);
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog palette-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label="Quick search"
    >
      <div className="palette">
        <input
          className="palette-input"
          autoFocus
          placeholder="Search incidents, or jump to a view…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[current]);
            }
          }}
          aria-label="Search"
          aria-activedescendant={results[current] ? `pal-${results[current].key}` : undefined}
        />
        <ul className="palette-list" role="listbox">
          {results.length === 0 && <li className="palette-empty">No matches</li>}
          {results.map((item, i) => (
            <li
              key={item.key}
              id={`pal-${item.key}`}
              role="option"
              aria-selected={i === current}
              className={`palette-item ${i === current ? "palette-item-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
            >
              {item.kind === "action" ? (
                <>
                  <span className="palette-kind">{item.action.group}</span>
                  <span className="palette-text">{item.action.label}</span>
                  {item.action.hint && <kbd>{item.action.hint}</kbd>}
                </>
              ) : (
                <>
                  <span className="palette-kind">INC-{item.alert.id}</span>
                  <span className="palette-text">{item.alert.message}</span>
                  <PriorityIcon priority={item.alert.priority} />
                  <TicketStatus status={item.alert.ticketStatus} />
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="palette-foot">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </p>
      </div>
    </dialog>
  );
}

export default CommandPalette;
