import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import {
  createDatabase,
  listEntries,
  listEntriesByCategory,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryNextAiring,
  reorderEntriesInCategory,
  hasDuplicateEntry,
  pruneExpiredCache
} from "./db.js";
import {
  nowIso,
  isValidCategory,
  normalizeText,
  normalizeNullableText,
  normalizeInteger,
  parseGenres,
  stripHtml
} from "./utils.js";
import {
  searchAnime,
  fetchNextAiringByIds,
  fetchAnimeCharactersById,
  fetchVoiceActorTopRolesById,
  fetchAnimeOfDayRecommendation
} from "./anilist.js";
import {
  fetchMalTopAiring,
  fetchAnilistTrendingTopAiring
} from "./mal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

const PORT = Number.parseInt(process.env.PORT || "4310", 10);
const HOST = process.env.HOST || "127.0.0.1";
const DATABASE_FILE = process.env.DATABASE_FILE || "./data/watchlist.sqlite";
const NODE_ENV = process.env.NODE_ENV || "production";
const CACHE_TTL_HOURS = Number.parseInt(process.env.CACHE_TTL_HOURS || "24", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.REQUEST_TIMEOUT_MS || "12000",
  10
);
const NEXT_AIRING_REFRESH_TTL_MS = Math.max(
  60000,
  Number.parseInt(process.env.NEXT_AIRING_REFRESH_TTL_MS || "900000", 10)
);
const TRUST_PROXY = process.env.TRUST_PROXY || "loopback";
const WATCHLIST_PASSWORD = process.env.WATCHLIST_PASSWORD || "";
const WATCHLIST_SESSION_SECRET = process.env.WATCHLIST_SESSION_SECRET || "";
const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "watchlist_session";
const SESSION_COOKIE_PATH = process.env.SESSION_COOKIE_PATH || "/";
const AUTH_RATE_WINDOW_MS = Number.parseInt(
  process.env.AUTH_RATE_WINDOW_MS || "60000",
  10
);
const AUTH_RATE_MAX_REQUESTS = Number.parseInt(
  process.env.AUTH_RATE_MAX_REQUESTS || "20",
  10
);
const AUTH_FAILURE_LOCKOUT_WINDOW_MS = Number.parseInt(
  process.env.AUTH_FAILURE_LOCKOUT_WINDOW_MS || "300000",
  10
);
const AUTH_FAILURE_MAX_ATTEMPTS = Number.parseInt(
  process.env.AUTH_FAILURE_MAX_ATTEMPTS || "6",
  10
);
const AUTH_LOCKOUT_DURATION_MS = Number.parseInt(
  process.env.AUTH_LOCKOUT_DURATION_MS || "900000",
  10
);
const AUTH_FAILURE_DELAY_MS = Number.parseInt(
  process.env.AUTH_FAILURE_DELAY_MS || "250",
  10
);
const AUTH_FAILURE_MAX_DELAY_MS = Number.parseInt(
  process.env.AUTH_FAILURE_MAX_DELAY_MS || "1200",
  10
);

const authEnabled = WATCHLIST_PASSWORD.length > 0;

if (authEnabled && !WATCHLIST_SESSION_SECRET) {
  console.error("WATCHLIST_SESSION_SECRET must be set when password is set.");
  process.exit(1);
}
if (
  authEnabled &&
  WATCHLIST_SESSION_SECRET === WATCHLIST_PASSWORD
) {
  console.error("WATCHLIST_SESSION_SECRET must not equal WATCHLIST_PASSWORD.");
  process.exit(1);
}
if (
  authEnabled &&
  WATCHLIST_SESSION_SECRET === "change-me-before-public-use"
) {
  console.error("WATCHLIST_SESSION_SECRET is still the placeholder value.");
  process.exit(1);
}
if (NODE_ENV === "production" && !authEnabled) {
  console.warn("Warning: WATCHLIST_PASSWORD is not set in production.");
}

const dbPath = path.isAbsolute(DATABASE_FILE)
  ? DATABASE_FILE
  : path.join(projectRoot, DATABASE_FILE);
const db = createDatabase(dbPath);
const distDir = path.join(projectRoot, "dist");

