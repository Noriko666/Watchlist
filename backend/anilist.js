import crypto from "crypto";
import { nowIso, stripHtml } from "./utils.js";
import {
  getCachedPayload,
  parseCachedPayload,
  listCachedPayloadsByPrefix,
  setCachedPayload
} from "./db.js";
import { searchJikan, fetchWithTimeout } from "./mal.js";

const ANILIST_URL = "https://graphql.anilist.co";

function mapAnilistMedia(media) {
  return {
    externalId: media.id,
    source: "anilist",
    title:
      media.title?.romaji ||
      media.title?.english ||
      media.title?.native ||
      "Unknown title",
    titleEnglish: media.title?.english || null,
    coverImage:
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      media.coverImage?.medium ||
      null,
    bannerImage: media.bannerImage || null,
    year: media.seasonYear || media.startDate?.year || null,
    episodes: media.episodes || null,
    synopsis: stripHtml(media.description),
    genres: (media.genres || []).filter(Boolean).slice(0, 10),
    nextAiringEpisode: media.nextAiringEpisode?.episode || null,
    nextAiringAt: media.nextAiringEpisode?.airingAt
      ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
      : null
  };
}

async function anilistQuery(query, variables, timeoutMs) {
  const response = await fetchWithTimeout(
    ANILIST_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ query, variables })
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`AniList request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "AniList GraphQL error");
  }

  return payload.data;
}

export async function searchAnime({
  db,
  query,
  cacheTtlHours = 24,
  timeoutMs = 12000
}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = `anilist:search:${trimmed.toLowerCase()}`;
  const cached = getCachedPayload(db, cacheKey);
  const staleCache = cached ? parseJsonSafe(cached.payload) : null;

  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          seasonYear
          episodes
          startDate { year }
          genres
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  try {
    const data = await anilistQuery(gql, { search: trimmed }, timeoutMs);
    let results = (data?.Page?.media || []).map(mapAnilistMedia);

    if (!results.length) {
      results = await searchJikan({ query: trimmed, timeoutMs });
    }

    if (results.length) {
      setCachedPayload(
        db,
        cacheKey,
        results,
        Date.now() + cacheTtlHours * 60 * 60 * 1000
      );
    }

    return results;
  } catch (error) {
    if (staleCache) return staleCache;
    throw error;
  }
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function fetchNextAiringByIds({ ids, timeoutMs = 12000 }) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const result = new Map();
  if (!uniqueIds.length) return result;

  const gql = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME, isAdult: false) {
          id
          nextAiringEpisode { episode airingAt }
          airingSchedule(perPage: 50) {
            nodes { episode airingAt }
          }
        }
      }
    }
  `;

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const data = await anilistQuery(gql, { ids: batch }, timeoutMs);
    const mediaList = data?.Page?.media || [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const media of mediaList) {
      const nodes = media.airingSchedule?.nodes || [];
      const futureNodes = nodes
        .filter((n) => n.airingAt > nowSec)
        .sort((a, b) => a.airingAt - b.airingAt);
      const pastNodes = nodes
        .filter((n) => n.airingAt <= nowSec)
        .sort((a, b) => b.airingAt - a.airingAt);

      const nextNode = futureNodes[0] || media.nextAiringEpisode;
      const recentNode = pastNodes[0] || null;
      const recentWithinDay =
        recentNode?.airingAt != null &&
        nowSec - recentNode.airingAt < 24 * 60 * 60;

      result.set(media.id, {
        nextAiringEpisode: nextNode?.episode || null,
        nextAiringAt: nextNode?.airingAt
          ? new Date(nextNode.airingAt * 1000).toISOString()
          : null,
        recentAiredEpisode: recentWithinDay ? recentNode.episode : null,
        recentAiredAt:
          recentWithinDay && recentNode?.airingAt
            ? new Date(recentNode.airingAt * 1000).toISOString()
            : null
      });
    }
  }

  return result;
}

