const reducedMotionQuery = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

export function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

/** Sumi-ink ripple expanding from a pointer position. */
export function spawnInkRipple(x, y) {
  if (prefersReducedMotion()) return;
  const el = document.createElement("div");
  el.className = "fx-ink-ripple";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/** A small, restrained burst of sakura petals. */
export function spawnSakuraBurst(x, y, count = 7) {
  if (prefersReducedMotion()) return;
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement("div");
    el.className = "fx-petal-burst";
    const angle = Math.random() * Math.PI * 2;
    const dist = 36 + Math.random() * 64;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${(Math.cos(angle) * dist).toFixed(1)}px`);
    el.style.setProperty(
      "--dy",
      `${(Math.sin(angle) * dist * 0.6 - 34).toFixed(1)}px`
    );
    el.style.setProperty(
      "--rot",
      `${Math.round(Math.random() * 520 - 260)}deg`
    );
    el.style.setProperty("--dur", `${(0.65 + Math.random() * 0.5).toFixed(2)}s`);
    el.style.setProperty("--size", `${Math.round(6 + Math.random() * 6)}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}
