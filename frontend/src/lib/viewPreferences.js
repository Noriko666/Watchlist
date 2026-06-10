import { DEFAULT_VIEW_MODE, VIEW_MODES } from "./constants.js";

const STORAGE_KEY = "watchlist-view-mode";

export function loadViewMode() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VIEW_MODES.includes(value) ? value : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export function saveViewMode(mode) {
  if (!VIEW_MODES.includes(mode)) return;
  localStorage.setItem(STORAGE_KEY, mode);
}
