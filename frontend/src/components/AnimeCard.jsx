import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { PLAYGROUND_FALLBACK_COVER } from "../lib/constants.js";
import { getDisplayTitle } from "../lib/display.js";
import { shouldShowNewEpisodeBadge } from "../lib/newEpisode.js";
import { spawnInkRipple, spawnSakuraBurst } from "../lib/fx.js";

function formatAiringDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return null;
  }
}

export default function AnimeCard({
  entry,
  layout = "list",
  onOpen,
  onUpdateProgress,
  onContinue,
  onDelete,
  onOpenContextMenu,
  onDragStart,
  onDragTargetChange,
  onPointerDrop,
  isDragging,
  isDragTarget
}) {
  const [coverSrc, setCoverSrc] = useState(
    entry.coverImage || PLAYGROUND_FALLBACK_COVER
  );
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef(null);
  const dragState = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const ghostRafRef = useRef(null);
  const pendingGhostRef = useRef(null);
  const [ghost, setGhost] = useState(null);

  const scheduleGhost = useCallback((next) => {
    pendingGhostRef.current = next;
    if (ghostRafRef.current != null) return;
    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = null;
      setGhost(pendingGhostRef.current);
    });
  }, []);

  const progressPercent =
    entry.progressTotal && entry.progressTotal > 0
      ? Math.round((entry.progressCurrent / entry.progressTotal) * 100)
      : null;

  const showNewEpisodeBadge = shouldShowNewEpisodeBadge(entry);

  const handleDelete = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteArmed(false), 2400);
      return;
    }
    clearTimeout(deleteTimer.current);
    setDeleteArmed(false);
    onDelete(entry);
  };

  const findDropTarget = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return { entryId: null, category: null };
    const cardEl = el.closest("[data-anime-card-id]");
    if (cardEl) {
      return {
        entryId: Number(cardEl.dataset.animeCardId),
        category: cardEl.dataset.category
      };
    }
    const sectionEl = el.closest("[data-category-section]");
    if (sectionEl) {
      return {
        entryId: null,
        category: sectionEl.dataset.categorySection
      };
    }
    return { entryId: null, category: null };
  }, []);

  const ghostAtPointer = (clientX, clientY, tilt = 0, pickup = false) => ({
    x: clientX + 14,
    y: clientY - (layout === "grid" ? 44 : 20),
    rot: tilt,
    pickup
  });

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      tilt: 0,
      active: false
    };

    const onMove = (ev) => {
      const state = dragState.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      const dy = ev.clientY - state.startY;

      // Velocity-based tilt: the ghost leans into the drag direction.
      const now = performance.now();
      const dt = Math.max(now - state.lastT, 1);
      const vx = (ev.clientX - state.lastX) / dt;
      state.lastX = ev.clientX;
      state.lastT = now;
      const targetTilt = Math.max(-12, Math.min(12, vx * 26));
      state.tilt = state.tilt * 0.72 + targetTilt * 0.28;

      if (!state.active && Math.hypot(dx, dy) >= 4) {
        state.active = true;
        onDragStart(entry);
        scheduleGhost(ghostAtPointer(ev.clientX, ev.clientY, state.tilt, true));
      }
      if (state.active) {
        scheduleGhost(ghostAtPointer(ev.clientX, ev.clientY, state.tilt));
        onDragTargetChange?.(findDropTarget(ev.clientX, ev.clientY));
      }
    };

    const onUp = (ev) => {
      const state = dragState.current;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (state?.active) {
        const target = findDropTarget(ev.clientX, ev.clientY);
        onDragTargetChange?.(null);
        if (target.category && target.category !== entry.category) {
          spawnInkRipple(ev.clientX, ev.clientY);
          spawnSakuraBurst(ev.clientX, ev.clientY);
        } else if (target.entryId && target.entryId !== entry.id) {
          spawnInkRipple(ev.clientX, ev.clientY);
        }
        onPointerDrop(entry, target);
        suppressClickUntilRef.current = Date.now() + 450;
      }
      if (ghostRafRef.current != null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      dragState.current = null;
      setGhost(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const onCardClick = (e) => {
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onOpen(entry);
  };

  const metaLine = (
    <>
      {entry.episodes ? `${entry.episodes} eps` : "TBA"}
      {progressPercent !== null
        ? ` · ${entry.progressCurrent}/${entry.progressTotal}`
        : ""}
      {entry.year ? ` · ${entry.year}` : ""}
    </>
  );

  const airingLine =
    (entry.category === "watching" || entry.category === "on_hold") &&
    entry.nextAiringAt ? (
      <span className="anime-airing">
        Next {formatAiringDate(entry.nextAiringAt)}
      </span>
    ) : null;

  const controls = (
    <>
      {entry.category === "watching" ? (
        <div className="ep-stepper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onUpdateProgress(entry, entry.progressCurrent - 1)}
            aria-label="Decrease episode"
          >
            −
          </button>
          <span className="ep-stepper-value" key={entry.progressCurrent}>
            {entry.progressCurrent}
          </span>
          <button
            type="button"
            onClick={() => onUpdateProgress(entry, entry.progressCurrent + 1)}
            aria-label="Increase episode"
            disabled={
              entry.progressTotal != null &&
              entry.progressCurrent >= entry.progressTotal
            }
          >
            ＋
          </button>
        </div>
      ) : null}
      {(entry.category === "canceled" || entry.category === "on_hold") && (
        <button
          type="button"
          className="app-btn app-btn-ghost anime-continue"
          onClick={(e) => {
            e.stopPropagation();
            onContinue(entry);
          }}
        >
          To watchlist
        </button>
      )}
    </>
  );

  const dragDelete = (
    <>
      <button
        type="button"
        className="card-icon-btn card-drag"
        title="Drag to reorder or move"
        aria-label="Drag anime"
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </button>
      <button
        type="button"
        className={`card-icon-btn card-delete ${deleteArmed ? "is-armed" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
        aria-label="Delete anime"
      >
        {deleteArmed ? "✓" : "×"}
      </button>
    </>
  );

  const ghostNode = ghost
    ? createPortal(
        <div
          className={`drag-ghost drag-ghost-${layout} ${ghost.pickup ? "drag-ghost-pickup" : ""}`}
          style={{
            left: ghost.x,
            top: ghost.y,
            "--tilt": `${ghost.rot.toFixed(2)}deg`
          }}
        >
          <img src={coverSrc} alt="" />
          <span>{getDisplayTitle(entry)}</span>
        </div>,
        document.body
      )
    : null;

  if (layout === "grid") {
    return (
      <>
        <article
          className={`anime-tile cat-${entry.category} ${isDragging ? "is-dragging-source" : ""} ${isDragTarget ? "is-drag-target" : ""}`}
          data-anime-card-id={entry.id}
          data-category={entry.category}
          onClick={onCardClick}
          onContextMenu={(e) => onOpenContextMenu(e, entry)}
        >
          <div className="anime-cover anime-tile-cover">
            <img
              src={coverSrc}
              alt=""
              loading="lazy"
              onError={() => setCoverSrc(PLAYGROUND_FALLBACK_COVER)}
            />
            <span className="anime-cover-shine" aria-hidden="true" />
            {showNewEpisodeBadge ? (
              <span
                className="hanko-badge"
                lang="ja"
                title="New episode within the last 24h"
              >
                新
              </span>
            ) : null}
            {progressPercent !== null ? (
              <div
                className="ink-progress anime-tile-progress"
                aria-hidden="true"
              >
                <span
                  className="ink-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            ) : null}
            <div
              className="anime-tile-overlay"
              onClick={(e) => e.stopPropagation()}
            >
              {dragDelete}
            </div>
          </div>
          <div className="anime-tile-body">
            <h3 className="anime-tile-title">{getDisplayTitle(entry)}</h3>
            <div className="anime-tile-meta">
              <span>{metaLine}</span>
              {airingLine}
            </div>
            <div className="anime-tile-controls">{controls}</div>
          </div>
        </article>
        {ghostNode}
      </>
    );
  }

  return (
    <>
      <article
        className={`anime-row cat-${entry.category} ${isDragging ? "is-dragging-source" : ""} ${isDragTarget ? "is-drag-target" : ""}`}
        data-anime-card-id={entry.id}
        data-category={entry.category}
        onClick={onCardClick}
        onContextMenu={(e) => onOpenContextMenu(e, entry)}
      >
        <div className="anime-cover anime-row-poster">
          <img
            src={coverSrc}
            alt=""
            loading="lazy"
            onError={() => setCoverSrc(PLAYGROUND_FALLBACK_COVER)}
          />
          <span className="anime-cover-shine" aria-hidden="true" />
          {showNewEpisodeBadge ? (
            <span
              className="hanko-badge"
              lang="ja"
              title="New episode within the last 24h"
            >
              新
            </span>
          ) : null}
        </div>

        <div className="anime-row-main">
          <div className="anime-row-head">
            <h3 className="anime-row-title">{getDisplayTitle(entry)}</h3>
            <div className="anime-row-meta">
              <span>{metaLine}</span>
              {airingLine}
            </div>
          </div>
          {progressPercent !== null ? (
            <div className="ink-progress" aria-hidden="true">
              <span
                className="ink-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="anime-row-actions" onClick={(e) => e.stopPropagation()}>
          {controls}
          {dragDelete}
        </div>
      </article>
      {ghostNode}
    </>
  );
}
