import { safeCssUrl } from "../lib/display.js";

export default function ExperimentSection({
  recommendation,
  loading,
  error,
  onAddToCategory,
  savingCategory
}) {
  return (
    <section className="discover-panel" data-category-section="discover">
      {loading ? (
        <div className="discover-state">
          <span className="enso" aria-hidden="true" />
          Matching AniList tags…
        </div>
      ) : null}
      {error ? <p className="modal-error">{error}</p> : null}
      {!loading && !error && recommendation ? (
        <article className="discover-hero">
          <div
            className="discover-hero-backdrop"
            style={{
              backgroundImage: safeCssUrl(
                recommendation.bannerImage || recommendation.coverImage
              )
            }}
            aria-hidden="true"
          />
          <span className="discover-vertical" lang="ja" aria-hidden="true">
            今日の一本
          </span>
          <div className="discover-hero-content">
            <div className="discover-cover">
              {recommendation.coverImage ? (
                <img
                  src={recommendation.coverImage}
                  alt={recommendation.titleEnglish || recommendation.title}
                />
              ) : null}
            </div>
            <div className="discover-card-body">
              <span className="discover-eyebrow">AniList match · today</span>
              <h2>{recommendation.titleEnglish || recommendation.title}</h2>
              <p className="discover-meta">
                {recommendation.year || "?"} ·{" "}
                {recommendation.episodes
                  ? `${recommendation.episodes} episodes`
                  : "Unknown length"}
                {recommendation.averageScore
                  ? ` · ${recommendation.averageScore}% score`
                  : ""}
              </p>
              <div className="discover-chips">
                {(recommendation.matchedGenres || []).map((g) => (
                  <span key={g} className="discover-chip">
                    {g}
                  </span>
                ))}
              </div>
              {(recommendation.matchedTags || []).length > 0 ? (
                <div className="discover-tags">
                  {(recommendation.matchedTags || []).map((t) => (
                    <span key={t} className="discover-chip discover-chip-muted">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="discover-synopsis">
                {recommendation.synopsis ||
                  "No synopsis available for this recommendation."}
              </p>
              <div className="discover-actions">
                <button
                  type="button"
                  className="app-btn app-btn-primary"
                  disabled={savingCategory === "watching"}
                  onClick={() => onAddToCategory("watching")}
                >
                  Add to watchlist
                </button>
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  disabled={savingCategory === "on_hold"}
                  onClick={() => onAddToCategory("on_hold")}
                >
                  Plan to watch
                </button>
                {recommendation.url ? (
                  <a
                    className="app-btn app-btn-ghost"
                    href={recommendation.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on AniList
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      ) : null}
      {!loading && !error && !recommendation ? (
        <div className="discover-state">
          No AniList match available right now.
        </div>
      ) : null}
    </section>
  );
}
