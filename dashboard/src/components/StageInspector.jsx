import { fullTime } from "../lib/format";
import { matchQuality } from "../lib/format";

// Everything shown here comes from stored data: incident fields, the triage result (incl. timings the
// AI service measured) and the activity log. Missing data is labelled as missing, never estimated.

const at = (events, type) => events.filter((e) => e.type === type);
const time = (iso) => (iso ? new Date(iso).getTime() : null);

function duration(ms) {
  if (ms == null) return null;
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Row({ label, children, muted }) {
  return (
    <div className="insp-row">
      <dt>{label}</dt>
      <dd className={muted ? "field-muted" : undefined}>{children}</dd>
    </div>
  );
}

const NOT_RECORDED = "Not recorded — this incident was processed before stage timing was added.";

function EventList({ events }) {
  if (events.length === 0) return null;
  return (
    <ol className="insp-events">
      {events.map((e) => (
        <li key={e.id}>
          <time dateTime={e.createdAt}>{fullTime(e.createdAt)}</time>
          <span>
            <strong>{e.actor === "system" ? "Triage worker" : e.actor}</strong> · {e.message}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageInspector({ stage, alert, events, eventsError, onClose }) {
  const pickups = at(events, "PROCESSING");
  const triaged = at(events, "TRIAGED")[0];
  const firstPickup = pickups[0];
  const lastPickup = pickups[pickups.length - 1];
  const created = time(alert.createdAt);
  const hasTelemetry = alert.retrievalMs != null;
  let body;

  switch (stage.key) {
    case "received":
      body = (
        <dl>
          <Row label="When">{fullTime(alert.createdAt)}</Row>
          <Row label="From">
            {alert.source}
            {alert.reporter ? ` · reported by ${alert.reporter}` : " · via monitoring/API"}
          </Row>
          <Row label="Input">
            <code className="insp-code">{alert.message}</code>
          </Row>
        </dl>
      );
      break;
    case "queued":
      body = (
        <dl>
          <Row label="Wait in queue" muted={!firstPickup}>
            {firstPickup ? duration(time(firstPickup.createdAt) - created) : "No pickup recorded"}
          </Row>
          <Row label="Attempts">
            {pickups.length > 0
              ? pickups.length
              : alert.retryCount > 0
                ? `${alert.retryCount + 1} (from retry count)`
                : "—"}
          </Row>
          <EventList
            events={events.filter((e) => ["PROCESSING", "ATTEMPT_FAILED", "FAILED", "RETRY"].includes(e.type))}
          />
        </dl>
      );
      break;
    case "retrieval": {
      const q = matchQuality(alert.confidenceDistance);
      body = (
        <dl>
          <Row label="Method">
            Message embedded (all-MiniLM-L6-v2) and compared by cosine distance to the knowledge base
          </Row>
          <Row label="Duration" muted={!hasTelemetry}>
            {hasTelemetry ? duration(alert.retrievalMs) : NOT_RECORDED}
          </Row>
          <Row label="Output" muted={!alert.matchedLog}>
            {alert.matchedLog ? (
              <>
                Closest past incident #{alert.matchedIncidentId} ·{" "}
                {q ? `${q.similarity}% similar (distance ${q.distance.toFixed(3)})` : ""}
                <code className="insp-code">{alert.matchedLog}</code>
              </>
            ) : alert.decision ? (
              "No past incident returned"
            ) : (
              "Not run yet"
            )}
          </Row>
        </dl>
      );
      break;
    }
    case "reasoning": {
      const skipped = alert.decision && hasTelemetry && alert.aiCheckMs == null;
      body = (
        <dl>
          <Row label="Method">
            An LLM is asked whether the new alert and the closest past incident are the same problem
          </Row>
          <Row label="Duration" muted={!alert.aiCheckMs}>
            {alert.aiCheckMs != null
              ? duration(alert.aiCheckMs)
              : skipped
                ? "Not run — the closest match was below the similarity threshold, so there was nothing to verify."
                : alert.decision
                  ? NOT_RECORDED
                  : "Not run yet"}
          </Row>
          {alert.reasoning && (
            <Row label="Output">
              <span className="insp-ai">AI-generated</span> {alert.reasoning}
            </Row>
          )}
        </dl>
      );
      break;
    }
    case "decision":
      body = (
        <dl>
          <Row label="Decided at" muted={!triaged}>
            {triaged ? fullTime(triaged.createdAt) : alert.decision ? "Not recorded" : "Not decided yet"}
          </Row>
          <Row label="Processing time" muted={!(triaged && lastPickup)}>
            {triaged && lastPickup ? duration(time(triaged.createdAt) - time(lastPickup.createdAt)) : "Not recorded"}
          </Row>
          {alert.classifyMs != null && (
            <Row label="Classification">
              {duration(alert.classifyMs)} · severity {alert.severity}, category {alert.category}
            </Row>
          )}
          <Row label="Outcome">
            {alert.decision === "auto_suggest_fix"
              ? "Known fix suggested — not applied; needs human approval"
              : alert.decision === "escalate"
                ? "Escalated to an engineer"
                : alert.status === "FAILED"
                  ? "Dead-lettered after repeated failures"
                  : "Pending"}
          </Row>
          {triaged && <Row label="Log">{triaged.message}</Row>}
          {alert.status === "FAILED" && (
            <EventList events={events.filter((e) => e.type === "FAILED" || e.type === "ATTEMPT_FAILED")} />
          )}
        </dl>
      );
      break;
    default: {
      const human = events.filter(
        (e) => ["REVIEW", "RESOLVED", "STATUS", "ASSIGNEE", "DUPLICATE"].includes(e.type) && e.actor !== "system",
      );
      body = (
        <dl>
          <Row label="Owner" muted={!alert.assignee}>
            {alert.assignee || "Unassigned"}
          </Row>
          <Row label="Review" muted={!alert.humanReviewStatus}>
            {alert.humanReviewStatus ? alert.humanReviewStatus.replaceAll("_", " ").toLowerCase() : "—"}
          </Row>
          {human.length === 0 ? (
            <Row label="History" muted>
              No human actions yet
            </Row>
          ) : (
            <EventList events={human} />
          )}
        </dl>
      );
    }
  }

  return (
    <section className="inspector" aria-label={`${stage.label} details`}>
      <header className="insp-head">
        <h3>
          {stage.label} <span className={`insp-state insp-${stage.state}`}>{stage.state}</span>
        </h3>
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="insp-hint">{stage.hint}</p>
      {eventsError && <p className="form-error">Activity log unavailable: {eventsError}</p>}
      {body}
    </section>
  );
}

export default StageInspector;
