import { Suspense, lazy, useState, useEffect, useMemo, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import BoardView from "./components/BoardView";
import NewIssueModal from "./components/NewIssueModal";
import AuthScreen from "./components/AuthScreen";
import PageHeader from "./components/PageHeader";
import Tour from "./components/Tour";
import Welcome from "./components/Welcome";
import ErrorBoundary from "./components/ErrorBoundary";
import IssueDrawer from "./components/IssueDrawer";
import CommandPalette from "./components/CommandPalette";
import { ToastProvider } from "./components/Toast";
import { useToast } from "./lib/toast";
import { canWrite, clearSession, loadSession, saveSession } from "./api";
import { useHashRoute, useServiceHealth, useTheme } from "./lib/hooks";
import { useIncidentStore } from "./lib/store";
import { DEMO_INCIDENT, TOUR_STEPS, hasOnboarded, markOnboarded } from "./lib/onboarding";
import "./App.css";

// Secondary views load on demand to keep the first paint small.
const KanbanView = lazy(() => import("./components/KanbanView"));
const CalendarView = lazy(() => import("./components/CalendarView"));
const AnalyticsView = lazy(() => import("./components/AnalyticsView"));
const KnowledgeBaseView = lazy(() => import("./components/KnowledgeBaseView"));

function isTypingTarget(el) {
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable='true'], dialog"));
}

