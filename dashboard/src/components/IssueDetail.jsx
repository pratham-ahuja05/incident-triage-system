import { useEffect, useState } from "react";
import { IconBack, IconReplay } from "./Icons";
import StatusTag from "./StatusTag";
import PipelineStepper from "./PipelineStepper";
import IssueFields from "./IssueFields";
import ActivityPanel from "./ActivityPanel";
import StageInspector from "./StageInspector";
import InvestigationPanel from "./InvestigationPanel";
import { fetchActivity } from "../api";
import { PriorityIcon, TicketStatus } from "./TicketBits";
import { MATCH_HELP, fullTime, humanize, matchQuality, relativeTime, severityTone } from "../lib/format";
import {
  MAX_RETRIES,
  deriveStages,
  formatElapsed,
  isInFlight,
  reachedCount,
  useNow,
  useStagedReveal,
} from "../lib/pipeline";

const AUTO_FIX_SIMILARITY = 60; // 1 - DISTANCE_THRESHOLD (0.4) in agent.py

function SimilarityGauge({ distance }) {
  const quality = matchQuality(distance);
  if (!quality) return null;
  return (
    <div className="gauge" title={MATCH_HELP}>
      <div className="gauge-head">
        <span className="gauge-value">{quality.similarity}%</span>
        <span className="gauge-caption">similar to a past incident</span>
        <StatusTag label={quality.label} tone={quality.tone} />
      </div>
      <div
        className="gauge-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quality.similarity}
        aria-label="Match similarity"
      >
        <span className="gauge-zone" style={{ left: `${AUTO_FIX_SIMILARITY}%` }} />
        <span className={`gauge-fill gauge-${quality.tone}`} style={{ width: `${quality.similarity}%` }} />
        <span className="gauge-threshold" style={{ left: `${AUTO_FIX_SIMILARITY}%` }} />
      </div>
      <div className="gauge-scale">
        <span>0%</span>
        <span style={{ left: `${AUTO_FIX_SIMILARITY}%` }} className="gauge-scale-mark">
          fix-suggestion zone ≥ {AUTO_FIX_SIMILARITY}%
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

const PROVENANCE = {
  observed: { label: "Observed", title: "Measured or stored data, not an AI opinion" },
  ai: { label: "AI-generated", title: "Produced by a model — verify before acting" },
  human: { label: "Human", title: "Decisions and records made by people" },
};

function StageCard({ index, title, tone, kind, children }) {
  const prov = PROVENANCE[kind];
  return (
    <section className={`stage-card ${tone ? `stage-card-${tone}` : ""}`} style={{ "--stagger": index }}>
      <header className="stage-card-head">
        <span className="stage-num">{index}</span>
        <h3 className="stage-title">{title}</h3>
        {prov && (
          <span className={`prov prov-${kind}`} title={prov.title}>
            {prov.label}
          </span>
        )}
      </header>
      <div className="stage-body">{children}</div>
    </section>
  );
}

function LiveCard({ alert, elapsed }) {
  const queued = alert.status === "PENDING";
  return (
    <section className="live-card" aria-live="polite">
      <div className="live-scan" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className="live-title">
          {queued
            ? alert.retryCount > 0
              ? `Retrying (${alert.retryCount}/${MAX_RETRIES}) — waiting for the AI service`
              : "Waiting in the queue for a triage worker"
            : "Searching past incidents and asking the AI to verify the match"}
        </p>
        <p className="live-sub">
          Running for <strong>{formatElapsed(elapsed)}</strong> · this page updates by itself, no need to refresh.
        </p>
      </div>
    </section>
  );
}

function IssueDetail({
  alert,
  missingId,
  onReview,
  onResolve,
  onRetry,
  onBack,
  canWrite,
  users = [],
  me,
  onUpdate,
  refreshKey,
  onInvestigate,
  onCloseDuplicate,
}) {
  const [note, setNote] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("triage");
  const [inspect, setInspect] = useState(null);
  const [activity, setActivity] = useState({ events: null, error: null });

  // One activity fetch feeds both the stage inspector (timestamps) and the Activity tab.
  const alertId = alert?.id;
  useEffect(() => {
    if (!alertId) return undefined;
    let cancelled = false;
    fetchActivity(alertId)
      .then((events) => !cancelled && setActivity({ events, error: null }))
      .catch((err) => !cancelled && setActivity((a) => ({ events: a.events || [], error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [alertId, refreshKey]);

  const stages = alert ? deriveStages(alert) : [];
  const [visible, replay, replaying] = useStagedReveal(reachedCount(stages));
  const inFlight = isInFlight(alert);
  const now = useNow(1000, inFlight);

  const pendingReview =
    alert?.decision === "auto_suggest_fix" &&
    alert.humanReviewStatus === "PENDING_REVIEW" &&
    !["RESOLVED", "CLOSED"].includes(alert.ticketStatus) &&
    canWrite;

  const review = (decision) => {
    setBusy(decision);
    Promise.resolve(onReview(alert.triageResultId, decision))
      .then(() => setConfirmReject(false))
      .catch(() => {})
      .finally(() => setBusy(null));
  };

  useEffect(() => {
    if (!pendingReview) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, dialog")) return;
      if (busy) return;
      if (e.key === "a") review("APPROVED");
      if (e.key === "r") setConfirmReject(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!alert) {
    return (
      <div className="detail-empty">
        {missingId ? (
          <>
            <p className="detail-empty-title">INC-{missingId} not found</p>
            <p>It may have been deleted, or the link is wrong.</p>
            {onBack && (
              <button type="button" className="btn btn-small" onClick={onBack}>
                Back to list
              </button>
            )}
          </>
        ) : (
          <>
            <PipelineStepper
              stages={deriveStages({ status: "PENDING", retryCount: 0 }).map((s) => ({ ...s, state: "pending" }))}
              visible={0}
              compact
            />
            <p className="detail-empty-title">Select an incident to watch its triage</p>
            <p>Every alert travels through this pipeline. Open one to see each step, the evidence, and the decision.</p>
          </>
        )}
      </div>
    );
  }

  const isAutoFix = alert.decision === "auto_suggest_fix";
  const isEscalated = alert.decision === "escalate";
  const isFailed = alert.status === "FAILED" && !alert.decision;
  const show = (stageIndex) => visible > stageIndex;
  const caption = replaying && visible > 0 ? stages[visible - 1] : stages.find((s) => s.state === "active");

  const submitResolve = () => {
    if (!note.trim()) return;
    setBusy("resolve");
    Promise.resolve(onResolve(alert.triageResultId, note))
      .then(() => {
        setNote("");
        setShowResolveForm(false);
      })
      .catch(() => {})
      .finally(() => setBusy(null));
  };

  return (
    <div className="detail">
      {onBack && (
        <button type="button" className="detail-back btn" onClick={onBack}>
          <IconBack />
          Back to list
        </button>
      )}

      <div className="detail-top">
        <div className="detail-key-row">
          <span className="detail-key-group">
            <span className="detail-key">INC-{alert.id}</span>
            <TicketStatus status={alert.ticketStatus} />
            <PriorityIcon priority={alert.priority} withLabel />
          </span>
          <span className="detail-tags">
            {inFlight && (
              <span className="live-chip">
                <span className="live-chip-dot" aria-hidden="true" />
                Live · {formatElapsed(now - new Date(alert.createdAt).getTime())}
              </span>
            )}
            {alert.severity && <StatusTag label={humanize(alert.severity)} tone={severityTone(alert.severity)} />}
            {alert.category && <StatusTag label={humanize(alert.category)} tone="neutral" />}
            {canWrite && onUpdate && alert.ticketStatus === "OPEN" && !alert.assignee && (
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() =>
                  onUpdate(alert.id, { assignee: me }, `Acknowledged — you own INC-${alert.id}`).catch(() => {})
                }
                title="Assign to yourself and move to In progress"
              >
                Acknowledge
              </button>
            )}
            <button
              type="button"
              className="btn btn-small btn-icon"
              onClick={replay}
              disabled={replaying}
              title="Replay the triage step by step"
              data-tour="replay"
            >
              <IconReplay size={13} />
              {replaying ? "Replaying…" : "Replay"}
            </button>
          </span>
        </div>
        <h2 className="detail-title">{alert.message}</h2>
        <span className="detail-source">
          reported by {alert.source} ·{" "}
          <time dateTime={alert.createdAt} title={fullTime(alert.createdAt)}>
            {relativeTime(alert.createdAt)}
          </time>
        </span>
      </div>

      {onUpdate && (
        <details className="fields-box" open>
          <summary>Details</summary>
          <IssueFields alert={alert} users={users} me={me} canWrite={canWrite} onUpdate={onUpdate} />
        </details>
      )}

      <div className="tabs" role="tablist" aria-label="Incident sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "triage"}
          className={`tab ${tab === "triage" ? "tab-active" : ""}`}
          onClick={() => setTab("triage")}
        >
          Triage
        </button>
        {onInvestigate && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "investigation"}
            className={`tab ${tab === "investigation" ? "tab-active" : ""}`}
            onClick={() => setTab("investigation")}
          >
            Investigation
            {alert.investigation && <span className="tab-dot" aria-label="(available)" />}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          className={`tab ${tab === "activity" ? "tab-active" : ""}`}
          onClick={() => setTab("activity")}
        >
          Activity
          {alert.commentCount > 0 && <span className="tab-count">{alert.commentCount}</span>}
        </button>
      </div>

      {tab === "activity" && (
        <ActivityPanel
          alertId={alert.id}
          events={activity.events}
          error={activity.error}
          onAdded={(e) => setActivity((a) => ({ ...a, events: [...(a.events || []), e] }))}
        />
      )}

      {tab === "investigation" && onInvestigate && (
        <InvestigationPanel
          alert={alert}
          canWrite={canWrite}
          onInvestigate={onInvestigate}
          onCloseDuplicate={onCloseDuplicate}
        />
      )}

      {tab === "triage" && (
        <>
          <div className="pipeline-wrap" data-tour="pipeline">
            <PipelineStepper
              stages={stages}
              visible={visible}
              selectedKey={inspect}
              onSelect={(key) => setInspect(inspect === key ? null : key)}
            />
            {inspect ? (
              <StageInspector
                stage={stages.find((s) => s.key === inspect)}
                alert={alert}
                events={activity.events || []}
                eventsError={activity.error}
                onClose={() => setInspect(null)}
              />
            ) : (
              <p className="pipeline-hint">Select any stage to see its timing, inputs and outputs.</p>
            )}
            {!inspect && caption && (
              <p className={`pipeline-caption ${replaying ? "pipeline-caption-replay" : ""}`} key={caption.key}>
                <strong>{caption.label}:</strong> {caption.hint}
              </p>
            )}
          </div>

          {inFlight && <LiveCard alert={alert} elapsed={now - new Date(alert.createdAt).getTime()} />}

          <div className="stage-cards">
            {show(2) && !inFlight && (
              <StageCard index={1} title="Retrieval — closest past incident" kind="observed">
                {alert.matchedLog ? (
                  <>
                    <p className="evidence-log">{alert.matchedLog}</p>
                    <SimilarityGauge distance={alert.confidenceDistance} />
                  </>
                ) : isFailed ? (
                  <p className="tl-text tl-muted">Not completed — the AI service could not be reached.</p>
                ) : (
                  <p className="tl-text tl-muted">
                    Nothing in the knowledge base was close enough to compare. New kinds of problems always go to a
                    human.
                  </p>
                )}
              </StageCard>
            )}

            {show(3) && alert.reasoning && (
              <StageCard index={2} title="AI check — why" kind="ai">
                <p className="tl-text tl-mono">{alert.reasoning}</p>
              </StageCard>
            )}

            {show(4) && (isAutoFix || isEscalated || isFailed) && (
              <StageCard
                index={3}
                title={
                  isAutoFix
                    ? "Decision — known fix suggested"
                    : isEscalated
                      ? "Decision — escalated to an engineer"
                      : "Decision — processing failed"
                }
                tone={isAutoFix ? "success" : isEscalated ? "warning" : "danger"}
                kind={isFailed ? "observed" : "ai"}
              >
                {isAutoFix && (
                  <>
                    <p className="tl-text">{alert.suggestedResolution}</p>
                    <p className="not-applied">
                      Not applied. This is the fix recorded for the matching past incident — nothing in your systems has
                      changed. A person must review it, and the incident stays open until they do.
                    </p>
                  </>
                )}
                {isEscalated && (
                  <p className="tl-text">
                    No trusted fix was found, so this needs an engineer. On-call is notified in Slack when a webhook is
                    configured.
                  </p>
                )}
                {isFailed && (
                  <>
                    <p className="tl-text">
                      The triage worker tried {MAX_RETRIES + 1} times with increasing delays and then dead-lettered the
                      alert. The most common cause is the AI service being offline.
                    </p>
                    {canWrite ? (
                      <div className="detail-actions">
                        <button type="button" className="btn btn-primary" onClick={() => onRetry(alert.id)}>
                          Retry triage
                        </button>
                      </div>
                    ) : (
                      <p className="tl-text tl-muted">An Analyst or Manager can retry it.</p>
                    )}
                  </>
                )}
              </StageCard>
            )}

            {show(5) && isAutoFix && (
              <StageCard index={4} title="Human loop — review the suggestion" kind="human">
                <p className="tl-text">
                  Status: <strong>{humanize(alert.humanReviewStatus)}</strong>
                </p>
                {pendingReview &&
                  (confirmReject ? (
                    <div className="confirm-box" role="group" aria-label="Confirm rejection">
                      <p className="tl-text">Reject this fix? It will not be added to the knowledge base.</p>
                      <div className="detail-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setConfirmReject(false)}
                          disabled={Boolean(busy)}
                        >
                          Keep reviewing
                        </button>
                        <button
                          type="button"
                          className="btn btn-reject"
                          onClick={() => review("REJECTED")}
                          disabled={Boolean(busy)}
                        >
                          {busy === "REJECTED" ? "Rejecting…" : "Yes, reject"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="detail-actions" data-tour="review-actions">
                      <button
                        type="button"
                        className="btn btn-approve"
                        onClick={() => review("APPROVED")}
                        disabled={Boolean(busy)}
                      >
                        {busy === "APPROVED" ? "Approving…" : "Approve fix"} <kbd>a</kbd>
                      </button>
                      <button
                        type="button"
                        className="btn btn-reject"
                        onClick={() => setConfirmReject(true)}
                        disabled={Boolean(busy)}
                      >
                        Reject <kbd>r</kbd>
                      </button>
                    </div>
                  ))}
                {alert.humanReviewStatus === "PENDING_REVIEW" &&
                  ["RESOLVED", "CLOSED"].includes(alert.ticketStatus) && (
                    <p className="tl-text tl-muted">
                      The ticket was{" "}
                      {alert.duplicateOfId ? `closed as a duplicate of INC-${alert.duplicateOfId}` : "closed"} without
                      reviewing this suggestion, so it was not added to the knowledge base.
                    </p>
                  )}
                {alert.humanReviewStatus === "PENDING_REVIEW" &&
                  !canWrite &&
                  !["RESOLVED", "CLOSED"].includes(alert.ticketStatus) && (
                    <p className="tl-text tl-muted">Waiting on an Analyst or Manager to review this suggestion.</p>
                  )}
                {alert.humanReviewStatus === "APPROVED" && (
                  <p className="tl-text tl-muted">
                    Approved by a person — the incident was marked resolved and this fix strengthens future matches.
                  </p>
                )}
                {alert.humanReviewStatus === "REJECTED" && (
                  <p className="tl-text tl-muted">Rejected — the suggestion did not apply; the team is working it.</p>
                )}
              </StageCard>
            )}

            {show(5) && isEscalated && (
              <StageCard
                index={4}
                title="Human loop — record the real fix"
                tone={alert.humanReviewStatus === "RESOLVED" ? "success" : undefined}
                kind="human"
              >
                {alert.humanReviewStatus === "RESOLVED" ? (
                  <>
                    <p className="tl-text tl-muted">Resolved — the system learned this fix for next time.</p>
                    <p className="evidence-log">{alert.humanResolutionNote}</p>
                  </>
                ) : canWrite ? (
                  showResolveForm ? (
                    <div className="resolve-form">
                      <label className="field">
                        <span>How was this actually fixed?</span>
                        <textarea
                          className="resolve-textarea"
                          placeholder="This teaches the system for next time."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                      </label>
                      <div className="detail-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setShowResolveForm(false)}
                          disabled={Boolean(busy)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={submitResolve}
                          disabled={Boolean(busy) || !note.trim()}
                        >
                          {busy === "resolve" ? "Saving…" : "Save & teach system"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="tl-text tl-muted">
                        Once an engineer fixes it, write down what worked. The next similar alert will then get this fix
                        suggested.
                      </p>
                      <div className="detail-actions">
                        <button type="button" className="btn btn-primary" onClick={() => setShowResolveForm(true)}>
                          Mark as resolved
                        </button>
                      </div>
                    </>
                  )
                ) : (
                  <p className="tl-text tl-muted">Waiting on an Analyst or Manager to record a resolution.</p>
                )}
              </StageCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default IssueDetail;
