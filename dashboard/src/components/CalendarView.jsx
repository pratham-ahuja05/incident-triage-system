import { useMemo, useState } from "react";
import { Avatar, PriorityIcon, TicketStatus } from "./TicketBits";
import { isDone, toDate } from "../lib/workflow";
import { useNow } from "../lib/pipeline";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const sameDay = (a, b) => dayKey(a) === dayKey(b);

function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const weeks = Math.ceil((offset + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Every incident contributes up to two events: when it was reported and when it is due.
function buildEvents(alerts, mode, now) {
  const byDay = new Map();
  const push = (date, event) => {
    const key = dayKey(date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  };
  for (const a of alerts) {
    if (mode !== "due") push(toDate(a.createdAt), { kind: "created", alert: a, at: toDate(a.createdAt) });
    if (mode !== "created" && a.dueAt) {
      const at = toDate(a.dueAt);
      const kind = isDone(a) ? "done" : at.getTime() < now ? "overdue" : "due";
      push(at, { kind, alert: a, at });
    }
  }
  for (const list of byDay.values()) list.sort((x, y) => x.at - y.at);
  return byDay;
}

const KIND_LABEL = { created: "Reported", due: "Due", overdue: "Overdue", done: "Due (done)" };

function CalendarView({ store, onOpen }) {
  const now = useNow(60000, true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [mode, setMode] = useState("both");
  const [selected, setSelected] = useState(() => new Date());

  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const events = useMemo(() => buildEvents(store.alerts, mode, now), [store.alerts, mode, now]);
  const today = new Date(now);
  const agenda = events.get(dayKey(selected)) || [];

  const shift = (months) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(d);
  };

  const overdueCount = store.alerts.filter((a) => a.dueAt && !isDone(a) && toDate(a.dueAt).getTime() < now).length;

  return (
    <div className="calendar-wrap">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="btn btn-small" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <h2 className="cal-title">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button type="button" className="btn btn-small" onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
          <button type="button" className="btn btn-small" onClick={goToday}>
            Today
          </button>
        </div>
        <div className="activity-filter" role="group" aria-label="Show on calendar">
          {[
            ["both", "Reported + due"],
            ["due", "Due dates"],
            ["created", "Reported"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`seg-btn ${mode === key ? "seg-btn-active" : ""}`}
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="cal-legend" aria-label="Legend">
        <li>
          <span className="cal-swatch ev-created" /> Reported
        </li>
        <li>
          <span className="cal-swatch ev-due" /> Due
        </li>
        <li>
          <span className="cal-swatch ev-overdue" /> Overdue {overdueCount > 0 && <strong>({overdueCount})</strong>}
        </li>
        <li>
          <span className="cal-swatch ev-done" /> Done
        </li>
      </ul>

      <div className="cal-layout">
        <div className="cal-grid" role="grid" aria-label="Month" data-tour="calendar">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-weekday" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const list = events.get(dayKey(d)) || [];
            const outside = d.getMonth() !== cursor.getMonth();
            const isToday = sameDay(d, today);
            const isSelected = sameDay(d, selected);
            const hasOverdue = list.some((e) => e.kind === "overdue");
            return (
              <div
                key={dayKey(d)}
                role="gridcell"
                className={`cal-cell ${outside ? "cal-outside" : ""} ${isToday ? "cal-today" : ""} ${isSelected ? "cal-selected" : ""}`}
              >
                <button
                  type="button"
                  className="cal-day"
                  onClick={() => setSelected(d)}
                  aria-label={`${d.toDateString()}, ${list.length} events`}
                  aria-pressed={isSelected}
                >
                  <span className="cal-num">{d.getDate()}</span>
                  {list.length > 0 && (
                    <span className={`cal-dot ${hasOverdue ? "cal-dot-overdue" : ""}`} aria-hidden="true">
                      {list.length}
                    </span>
                  )}
                </button>
                <div className="cal-events">
                  {list.slice(0, MAX_CHIPS).map((e) => (
                    <button
                      key={`${e.kind}-${e.alert.id}`}
                      type="button"
                      className={`cal-chip ev-${e.kind}`}
                      onClick={() => onOpen(e.alert.id)}
                      title={`${KIND_LABEL[e.kind]} · INC-${e.alert.id} · ${e.alert.message}`}
                    >
                      <span className="cal-chip-key">INC-{e.alert.id}</span>
                      <span className="cal-chip-text">{e.alert.source}</span>
                    </button>
                  ))}
                  {list.length > MAX_CHIPS && (
                    <button type="button" className="cal-more" onClick={() => setSelected(d)}>
                      +{list.length - MAX_CHIPS} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="agenda" aria-label="Selected day">
          <h3 className="agenda-title">
            {selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          {agenda.length === 0 && <p className="field-muted">Nothing reported or due this day.</p>}
          <ol className="agenda-list">
            {agenda.map((e) => (
              <li key={`${e.kind}-${e.alert.id}`}>
                <button type="button" className={`agenda-item ev-border-${e.kind}`} onClick={() => onOpen(e.alert.id)}>
                  <span className="agenda-top">
                    <span className={`agenda-kind ev-text-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                    <span className="agenda-time">
                      {e.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="agenda-msg">{e.alert.message}</span>
                  <span className="agenda-meta">
                    <span className="kcard-key">INC-{e.alert.id}</span>
                    <PriorityIcon priority={e.alert.priority} />
                    <TicketStatus status={e.alert.ticketStatus} />
                    <span className="kcard-spacer" />
                    <Avatar name={e.alert.assignee} size={20} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

export default CalendarView;
