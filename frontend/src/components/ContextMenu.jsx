import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function ContextMenu({ open, x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menuWidth = 230;
  const menuHeight = 44 * Math.max(items.length, 1) + 16;
  const padding = 16;
  const left = Math.min(x, window.innerWidth - menuWidth - padding);
  const top = Math.min(y, window.innerHeight - menuHeight - padding);

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left, top }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.type === "separator") {
          return <div key={`sep-${index}`} className="context-menu-separator" />;
        }
        return (
          <button
            key={item.key}
            type="button"
            className={`context-menu-item ${item.tone === "danger" ? "context-menu-danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onSelect();
                onClose();
              }
            }}
            role="menuitem"
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
