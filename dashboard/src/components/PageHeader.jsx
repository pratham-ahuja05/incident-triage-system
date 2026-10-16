import { IconMenu } from "./Icons";

function PageHeader({ title, subtitle, onOpenNav, meta, actions }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="menu-toggle" onClick={onOpenNav} aria-label="Open navigation">
          <IconMenu />
        </button>
        <div>
          <h1 className="view-title">{title}</h1>
          {subtitle && <p className="view-sub">{subtitle}</p>}
          {meta}
        </div>
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}

export default PageHeader;
