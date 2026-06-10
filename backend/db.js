import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { nowIso, mapEntryRow, parseJsonValue } from "./utils.js";

const ENTRY_SORT_SQL = `
  ORDER BY
    CASE category
      WHEN 'watching' THEN 1
      WHEN 'on_hold' THEN 2
      WHEN 'finished' THEN 3
      ELSE 4
    END ASC,
    manual_order ASC,
    updated_at DESC,
    title COLLATE NOCASE ASC
`;

const CATEGORY_SORT_SQL = `
  ORDER BY manual_order ASC, updated_at DESC, title COLLATE NOCASE ASC
`;

function compactCategoryOrders(db, category) {
  const rows = db
    .prepare(
      `SELECT id FROM anime_entries WHERE category = ? ${CATEGORY_SORT_SQL}`
    )
    .all(category);
  const update = db.prepare(
    "UPDATE anime_entries SET manual_order = ? WHERE id = ?"
  );
  const tx = db.transaction(() => {
    rows.forEach((row, index) => {
      update.run(index + 1, row.id);
    });
  });
  tx();
}

export function createDatabase(databaseFile) {
  const dir = path.dirname(databaseFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS anime_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'anilist',
      title TEXT NOT NULL,
      title_english TEXT,
      cover_image TEXT,
      banner_image TEXT,
      year INTEGER,
      episodes INTEGER,
      synopsis TEXT,
      genres TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      rating INTEGER,
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER,
      manual_order INTEGER NOT NULL DEFAULT 0,
      next_airing_at TEXT,
      next_airing_episode INTEGER,
      recent_aired_at TEXT,
      recent_aired_episode INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (source, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_anime_entries_category ON anime_entries (category);
    CREATE INDEX IF NOT EXISTS idx_anime_entries_title ON anime_entries (title);
    CREATE INDEX IF NOT EXISTS idx_anime_entries_updated_at ON anime_entries (updated_at DESC);

    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON api_cache (expires_at);
  `);

  runMigrations(db);
  return db;
}

function runMigrations(db) {
  const columns = db.prepare("PRAGMA table_info(anime_entries)").all();
  const columnNames = new Set(columns.map((c) => c.name));

  const additions = [
    { name: "next_airing_at", sql: "ALTER TABLE anime_entries ADD COLUMN next_airing_at TEXT" },
    { name: "next_airing_episode", sql: "ALTER TABLE anime_entries ADD COLUMN next_airing_episode INTEGER" },
    { name: "recent_aired_at", sql: "ALTER TABLE anime_entries ADD COLUMN recent_aired_at TEXT" },
    { name: "recent_aired_episode", sql: "ALTER TABLE anime_entries ADD COLUMN recent_aired_episode INTEGER" },
    { name: "manual_order", sql: "ALTER TABLE anime_entries ADD COLUMN manual_order INTEGER NOT NULL DEFAULT 0" }
  ];

  let manualOrderAdded = false;
  for (const col of additions) {
    if (!columnNames.has(col.name)) {
      db.exec(col.sql);
      if (col.name === "manual_order") manualOrderAdded = true;
    }
  }

  if (manualOrderAdded) {
    const categories = db
      .prepare("SELECT DISTINCT category FROM anime_entries")
      .all();
    for (const { category } of categories) {
      const rows = db
        .prepare(
          `SELECT id FROM anime_entries WHERE category = ?
           ORDER BY updated_at DESC, title COLLATE NOCASE ASC`
        )
        .all(category);
      const update = db.prepare(
        "UPDATE anime_entries SET manual_order = ? WHERE id = ?"
      );
      rows.forEach((row, index) => {
        update.run(index + 1, row.id);
      });
    }
  }

  const allCategories = db
    .prepare("SELECT DISTINCT category FROM anime_entries")
    .all();
  for (const { category } of allCategories) {
    compactCategoryOrders(db, category);
  }
}

export function listEntries(db) {
  return db
    .prepare(`SELECT * FROM anime_entries ${ENTRY_SORT_SQL}`)
    .all()
    .map(mapEntryRow);
}

export function listEntriesByCategory(db, category) {
  return db
    .prepare(
      `SELECT * FROM anime_entries WHERE category = ? ${CATEGORY_SORT_SQL}`
    )
    .all(category)
    .map(mapEntryRow);
}

export function getEntryById(db, id) {
  const row = db.prepare("SELECT * FROM anime_entries WHERE id = ?").get(id);
  return row ? mapEntryRow(row) : null;
}

export function hasDuplicateEntry(db, source, externalId) {
  const row = db
    .prepare(
      "SELECT id FROM anime_entries WHERE source = ? AND external_id = ?"
    )
    .get(source, externalId);
  return Boolean(row);
}

export function createEntry(db, entry) {
  const now = nowIso();
  const category = entry.category;

  const maxOrder = db
    .prepare(
      "SELECT COALESCE(MAX(manual_order), 0) AS max_order FROM anime_entries WHERE category = ?"
    )
    .get(category);
  const manualOrder = entry.manualOrder ?? maxOrder.max_order + 1;

  const result = db
    .prepare(
      `INSERT INTO anime_entries (
        external_id, source, title, title_english, cover_image, banner_image,
        year, episodes, synopsis, genres, category, notes, rating,
        progress_current, progress_total, manual_order,
        next_airing_at, next_airing_episode, recent_aired_at, recent_aired_episode,
        created_at, updated_at
      ) VALUES (
        @externalId, @source, @title, @titleEnglish, @coverImage, @bannerImage,
        @year, @episodes, @synopsis, @genres, @category, @notes, @rating,
        @progressCurrent, @progressTotal, @manualOrder,
        @nextAiringAt, @nextAiringEpisode, @recentAiredAt, @recentAiredEpisode,
        @createdAt, @updatedAt
      )`
    )
    .run({
      externalId: entry.externalId,
      source: entry.source || "anilist",
      title: entry.title,
      titleEnglish: entry.titleEnglish ?? null,
      coverImage: entry.coverImage ?? null,
      bannerImage: entry.bannerImage ?? null,
      year: entry.year ?? null,
      episodes: entry.episodes ?? null,
      synopsis: entry.synopsis ?? "",
      genres: JSON.stringify(entry.genres || []),
      category,
      notes: entry.notes ?? "",
      rating: entry.rating ?? null,
      progressCurrent: entry.progressCurrent ?? 0,
      progressTotal: entry.progressTotal ?? entry.episodes ?? null,
      manualOrder,
      nextAiringAt: entry.nextAiringAt ?? null,
      nextAiringEpisode: entry.nextAiringEpisode ?? null,
      recentAiredAt: entry.recentAiredAt ?? null,
      recentAiredEpisode: entry.recentAiredEpisode ?? null,
      createdAt: now,
      updatedAt: now
    });

  return getEntryById(db, result.lastInsertRowid);
}

export function updateEntry(db, id, patch) {
  const current = getEntryById(db, id);
  if (!current) return null;

  const merged = { ...current, ...patch };
  const categoryChanged =
    patch.category !== undefined && patch.category !== current.category;
  const progressIncreased =
    patch.progressCurrent !== undefined &&
    patch.progressCurrent > current.progressCurrent;
  const watchingProgressBump =
    !categoryChanged &&
    patch.manualOrder === undefined &&
    current.category === "watching" &&
    progressIncreased;

  let manualOrder = merged.manualOrder;

  if (categoryChanged && patch.manualOrder === undefined) {
    const oldCategory = current.category;
    const newCategory = patch.category;

    db.prepare(
      `UPDATE anime_entries SET manual_order = manual_order - 1
       WHERE category = ? AND manual_order > ?`
    ).run(oldCategory, current.manualOrder);

    db.prepare(
      `UPDATE anime_entries SET manual_order = manual_order + 1 WHERE category = ?`
    ).run(newCategory);

    manualOrder = 1;
  } else if (watchingProgressBump) {
    db.prepare(
      `UPDATE anime_entries SET manual_order = manual_order + 1
       WHERE category = 'watching' AND manual_order < ? AND id != ?`
    ).run(current.manualOrder, id);
    manualOrder = 1;
  }

  db.prepare(
    `UPDATE anime_entries SET
      external_id = @externalId, source = @source, title = @title,
      title_english = @titleEnglish, cover_image = @coverImage,
      banner_image = @bannerImage, year = @year, episodes = @episodes,
      synopsis = @synopsis, genres = @genres, category = @category,
      notes = @notes, rating = @rating, progress_current = @progressCurrent,
      progress_total = @progressTotal, manual_order = @manualOrder,
      next_airing_at = @nextAiringAt, next_airing_episode = @nextAiringEpisode,
      recent_aired_at = @recentAiredAt, recent_aired_episode = @recentAiredEpisode,
      updated_at = @updatedAt
    WHERE id = @id`
  ).run({
    id,
    externalId: merged.externalId,
    source: merged.source,
    title: merged.title,
    titleEnglish: merged.titleEnglish,
    coverImage: merged.coverImage,
    bannerImage: merged.bannerImage,
    year: merged.year,
    episodes: merged.episodes,
    synopsis: merged.synopsis,
    genres: JSON.stringify(merged.genres || []),
    category: merged.category,
    notes: merged.notes,
    rating: merged.rating,
    progressCurrent: merged.progressCurrent,
    progressTotal: merged.progressTotal,
    manualOrder: manualOrder ?? current.manualOrder,
    nextAiringAt: merged.nextAiringAt,
    nextAiringEpisode: merged.nextAiringEpisode,
    recentAiredAt: merged.recentAiredAt,
    recentAiredEpisode: merged.recentAiredEpisode,
    updatedAt: nowIso()
  });

  return getEntryById(db, id);
}

export function deleteEntry(db, id) {
  const current = getEntryById(db, id);
  if (!current) return false;

  db.prepare("DELETE FROM anime_entries WHERE id = ?").run(id);
  compactCategoryOrders(db, current.category);
  return true;
}

export function updateEntryNextAiring(db, id, nextAiring) {
  db.prepare(
    `UPDATE anime_entries SET
      next_airing_at = @nextAiringAt,
      next_airing_episode = @nextAiringEpisode,
      recent_aired_at = @recentAiredAt,
      recent_aired_episode = @recentAiredEpisode
    WHERE id = @id`
  ).run({
    id,
    nextAiringAt: nextAiring.nextAiringAt ?? null,
    nextAiringEpisode: nextAiring.nextAiringEpisode ?? null,
    recentAiredAt: nextAiring.recentAiredAt ?? null,
    recentAiredEpisode: nextAiring.recentAiredEpisode ?? null
  });
}

export function reorderEntriesInCategory(db, category, orderedIds) {
  const update = db.prepare(
    "UPDATE anime_entries SET manual_order = ? WHERE id = ? AND category = ?"
  );
  const tx = db.transaction(() => {
    orderedIds.forEach((entryId, index) => {
      update.run(index + 1, entryId, category);
    });
  });
  tx();
  return listEntriesByCategory(db, category);
}

export function getCachedPayload(db, cacheKey) {
  return db
    .prepare("SELECT * FROM api_cache WHERE cache_key = ?")
    .get(cacheKey);
}

export function parseCachedPayload(cachedRow, fallback) {
  if (!cachedRow) return fallback;
  const now = Date.now();
  if (cachedRow.expires_at <= now) return fallback;
  return parseJsonValue(cachedRow.payload, fallback);
}

export function listCachedPayloadsByPrefix(db, cacheKeyPrefix, limit = 100) {
  return db
    .prepare(
      `SELECT * FROM api_cache WHERE cache_key LIKE ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(`${cacheKeyPrefix}%`, limit);
}

export function pruneExpiredCache(db, now = Date.now()) {
  return db
    .prepare("DELETE FROM api_cache WHERE expires_at <= ?")
    .run(now).changes;
}

export function setCachedPayload(db, cacheKey, payload, expiresAt) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO api_cache (cache_key, payload, expires_at, created_at)
     VALUES (@cacheKey, @payload, @expiresAt, @createdAt)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload = excluded.payload,
       expires_at = excluded.expires_at,
       created_at = excluded.created_at`
  ).run({
    cacheKey,
    payload: JSON.stringify(payload),
    expiresAt,
    createdAt: now
  });
}
