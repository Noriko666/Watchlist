import { useEffect, useRef } from "react";

const TWO_PI = Math.PI * 2;

function makePetal(w, h, initial) {
  const depth = 0.35 + Math.random() * 0.65; // 0..1, far..near
  return {
    x: Math.random() * w,
    y: initial ? Math.random() * h : -20,
    size: 4.5 + depth * 6.5,
    speed: 14 + depth * 26, // px / s
    swayAmp: 18 + Math.random() * 26,
    swayFreq: 0.4 + Math.random() * 0.5,
    phase: Math.random() * TWO_PI,
    rot: Math.random() * TWO_PI,
    rotSpeed: (Math.random() - 0.5) * 1.4,
    alpha: 0.07 + depth * 0.13,
    hue: Math.random() < 0.5 ? "242, 184, 198" : "248, 206, 216"
  };
}

function drawPetal(ctx, p, t) {
  const sway = Math.sin(p.phase + t * p.swayFreq) * p.swayAmp;
  ctx.save();
  ctx.translate(p.x + sway, p.y);
  ctx.rotate(p.rot + Math.sin(p.phase + t * 0.8) * 0.4);
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = `rgb(${p.hue})`;
  const s = p.size;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.9, -s * 0.7, s * 0.85, s * 0.45, 0, s * 0.9);
  ctx.bezierCurveTo(-s * 0.85, s * 0.45, -s * 0.9, -s * 0.7, 0, -s);
  ctx.fill();
  ctx.restore();
}

export default function SakuraCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const ctx = canvas.getContext("2d");
    let raf = null;
    let w = 0;
    let h = 0;
    let petals = [];
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(16, Math.max(8, Math.round((w * h) / 110000)));
      while (petals.length < target) petals.push(makePetal(w, h, true));
      petals.length = target;
    };

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < petals.length; i += 1) {
        const p = petals[i];
        p.y += p.speed * dt;
        p.rot += p.rotSpeed * dt;
        if (p.y > h + 24) petals[i] = makePetal(w, h, false);
        drawPetal(ctx, p, t);
      }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (raf != null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf == null) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="sakura-canvas" aria-hidden="true" />;
}
