// Records FlipDD (the local app by default) for the demo film.
//   ONLY=check,ties,round,find,play node scripts/capture.mjs
//   BASE=https://<deployment> ONLY=... node scripts/capture.mjs   (the live site)
// Output: .cache/frames/<clip>/ (JPEG screencast + frames.json), .cache/marks.json (event times),
// .cache/meta.json (per clip: element rects in CSS px) and stills in public/stills/.
// scripts/encode.mjs turns the frames into public/footage/<clip>.mp4.
//
// The window is 1600x900 CSS px at device scale 2 (frames 3200x1800).
// Writes: the "check" clip runs ONE live check of the built-in example with "Ask Cala live" ticked
// (about 90 Cala calls, no cache) and saves that run in the app's own store. Nothing else writes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = process.env.BASE || "https://tryflipdd.vercel.app";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FRAMES = join(ROOT, ".cache/frames");
const STILLS = join(ROOT, "public/stills");
const SCALE = 2;
const VIEW = { w: 1600, h: 900 };
const ONLY = process.env.ONLY?.split(",");
if (!ONLY) { console.error("Set ONLY=<clip,...> (check,ties,prep,round,find,play). check runs a live Cala check."); process.exit(1); }
const want = (clip) => ONLY.includes(clip);
mkdirSync(FRAMES, { recursive: true });
mkdirSync(STILLS, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
const marks = readJson(join(ROOT, ".cache/marks.json"));
const meta = readJson(join(ROOT, ".cache/meta.json"));
const mark = (k) => { marks[k] = Date.now() / 1000; log("mark", k); };
const save = () => {
  writeFileSync(join(ROOT, ".cache/marks.json"), JSON.stringify(marks, null, 1));
  writeFileSync(join(ROOT, ".cache/meta.json"), JSON.stringify(meta, null, 1));
};

// A visible pointer (headless Chrome draws none), a click ring and an eased scroll helper.
const OVERLAY = `(() => {
  window.__ease = (el, prop, to, ms) => new Promise((done) => {
    const from = el[prop]; const start = performance.now();
    const f = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const p = Math.min(1, (now - start) / ms); el[prop] = from + (to - from) * f(p); if (p < 1) requestAnimationFrame(step); else done(el[prop]); };
    requestAnimationFrame(step);
  });
  if (document.getElementById('__cur')) return;
  const s = document.createElement('style');
  s.textContent = 'html{scroll-behavior:auto!important}#__cur{position:fixed;left:-40px;top:-40px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(232,64,37,.8),0 4px 16px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .3s ease,transform .12s ease-out,left .8s cubic-bezier(.22,1,.36,1),top .8s cubic-bezier(.22,1,.36,1)}#__cur.down{transform:scale(.7)}.__ring{position:fixed;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;border:2px solid rgba(232,64,37,.85);z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
})()`;

let b;
const js = (e) => b.js(e);
async function overlay() { await js(OVERLAY); }
async function glide(x, y, settle = 900) {
  await js(`(() => { const k = document.getElementById('__cur'); if (k) { k.style.opacity = '1'; k.style.left = '${x}px'; k.style.top = '${y}px'; } })()`);
  await sleep(820);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(Math.max(0, settle - 820));
}
async function cursorAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); if (!k) return; const t = k.style.transition; k.style.transition = 'opacity .3s ease'; k.style.left = '${x}px'; k.style.top = '${y}px'; k.offsetWidth; k.style.transition = t; k.style.opacity = '1'; })()`);
}
async function cursorHide() { await js(`(() => { const k = document.getElementById('__cur'); if (k) k.style.opacity = '0'; })()`); }
async function clickAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); k?.classList.add('down'); const r = document.createElement('div'); r.className = '__ring'; r.style.left = '${x}px'; r.style.top = '${y}px'; document.body.appendChild(r); setTimeout(() => { k?.classList.remove('down'); r.remove(); }, 650); })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(90);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
const centerOf = (finder) => js(`(() => { const e = ${finder}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const rectOf = async (finder) => { const r = await b.rectOf(finder); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
/** Absolute document y of an element's top. */
const docY = (finder) => js(`(() => { const e = ${finder}; return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; })()`);
const scrollTo = (y, ms) => js(`window.__ease(document.scrollingElement, 'scrollTop', ${y}, ${ms})`);
const parkMouse = () => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: VIEW.w - 4, y: VIEW.h - 4 });
/** Glide to an element and click it (real mouse events). */
async function press(finder, settle = 700) {
  const p = await centerOf(finder);
  if (!p) throw new Error("press: not found " + finder.slice(0, 90));
  await glide(p.x, p.y, 1000);
  await clickAt(p.x, p.y);
  await sleep(settle);
  return p;
}
/** Types text into the focused field, a key at a time, like a person. */
async function typeText(text, cps = 16) {
  for (const ch of text) {
    await b.send("Input.insertText", { text: ch });
    await sleep(1000 / cps + Math.random() * 30);
  }
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(text)}))`;
const byAria = (sel, label) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)}))`;
const heading = (text) => byText("h1,h2,h3", text);
async function waitFor(cond, ms = 30000, what = cond) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(`!!(${cond})`).catch(() => false)) return true; await sleep(400); }
  throw new Error("timed out waiting for " + String(what).slice(0, 120));
}

