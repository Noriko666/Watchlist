import Database from "better-sqlite3";

const sourcePath = process.argv[2] || "./data/source.sqlite";
const targetPath = process.argv[3] || "./data/watchlist.sqlite";

const source = new Database(sourcePath, { readonly: true });
const rows = source.prepare("SELECT * FROM anime_entries ORDER BY id").all();
source.close();

const target = new Database(targetPath);
const columns = [
  "id",
  "external_id",
  "source",
  "title",
  "title_english",
  "cover_image",
  "banner_image",
  "year",
  "episodes",
  "synopsis",
  "genres",
  "category",
  "notes",
  "rating",
  "progress_current",
  "progress_total",
  "manual_order",
  "next_airing_at",
  "next_airing_episode",
  "recent_aired_at",
  "recent_aired_episode",
  "created_at",
  "updated_at"
];

const placeholders = columns.map(() => "?").join(", ");
const insert = target.prepare(
  `INSERT INTO anime_entries (${columns.join(", ")}) VALUES (${placeholders})`
);

const copy = target.transaction(() => {
  target.exec("DELETE FROM anime_entries");
  for (const row of rows) {
    insert.run(columns.map((col) => row[col]));
  }
  const maxId = rows.reduce((max, row) => Math.max(max, row.id), 0);
  if (maxId > 0) {
    target
      .prepare(
        "UPDATE sqlite_sequence SET seq = ? WHERE name = 'anime_entries'"
      )
      .run(maxId);
  }
});

copy();
target.close();

console.log(`Copied ${rows.length} anime entries to ${targetPath}`);
