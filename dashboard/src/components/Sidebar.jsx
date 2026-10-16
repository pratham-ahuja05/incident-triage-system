import {
  IconBoard,
  IconBook,
  IconCalendar,
  IconChart,
  IconClose,
  IconHelp,
  IconKanban,
  IconMark,
  IconPlus,
  IconSearch,
} from "./Icons";
import { normalizeRole } from "../api";

const NAV_ITEMS = [
  { key: "board", label: "Triage queue", icon: IconBoard },
  { key: "kanban", label: "Kanban board", icon: IconKanban },
  { key: "calendar", label: "Calendar", icon: IconCalendar },
  { key: "analytics", label: "Analytics", icon: IconChart },
  { key: "knowledge", label: "Knowledge Base", icon: IconBook },
];

const SERVICES = [
  { key: "api", label: "API server" },
  { key: "ai", label: "AI service" },
];

const HEALTH_TEXT = { up: "online", down: "offline", unknown: "checking…" };

function Sidebar({
  active,
  onNavigate,
  session,
  onSignOut,
  open,
  onClose,
  theme,
  onToggleTheme,
  health = {},
  onHelp,
  canWrite,
  onReport,
  onSearch,
}) {
  const role = session?.roles?.map(normalizeRole).join(", ").toLowerCase() || "viewer";

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Primary">
        <div className="sidebar-brand">
          <div className="sidebar-brand-main">
            <span className="brand-mark">
              <IconMark />
            </span>
            <span className="brand-copy">
              <span className="brand-name">Incident Triage</span>
              <span className="brand-sub">Ops console</span>
            </span>
          </div>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <IconClose />
          </button>
        </div>

        <div className="sidebar-actions">
          {canWrite && (
            <button type="button" className="btn btn-primary btn-icon sidebar-create" onClick={onReport}>
              <IconPlus size={14} />
              Report incident
            </button>
          )}
          <button type="button" className="sidebar-search" onClick={onSearch} data-tour="search">
            <IconSearch size={14} />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`sidebar-item ${active === item.key ? "sidebar-item-active" : ""}`}
                onClick={() => onNavigate(item.key)}
                aria-current={active === item.key ? "page" : undefined}
                data-tour={`nav-${item.key}`}
              >
                <span className="sidebar-icon">
                  <Icon />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-item sidebar-help" onClick={onHelp}>
            <span className="sidebar-icon">
              <IconHelp />
            </span>
            How it works
          </button>
          <ul className="service-health" aria-label="Service status" data-tour="health">
            {SERVICES.map((svc) => {
              const state = health[svc.key] || "unknown";
              return (
                <li key={svc.key} className="service-row">
                  <span className={`health-dot health-${state}`} aria-hidden="true" />
                  <span>{svc.label}</span>
                  <span className={`service-state service-${state}`}>{HEALTH_TEXT[state]}</span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
            {theme === "light" ? "☾ Dark theme" : "☀ Light theme"}
          </button>
          <div className="sidebar-user">
            <span className="sidebar-user-name">{session?.username || "Signed in"}</span>
            <span className="sidebar-user-role">{role}</span>
          </div>
          <button type="button" className="sidebar-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
