// Sound effects via ElevenLabs /v1/sound-generation. Skips files that already exist.
//   node scripts/sfx.mjs                 all missing
//   ONLY=stamp,impact node scripts/sfx.mjs   force regenerate some
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";

const SFX = {
  thud: ["Deep heavy stamp thud with a short low tail, single hit, dramatic, close", 0.8],
  snap: ["A taut line snapping tight, quick sharp elastic snap, clean, short", 0.5],
  whoosh: ["Soft fast airy whoosh, smooth cinematic transition, no music", 1.0],
  paper: ["A few paper pages sliding quickly across a table, crisp, short", 1.0],
  flip: ["A card flipped over fast with a crisp snap, close", 0.6],
  impact: ["Deep clean cinematic impact with a warm sub tail, modern, single hit", 2],
  click: ["Soft modern UI click, single, clean, short", 0.5],
  tick: ["Fast soft digital ticks counting up, data loading, clean, short", 1.2],
  pop: ["Soft bubbly UI pop, single, clean, short", 0.5],
  alert: ["Short low warning blip, two quick notes, modern UI alert, clean", 0.7],
  ring: ["Modern smartphone ringing, two short soft rings, clean, close", 2.0],
  pickup: ["Phone call connecting click and a soft line hum, short", 0.6],
  chime: ["Bright clean confirmation chime, two soft ascending notes, modern, short tail", 1.2],
  riser: ["Tension riser, rising airy synth swell building to a peak, cinematic, no drums", 2],
};

const dir = join(ROOT, "public/audio/sfx");
mkdirSync(dir, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

for (const [name, [text, dur]] of Object.entries(SFX)) {
  const f = join(dir, `${name}.mp3`);
  if (only ? !only.includes(name) : existsSync(f)) { console.log(`${name}: skip`); continue; }
  try {
    const buf = await retry(async () => {
      const res = await post("/sound-generation?output_format=mp3_44100_128", { text, duration_seconds: dur, prompt_influence: 0.5 });
      return Buffer.from(await res.arrayBuffer());
    });
    writeFileSync(f, buf);
    console.log(`${name}: ${(buf.length / 1024).toFixed(0)}kb`);
  } catch (e) { console.error(`${name}: FAILED ${e.message}`); }
}
