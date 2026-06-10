import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import toast from "react-hot-toast";
import AppHeader from "./components/AppHeader.jsx";
import AppSidebar from "./components/AppSidebar.jsx";
import LibraryView from "./components/LibraryView.jsx";
import ExperimentSection from "./components/ExperimentSection.jsx";
import AddAnimeModal from "./components/AddAnimeModal.jsx";
import AnimeDetailsModal from "./components/AnimeDetailsModal.jsx";
import ContextMenu from "./components/ContextMenu.jsx";
import LoginLock from "./components/LoginLock.jsx";
import SakuraCanvas from "./components/SakuraCanvas.jsx";
import {
  getAuthSession,
  login,
  logout,
  listAnime,
  getAnimeOfTheDay,
  createAnime,
  updateAnime,
  reorderAnime,
  removeAnime
} from "./lib/api.js";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./lib/constants.js";
import {
  getDisplayTitle,
  getEntryIdentityKey,
  getLocalDateKey,
  sortEntriesForDisplay
} from "./lib/display.js";
import { prefersReducedMotion } from "./lib/fx.js";
import { loadViewMode, saveViewMode } from "./lib/viewPreferences.js";

export default function App() {
  const [activeView, setActiveView] = useState("watching");
  const [viewMode, setViewMode] = useState(loadViewMode);
  const [authState, setAuthState] = useState({
    authEnabled: false,
    authenticated: false,
    checking: true
  });
  const [pin, setPin] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [entries, setEntries] = useState([]);
  const [animeOfDay, setAnimeOfDay] = useState(null);
  const [animeOfDayLoading, setAnimeOfDayLoading] = useState(false);
  const [animeOfDayError, setAnimeOfDayError] = useState("");
  const [animeOfDaySavingCategory, setAnimeOfDaySavingCategory] =
    useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [draggedEntry, setDraggedEntry] = useState(null);
  const [dragTargetEntryId, setDragTargetEntryId] = useState(null);
  const [dragTargetCategory, setDragTargetCategory] = useState(null);
  const [animatedSlotState, setAnimatedSlotState] = useState({
    category: null,
    indexes: []
  });
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    entry: null
  });

  const entriesRequestId = useRef(0);
  const aotdRequestId = useRef(0);
  const dragTargetRef = useRef({ entryId: null, category: null });

  const existingEntryKeys = useMemo(
    () => new Set(entries.map(getEntryIdentityKey)),
    [entries]
  );

  const entriesByCategory = useMemo(() => {
    const map = {};
    for (const cat of CATEGORY_ORDER) {
      map[cat] = sortEntriesForDisplay(
        entries.filter((e) => e.category === cat)
      );
    }
    return map;
  }, [entries]);

  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const cat of CATEGORY_ORDER) {
      counts[cat] = entriesByCategory[cat]?.length ?? 0;
    }
    return counts;
  }, [entriesByCategory]);

  const changeView = useCallback(
    (view) => {
      if (view === activeView) return;
      if (document.startViewTransition && !prefersReducedMotion()) {
        document.startViewTransition(() => {
          flushSync(() => setActiveView(view));
        });
      } else {
        setActiveView(view);
      }
    },
    [activeView]
  );

  const resetClientState = useCallback(() => {
    setEntries([]);
    setAnimeOfDay(null);
    setSelectedEntry(null);
    setDraggedEntry(null);
    setDragTargetEntryId(null);
    setDragTargetCategory(null);
    setIsAddOpen(false);
    setContextMenu({ open: false, x: 0, y: 0, entry: null });
  }, []);

  const handleUnauthorized = useCallback(() => {
    setAuthState((s) => ({ ...s, authenticated: false }));
    resetClientState();
    setPin("");
    setLoginError("Your session expired. Enter the PIN again.");
  }, [resetClientState]);

  const loadEntries = useCallback(async () => {
    const id = ++entriesRequestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await listAnime();
      if (id === entriesRequestId.current) {
        setEntries(data || []);
      }
    } catch (err) {
      if (id === entriesRequestId.current) {
        if (err.status === 401) {
          handleUnauthorized();
        } else {
          setError(err.message);
        }
      }
    } finally {
      if (id === entriesRequestId.current) setLoading(false);
    }
  }, [handleUnauthorized]);

  const loadAnimeOfDay = useCallback(
    async (dateKey = getLocalDateKey()) => {
      const id = ++aotdRequestId.current;
      setAnimeOfDayLoading(true);
      setAnimeOfDayError("");
      try {
        const data = await getAnimeOfTheDay(dateKey);
        if (id === aotdRequestId.current) setAnimeOfDay(data);
      } catch (err) {
        if (id === aotdRequestId.current) {
          if (err.status === 401) handleUnauthorized();
          else setAnimeOfDayError(err.message);
        }
      } finally {
        if (id === aotdRequestId.current) setAnimeOfDayLoading(false);
      }
    },
    [handleUnauthorized]
  );

  useEffect(() => {
    getAuthSession()
      .then((session) => {
        setAuthState({
          authEnabled: session.authEnabled,
          authenticated: session.authenticated,
          checking: false
        });
        if (!session.authEnabled || session.authenticated) {
          loadEntries();
          loadAnimeOfDay();
        }
      })
      .catch(() => {
        setAuthState((s) => ({ ...s, checking: false }));
        setError("Failed to check session.");
      });
  }, [loadEntries, loadAnimeOfDay]);

  useEffect(() => {
    if (authState.checking || (authState.authEnabled && !authState.authenticated)) {
      return undefined;
    }

    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      const ms = next.getTime() - now.getTime();
      return setTimeout(() => {
        loadAnimeOfDay(getLocalDateKey());
        scheduleMidnight();
      }, ms);
    };

    const timer = scheduleMidnight();
    return () => clearTimeout(timer);
  }, [authState, loadAnimeOfDay]);

  useEffect(() => {
    if (authState.checking || (authState.authEnabled && !authState.authenticated)) {
      return undefined;
    }
    const prevent = (e) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, [authState]);

  const handleLogin = async (pinValue) => {
    const code = pinValue ?? pin;
    if (code.length !== 4) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const session = await login(code);
      setAuthState({
        authEnabled: session.authEnabled,
        authenticated: session.authenticated,
        checking: false
      });
      setPin("");
      await Promise.all([loadEntries(), loadAnimeOfDay()]);
    } catch (err) {
      let msg = err.message || "Login failed.";
      if (err.retryAfter) msg += ` Try again in ${err.retryAfter}s.`;
      setLoginError(msg);
      setPin("");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    setAuthState((s) => ({ ...s, authenticated: false }));
    resetClientState();
    setPin("");
  };

  const handleCreate = async (entry) => {
    try {
      const created = await createAnime(entry);
      setEntries((prev) => [created, ...prev]);
      setIsAddOpen(false);
      await loadAnimeOfDay();
      toast.success(`Added "${getDisplayTitle(created)}"`);
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else toast.error(err.message);
      throw err;
    }
  };

  const handleMove = async (entry, category) => {
    if (entry.category === category) return;
    try {
      const updated = await updateAnime(entry.id, { category });
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );
      await loadAnimeOfDay();
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      toast.success(`Moved to ${CATEGORY_LABELS[category]}`);
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else toast.error(err.message);
    }
  };

  const triggerSlotAnimation = (category, indexes) => {
    setAnimatedSlotState({ category, indexes });
    setTimeout(() => setAnimatedSlotState({ category: null, indexes: [] }), 600);
  };

  const handleReorder = async (category, dragged, target) => {
    if (!dragged || !target || dragged.id === target.entryId) return;
    if (target.category && target.category !== category) {
      await handleMove(dragged, target.category);
      return;
    }

    // No card under cursor (gap, own slot, section padding) — keep order.
    if (!target.entryId) return;

    const list = entriesByCategory[category];
    const draggedIndex = list.findIndex((e) => e.id === dragged.id);
    const targetIndex = list.findIndex((e) => e.id === target.entryId);

    if (draggedIndex < 0 || targetIndex < 0) return;
    if (draggedIndex === targetIndex) return;

    const reordered = [...list];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);
    const orderedIds = reordered.map((e) => e.id);

    const optimistic = reordered.map((e, i) => ({
      ...e,
      manualOrder: i + 1
    }));

    setEntries((prev) => {
      const others = prev.filter((e) => e.category !== category);
      return [...others, ...optimistic];
    });

    const minIdx = Math.min(draggedIndex, targetIndex);
    const maxIdx = Math.max(draggedIndex, targetIndex);
    triggerSlotAnimation(
      category,
      Array.from({ length: maxIdx - minIdx + 1 }, (_, i) => minIdx + i)
    );

    try {
      const updated = await reorderAnime(category, orderedIds);
      setEntries((prev) => {
        const others = prev.filter((e) => e.category !== category);
        return [...others, ...updated];
      });
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else {
        toast.error(err.message);
        loadEntries();
      }
    }
  };

  const handleDragTargetChange = useCallback((target) => {
    if (!target) {
      if (
        dragTargetRef.current.entryId !== null ||
        dragTargetRef.current.category !== null
      ) {
        dragTargetRef.current = { entryId: null, category: null };
        setDragTargetEntryId(null);
        setDragTargetCategory(null);
      }
      return;
    }

    const entryId = target.entryId ?? null;
    const category = target.category ?? null;
    if (
      dragTargetRef.current.entryId === entryId &&
      dragTargetRef.current.category === category
    ) {
      return;
    }

    dragTargetRef.current = { entryId, category };
    setDragTargetEntryId(entryId);
    setDragTargetCategory(category);
  }, []);

  const handlePointerDrop = (entry, target) => {
    dragTargetRef.current = { entryId: null, category: null };
    setDraggedEntry(null);
    setDragTargetEntryId(null);
    setDragTargetCategory(null);
    if (!target?.category) return;
    handleReorder(entry.category, entry, target);
    if (target.category !== "discover" && target.category !== entry.category) {
      setActiveView(target.category);
    }
  };

  const handleDropOnCategory = (entry, category) => {
    handlePointerDrop(entry, { category, entryId: null });
  };

  const handleUpdateProgress = async (entry, next) => {
    const value = Math.max(0, next);
    if (entry.progressTotal != null && value > entry.progressTotal) return;

    const increased = value > entry.progressCurrent;
    try {
      const updated = await updateAnime(entry.id, {
        progressCurrent: value
      });

      if (entry.category === "watching" && increased) {
        const watching = sortEntriesForDisplay(
          entries.filter(
            (e) => e.category === "watching" && e.id !== entry.id
          )
        );
        const reorderedIds = [
          updated.id,
          ...watching.map((e) => e.id)
        ];
        const optimistic = [
          { ...updated, manualOrder: 1 },
          ...watching.map((e, i) => ({ ...e, manualOrder: i + 2 }))
        ];
        setEntries((prev) => {
          const others = prev.filter((e) => e.category !== "watching");
          return [...others, ...optimistic];
        });
        triggerSlotAnimation("watching", [0, 1, 2]);

        const serverList = await reorderAnime("watching", reorderedIds);
        setEntries((prev) => {
          const others = prev.filter((e) => e.category !== "watching");
          return [...others, ...serverList];
        });
      } else {
        setEntries((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e))
        );
      }

      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else toast.error(err.message);
    }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete "${getDisplayTitle(entry)}"?`)) return;
    try {
      await removeAnime(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      if (selectedEntry?.id === entry.id) setSelectedEntry(null);
      await loadAnimeOfDay();
      toast.success("Deleted");
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else toast.error(err.message);
    }
  };

  const handleAddAnimeOfDay = async (category) => {
    if (!animeOfDay) return;
    setAnimeOfDaySavingCategory(category);
    try {
      const created = await createAnime({
        externalId: animeOfDay.externalId,
        source: animeOfDay.source,
        title: animeOfDay.title,
        titleEnglish: animeOfDay.titleEnglish,
        coverImage: animeOfDay.coverImage,
        bannerImage: animeOfDay.bannerImage,
        year: animeOfDay.year,
        episodes: animeOfDay.episodes,
        synopsis: animeOfDay.synopsis,
        genres: animeOfDay.genres,
        category,
        notes: "",
        progressCurrent: 0,
        progressTotal: animeOfDay.episodes || null,
        nextAiringEpisode: animeOfDay.nextAiringEpisode,
        nextAiringAt: animeOfDay.nextAiringAt
      });
      setEntries((prev) => [created, ...prev]);
      await loadAnimeOfDay();
      toast.success("Added recommendation");
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else toast.error(err.message);
    } finally {
      setAnimeOfDaySavingCategory(null);
    }
  };

  const openContextMenu = (e, entry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      entry: entry || null
    });
  };

  const buildContextItems = () => {
    const entry = contextMenu.entry;
    if (!entry) {
      return [
        {
          key: "add",
          label: "Add Anime",
          onSelect: () => setIsAddOpen(true)
        }
      ];
    }

    const items = [];
    if (entry.category === "watching") {
      items.push(
        {
          key: "pause",
          label: "Mark as Paused",
          onSelect: () => handleMove(entry, "canceled")
        },
        {
          key: "finish",
          label: "Mark as Finished",
          onSelect: () => handleMove(entry, "finished")
        },
        { type: "separator" },
        {
          key: "edit",
          label: "Edit Anime",
          onSelect: () => setSelectedEntry(entry)
        },
        {
          key: "plus",
          label: "+1 Episode",
          disabled:
            entry.progressTotal != null &&
            entry.progressCurrent >= entry.progressTotal,
          onSelect: () =>
            handleUpdateProgress(entry, entry.progressCurrent + 1)
        },
        { type: "separator" },
        {
          key: "delete",
          label: "Delete Anime",
          tone: "danger",
          onSelect: () => handleDelete(entry)
        }
      );
    } else if (entry.category === "on_hold") {
      items.push(
        {
          key: "watch",
          label: "Add to Watchlist",
          onSelect: () => handleMove(entry, "watching")
        },
        {
          key: "pause",
          label: "Mark as Paused",
          onSelect: () => handleMove(entry, "canceled")
        },
        { type: "separator" },
        {
          key: "edit",
          label: "Edit Anime",
          onSelect: () => setSelectedEntry(entry)
        },
        { type: "separator" },
        {
          key: "delete",
          label: "Delete Anime",
          tone: "danger",
          onSelect: () => handleDelete(entry)
        }
      );
    } else if (entry.category === "canceled") {
      items.push(
        {
          key: "watch",
          label: "Add to Watchlist",
          onSelect: () => handleMove(entry, "watching")
        },
        {
          key: "plan",
          label: "Plan to Watch",
          onSelect: () => handleMove(entry, "on_hold")
        },
        { type: "separator" },
        {
          key: "edit",
          label: "Edit Anime",
          onSelect: () => setSelectedEntry(entry)
        },
        { type: "separator" },
        {
          key: "delete",
          label: "Delete Anime",
          tone: "danger",
          onSelect: () => handleDelete(entry)
        }
      );
    } else {
      items.push(
        {
          key: "watch",
          label: "Add to Watchlist",
          onSelect: () => handleMove(entry, "watching")
        },
        {
          key: "plan",
          label: "Plan to Watch",
          onSelect: () => handleMove(entry, "on_hold")
        },
        { type: "separator" },
        {
          key: "edit",
          label: "Edit Anime",
          onSelect: () => setSelectedEntry(entry)
        },
        { type: "separator" },
        {
          key: "delete",
          label: "Delete Anime",
          tone: "danger",
          onSelect: () => handleDelete(entry)
        }
      );
    }
    return items;
  };

  if (authState.checking) {
    return (
      <div className="page-centered">
        <div className="boot-panel">
          <span className="enso" aria-hidden="true" />
          <h1>Checking session…</h1>
        </div>
      </div>
    );
  }

  if (authState.authEnabled && !authState.authenticated) {
    return (
      <LoginLock
        busy={loginBusy}
        error={loginError}
        pin={pin}
        onPinChange={setPin}
        onSubmit={(value) => handleLogin(value)}
      />
    );
  }

  if (loading && entries.length === 0 && !error) {
    return (
      <div className="page-centered">
        <div className="boot-panel">
          <span className="enso" aria-hidden="true" />
          <h1>Loading library…</h1>
        </div>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="page-centered">
        <div className="boot-panel">
          <span className="boot-kicker">Backend unreachable</span>
          <h1>{error}</h1>
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={loadEntries}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const dragHandlers = {
    onOpenEntry: setSelectedEntry,
    onUpdateProgress: handleUpdateProgress,
    onContinueEntry: (e) => handleMove(e, "watching"),
    onDeleteEntry: handleDelete,
    onOpenContextMenu: openContextMenu,
    onDragStart: (entry) => {
      dragTargetRef.current = { entryId: null, category: null };
      setDraggedEntry(entry);
      setDragTargetEntryId(null);
      setDragTargetCategory(null);
    },
    onDragTargetChange: handleDragTargetChange,
    onPointerDrop: handlePointerDrop,
    draggedEntry,
    dragTargetEntryId
  };

  return (
    <div
      className={`app-shell${draggedEntry ? " is-dragging" : ""}`}
      onContextMenu={(e) => openContextMenu(e, null)}
    >
      <SakuraCanvas />
      <AppSidebar
        activeView={activeView}
        onChangeView={changeView}
        counts={categoryCounts}
        draggedEntry={draggedEntry}
        dragTargetCategory={dragTargetCategory}
        onDropOnCategory={handleDropOnCategory}
      />
      <div className="app-main">
        <AppHeader
          activeView={activeView}
          entryCount={
            activeView !== "discover"
              ? entriesByCategory[activeView]?.length ?? 0
              : 0
          }
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          onLogout={authState.authEnabled ? handleLogout : null}
          onOpenAdd={() => setIsAddOpen(true)}
        />
        <div className="app-content">
          {activeView === "discover" ? (
            <ExperimentSection
              recommendation={animeOfDay}
              loading={animeOfDayLoading}
              error={animeOfDayError}
              onAddToCategory={handleAddAnimeOfDay}
              savingCategory={animeOfDaySavingCategory}
            />
          ) : (
            <LibraryView
              category={activeView}
              entries={entriesByCategory[activeView] || []}
              viewMode={viewMode}
              animatedSlotIndexes={
                animatedSlotState.category === activeView
                  ? animatedSlotState.indexes
                  : []
              }
              {...dragHandlers}
            />
          )}
        </div>
      </div>
      <AddAnimeModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={handleCreate}
        existingEntryKeys={existingEntryKeys}
      />
      <AnimeDetailsModal
        entry={selectedEntry}
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
      />
      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={buildContextItems()}
        onClose={() =>
          setContextMenu({ open: false, x: 0, y: 0, entry: null })
        }
      />
    </div>
  );
}
