import { useEffect, useRef, useState } from "react";
import {
  listAnimeCharacters,
  listVoiceActorTopRoles
} from "../lib/api.js";
import { getDisplayTitle, safeCssUrl } from "../lib/display.js";
import ModalShell from "./ModalShell.jsx";

export default function AnimeDetailsModal({ entry, open, onClose }) {
  const [characters, setCharacters] = useState([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [charsError, setCharsError] = useState("");
  const [vaCache, setVaCache] = useState({});
  const [selectedVa, setSelectedVa] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open || !entry) return undefined;
    if (entry.source !== "anilist") {
      setCharacters([]);
      return undefined;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCharsLoading(true);
    setCharsError("");

    listAnimeCharacters(entry.id)
      .then((data) => {
        if (!controller.signal.aborted) setCharacters(data || []);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setCharsError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCharsLoading(false);
      });

    return () => controller.abort();
  }, [open, entry?.id, entry?.source]);

  useEffect(() => {
    if (!open) {
      setSelectedVa(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedVa(null);
  }, [entry?.id]);

  const fetchVaRoles = (vaId) => {
    if (!vaId || vaCache[vaId]?.status === "loading" || vaCache[vaId]?.roles) {
      return;
    }

    setVaCache((c) => ({ ...c, [vaId]: { status: "loading" } }));
    listVoiceActorTopRoles(vaId)
      .then((roles) => {
        setVaCache((c) => ({
          ...c,
          [vaId]: { status: "ok", roles }
        }));
      })
      .catch((err) => {
        setVaCache((c) => ({
          ...c,
          [vaId]: { status: "error", error: err.message }
        }));
      });
  };

  const toggleVoiceActor = (voiceActor) => {
    if (!voiceActor?.id) return;

    if (selectedVa?.id === voiceActor.id) {
      setSelectedVa(null);
      return;
    }

    setSelectedVa({
      id: voiceActor.id,
      name: voiceActor.name,
      image: voiceActor.image
    });
    fetchVaRoles(voiceActor.id);
  };

  const selectedVaState = selectedVa ? vaCache[selectedVa.id] : null;

  if (!entry) return null;

  const backdrop =
    entry.bannerImage || entry.coverImage
      ? safeCssUrl(entry.bannerImage || entry.coverImage)
      : "url(../anime-ui/details-modal-backdrop.png)";

  const castArt = entry.coverImage
    ? safeCssUrl(entry.coverImage)
    : "url(../anime-ui/details-cast-banner.png)";

  const panelStyle = {
    "--details-modal-backdrop": backdrop,
    "--details-modal-cast-art": castArt
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={getDisplayTitle(entry)}
      wide
      panelClassName="details-modal-panel"
      panelStyle={panelStyle}
    >
      <div className="details-modal-grid">
        <aside className="details-sidebar">
          {entry.coverImage ? (
            <img
              className="details-cover"
              src={entry.coverImage}
              alt={getDisplayTitle(entry)}
            />
          ) : null}
          <p className="details-source">
            Source: {entry.source} · External ID: {entry.externalId}
          </p>
          <div className="details-genres">
            {(entry.genres || []).map((g) => (
              <span key={g} className="genre-chip">
                {g}
              </span>
            ))}
          </div>
        </aside>
        <div className="details-main">
          <section className="details-summary">
            <span className="modal-kicker">Archive Entry</span>
            <h3>{getDisplayTitle(entry)}</h3>
            <p>{entry.synopsis || "No synopsis available."}</p>
          </section>
          <div className="details-meta-grid">
            {entry.year ? (
              <div className="meta-card">
                <span>Year</span>
                <strong>{entry.year}</strong>
              </div>
            ) : null}
            <div className="meta-card">
              <span>Episodes</span>
              <strong>{entry.episodes || "TBA"}</strong>
            </div>
            <div className="meta-card">
              <span>Progress</span>
              <strong>
                {entry.progressCurrent}
                {entry.progressTotal ? ` / ${entry.progressTotal}` : ""}
              </strong>
            </div>
            <div className="meta-card">
              <span>Source</span>
              <strong>{entry.source === "anilist" ? "AniList" : entry.source}</strong>
            </div>
            {entry.nextAiringAt ? (
              <div className="meta-card">
                <span>Next Air</span>
                <strong>
                  EP {entry.nextAiringEpisode || "?"} ·{" "}
                  {new Date(entry.nextAiringAt).toLocaleDateString("en-GB")}
                </strong>
              </div>
            ) : null}
          </div>
          {entry.notes ? (
            <section className="details-notes">
              <h4>Notes</h4>
              <p>{entry.notes}</p>
            </section>
          ) : null}
          {entry.source === "anilist" ? (
            <section className="details-cast">
              <div className="cast-banner">
                <span className="modal-kicker">Studio Archive</span>
                <h4>Characters & Voice Actors</h4>
                {characters.length > 0 ? (
                  <p className="cast-banner-hint">
                    Click a voice actor to see their other roles.
                  </p>
                ) : null}
              </div>
              {charsLoading ? <p>Loading cast…</p> : null}
              {charsError ? <p className="modal-error">{charsError}</p> : null}
              {!charsLoading && !charsError && characters.length === 0 ? (
                <p>No character data available.</p>
              ) : null}
              <div
                className={`cast-layout ${selectedVa ? "cast-layout-split" : ""}`}
              >
                <div className="cast-table">
                  <div className="cast-table-head" aria-hidden="true">
                    <span>Role</span>
                    <span>Character</span>
                    <span>Voice actor</span>
                  </div>
                  <div className="cast-table-body">
                    {characters.map((line) => {
                      const vaId = line.voiceActor?.id;
                      const isSelected = vaId && selectedVa?.id === vaId;

                      return (
                        <div
                          key={line.character.id}
                          className={`cast-row ${isSelected ? "cast-row-selected" : ""}`}
                        >
                          <span className="role-badge">
                            {line.role === "MAIN" ? "Main" : "Support"}
                          </span>
                          <div className="cast-character-cell">
                            {line.character.image ? (
                              <img
                                src={line.character.image}
                                alt=""
                                className="cast-portrait"
                              />
                            ) : (
                              <div className="cast-portrait cast-portrait-fallback" />
                            )}
                            <span className="cast-name">
                              {line.character.name}
                            </span>
                          </div>
                          {line.voiceActor ? (
                            <button
                              type="button"
                              className={`cast-va-cell ${isSelected ? "cast-va-active" : ""}`}
                              onClick={() => toggleVoiceActor(line.voiceActor)}
                              aria-pressed={isSelected}
                            >
                              {line.voiceActor.image ? (
                                <img
                                  src={line.voiceActor.image}
                                  alt=""
                                  className="cast-portrait"
                                />
                              ) : (
                                <div className="cast-portrait cast-portrait-fallback" />
                              )}
                              <span className="cast-name">
                                {line.voiceActor.name}
                              </span>
                            </button>
                          ) : (
                            <span className="cast-empty-cell">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {selectedVa ? (
                  <aside className="va-roles-dock" aria-live="polite">
                    <div className="va-roles-dock-header">
                      <div className="va-roles-dock-identity">
                        {selectedVa.image ? (
                          <img src={selectedVa.image} alt="" />
                        ) : null}
                        <div>
                          <span className="modal-kicker">Known roles</span>
                          <strong>{selectedVa.name}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="va-roles-dock-close"
                        onClick={() => setSelectedVa(null)}
                        aria-label="Close voice actor roles"
                      >
                        ×
                      </button>
                    </div>
                    {selectedVaState?.status === "loading" ? (
                      <p className="va-roles-panel-hint">Loading roles…</p>
                    ) : null}
                    {selectedVaState?.status === "error" ? (
                      <p className="modal-error">{selectedVaState.error}</p>
                    ) : null}
                    {selectedVaState?.roles?.length ? (
                      <ul className="va-roles-list">
                        {selectedVaState.roles.map((r) => (
                          <li
                            key={`${r.anime.id}-${r.character.id}`}
                            className="va-role-row"
                          >
                            {r.anime.coverImage ? (
                              <img src={r.anime.coverImage} alt="" />
                            ) : (
                              <div className="va-role-thumb-fallback" />
                            )}
                            <div className="va-role-copy">
                              <span className="va-role-character">
                                {r.character.name}
                              </span>
                              <span className="va-role-anime">
                                {r.anime.title}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {selectedVaState?.status === "ok" &&
                    !selectedVaState.roles?.length ? (
                      <p className="va-roles-panel-hint">
                        No additional roles found.
                      </p>
                    ) : null}
                  </aside>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
