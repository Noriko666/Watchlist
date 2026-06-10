import { useLayoutEffect, useRef } from "react";
import AnimeCard from "./AnimeCard.jsx";
import { CATEGORY_KANJI, CATEGORY_LABELS } from "../lib/constants.js";

export default function LibraryView({
  category,
  entries,
  viewMode = "list",
  onOpenEntry,
  onUpdateProgress,
  onContinueEntry,
  onDeleteEntry,
  onOpenContextMenu,
  onDragStart,
  onDragTargetChange,
  onPointerDrop,
  draggedEntry,
  dragTargetEntryId,
  animatedSlotIndexes
}) {
  const listRef = useRef(null);
  const prevRects = useRef(new Map());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      prevRects.current.clear();
      return;
    }

    const slots = list.querySelectorAll(".library-slot");
    const newRects = new Map();
    slots.forEach((slot) => {
      const id = slot.dataset.entryId;
      if (id) newRects.set(id, slot.getBoundingClientRect());
    });

    slots.forEach((slot) => {
      const id = slot.dataset.entryId;
      const prev = prevRects.current.get(id);
      const next = newRects.get(id);
      if (prev && next) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx !== 0 || dy !== 0) {
          slot.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.92 },
              { transform: "none", opacity: 1 }
            ],
            {
              duration: 420,
              easing: "cubic-bezier(0.2, 0.9, 0.16, 1)",
              fill: "both"
            }
          );
        }
      }
    });

    prevRects.current = newRects;
  }, [entries, animatedSlotIndexes]);

  const title = CATEGORY_LABELS[category] || category;
  const isDropTarget =
    draggedEntry &&
    (draggedEntry.category !== category || dragTargetEntryId != null);

  return (
    <section
      className={`library-view cat-${category} ${isDropTarget ? "library-view-drop-target" : ""}`}
      data-category-section={category}
      onContextMenu={(e) => onOpenContextMenu(e, null)}
    >
      {entries.length === 0 ? (
        <div className="library-empty">
          <span className="library-empty-kanji" lang="ja" aria-hidden="true">
            {CATEGORY_KANJI[category]}
          </span>
          <p>No titles in {title.toLowerCase()} yet.</p>
          <span>Right-click to add anime, or use the button above.</span>
        </div>
      ) : (
        <ul
          key={`${category}-${viewMode}`}
          className={viewMode === "grid" ? "library-grid" : "library-list"}
          ref={listRef}
        >
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className={`library-slot ${animatedSlotIndexes?.includes(index) ? "library-slot-animate" : ""} ${dragTargetEntryId === entry.id ? "library-slot-insert-before" : ""}`}
              data-entry-id={entry.id}
              style={{ "--i": Math.min(index, 14) }}
            >
              <AnimeCard
                entry={entry}
                layout={viewMode}
                onOpen={onOpenEntry}
                onUpdateProgress={onUpdateProgress}
                onContinue={onContinueEntry}
                onDelete={onDeleteEntry}
                onOpenContextMenu={onOpenContextMenu}
                onDragStart={onDragStart}
                onDragTargetChange={onDragTargetChange}
                onPointerDrop={onPointerDrop}
                isDragging={draggedEntry?.id === entry.id}
                isDragTarget={dragTargetEntryId === entry.id}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