let lastAiringRefreshAt = 0;
let airingRefreshRunning = false;

pruneExpiredCache(db);
setInterval(() => pruneExpiredCache(db), 5 * 60 * 1000);

const authStates = new Map();

setInterval(() => {
  const now = Date.now();
  const idleMs = 10 * 60 * 1000;
  for (const [ip, state] of authStates.entries()) {
    if (now - state.lastSeenAt > idleMs) {
      authStates.delete(ip);
    }
  }
}, 60000);

function jsonOk(res, data, status = 200) {
  return res.status(status).json({ data });
}

function jsonError(res, message, status = 400) {
  return res.status(status).json({ error: { message } });
}

function setApiCacheHeaders(res) {
  res.set({
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    Vary: "Cookie"
  });
}

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getAuthState(ip) {
  if (!authStates.has(ip)) {
    authStates.set(ip, {
      requestTimestamps: [],
      failureTimestamps: [],
      consecutiveFailures: 0,
      lockedUntil: 0,
      lastSeenAt: Date.now()
    });
  }
  const state = authStates.get(ip);
  state.lastSeenAt = Date.now();
  return state;
}

function createSessionToken() {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", WATCHLIST_SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !authEnabled) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expected = crypto
    .createHmac("sha256", WATCHLIST_SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now();
  } catch {
    return false;
  }
}

function isAuthenticated(req) {
  if (!authEnabled) return true;
  const token = parseCookie(req);
  return verifySessionToken(token);
}

function parseCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parts = header.split(";").map((c) => c.trim());
  for (const part of parts) {
    const [name, ...rest] = part.split("=");
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function setSessionCookie(res, req) {
  const token = createSessionToken();
  const secure = req.secure || req.protocol === "https";
  let cookie = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=${SESSION_COOKIE_PATH}; SameSite=Lax; Max-Age=2592000`;
  if (secure) cookie += "; Secure";
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=${SESSION_COOKIE_PATH}; SameSite=Lax; Max-Age=0`
  );
}

function requireAuth(req, res, next) {
  if (!authEnabled) return next();
  if (isAuthenticated(req)) return next();
  return jsonError(res, "Authentication required.", 401);
}

function validateEntryPayload(body, { partial = false } = {}) {
  const errors = [];
  const result = {};

  if (!partial || body.externalId !== undefined) {
    const externalId = normalizeInteger(body.externalId, { min: 1 });
    if (!externalId) errors.push("externalId is required.");
    else result.externalId = externalId;
  }

  if (!partial || body.source !== undefined) {
    result.source = normalizeText(body.source || "anilist").toLowerCase() || "anilist";
  }

  if (!partial || body.title !== undefined) {
    const title = normalizeText(body.title);
    if (!title) errors.push("title is required.");
    else result.title = title;
  }

  if (!partial || body.titleEnglish !== undefined) {
    result.titleEnglish = normalizeNullableText(body.titleEnglish);
  }
  if (!partial || body.coverImage !== undefined) {
    result.coverImage = normalizeNullableText(body.coverImage);
  }
  if (!partial || body.bannerImage !== undefined) {
    result.bannerImage = normalizeNullableText(body.bannerImage);
  }
  if (!partial || body.year !== undefined) {
    result.year = normalizeInteger(body.year, {
      min: 1900,
      max: 2100,
      allowNull: true
    });
  }
  if (!partial || body.episodes !== undefined) {
    result.episodes = normalizeInteger(body.episodes, {
      min: 1,
      max: 5000,
      allowNull: true
    });
  }
  if (!partial || body.synopsis !== undefined) {
    result.synopsis = stripHtml(body.synopsis || "");
  }
  if (!partial || body.genres !== undefined) {
    result.genres = parseGenres(body.genres);
  }
  if (!partial || body.category !== undefined) {
    if (!isValidCategory(body.category)) errors.push("Invalid category.");
    else result.category = body.category;
  }
  if (!partial || body.notes !== undefined) {
    result.notes = String(body.notes ?? "");
  }
  if (!partial || body.rating !== undefined) {
    result.rating = normalizeInteger(body.rating, {
      min: 1,
      max: 10,
      allowNull: true
    });
  }
  if (!partial || body.progressCurrent !== undefined) {
    result.progressCurrent = normalizeInteger(body.progressCurrent, {
      min: 0,
      max: 5000
    });
  }
  if (!partial || body.progressTotal !== undefined) {
    result.progressTotal = normalizeInteger(body.progressTotal, {
      min: 1,
      max: 5000,
      allowNull: true
    });
  }
  if (!partial || body.nextAiringEpisode !== undefined) {
    result.nextAiringEpisode = normalizeInteger(body.nextAiringEpisode, {
      min: 1,
      max: 5000,
      allowNull: true
    });
  }
  if (!partial || body.nextAiringAt !== undefined) {
    result.nextAiringAt = normalizeNullableText(body.nextAiringAt);
  }

  return { errors, result };
}

