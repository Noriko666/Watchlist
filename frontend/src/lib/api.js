async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers,
    ...options
  });

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || "Request failed."
    );
    error.status = response.status;
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      error.retryAfter = Number.parseInt(retryAfter, 10);
    }
    throw error;
  }

  return payload?.data;
}

export function getAuthSession() {
  return request("./api/auth/session");
}

export function login(password) {
  return request("./api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function logout() {
  return request("./api/auth/logout", { method: "POST" });
}

export function listAnime() {
  return request("./api/anime");
}

export function getAnimeOfTheDay(dateKey) {
  const query = dateKey ? `?date=${encodeURIComponent(dateKey)}` : "";
  return request(`./api/anime-of-the-day${query}`);
}

export function listAnimeCharacters(id) {
  return request(`./api/anime/${id}/characters`);
}

export function listVoiceActorTopRoles(id) {
  return request(`./api/staff/${id}/top-roles`);
}

export function searchCatalog(query, options = {}) {
  return request(
    `./api/search?query=${encodeURIComponent(query)}`,
    options
  );
}

export function listSeasonTopAiring(scope) {
  const suffix = scope ? `/${scope}` : "";
  return request(`./api/season-top-airing${suffix}`);
}

export function createAnime(entry) {
  return request("./api/anime", {
    method: "POST",
    body: JSON.stringify(entry)
  });
}

export function updateAnime(id, patch) {
  return request(`./api/anime/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export function reorderAnime(category, orderedIds) {
  return request("./api/anime/reorder", {
    method: "POST",
    body: JSON.stringify({ category, orderedIds })
  });
}

export function removeAnime(id) {
  return request(`./api/anime/${id}`, { method: "DELETE" });
}

export function importAnime(payload) {
  return request("./api/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