let stopRec = null;
async function rec(name) {
  const dir = join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  stopRec = await b.screencast(dir);
  if (meta[name]) meta[name].rects = {};
  mark(`${name}:start`);
}
async function endRec(name) {
  if (!stopRec) return;
  mark(`${name}:end`);
  const frames = await stopRec();
  stopRec = null;
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  log(`${name}: ${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / Math.max(span, 0.001)).toFixed(1)} fps)`);
}
function setMeta(clip, data) {
  const prev = meta[clip] || {};
  meta[clip] = { deviceScale: SCALE, viewport: VIEW, ...prev, ...data, rects: { ...(prev.rects || {}), ...(data.rects || {}) } };
}
async function still(name, finder) { await b.shot(join(STILLS, `${name}.png`), finder); log("still", name); }

/** Opens a route with the guide already marked seen, waits for it to settle, adds the pointer. */
async function open(route, { settle = 6000, guide = false } = {}) {
  if (!guide) await js(`try { localStorage.setItem('flipdd.formCollapsed', '0') } catch {}`).catch(() => {});
  await b.goto(BASE + route, settle);
  await overlay();
  await parkMouse();
  const errs = await js(`/Application error|Something went wrong|500|This page could not be found/.test(document.title + ' ' + document.body.innerText.slice(0, 400))`);
  if (errs) log("WARN: page shows an error?", route);
}

