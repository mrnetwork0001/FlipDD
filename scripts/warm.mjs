// Runs the built-in example (and any lists in WARM_LISTS) against a FlipDD
// deployment, so the first visitor gets cached answers and the landing page
// has a real run to show.
//   node scripts/warm.mjs https://your-app.up.railway.app
const base = (process.argv[2] || process.env.FLIPDD_URL || "http://localhost:3001").replace(/\/$/, "");
const EXAMPLE = {
  startupName: "Veloce AI",
  description:
    "AI software engineer that turns a prompt into a working web app, writing and reviewing the code for product teams.",
  competitors: ["Lovable"],
  investors: ["Creandum", "Northzone", "Atomico", "Balderton Capital", "Index Ventures", "EQT Ventures", "Lifeline Ventures", "Maki.vc"],
};

const started = Date.now();
console.log(`Warming ${base} with the example (8 funds vs Lovable)…`);
const res = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(EXAMPLE),
});
if (!res.ok || !res.body) {
  console.error(`Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let stats;
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    const e = JSON.parse(line);
    if (e.type === "stats") stats = e;
    if (e.type === "step" && (e.state === "warn" || e.state === "wait")) console.log(`  ${e.scope}: ${e.text}`);
    if (e.type === "error") console.error(`  error: ${e.message}`);
  }
}
const slush = await fetch(`${base}/api/slush`).then((r) => r.json()).catch(() => null);
console.log(
  `Done in ${Math.round((Date.now() - started) / 1000)} s · ${stats?.calls ?? "?"} live Cala calls, ${stats?.cached ?? "?"} cached` +
    (slush?.attendees ? ` · Slush list: ${slush.attendees} companies` : ""),
);