async function refreshNextAiring() {
  if (airingRefreshRunning) return;
  if (Date.now() - lastAiringRefreshAt < NEXT_AIRING_REFRESH_TTL_MS) return;

  airingRefreshRunning = true;
  lastAiringRefreshAt = Date.now();

  try {
    const entries = listEntries(db).filter(
      (e) =>
        e.source === "anilist" &&
        ["watching", "on_hold"].includes(e.category)
    );
    const ids = entries.map((e) => e.externalId);
    if (!ids.length) return;

    const airingMap = await fetchNextAiringByIds({
      ids,
      timeoutMs: REQUEST_TIMEOUT_MS
    });

    for (const entry of entries) {
      const airing = airingMap.get(entry.externalId);
      if (airing) {
        updateEntryNextAiring(db, entry.id, airing);
      }
    }
  } catch (error) {
    console.error("Next airing refresh failed:", error.message);
  } finally {
    airingRefreshRunning = false;
  }
}

const app = express();
app.set("trust proxy", TRUST_PROXY);
app.disable("x-powered-by");
app.use(
  helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false })
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("combined"));

app.use((req, res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    setApiCacheHeaders(res);
  }
  next();
});

app.get("/api/health", (req, res) => {
  jsonOk(res, { status: "ok", timestamp: nowIso() });
});

app.get("/api/auth/session", (req, res) => {
  jsonOk(res, {
    authEnabled,
    authenticated: isAuthenticated(req)
  });
});

