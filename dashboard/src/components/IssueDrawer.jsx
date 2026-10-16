import { useEffect, useRef } from "react";
import IssueDetail from "./IssueDetail";
import { IconClose } from "./Icons";

// Slide-over panel so Kanban and Calendar can open an incident without leaving the view.
function IssueDrawer({ alert, missingId, onClose, ...detailProps }) {
  const panelRef = useRef(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !e.target.closest?.("input, textarea, select, dialog")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={onClose} />
      <aside ref={panelRef} className="drawer" tabIndex={-1} aria-label={alert ? `INC-${alert.id}` : "Incident"}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close panel">
          <IconClose />
        </button>
        <IssueDetail key={alert ? alert.id : `missing-${missingId}`} alert={alert} missingId={missingId} {...detailProps} />
      </aside>
    </div>
  );
}

export default IssueDrawer;