function Console({ session, onSignOut, theme, onToggleTheme }) {
  const notify = useToast();
  const [route, navigate] = useHashRoute();
  const [navOpen, setNavOpen] = useState(false);
  const health = useServiceHealth();
  const store = useIncidentStore();
  const writeAccess = canWrite(session);
  const me = session.username;
  const [onboarding, setOnboarding] = useState(() => (hasOnboarded(me) ? null : "welcome"));
  const [reporting, setReporting] = useState(false);
  const [palette, setPalette] = useState(false);

  const openNav = () => setNavOpen(true);
  // Incidents open in place: the list's detail pane on the board, a side drawer everywhere else.
  const openIncident = useCallback(
    (id) => navigate(["kanban", "calendar"].includes(route.view) ? route.view : "board", id),
    [navigate, route.view]
  );
  const selectOnBoard = useCallback((id) => navigate("board", id), [navigate]);
  const closeDrawer = useCallback(() => navigate(route.view), [navigate, route.view]);

  const finishWelcome = () => {
    markOnboarded(me);
    setOnboarding(null);
  };
  const startTour = () => {
    markOnboarded(me);
    setOnboarding(null);
    setNavOpen(false);
    navigate("board");
    // Let the board render before measuring tour targets.
    setTimeout(() => setOnboarding("tour"), 350);
  };

  const report = ({ source, message }) =>
    store.submit({ source, message }).then((saved) => {
      if (saved?.id) openIncident(saved.id);
      notify("Reported — watch it move through the pipeline");
    });

  const startDemo = () => {
    finishWelcome();
    store
      .submit(DEMO_INCIDENT)
      .then((saved) => {
        if (saved?.id) navigate("board", saved.id);
        notify("Demo incident created — watch each step light up");
      })
      .catch((err) => notify(err.message, "danger"));
  };

  // Global shortcuts: Ctrl/Cmd+K quick search, n = new incident
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "n" && writeAccess && !onboarding) {
        e.preventDefault();
        setReporting(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [writeAccess, onboarding]);

  const sources = useMemo(() => [...new Set(store.alerts.map((a) => a.source))].sort(), [store.alerts]);

  const paletteActions = useMemo(
    () => [
      { key: "go-board", group: "Go to", label: "Triage queue", run: () => navigate("board") },
      { key: "go-kanban", group: "Go to", label: "Kanban board", run: () => navigate("kanban") },
      { key: "go-calendar", group: "Go to", label: "Calendar", run: () => navigate("calendar") },
      { key: "go-analytics", group: "Go to", label: "Analytics", run: () => navigate("analytics") },
      { key: "go-kb", group: "Go to", label: "Knowledge base", run: () => navigate("knowledge") },
      ...(writeAccess
        ? [{ key: "new", group: "Create", label: "Report an incident", hint: "n", run: () => setReporting(true) }]
        : []),
      { key: "help", group: "Help", label: "How it works", run: () => setOnboarding("welcome") },
      { key: "theme", group: "Settings", label: `Switch to ${theme === "light" ? "dark" : "light"} theme`, run: onToggleTheme },
    ],
    [navigate, writeAccess, theme, onToggleTheme]
  );

  const drawerOpen = ["kanban", "calendar"].includes(route.view) && route.id;
  const drawerAlert = drawerOpen ? store.alerts.find((a) => a.id === route.id) || null : null;
  const detailProps = {
    onReview: store.review,
    onResolve: store.resolve,
    onRetry: store.retry,
    onUpdate: store.update,
    onInvestigate: store.investigate,
    onCloseDuplicate: store.closeAsDuplicate,
    users: store.users,
    me,
    refreshKey: store.lastUpdated,
    canWrite: writeAccess,
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={route.view}
        onNavigate={(view) => {
          navigate(view);
          setNavOpen(false);
        }}
        session={session}
        onSignOut={onSignOut}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        health={health}
        canWrite={writeAccess}
        onReport={() => {
          setNavOpen(false);
          setReporting(true);
        }}
        onSearch={() => {
          setNavOpen(false);
          setPalette(true);
        }}
        onHelp={() => {
          setNavOpen(false);
          setOnboarding("welcome");
        }}
      />
      <main className="main">
        <ErrorBoundary key={route.view}>
          <Suspense fallback={<p className="empty-state">Loading…</p>}>
            {route.view === "board" && (
              <BoardView
                store={store}
                live={store.live}
                writeAccess={writeAccess}
                me={me}
                onOpenNav={openNav}
                selectedId={route.id}
                onSelect={selectOnBoard}
                onReport={() => setReporting(true)}
                onDemo={startDemo}
                onStartTour={startTour}
              />
            )}
            {route.view === "kanban" && (
              <>
                <PageHeader
                  title="Kanban board"
                  subtitle="Drag incidents through the workflow. Highest priority first in each column."
                  onOpenNav={openNav}
                />
                <KanbanView store={store} me={me} canWrite={writeAccess} selectedId={route.id} onOpen={openIncident} />
              </>
            )}
            {route.view === "calendar" && (
              <>
                <PageHeader
                  title="Calendar"
                  subtitle="When incidents were reported and when their SLA is due."
                  onOpenNav={openNav}
                />
                <CalendarView store={store} onOpen={openIncident} />
              </>
            )}
            {route.view === "analytics" && (
              <>
                <PageHeader title="Analytics" subtitle="Volume, outcomes, SLA and review health." onOpenNav={openNav} />
                <AnalyticsView />
              </>
            )}
            {route.view === "knowledge" && (
              <>
                <PageHeader
                  title="Knowledge Base"
                  subtitle="Semantic search over past resolved incidents."
                  onOpenNav={openNav}
                />
                <KnowledgeBaseView aiStatus={health.ai} />
              </>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {drawerOpen && (
        <IssueDrawer
          alert={drawerAlert}
          missingId={!store.loading && !drawerAlert ? route.id : null}
          onClose={closeDrawer}
          {...detailProps}
        />
      )}
      {reporting && <NewIssueModal onClose={() => setReporting(false)} onSubmit={report} sources={sources} />}
      {palette && (
        <CommandPalette
          alerts={store.alerts}
          actions={paletteActions}
          onOpenIncident={openIncident}
          onClose={() => setPalette(false)}
        />
      )}
      {onboarding === "welcome" && (
        <Welcome session={session} canWrite={writeAccess} onTour={startTour} onDemo={startDemo} onClose={finishWelcome} />
      )}
      {onboarding === "tour" && <Tour steps={TOUR_STEPS} onClose={() => setOnboarding(null)} />}
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => loadSession());
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const onUnauthorized = () => setSession(null);
    window.addEventListener("triage:unauthorized", onUnauthorized);
    return () => window.removeEventListener("triage:unauthorized", onUnauthorized);
  }, []);

  const authenticate = (payload) => {
    saveSession(payload);
    setSession(payload);
  };

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  return (
    <ToastProvider>
      {session?.token ? (
        <Console session={session} onSignOut={signOut} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <AuthScreen onAuthenticated={authenticate} />
      )}
    </ToastProvider>
  );
}

export default App;