app.post("/api/auth/login", async (req, res) => {
  if (!authEnabled) {
    return jsonOk(res, { authEnabled: false, authenticated: true });
  }

  const ip = getClientIp(req);
  const state = getAuthState(ip);
  const now = Date.now();

  state.requestTimestamps = state.requestTimestamps.filter(
    (t) => now - t < AUTH_RATE_WINDOW_MS
  );
  state.failureTimestamps = state.failureTimestamps.filter(
    (t) => now - t < AUTH_FAILURE_LOCKOUT_WINDOW_MS
  );

  if (state.lockedUntil > now) {
    const retryAfter = Math.ceil((state.lockedUntil - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return jsonError(res, "Too many failed attempts. Try again later.", 429);
  }

  if (state.requestTimestamps.length >= AUTH_RATE_MAX_REQUESTS) {
    const oldest = state.requestTimestamps[0];
    const retryAfter = Math.ceil(
      (AUTH_RATE_WINDOW_MS - (now - oldest)) / 1000
    );
    res.set("Retry-After", String(retryAfter));
    return jsonError(res, "Too many login requests. Try again later.", 429);
  }

  state.requestTimestamps.push(now);

  const password = String(req.body?.password ?? "");
  const expected = WATCHLIST_PASSWORD;

  const lengthMatch = password.length === expected.length;
  const passwordMatch =
    lengthMatch &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));

  if (!passwordMatch) {
    state.consecutiveFailures += 1;
    state.failureTimestamps.push(now);

    const delay =
      Math.min(
        AUTH_FAILURE_DELAY_MS * (state.consecutiveFailures + 1) +
          Math.floor(Math.random() * 120),
        AUTH_FAILURE_MAX_DELAY_MS
      );
    await new Promise((r) => setTimeout(r, delay));

    if (state.failureTimestamps.length >= AUTH_FAILURE_MAX_ATTEMPTS) {
      state.lockedUntil = now + AUTH_LOCKOUT_DURATION_MS;
      const retryAfter = Math.ceil(AUTH_LOCKOUT_DURATION_MS / 1000);
      res.set("Retry-After", String(retryAfter));
      return jsonError(res, "Too many failed attempts. Account locked.", 429);
    }

    const remaining =
      AUTH_FAILURE_MAX_ATTEMPTS - state.failureTimestamps.length;
    return jsonError(
      res,
      `Invalid PIN. ${remaining} attempt(s) remaining.`,
      401
    );
  }

  state.consecutiveFailures = 0;
  state.failureTimestamps = [];
  state.lockedUntil = 0;
  setSessionCookie(res, req);
  return jsonOk(res, { authEnabled: true, authenticated: true });
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get("/api/anime", requireAuth, (req, res) => {
  const entries = listEntries(db);
  jsonOk(res, entries);
  setImmediate(() => refreshNextAiring());
});

app.get("/api/anime/:id", requireAuth, (req, res) => {
  const id = normalizeInteger(req.params.id, { min: 1 });
  const entry = getEntryById(db, id);
  if (!entry) return jsonError(res, "Entry not found.", 404);
  jsonOk(res, entry);
});

app.get("/api/anime/:id/characters", requireAuth, async (req, res) => {
  const id = normalizeInteger(req.params.id, { min: 1 });
  const entry = getEntryById(db, id);
  if (!entry) return jsonError(res, "Entry not found.", 404);
  if (entry.source !== "anilist") return jsonOk(res, []);

  try {
    const characters = await fetchAnimeCharactersById({
      db,
      id: entry.externalId,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    jsonOk(res, characters);
  } catch {
    jsonError(res, "Failed to fetch character data.", 502);
  }
});

app.get("/api/staff/:id/top-roles", requireAuth, async (req, res) => {
  const id = normalizeInteger(req.params.id, { min: 1 });
  if (!id) return jsonError(res, "Invalid staff ID.", 400);

  try {
    const roles = await fetchVoiceActorTopRolesById({
      db,
      id,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    jsonOk(res, roles);
  } catch {
    jsonError(res, "Failed to fetch voice actor roles.", 502);
  }
});

app.post("/api/anime", requireAuth, (req, res) => {
  const { errors, result } = validateEntryPayload(req.body);
  if (errors.length) return jsonError(res, errors.join(" "), 400);

  if (
    result.progressTotal !== null &&
    result.progressTotal !== undefined &&
    result.progressCurrent > result.progressTotal
  ) {
    return jsonError(res, "progressCurrent cannot exceed progressTotal.", 400);
  }

  if (result.progressTotal === undefined) {
    result.progressTotal = result.episodes || null;
  }

  if (
    hasDuplicateEntry(db, result.source, result.externalId)
  ) {
    return jsonError(res, "This anime is already in the watchlist.", 409);
  }

  const entry = createEntry(db, result);
  jsonOk(res, entry, 201);
});

app.patch("/api/anime/:id", requireAuth, (req, res) => {
  const id = normalizeInteger(req.params.id, { min: 1 });
  const current = getEntryById(db, id);
  if (!current) return jsonError(res, "Entry not found.", 404);

  const { errors, result } = validateEntryPayload(req.body, { partial: true });
  if (errors.length) return jsonError(res, errors.join(" "), 400);

  const merged = { ...current, ...result };
  if (
    merged.progressTotal !== null &&
    merged.progressCurrent > merged.progressTotal
  ) {
    return jsonError(res, "progressCurrent cannot exceed progressTotal.", 400);
  }

  const updated = updateEntry(db, id, result);
  jsonOk(res, updated);
});

app.post("/api/anime/reorder", requireAuth, (req, res) => {
  const category = req.body?.category;
  const orderedIds = req.body?.orderedIds;

  if (!isValidCategory(category)) {
    return jsonError(res, "Invalid category.", 400);
  }
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    return jsonError(res, "orderedIds must be a non-empty array.", 400);
  }

  const categoryEntries = listEntriesByCategory(db, category);
  const categoryIds = new Set(categoryEntries.map((e) => e.id));
  const parsedIds = orderedIds.map((id) => normalizeInteger(id, { min: 1 }));

  if (parsedIds.length !== categoryEntries.length) {
    return jsonError(res, "orderedIds must include all entries in category.", 400);
  }

  for (const entryId of parsedIds) {
    if (!categoryIds.has(entryId)) {
      return jsonError(res, "orderedIds contains invalid entry.", 400);
    }
  }

  const unique = new Set(parsedIds);
  if (unique.size !== parsedIds.length) {
    return jsonError(res, "orderedIds contains duplicates.", 400);
  }

  const updated = reorderEntriesInCategory(db, category, parsedIds);
  jsonOk(res, updated);
});

app.delete("/api/anime/:id", requireAuth, (req, res) => {
  const id = normalizeInteger(req.params.id, { min: 1 });
  const deleted = deleteEntry(db, id);
  if (!deleted) return jsonError(res, "Entry not found.", 404);
  res.status(204).end();
});

app.get("/api/search", requireAuth, async (req, res) => {
  const query = normalizeText(req.query.query || "");
  if (query.length < 2) return jsonOk(res, []);

  try {
    const results = await searchAnime({
      db,
      query,
      cacheTtlHours: CACHE_TTL_HOURS,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    jsonOk(res, results);
  } catch {
    jsonError(
      res,
      "The anime API is currently unavailable. Please try again in a moment.",
      502
    );
  }
});

app.get("/api/anime-of-the-day", requireAuth, async (req, res) => {
  const dateKey = req.query.date;
  try {
    const entries = listEntries(db);
    const recommendation = await fetchAnimeOfDayRecommendation({
      db,
      entries,
      dateKey,
      cacheTtlHours: 12,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    jsonOk(res, recommendation);
  } catch {
    jsonError(res, "Failed to generate anime of the day.", 502);
  }
});

async function handleTopAiring(req, res) {
  const scopeParam = req.params.scope || req.query.scope || "airing";
  const scope =
    scopeParam === "24h" || scopeParam === "trending24h" ? "24h" : "airing";

  try {
    const payload =
      scope === "24h"
        ? await fetchAnilistTrendingTopAiring({
            db,
            limit: 10,
            timeoutMs: REQUEST_TIMEOUT_MS
          })
        : await fetchMalTopAiring({
            db,
            limit: 10,
            timeoutMs: REQUEST_TIMEOUT_MS
          });
    jsonOk(res, payload);
  } catch (error) {
    jsonError(res, error.message || "Failed to fetch top airing.", 502);
  }
}

app.get("/api/season-top-airing", requireAuth, handleTopAiring);
app.get("/api/season-top-airing/:scope", requireAuth, handleTopAiring);

app.get("/api/export", requireAuth, (req, res) => {
  const entries = listEntries(db);
  res.set({
    "Content-Type": "application/json",
    "Content-Disposition": 'attachment; filename="watchlist-export.json"'
  });
  res.json({
    version: 1,
    exportedAt: nowIso(),
    entries
  });
});

app.post("/api/import", requireAuth, (req, res) => {
  const importEntries = req.body?.entries;
  if (!Array.isArray(importEntries)) {
    return jsonError(res, "entries array is required.", 400);
  }

  let imported = 0;
  let skipped = 0;
  const created = [];

  const tx = db.transaction(() => {
    for (const item of importEntries) {
      const { errors, result } = validateEntryPayload(item);
      if (errors.length) {
        skipped++;
        continue;
      }
      if (hasDuplicateEntry(db, result.source, result.externalId)) {
        skipped++;
        continue;
      }
      if (
        result.progressTotal !== null &&
        result.progressCurrent > result.progressTotal
      ) {
        skipped++;
        continue;
      }
      if (result.progressTotal === undefined) {
        result.progressTotal = result.episodes || null;
      }
      try {
        const entry = createEntry(db, result);
        created.push(entry);
        imported++;
      } catch {
        skipped++;
      }
    }
  });
  tx();

  jsonOk(res, { imported, skipped, entries: listEntries(db) });
});

app.use("/api", (req, res) => {
  jsonError(res, "API route not found.", 404);
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Watchlist listening on http://${HOST}:${PORT}`);
});