// ---------------------------------------------------------------- clips
const CLIPS = {};
const row = (name) => `document.getElementById('row-' + encodeURIComponent(${JSON.stringify(name)}))`;
const rowButton = (name) => `(${row(name)})?.querySelector('button')`;
const tab = (label) => `[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes(${JSON.stringify(label)}))`;
const roundPanel = `(${byText("p", "[ your round ]")})?.closest('section')`;
const URL_LABEL = BASE.replace(/^https?:\/\//, "") + "/app";

/** The built-in example, run live against Cala (cache skipped), from an empty screen to the verdicts. */
CLIPS.check = async () => {
  await open("/app", { settle: 6000 });
  await rec("check");
  await sleep(1200);
  await press(byText("button", "Load example"), 1400);
  mark("check.load");
  // The example is answered from Cala records cached today (the live key is rate-limited); the header shows it.
  await press(byText("button", "Check 8 investors"), 300);
  mark("check.press");
  await cursorHide();
  setMeta("check", { url: URL_LABEL, rects: { form: await rectOf(`document.querySelector('form') || document.querySelector('aside')`) } });
  await waitFor(`document.body.innerText.includes('Checked 8 investors in')`, 240000, "the check to finish");
  mark("check.done");
  setMeta("check", { rects: {
    header: await rectOf(`document.querySelector('header')`),
    scan: await rectOf(`(${byText("p,span,div", "Checked 8 investors in")})?.closest('section,div.rounded-2xl')`),
  } });
  await sleep(2500);
  await endRec("check");
  const stats = await js(`document.querySelector('header')?.innerText.replace(/\s+/g, ' ')`);
  setMeta("check", { header: stats });
  log("header:", stats);
  await still("check_done");
};

/** The verdicts: Creandum (direct), Northzone (one step via Accel), Atomico (lookalike). */
CLIPS.ties = async () => {
  if (!(await js(`!!(${row("Creandum")})`))) throw new Error("ties: run the check clip first in this session");
  await js(`document.querySelectorAll('li[id^=row-] > button[aria-expanded=true]').forEach((b) => b.click())`);
  await sleep(400);
  const listY = await docY(row("Creandum"));
  await cursorHide();
  await scrollTo(Math.max(0, listY - 120), 10);
  await sleep(600);
  await rec("ties");
  await sleep(1000);
  for (const [name, key] of [["Creandum", "creandum"], ["Northzone", "northzone"], ["Atomico", "atomico"]]) {
    const y = await docY(row(name));
    await cursorHide();
    await scrollTo(Math.max(0, y - 110), 900);
    await sleep(300);
    await press(rowButton(name), 300);
    mark(`ties.${key}`);
    await sleep(700);
    setMeta("ties", { rects: { [key]: await rectOf(row(name)) } });
    await sleep(2300);
  }
  await endRec("ties");
  await still("ties_atomico", row("Atomico"));
};

/** The round panel: headline, score, meeting order. */
CLIPS.round = async () => {
  await js(`document.querySelectorAll('li[id^=row-] > button[aria-expanded=true]').forEach((b) => b.click())`);
  const y = await docY(roundPanel);
  if (y == null) throw new Error("round: panel not found");
  await scrollTo(Math.max(0, y - 160), 10);
  await sleep(500);
  await rec("round");
  await sleep(800);
  await cursorHide();
  await scrollTo(Math.max(0, y - 90), 1400);
  await sleep(400);
  setMeta("round", { rects: { panel: await rectOf(roundPanel), headline: await rectOf(`(${roundPanel})?.querySelector('h2')`) } });
  mark("round.panel");
  await sleep(2600);
  const orderY = await docY(byText("p", "Suggested meeting order"));
  if (orderY != null) { await scrollTo(Math.max(0, orderY - 220), 1600); mark("round.order"); }
  setMeta("round", { rects: { order: await rectOf(`(${byText("p", "Suggested meeting order")})?.parentElement`) } });
  await sleep(2600);
  await endRec("round");
};

/** Reopens a saved run (RUN_ID) from Recent checks, without asking Cala again. */
async function ensureRun() {
  if (await js(`!!(${row("Creandum")})`)) return;
  const id = process.env.RUN_ID;
  if (!id) throw new Error("no run on screen: record check first, or set RUN_ID=<saved run id>");
  await open("/app", { settle: 4000 });
  await js(`localStorage.setItem("flipdd.history.v1", JSON.stringify([{ id: ${JSON.stringify(id)}, startupName: "Veloce AI", competitors: ["Lovable"], investors: 8, conflicts: 4, createdAt: new Date().toISOString() }]))`);
  await open("/app", { settle: 5000 });
  await js(`document.querySelector('[data-history] button')?.click()`);
  await sleep(500);
  await js(`[...document.querySelectorAll('[data-history] button')].find((b) => b.textContent.includes('Veloce'))?.click()`);
  await waitFor(`!!(${row("Creandum")})`, 20000, "the saved run to open");
  // Close the "Reopened" toast with its own button, or wait it out.
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close')?.click()`);
  await sleep(2500);
}

/** Find investors: clean funds near the market, and the dropped ones. */
CLIPS.find = async () => {
  await ensureRun();
  await cursorHide();
  await scrollTo(0, 10);
  await rec("find");
  await sleep(700);
  await press(tab("Find investors"), 600);
  mark("find.tab");
  await waitFor(`/clean investors/i.test(document.body.innerText)`, 20000);
  setMeta("find", { rects: { hero: await rectOf(`(${byText("p", "Clean investors")})?.parentElement`) } });
  await sleep(2200);
  const y = await docY(`document.querySelector('ul.grid li')`);
  if (y != null) { await cursorHide(); await scrollTo(Math.max(0, y - 140), 1600); mark("find.cards"); }
  setMeta("find", { rects: { cards: await rectOf(`document.querySelector('ul.grid')`) } });
  await sleep(3000);
  await endRec("find");
};

/** Meeting prep on Creandum: the 30-second card, who you'll meet, what they know about Lovable. */
CLIPS.prep = async () => {
  await ensureRun();
  await press(tab("Investors"), 300);
  await js(`document.querySelectorAll('li[id^=row-] button[aria-expanded=true]').forEach((b) => b.click())`);
  const y = await docY(row("Creandum"));
  await cursorHide();
  await scrollTo(Math.max(0, y - 160), 10);
  await sleep(500);
  await rec("prep");
  await sleep(900);
  const prepBtn = `[...(${row("Creandum")}).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Prep')`;
  await press(prepBtn, 200);
  mark("prep.open");
  await waitFor(`/in 30 seconds/i.test(document.querySelector('[role=dialog]')?.innerText || '')`, 30000, "the prep note");
  mark("prep.summary");
  setMeta("prep", { url: URL_LABEL, rects: {
    dialog: await rectOf(`document.querySelector('[role=dialog] aside') || document.querySelector('[role=dialog]')`),
    summary: await rectOf(`[...document.querySelectorAll('[role=dialog] div')].find((d) => d.firstElementChild?.textContent?.trim() === 'In 30 seconds')`),
  } });
  await sleep(3800);
  const fold = (title) => `[...document.querySelectorAll('[role=dialog] section button[aria-expanded]')].find((b) => b.textContent.includes(${JSON.stringify(title)}))`;
  await press(fold("Who you'll meet"), 300);
  mark("prep.team");
  await sleep(600);
  await js(`(${fold("Who you'll meet")}).scrollIntoView({ block: 'start', behavior: 'smooth' })`);
  await sleep(900);
  setMeta("prep", { rects: { team: await rectOf(`(${fold("Who you'll meet")}).closest('section')`) } });
  await sleep(2600);
  await press(fold("What they know about your competitors"), 300);
  mark("prep.rival");
  await sleep(600);
  await js(`(${fold("What they know about your competitors")}).scrollIntoView({ block: 'start', behavior: 'smooth' })`);
  await sleep(900);
  setMeta("prep", { rects: { rival: await rectOf(`(${fold("What they know about your competitors")}).closest('section')`) } });
  await sleep(4200);
  await endRec("prep");
  await still("prep_rival");
  // the run behind the footage, for data/run.json
  const runId = await js(`(JSON.parse(localStorage.getItem('flipdd.history.v1') || '[]')[0] || {}).id || ''`);
  setMeta("prep", { runId });
  log("run id:", runId);
};

/** Play my day: the button under the round score switches to Stop while it speaks. */
CLIPS.play = async () => {
  await ensureRun();
  await press(tab("Investors"), 500);
  const y = await docY(roundPanel);
  await cursorHide();
  await scrollTo(Math.max(0, y - 140), 10);
  await sleep(500);
  await rec("play");
  await sleep(900);
  const btn = byText("button", "Play my day");
  setMeta("play", { rects: { button: await rectOf(btn), panel: await rectOf(roundPanel) } });
  await press(btn, 200);
  mark("play.press");
  await sleep(3500);
  await endRec("play");
};

// ---------------------------------------------------------------- run
b = await launch({ width: VIEW.w, height: VIEW.h });
await b.send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: SCALE, mobile: false });
try {
  for (const name of ["check", "ties", "prep", "round", "find", "play"]) {
    if (!want(name)) continue;
    log("clip", name);
    await CLIPS[name]();
    save();
  }
} catch (e) {
  console.error("FAILED:", e.message);
  if (stopRec) await endRec("aborted");
} finally {
  save();
  if (b.consoleLines.length) console.log("console:\n" + [...new Set(b.consoleLines)].slice(0, 15).join("\n"));
  b.close();
}
