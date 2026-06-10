import {
  CATEGORY_JP,
  CATEGORY_KANJI,
  CATEGORY_LABELS,
  CATEGORY_ORDER
} from "../lib/constants.js";

const NAV_ITEMS = [
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
  { key: "discover", label: "Discover" }
];

export default function AppSidebar({
  activeView,
  onChangeView,
  counts,
  draggedEntry,
  dragTargetCategory,
  onDropOnCategory
}) {
  return (
    <>
      <aside className="app-sidebar" aria-label="Library navigation">
        <div className="app-sidebar-crest" aria-hidden="true">
          <span className="app-sidebar-crest-seal" lang="ja">
            観
          </span>
          <span className="app-sidebar-crest-text" lang="ja">
            アニメ帳
          </span>
        </div>
        <nav className="app-sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            const isDropTarget =
              draggedEntry &&
              dragTargetCategory === item.key &&
              item.key !== "discover" &&
              draggedEntry.category !== item.key;
            const isDropCandidate =
              draggedEntry &&
              item.key !== "discover" &&
              draggedEntry.category !== item.key;
            const count =
              item.key === "discover" ? null : counts[item.key] ?? 0;

            return (
              <button
                key={item.key}
                type="button"
                className={`app-nav-item cat-${item.key} ${isActive ? "is-active" : ""} ${isDropTarget ? "is-drop-target" : ""} ${isDropCandidate ? "is-drop-candidate" : ""}`}
                data-category-section={
                  item.key === "discover" ? undefined : item.key
                }
                onClick={() => onChangeView(item.key)}
                onPointerUp={(e) => {
                  if (!draggedEntry || item.key === "discover") return;
                  e.preventDefault();
                  onDropOnCategory(draggedEntry, item.key);
                }}
              >
                <span className="app-nav-kanji" lang="ja" aria-hidden="true">
                  {CATEGORY_KANJI[item.key]}
                </span>
                <span className="app-nav-copy">
                  <span className="app-nav-label">{item.label}</span>
                  <span className="app-nav-jp" lang="ja" aria-hidden="true">
                    {CATEGORY_JP[item.key]}
                  </span>
                </span>
                {count != null ? (
                  <span className="app-nav-count">{count}</span>
                ) : (
                  <span className="app-nav-count app-nav-count-muted">✦</span>
                )}
                <span className="app-nav-brush" aria-hidden="true" />
              </button>
            );
          })}
        </nav>
        <div className="app-sidebar-foot" aria-hidden="true">
          <span className="app-sidebar-vertical" lang="ja">
            夜のアニメ図書館
          </span>
        </div>
      </aside>
      <nav className="app-tabbar" aria-label="Library navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.key;
          const count =
            item.key === "discover" ? null : counts[item.key] ?? 0;

          return (
            <button
              key={item.key}
              type="button"
              className={`app-tab-item cat-${item.key} ${isActive ? "is-active" : ""}`}
              onClick={() => onChangeView(item.key)}
            >
              <span className="app-tab-kanji" lang="ja" aria-hidden="true">
                {CATEGORY_KANJI[item.key]}
              </span>
              <span>{item.label}</span>
              {count != null ? <em>{count}</em> : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
