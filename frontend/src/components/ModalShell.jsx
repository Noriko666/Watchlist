import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ModalShell({
  open,
  onClose,
  title,
  wide = false,
  panelClassName = "",
  panelStyle,
  children
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <span className="modal-shoji modal-shoji-left" aria-hidden="true" />
      <span className="modal-shoji modal-shoji-right" aria-hidden="true" />
      <div
        className={`modal-panel ${wide ? "modal-panel-wide" : ""} ${panelClassName}`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
