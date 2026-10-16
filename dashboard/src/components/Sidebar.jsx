import { IconBoard, IconBook, IconChart, IconClose, IconMark } from "./Icons";
import { normalizeRole } from "../api";

const NAV_ITEMS = [
  { key: "board", label: "Board", icon: IconBoard },
  { key: "analytics", label: "Analytics", icon: IconChart },
  { key: "knowledge", label: "Knowledge Base", icon: IconBook },
];

function Sidebar({ active, onNavigate, session, onSignOut, open, onClose }) {
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
