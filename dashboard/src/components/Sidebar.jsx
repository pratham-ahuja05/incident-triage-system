const NAV_ITEMS = [
  { key: "board", label: "Board", icon: "▤" },
  { key: "analytics", label: "Analytics", icon: "◫" },
  { key: "knowledge", label: "Knowledge Base", icon: "◈" },
];

function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot" />
        <span className="brand-name">Incident Triage</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar-item ${active === item.key ? "sidebar-item-active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;