import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../frontend/public/anime-ui");

const files = [
  "playground-backdrop.png",
  "category-watching.png",
  "category-plan.png",
  "category-finished.png",
  "category-canceled.png",
  "category-experiment.png",
  "details-modal-backdrop.png",
  "details-cast-banner.png",
  "fallback-cover-playground.png"
];

// Minimal valid 64x64 dark PNG (single color #121018)
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAHElEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAvg0xYAAB/BJJ6QAAAABJRU5ErkJggg==";

const buffer = Buffer.from(PNG_BASE64, "base64");
fs.mkdirSync(outDir, { recursive: true });
for (const file of files) {
  fs.writeFileSync(path.join(outDir, file), buffer);
}
console.log(`Wrote ${files.length} placeholder PNGs to ${outDir}`);
