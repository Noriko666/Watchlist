import { nowIso, stripHtml } from "./utils.js";
import {
  getCachedPayload,
  parseCachedPayload,
  setCachedPayload
} from "./db.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const JIKAN_USER_AGENT =
  "Anime Watchlist/1.0 (+https://github.com/Noriko666/Watchlist)";

export async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchJikan({ query, timeoutMs = 12000 }) {
  const url = new URL("https://api.jikan.moe/v4/anime");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("sfw", "true");

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": JIKAN_USER_AGENT
      }
    },
    timeoutMs
  );

  if (!response.ok) return [];
  const payload = await response.json();
  const items = payload?.data || [];

  return items.map((item) => ({
    externalId: item.mal_id,
    source: "mal",
    title:
      item.title ||
      item.title_english ||
      item.title_japanese ||
      "Unknown title",
    titleEnglish: item.title_english || null,
    coverImage:
      item.images?.jpg?.large_image_url ||
      item.images?.jpg?.image_url ||
      item.images?.webp?.large_image_url ||
      item.images?.webp?.image_url ||
      null,
    bannerImage: null,
    year: item.year || item.aired?.prop?.from?.year || null,
    episodes: item.episodes || null,
    synopsis: stripHtml(item.synopsis),
    genres: (item.genres || []).map((g) => g.name).filter(Boolean).slice(0, 10),
    nextAiringEpisode: null,
    nextAiringAt: null
  }));
}

function extractEnglishTitle(html) {
  const spanMatch = html.match(
    /<span class="dark_text">English:<\/span>\s*([^<]+)/i
  );
  if (spanMatch) return spanMatch[1].trim();

  const pMatch = html.match(
    /<p class="title-english title-inherit">([^<]+)<\/p>/i
  );
  if (pMatch) return pMatch[1].trim();

  return null;
}

export async function fetchMalTopAiring({
  db,
  limit = 10,
  timeoutMs = 12000
}) {
  const cacheKey = `mal:top-airing:english:${limit}`;
  const cached = getCachedPayload(db, cacheKey);
  const cachedData = parseCachedPayload(cached, null);
  const cacheTtlMs = 6 * 60 * 60 * 1000;

  try {
    const response = await fetchWithTimeout(
      "https://myanimelist.net/topanime.php?type=airing",
      { headers: { "User-Agent": USER_AGENT } },
      timeoutMs
    );

    if (!response.ok) throw new Error("MAL top airing fetch failed");

    const html = await response.text();
    const rowRegex =
      /<tr class="ranking-list"[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowRegex) || [];

    const items = [];
    for (const row of rows.slice(0, limit)) {
      const rankMatch = row.match(/<span class="lightLink rank"[^>]*>\s*(\d+)/i);
      const linkMatch = row.match(
        /<a[^>]+href="(\/anime\/\d+\/[^"]*)"[^>]*class="hoverinfo"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i
      );
      const scoreMatch = row.match(
        /<td class="score"[^>]*>\s*([\d.]+)/i
      );

      if (!linkMatch) continue;

      const malId = Number.parseInt(linkMatch[1].match(/\/anime\/(\d+)/)?.[1], 10);
      const originalTitle = linkMatch[2].trim();
      const rank = rankMatch ? Number.parseInt(rankMatch[1], 10) : items.length + 1;
      const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : null;
      const url = `https://myanimelist.net${linkMatch[1]}`;

      let englishTitle = null;
      try {
        const detailRes = await fetchWithTimeout(
          url,
          { headers: { "User-Agent": USER_AGENT } },
          timeoutMs
        );
        if (detailRes.ok) {
          const detailHtml = await detailRes.text();
          englishTitle = extractEnglishTitle(detailHtml);
        }
      } catch {
        // skip detail fetch failure
      }

      items.push({
        id: malId,
        rank,
        title: englishTitle || originalTitle,
        originalTitle,
        score,
        url
      });
    }

    const payload = {
      source: "MyAnimeList",
      updatedAt: nowIso(),
      items
    };

    setCachedPayload(db, cacheKey, payload, Date.now() + cacheTtlMs);
    return payload;
  } catch (error) {
    if (cachedData) return cachedData;
    throw error;
  }
}

export async function fetchAnilistTrendingTopAiring({
  db,
  limit = 10,
  timeoutMs = 12000
}) {
  const cacheKey = `anilist:trending-top-airing:${limit}`;
  const cached = getCachedPayload(db, cacheKey);
  const cachedData = parseCachedPayload(cached, null);
  const cacheTtlMs = 6 * 60 * 60 * 1000;

  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, status: RELEASING, isAdult: false, sort: TRENDING_DESC) {
          id
          title { romaji english native }
          averageScore
          popularity
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  try {
    const response = await fetchWithTimeout(
      "https://graphql.anilist.co",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables: { perPage: limit } })
      },
      timeoutMs
    );

    if (!response.ok) throw new Error("AniList trending fetch failed");

    const payload = await response.json();
    const media = payload?.data?.Page?.media || [];

    const items = media.map((item, index) => ({
      id: item.id,
      rank: index + 1,
      url: `https://anilist.co/anime/${item.id}`,
      title:
        item.title?.english ||
        item.title?.romaji ||
        item.title?.native ||
        "Unknown title",
      score: item.averageScore ? item.averageScore / 10 : null,
      averageScore: item.averageScore,
      popularity: item.popularity,
      nextEpisode: item.nextAiringEpisode?.episode || null,
      nextAiringAt: item.nextAiringEpisode?.airingAt
        ? new Date(item.nextAiringEpisode.airingAt * 1000).toISOString()
        : null
    }));

    const result = {
      source: "AniList (trending)",
      updatedAt: nowIso(),
      items
    };

    setCachedPayload(db, cacheKey, result, Date.now() + cacheTtlMs);
    return result;
  } catch (error) {
    if (cachedData) return cachedData;
    throw error;
  }
}
