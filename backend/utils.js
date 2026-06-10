import { CATEGORY_ORDER } from "./constants.js";

export function nowIso() {
  return new Date().toISOString();
}

export function isValidCategory(category) {
  return CATEGORY_ORDER.includes(category);
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

export function normalizeInteger(value, { min, max, allowNull = false } = {}) {
  if (value === null || value === undefined || value === "") {
    return allowNull ? null : 0;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return allowNull ? null : 0;
  }
  if (min !== undefined && parsed < min) return allowNull ? null : min;
  if (max !== undefined && parsed > max) return allowNull ? null : max;
  return parsed;
}

export function parseGenres(value) {
  let genres = [];
  if (Array.isArray(value)) {
    genres = value;
  } else if (typeof value === "string") {
    genres = value.split(",");
  }
  return genres
    .map((g) => normalizeText(g))
    .filter(Boolean)
    .slice(0, 10);
}

export function stripHtml(html) {
  if (!html) return "";
  let text = String(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  const entities = {
    "&amp;": "&",
    "&quot;": '"',
    "&#039;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&mdash;": "—",
    "&nbsp;": " "
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.split(entity).join(char);
  }
  return text.replace(/\s+/g, " ").trim();
}

export function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseJsonArray(value, fallback = []) {
  const parsed = parseJsonValue(value, fallback);
  return Array.isArray(parsed) ? parsed : fallback;
}

export function mapEntryRow(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    source: row.source,
    title: row.title,
    titleEnglish: row.title_english,
    coverImage: row.cover_image,
    bannerImage: row.banner_image,
    year: row.year,
    episodes: row.episodes,
    synopsis: row.synopsis,
    genres: parseJsonArray(row.genres),
    category: row.category,
    notes: row.notes,
    rating: row.rating,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    manualOrder: row.manual_order,
    nextAiringAt: row.next_airing_at,
    nextAiringEpisode: row.next_airing_episode,
    recentAiredAt: row.recent_aired_at,
    recentAiredEpisode: row.recent_aired_episode,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
