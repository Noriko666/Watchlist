export function getDisplayTitle(entry) {
  return entry?.titleEnglish || entry?.title || "Unknown title";
}

export function getEntryIdentityKey(entry) {
  return `${entry?.source || "unknown"}:${entry?.externalId || ""}`;
}

export function safeCssUrl(url) {
  if (!url) return "none";
  const safe = String(url)
    .replace(/["'\\]/g, "")
    .replace(/[\n\r]/g, "");
  return `url("${safe}")`;
}

export function hashEntryAccent(entry) {
  const key = `${entry?.source || ""}:${entry?.externalId || ""}:${entry?.title || ""}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sortEntriesForDisplay(entries) {
  return [...entries].sort((a, b) => {
    if (a.manualOrder !== b.manualOrder) {
      return a.manualOrder - b.manualOrder;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return getDisplayTitle(a).localeCompare(getDisplayTitle(b), "de", {
      sensitivity: "base"
    });
  });
}
