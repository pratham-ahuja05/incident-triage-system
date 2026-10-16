import { useMemo, useState } from "react";
import { Avatar, DueBadge, PriorityIcon } from "./TicketBits";
import { IconComment } from "./Icons";
import { TICKET_STATUSES, dueState, labelsOf, priorityRank } from "../lib/workflow";
import { useNow } from "../lib/pipeline";

const SWIMLANE_FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Assigned to me" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
];

function KanbanCard({ alert, now, canDrag, onOpen, onMove, selected }) {
  const due = dueState(alert, now);
  return (
    <article
      className={`kcard ${selected ? "kcard-selected" : ""} ${due === "overdue" ? "kcard-overdue" : ""}`}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(alert.id));
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("kcard-dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("kcard-dragging")}
    >
      <button type="button" className="kcard-open" onClick={() => onOpen(alert.id)} aria-label={`Open INC-${alert.id}`}>
        <p className="kcard-title">{alert.message}</p>
        <div className="kcard-labels">
          <span className="kcard-source">{alert.source}</span>
          {labelsOf(alert)
            .slice(0, 2)
            .map((l) => (
              <span key={l} className="label-chip">
                {l}
              </span>
            ))}
        </div>
        <div className="kcard-foot">
          <span className="kcard-key">INC-{alert.id}</span>
          <PriorityIcon priority={alert.priority} />
          {alert.commentCount > 0 && (
            <span className="kcard-comments" title={`${alert.commentCount} comments`}>
              <IconComment size={12} />
              {alert.commentCount}
            </span>
          )}
          <DueBadge alert={alert} now={now} />
          <span className="kcard-spacer" />
          <Avatar name={alert.assignee} size={22} />
        </div>
      </button>
      {canDrag && (
        // Keyboard / touch alternative to drag-and-drop
        <select
          className="kcard-move"
          value={alert.ticketStatus}
          onChange={(e) => onMove(alert, e.target.value)}
          aria-label={`Move INC-${alert.id} to`}
        >
          {TICKET_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

function KanbanView({ store, me, canWrite, selectedId, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const now = useNow(30000, true);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.alerts.filter((a) => {
      if (q && !a.message.toLowerCase().includes(q) && !a.source.toLowerCase().includes(q) && `inc-${a.id}` !== q) return false;
      if (filter === "mine") return a.assignee === me;
      if (filter === "unassigned") return !a.assignee;
      if (filter === "overdue") return dueState(a, now) === "overdue";
      return true;
    });
  }, [store.alerts, filter, query, me, now]);

  const columns = useMemo(
    () =>
      TICKET_STATUSES.map((s) => ({
        ...s,
        items: visible
          .filter((a) => (a.ticketStatus || "OPEN") === s.key)
          .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt)),
      })),
    [visible]
  );

  const move = (alert, status) => {
    if (!alert || alert.ticketStatus === status) return;
    const label = TICKET_STATUSES.find((s) => s.key === status)?.label;
    store.update(alert.id, { ticketStatus: status }, `INC-${alert.id} → ${label}`).catch(() => {});
  };

  return (
    <div className="kanban-wrap">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Filter cards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter cards"
        />
        <div className="filters" aria-label="Quick filters">
          {SWIMLANE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`filter-chip ${filter === f.key ? "filter-chip-active" : ""}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!canWrite && <p className="role-note">Viewers can browse the board; moving cards needs Analyst access.</p>}

      <div className="kanban" data-tour="kanban">
        {columns.map((col) => (
          <section
            key={col.key}
            className={`kcol ${dropTarget === col.key ? "kcol-drop" : ""}`}
            aria-label={`${col.label}: ${col.items.length}`}
            onDragOver={(e) => {
              if (!canWrite) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropTarget !== col.key) setDropTarget(col.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              const id = Number(e.dataTransfer.getData("text/plain"));
              move(store.alerts.find((a) => a.id === id), col.key);
            }}
          >
            <header className="kcol-head">
              <span className={`kcol-dot ticket-${col.tone}`} aria-hidden="true" />
              <h2>{col.label}</h2>
              <span className="kcol-count">{col.items.length}</span>
            </header>
            <div className="kcol-body">
              {col.items.map((a) => (
                <KanbanCard
                  key={a.id}
                  alert={a}
                  now={now}
                  canDrag={canWrite}
                  onOpen={onOpen}
                  onMove={move}
                  selected={a.id === selectedId}
                />
              ))}
              {col.items.length === 0 && <p className="kcol-empty">{canWrite ? "Drop cards here" : "Empty"}</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default KanbanView;
