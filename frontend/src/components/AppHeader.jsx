import { useEffect, useState } from "react";
import { listSeasonTopAiring } from "../lib/api.js";
import { CATEGORY_KANJI, CATEGORY_LABELS } from "../lib/constants.js";

const VIEW_TITLES = {
  ...CATEGORY_LABELS,
  discover: "Discover"
};

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <g fill="currentColor">
        <rect x="1" y="2" width="3" height="3" rx="0.8" />
        <rect x="6" y="2.8" width="9" height="1.6" rx="0.8" />
        <rect x="1" y="6.5" width="3" height="3" rx="0.8" />
        <rect x="6" y="7.3" width="9" height="1.6" rx="0.8" />
        <rect x="1" y="11" width="3" height="3" rx="0.8" />
        <rect x="6" y="11.8" width="9" height="1.6" rx="0.8" />
      </g>
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <g fill="currentColor">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
      </g>
    </svg>
  );
}

export default function AppHeader({
  activeView,
  entryCount,
  viewMode,
  onChangeViewMode,
  onLogout,
  onOpenAdd
}) {
  const [ticker, setTicker] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    listSeasonTopAiring()
      .then((data) => {
        if (!controller.signal.aborted) setTicker(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const topItem = ticker?.items?.[0];

  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-header-titles" key={activeView}>
          <span
            className={`app-header-kanji cat-${activeView}`}
            lang="ja"
            aria-hidden="true"
          >
            {CATEGORY_KANJI[activeView] || "観"}
          </span>
          <div>
            <h1>
              {VIEW_TITLES[activeView] || "Library"}
              <span className="app-header-brush" aria-hidden="true" />
            </h1>
            {activeView !== "discover" ? (
              <p>
                {entryCount} {entryCount === 1 ? "title" : "titles"}
              </p>
            ) : (
              <p>Daily AniList recommendation</p>
            )}
          </div>
        </div>
        <div className="app-header-actions">
          {activeView !== "discover" ? (
            <div
              className="view-toggle"
              role="group"
              aria-label="Layout"
              data-mode={viewMode}
            >
              <span className="view-toggle-thumb" aria-hidden="true" />
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
                onClick={() => onChangeViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                <ListIcon />
                <span>List</span>
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "grid" ? "is-active" : ""}`}
                onClick={() => onChangeViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                <GridIcon />
                <span>Grid</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={onOpenAdd}
          >
            <span aria-hidden="true">＋</span> Add anime
          </button>
          {onLogout ? (
            <button
              type="button"
              className="app-btn app-btn-ghost"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </div>
      {topItem ? (
        <div className="app-header-ticker">
          <span className="app-header-ticker-label" lang="ja">
            今期の首位
          </span>
          {topItem.url ? (
            <a href={topItem.url} target="_blank" rel="noreferrer">
              #{topItem.rank} {topItem.title}
              {topItem.score != null ? ` · ${topItem.score}%` : ""}
            </a>
          ) : (
            <span>
              #{topItem.rank} {topItem.title}
            </span>
          )}
        </div>
      ) : null}
    </header>
  );
}
