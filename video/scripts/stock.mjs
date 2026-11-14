// Downloads the stock B-roll listed in data/stock.json (Mixkit, free licence) into
// public/footage/stock/<id>.mp4. The clips are not committed; run this before rendering.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const { clips } = JSON.parse(readFileSync(join(ROOT, "data/stock.json"), "utf8"));
const dir = join(ROOT, "public/footage/stock");
mkdirSync(dir, { recursive: true });
for (const c of clips) {
  const out = join(dir, `${c.id}.mp4`);
  if (existsSync(out)) { console.log(`${c.id}: have it`); continue; }
  const res = await fetch(`https://assets.mixkit.co/videos/${c.id}/${c.id}-720.mp4`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) { console.error(`${c.id}: ${res.status}`); continue; }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`${c.id}: ${c.title}`);
}
