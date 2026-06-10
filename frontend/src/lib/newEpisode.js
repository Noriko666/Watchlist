const NEW_EP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinNewEpisodeWindow(iso) {
  if (!iso) return false;
  const aired = new Date(iso).getTime();
  if (Number.isNaN(aired)) return false;
  return Date.now() - aired < NEW_EP_WINDOW_MS;
}

export function shouldShowNewEpisodeBadge(entry) {
  if (!entry) return false;
  if (!["watching", "on_hold"].includes(entry.category)) return false;
  return isWithinNewEpisodeWindow(entry.recentAiredAt);
}
