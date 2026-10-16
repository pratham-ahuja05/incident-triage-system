import { useCallback, useEffect, useState } from "react";
import {
  fetchAlerts,
  fetchUsers,
  resolveIncident,
  retryAlert,
  reviewDecision,
  submitAlert,
  updateIncident,
  markDuplicate,
  runInvestigation,
} from "../api";
import { useEventStream, usePolling } from "./hooks";
import { useToast } from "./toast";

// One live copy of all incidents, shared by the list, Kanban and Calendar views.
export function useIncidentStore() {
  const notify = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [users, setUsers] = useState([]);

  const refresh = useCallback(
    () =>
      fetchAlerts()
        .then((data) => {
          setAlerts(data);
          setError(null);
          setLastUpdated(Date.now());
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  const live = useEventStream("/api/alerts/stream", "update", refresh);
  // With a live stream, poll only as a slow safety net.
  usePolling(refresh, live ? 60000 : 8000);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const run = useCallback(
    (promise, success) =>
      promise
        .then((result) => {
          if (success) notify(success);
          return refresh().then(() => result);
        })
        .catch((err) => {
          notify(err.message, "danger");
          throw err;
        }),
    [notify, refresh]
  );

  const review = (triageResultId, decision) =>
    run(reviewDecision(triageResultId, decision), decision === "APPROVED" ? "Fix approved — incident resolved" : "Fix rejected — back to the team");

  const resolve = (triageResultId, note) =>
    run(resolveIncident(triageResultId, note), "Resolution saved and added to the knowledge base");

  const retry = (alertId) => run(retryAlert(alertId), `INC-${alertId} re-queued for triage`).catch(() => {});

  const submit = ({ source, message }) => submitAlert({ source, message }).then((saved) => refresh().then(() => saved));

  // Optimistic: the card moves / the field changes immediately, the server confirms.
  const update = (alertId, patch, success) => {
    const local = { ...patch };
    if (Array.isArray(local.labels)) local.labels = local.labels.join(",") || null;
    setAlerts((list) => list.map((a) => (a.id === alertId ? { ...a, ...local } : a)));
    return run(updateIncident(alertId, patch), success).catch((err) => {
      refresh();
      throw err;
    });
  };

  // Same PATCH applied to many incidents; one refresh and one summary toast.
  const bulkUpdate = async (ids, patch, label) => {
    setAlerts((list) => list.map((a) => (ids.includes(a.id) ? { ...a, ...patch } : a)));
    const results = await Promise.allSettled(ids.map((id) => updateIncident(id, patch)));
    const failed = results.filter((r) => r.status === "rejected");
    await refresh();
    if (failed.length === 0) notify(`${label} — ${ids.length} incident${ids.length === 1 ? "" : "s"}`);
    else notify(`${ids.length - failed.length} updated, ${failed.length} failed: ${failed[0].reason.message}`, "danger");
  };

  const investigate = (alertId) => run(runInvestigation(alertId), "AI investigation ready");

  const closeAsDuplicate = (alertId, originalId) =>
    run(markDuplicate(alertId, originalId), `INC-${alertId} closed as a duplicate of INC-${originalId}`);

  return {
    alerts,
    loading,
    error,
    lastUpdated,
    live,
    users,
    refresh,
    review,
    resolve,
    retry,
    submit,
    update,
    bulkUpdate,
    investigate,
    closeAsDuplicate,
  };
}