export async function fetchAnimeCharactersById({
  db,
  id,
  limit = 6,
  timeoutMs = 12000
}) {
  const cacheKey = `anilist:characters:${id}`;
  const cached = getCachedPayload(db, cacheKey);
  const cachedData = parseCachedPayload(cached, null);
  const cacheTtlMs = 24 * 60 * 60 * 1000;

  const gql = `
    query ($id: Int, $limit: Int) {
      Media(id: $id, type: ANIME) {
        characters(sort: [ROLE, RELEVANCE, ID], perPage: $limit) {
          edges {
            role
            node {
              id
              name { full }
              image { large medium }
            }
            voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
              id
              name { full }
              image { large medium }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await anilistQuery(gql, { id, limit }, timeoutMs);
    const edges = data?.Media?.characters?.edges || [];

    const characters = edges.map((edge) => {
      const va = edge.voiceActors?.[0];
      return {
        role: edge.role,
        character: {
          id: edge.node.id,
          name: edge.node.name?.full || "Unknown",
          image: edge.node.image?.large || edge.node.image?.medium || null
        },
        voiceActor: va
          ? {
              id: va.id,
              name: va.name?.full || "Unknown",
              image: va.image?.large || va.image?.medium || null
            }
          : null
      };
    });

    setCachedPayload(db, cacheKey, characters, Date.now() + cacheTtlMs);
    return characters;
  } catch (error) {
    if (cachedData) return cachedData;
    throw error;
  }
}

export async function fetchVoiceActorTopRolesById({
  db,
  id,
  timeoutMs = 12000
}) {
  const cacheKey = `anilist:voice-actor-roles:${id}`;
  const cached = getCachedPayload(db, cacheKey);
  const cachedData = parseCachedPayload(cached, null);
  const cacheTtlMs = 24 * 60 * 60 * 1000;

  const gql = `
    query ($id: Int) {
      Staff(id: $id) {
        characters(perPage: 25, sort: RELEVANCE) {
          edges {
            role
            node {
              id
              name { full }
              image { large medium }
              media(perPage: 1, sort: POPULARITY_DESC) {
                nodes {
                  id
                  title { romaji english }
                  coverImage { medium }
                  averageScore
                  popularity
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await anilistQuery(gql, { id }, timeoutMs);
    const edges = data?.Staff?.characters?.edges || [];

    const roles = edges
      .map((edge) => {
        const anime = edge.node.media?.nodes?.[0];
        if (!anime) return null;
        return {
          role: edge.role,
          character: {
            id: edge.node.id,
            name: edge.node.name?.full || "Unknown",
            image: edge.node.image?.large || edge.node.image?.medium || null
          },
          anime: {
            id: anime.id,
            title:
              anime.title?.english ||
              anime.title?.romaji ||
              "Unknown",
            coverImage: anime.coverImage?.medium || null,
            averageScore: anime.averageScore,
            popularity: anime.popularity
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.anime.popularity || 0) - (a.anime.popularity || 0))
      .slice(0, 12);

    setCachedPayload(db, cacheKey, roles, Date.now() + cacheTtlMs);
    return roles;
  } catch (error) {
    if (cachedData) return cachedData;
    throw error;
  }
}

const EXCLUDED_TAG_CATEGORIES = new Set([
  "Cast-Main Cast",
  "Demographic",
  "Technical"
]);
const EXCLUDED_TAG_NAMES = new Set([
  "Male Protagonist",
  "Female Protagonist",
  "Urban"
]);

function normalizeFranchiseTitle(title) {
  let t = (title || "").toLowerCase();
  t = t.replace(/&/g, "and");
  const removeWords = [
    "season", "cour", "part", "chapter", "arc", "final season",
    "tv", "ova", "ona", "movie", "special", "complete edition", "directors cut"
  ];
  for (const word of removeWords) {
    t = t.replace(new RegExp(`\\b${word}\\b`, "gi"), " ");
  }
  t = t.replace(/[0-9]+/g, " ");
  t = t.replace(/\b[ivxlcdm]+\b/gi, " ");
  t = t.replace(/[^\w\s]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function isSameFranchise(a, b) {
  const na = normalizeFranchiseTitle(a);
  const nb = normalizeFranchiseTitle(b);
  if (!na || !nb) return false;
  if (na === nb || na.startsWith(nb) || nb.startsWith(na)) return true;

  const tokensA = new Set(na.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 2));
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const ratio = overlap / Math.max(tokensA.size, tokensB.size, 1);
  return overlap >= 2 && ratio >= 0.67;
}

function getUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function fetchAnimeOfDayRecommendation({
  db,
  entries,
  dateKey,
  cacheTtlHours = 12,
  timeoutMs = 12000
}) {
  const sourceEntries = entries.filter(
    (e) =>
      e.source === "anilist" &&
      ["watching", "on_hold", "canceled"].includes(e.category)
  );

  if (!sourceEntries.length) return null;

  const validDateKey =
    dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey
      : getUtcDateKey();

  const fingerprint = sourceEntries
    .map((e) => `${e.externalId}:${e.category}:${e.updatedAt}`)
    .sort()
    .join("|");

  const cacheKey = `anilist:anime-of-day:${validDateKey}:${crypto
    .createHash("sha1")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 12)}`;

  const cached = getCachedPayload(db, cacheKey);
  const cachedData = parseCachedPayload(cached, null);

  try {
    const profileGql = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(id_in: $ids, type: ANIME) {
            id
            genres
            tags { name rank category isMediaSpoiler }
          }
        }
      }
    `;

    const ids = sourceEntries.map((e) => e.externalId);
    const profileData = await anilistQuery(
      profileGql,
      { ids: ids.slice(0, 50) },
      timeoutMs
    );
    const profileMedia = profileData?.Page?.media || [];
    const profileMap = new Map(profileMedia.map((m) => [m.id, m]));

    const genreWeights = new Map();
    const tagWeights = new Map();

    for (const entry of sourceEntries) {
      const weight = entry.category === "watching" ? 2.4 : 1.5;
      const profile = profileMap.get(entry.externalId);
      const genres = [
        ...(entry.genres || []),
        ...(profile?.genres || [])
      ];
      for (const g of genres) {
        genreWeights.set(g, (genreWeights.get(g) || 0) + weight);
      }

      for (const tag of profile?.tags || []) {
        if (!tag.name || tag.isMediaSpoiler) continue;
        if ((tag.rank || 0) < 60) continue;
        if (EXCLUDED_TAG_CATEGORIES.has(tag.category)) continue;
        if (EXCLUDED_TAG_NAMES.has(tag.name)) continue;
        tagWeights.set(tag.name, (tagWeights.get(tag.name) || 0) + weight);
      }
    }

    const topGenres = [...genreWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    const topTags = [...tagWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name]) => name);

    const excludeIds = entries
      .filter((e) => e.source === "anilist")
      .map((e) => e.externalId);

    const candidateGql = `
      query ($page: Int, $perPage: Int, $genreIn: [String], $tagIn: [String], $idNotIn: [Int]) {
        Page(page: $page, perPage: $perPage) {
          media(
            type: ANIME, isAdult: false, status_not_in: [NOT_YET_RELEASED],
            genre_in: $genreIn, tag_in: $tagIn, id_not_in: $idNotIn,
            sort: [POPULARITY_DESC, SCORE_DESC]
          ) {
            id
            title { romaji english native }
            coverImage { extraLarge large }
            bannerImage
            seasonYear
            episodes
            startDate { year }
            description(asHtml: false)
            genres
            averageScore
            popularity
            status
            nextAiringEpisode { episode airingAt }
            tags { name rank category isMediaSpoiler }
          }
        }
      }
    `;

    const candidateMap = new Map();
    const queries = [
      { page: 1, perPage: 25, genreIn: null, tagIn: null, pages: 4 },
      ...topGenres.slice(0, 2).map((g) => ({
        page: 1,
        perPage: 20,
        genreIn: [g],
        tagIn: null,
        pages: 1
      })),
      ...topTags.slice(0, 2).map((t) => ({
        page: 1,
        perPage: 20,
        genreIn: null,
        tagIn: [t],
        pages: 1
      }))
    ];

    for (const q of queries) {
      for (let p = 0; p < q.pages; p++) {
        const data = await anilistQuery(
          candidateGql,
          {
            page: q.page + p,
            perPage: q.perPage,
            genreIn: q.genreIn,
            tagIn: q.tagIn,
            idNotIn: excludeIds
          },
          timeoutMs
        );
        for (const media of data?.Page?.media || []) {
          if (!candidateMap.has(media.id)) {
            candidateMap.set(media.id, media);
          }
        }
        if (candidateMap.size >= 100) break;
      }
      if (candidateMap.size >= 100) break;
    }

    let candidates = [...candidateMap.values()];

    const watchlistTitles = sourceEntries.map((e) => e.title);
    const filtered = candidates.filter(
      (c) =>
        !watchlistTitles.some((t) =>
          isSameFranchise(
            t,
            c.title?.english || c.title?.romaji || ""
          )
        )
    );
    const franchiseFilterApplied = filtered.length >= 6;
    if (franchiseFilterApplied) candidates = filtered;

    const recentCaches = listCachedPayloadsByPrefix(
      db,
      "anilist:anime-of-day:",
      14
    );
    const sevenDayIds = new Set();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const row of recentCaches) {
      const created = new Date(row.created_at).getTime();
      if (created < sevenDaysAgo) continue;
      const parsed = parseJsonSafe(row.payload);
      if (parsed?.externalId) sevenDayIds.add(parsed.externalId);
    }

    let lockoutApplied = false;
    const withoutLockout = candidates.filter(
      (c) => !sevenDayIds.has(c.id)
    );
    if (withoutLockout.length > 0) {
      candidates = withoutLockout;
      lockoutApplied = true;
    }

    const scored = candidates
      .map((media) => {
        const matchedGenres = (media.genres || [])
          .filter((g) => genreWeights.has(g))
          .map((g) => ({ name: g, weight: genreWeights.get(g) }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 4);

        const matchedTags = (media.tags || [])
          .filter(
            (t) =>
              t.name &&
              !t.isMediaSpoiler &&
              tagWeights.has(t.name)
          )
          .map((t) => ({
            name: t.name,
            weight: tagWeights.get(t.name),
            rank: t.rank || 50
          }))
          .sort((a, b) => b.weight * b.rank - a.weight * a.rank)
          .slice(0, 5);

        const genreScore = matchedGenres.reduce(
          (sum, g) => sum + g.weight * 9,
          0
        );
        const tagScore = matchedTags.reduce(
          (sum, t) => sum + t.weight * Math.max(t.rank, 50) * 0.14,
          0
        );
        const overlapBonus =
          matchedGenres.length * 5 + matchedTags.length * 4;
        const ratingBonus = (media.averageScore || 0) * 0.1;
        const popularityBonus =
          (Math.min(media.popularity || 0, 500000) / 500000) * 2;
        const airingBonus = media.status === "RELEASING" ? 2 : 0;
        const score =
          genreScore +
          tagScore +
          overlapBonus +
          ratingBonus +
          popularityBonus +
          airingBonus;

        return { media, score, matchedGenres, matchedTags };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.media.popularity || 0) !== (a.media.popularity || 0)) {
          return (b.media.popularity || 0) - (a.media.popularity || 0);
        }
        if ((b.media.averageScore || 0) !== (a.media.averageScore || 0)) {
          return (b.media.averageScore || 0) - (a.media.averageScore || 0);
        }
        return a.media.id - b.media.id;
      });

    if (!scored.length) {
      if (cachedData) return cachedData;
      throw new Error("No recommendation candidates found");
    }

    const pool = scored.slice(0, 12);
    const hash = crypto
      .createHash("sha1")
      .update(`${validDateKey}:${fingerprint}`)
      .digest();
    const index =
      hash.readUInt32BE(0) % pool.length;
    const pick = pool[index];
    const media = pick.media;

    const result = {
      externalId: media.id,
      source: "anilist",
      title:
        media.title?.romaji ||
        media.title?.english ||
        media.title?.native ||
        "Unknown title",
      titleEnglish: media.title?.english || null,
      coverImage:
        media.coverImage?.extraLarge ||
        media.coverImage?.large ||
        null,
      bannerImage: media.bannerImage || null,
      year: media.seasonYear || media.startDate?.year || null,
      episodes: media.episodes || null,
      synopsis: stripHtml(media.description),
      genres: (media.genres || []).slice(0, 10),
      tags: (media.tags || [])
        .filter((t) => t.name && !t.isMediaSpoiler)
        .map((t) => t.name)
        .slice(0, 10),
      averageScore: media.averageScore,
      popularity: media.popularity,
      status: media.status,
      nextAiringEpisode: media.nextAiringEpisode?.episode || null,
      nextAiringAt: media.nextAiringEpisode?.airingAt
        ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
        : null,
      url: `https://anilist.co/anime/${media.id}`,
      score: pick.score,
      matchedGenres: pick.matchedGenres.map((g) => g.name),
      matchedTags: pick.matchedTags.map((t) => t.name),
      sevenDayLockoutApplied: lockoutApplied,
      franchiseFilterApplied,
      recommendationPoolSize: pool.length,
      profileGenres: topGenres,
      profileTags: topTags,
      generatedAt: nowIso()
    };

    setCachedPayload(
      db,
      cacheKey,
      result,
      Date.now() + cacheTtlHours * 60 * 60 * 1000
    );

    return result;
  } catch (error) {
    if (cachedData) return cachedData;

    const olderCaches = listCachedPayloadsByPrefix(
      db,
      "anilist:anime-of-day:",
      30
    );
    for (const row of olderCaches) {
      const parsed = parseJsonSafe(row.payload);
      if (parsed?.externalId) {
        return { ...parsed, staleRecommendation: true };
      }
    }

    throw error;
  }
}
