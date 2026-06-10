import { useEffect, useRef, useState } from "react";
import { searchCatalog } from "../lib/api.js";
import { CATEGORY_LABELS } from "../lib/constants.js";
import { getDisplayTitle, getEntryIdentityKey } from "../lib/display.js";
import ModalShell from "./ModalShell.jsx";

export default function AddAnimeModal({
  open,
  onClose,
  onCreate,
  existingEntryKeys
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    category: "watching",
    notes: "",
    progressCurrent: 0
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchId = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setForm({ category: "watching", notes: "", progressCurrent: 0 });
      setSearchError("");
      setIsSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError("");
      return undefined;
    }

    const controller = new AbortController();
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const data = await searchCatalog(trimmed, {
          signal: controller.signal
        });
        if (id === searchId.current) {
          setResults(data || []);
        }
      } catch (err) {
        if (id === searchId.current && err.name !== "AbortError") {
          setSearchError(err.message);
        }
      } finally {
        if (id === searchId.current) setIsSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const isDuplicate = selected
    ? existingEntryKeys.has(getEntryIdentityKey(selected))
    : false;

  const handleCreate = async (categoryOverride) => {
    if (!selected || isDuplicate) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        ...selected,
        category: categoryOverride || form.category,
        notes: form.notes,
        progressCurrent: form.progressCurrent,
        progressTotal: selected.episodes || null
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} title="Add Anime" wide>
      <div className="add-modal-grid">
        <div className="add-modal-search">
          <label className="field-label">
            Search Title
            <input
              type="search"
              placeholder="e.g. Frieren, Monster, Pluto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
          {isSearching ? <p className="modal-hint">Searching…</p> : null}
          {searchError ? <p className="modal-error">{searchError}</p> : null}
          <div className="search-results">
            {results.map((item, index) => {
              const dup = existingEntryKeys.has(getEntryIdentityKey(item));
              return (
                <button
                  key={getEntryIdentityKey(item)}
                  type="button"
                  className={`search-result-card ${selected?.externalId === item.externalId && selected?.source === item.source ? "selected" : ""}`}
                  style={{ "--i": Math.min(index, 10) }}
                  onClick={() => setSelected(item)}
                >
                  {item.coverImage ? (
                    <img src={item.coverImage} alt="" />
                  ) : null}
                  <div>
                    <strong>{getDisplayTitle(item)}</strong>
                    <span>
                      {item.year || "?"} · {item.episodes || "?"} eps
                    </span>
                    <span className="search-genres">
                      {(item.genres || []).slice(0, 3).join(", ")}
                    </span>
                    {dup ? (
                      <span className="duplicate-tag">Already in watchlist</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="add-modal-details">
          {selected ? (
            <>
              <div className="add-preview">
                {selected.coverImage ? (
                  <img src={selected.coverImage} alt={getDisplayTitle(selected)} />
                ) : null}
                <div>
                  <span className="modal-kicker">Selected</span>
                  <h3>{getDisplayTitle(selected)}</h3>
                  <p>
                    {selected.year || "?"} · {selected.episodes || "?"} episodes
                  </p>
                  <p className="add-synopsis">{selected.synopsis}</p>
                </div>
              </div>
              <label className="field-label">
                Category
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Current EP
                <input
                  type="number"
                  min="0"
                  value={form.progressCurrent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      progressCurrent: Number(e.target.value)
                    }))
                  }
                />
              </label>
              <label className="field-label">
                Episodes
                <input type="text" readOnly value={selected.episodes || "TBA"} />
              </label>
              <label className="field-label">
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </label>
              {isDuplicate ? (
                <p className="modal-error">This anime is already in your watchlist.</p>
              ) : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="app-btn app-btn-ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  disabled={isSubmitting || isDuplicate}
                  onClick={() => handleCreate("on_hold")}
                >
                  Plan to Watch
                </button>
                <button
                  type="button"
                  className="app-btn app-btn-primary"
                  disabled={isSubmitting || isDuplicate}
                  onClick={() => handleCreate("watching")}
                >
                  Add to Watchlist
                </button>
              </div>
            </>
          ) : (
            <p className="modal-hint">
              Select a result on the left to add it to your watchlist.
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
