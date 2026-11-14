"use client";

// One speech player for the whole page, on the browser's own voices
// (speechSynthesis): no key, works offline, on iPhone too. Starting a new
// briefing stops the one playing. Text is spoken sentence by sentence, since
// long utterances get cut off on Chrome and Safari.
//
// When the server has an ElevenLabs key (/api/speak), briefings play in
// FlipDD's ElevenLabs voice: the text goes in chunks, the next fetched while one
// plays. Without it, or if it fails, the browser's own voice takes over.
//
// Chrome's "Google …" voices stream from Google and can fail without a sound,
// and Chrome drops an utterance queued right after cancel(). So: voices built
// into the device first, a short pause after stopping, and a watchdog that
// retries on the default voice when nothing starts. If speech still can't
// play, the button says so instead of staying silent.

import { speechChunks } from "@/lib/voiceScript";

type Listener = (playingId: string | null, failedId: string | null) => void;

let playing: string | null = null;
let failed: string | null = null;
let session = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(playing, failed);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Voices load asynchronously in Chrome; wait briefly for the list on first use. */
function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 800);
  });
}

/** A clear English voice built into the device; network voices only as a last resort. */
function pickVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = list.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const local = en.filter((v) => v.localService);
  const prefer = [/Samantha/i, /Daniel/i, /Karen/i, /Moira/i, /Serena/i, /Alex/i, /Microsoft (Aria|Jenny|Guy|Zira|David)/i];
  for (const re of prefer) {
    const v = local.find((x) => re.test(x.name));
    if (v) return v;
  }
  return local[0] || en.find((v) => !/^Google/i.test(v.name)) || en[0];
}

// ---------- ElevenLabs through the server ----------

// One player for the page, kept on window so a code reload in development
// can't orphan audio that is still playing (Stop must always reach it).
type W = Window & { __flipddPlayer?: HTMLAudioElement; __flipddUrls?: string[] };
const shared = () => window as W;
let urls: string[] = [];
const getPlayer = () => (shared().__flipddPlayer ??= new Audio());
let elevenState: Promise<boolean> | null = null;
// A zero-length WAV: played inside the click, it unlocks audio on iPhone for the clips that follow.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const elevenEnabled = () =>
  (elevenState ??= fetch("/api/speak")
    .then((r) => r.json())
    .then((j: { enabled?: boolean }) => Boolean(j.enabled))
    .catch(() => false));

function clip(text: string): Promise<string> {
  return fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).then(async (r) => {
    if (!r.ok) throw new Error(`speak ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    urls.push(url);
    (shared().__flipddUrls ??= []).push(url);
    return url;
  });
}

/** Plays `text` in the ElevenLabs voice. False if the first clip fails (the caller falls back). */
async function playEleven(text: string, mine: number): Promise<boolean> {
  // A short first piece starts the voice almost at once; the rest is fetched while it plays.
  const first = speechChunks(text, 140)[0] || text;
  const rest = text.slice(text.indexOf(first) + first.length).trim();
  const parts = [first, ...(rest ? speechChunks(rest, 480) : [])];
  const player = getPlayer();
  let next: Promise<string> | null = clip(parts[0]);
  for (let i = 0; i < parts.length; i++) {
    let url: string;
    try {
      url = await next!;
    } catch {
      if (i === 0) return false;
      break;
    }
    if (mine !== session) return true;
    next = i + 1 < parts.length ? clip(parts[i + 1]) : null;
    next?.catch(() => undefined);
    player.src = url;
    try {
      await player.play();
    } catch {
      if (i === 0) return false;
      break;
    }
    await new Promise<void>((done) => {
      const p = player;
      const end = () => {
        p.removeEventListener("ended", end);
        p.removeEventListener("error", end);
        p.removeEventListener("pause", end);
        done();
      };
      p.addEventListener("ended", end);
      p.addEventListener("error", end);
      p.addEventListener("pause", end);
    });
    if (mine !== session) return true;
  }
  playing = null;
  emit();
  return true;
}

export function stopSpeaking() {
  session++;
  if (typeof window !== "undefined") {
    const p = shared().__flipddPlayer;
    if (p) {
      p.pause();
      p.removeAttribute("src");
      p.load();
    }
    for (const u of [...urls, ...(shared().__flipddUrls || [])]) URL.revokeObjectURL(u);
    shared().__flipddUrls = [];
  }
  urls = [];
  if (speechSupported()) window.speechSynthesis.cancel();
  if (playing !== null) {
    playing = null;
    emit();
  }
}

/** Speaks `text`; `id` names who asked, so their button shows Stop (or a failure note). */
export async function speak(id: string, text: string, onEnd?: () => void) {
  if (typeof window === "undefined") return;
  stopSpeaking();
  const mine = ++session;
  playing = id;
  failed = null;
  emit();
  // Unlock audio while still inside the click (iPhone needs this for later clips).
  const unlock = getPlayer();
  unlock.src = SILENT;
  unlock.play().catch(() => undefined);
  if (await elevenEnabled()) {
    const ok = await playEleven(text, mine);
    if (mine !== session) return;
    if (ok) {
      onEnd?.();
      return;
    }
  }
  if (!speechSupported()) {
    playing = null;
    failed = id;
    emit();
    return;
  }
  const synth = window.speechSynthesis;
  const list = await voices();
  // Chrome drops an utterance queued in the same tick as cancel().
  await new Promise((r) => setTimeout(r, 80));
  if (mine !== session) return;
  const chunks = speechChunks(text);
  let voice = pickVoice(list);
  let retried = false;
  let attempt = 0;

  const fail = () => {
    if (mine !== session) return;
    synth.cancel();
    playing = null;
    failed = id;
    emit();
  };

  const say = (i: number) => {
    if (mine !== session) return;
    if (i >= chunks.length) {
      playing = null;
      emit();
      onEnd?.();
      return;
    }
    const me = ++attempt;
    const u = new SpeechSynthesisUtterance(chunks[i]);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-US";
    u.rate = 1.04;
    let started = false;
    u.onstart = () => {
      started = true;
    };
    u.onend = () => {
      if (me === attempt && started) say(i + 1);
    };
    u.onerror = (e) => {
      if (me !== attempt || e.error === "interrupted" || e.error === "canceled") return;
      retry(i);
    };
    synth.resume(); // Chrome can be left paused after a page sleeps
    synth.speak(u);
    // Watchdog: a voice that never starts is retried once on the default voice.
    setTimeout(() => {
      if (mine === session && me === attempt && !started) retry(i);
    }, 1500);
  };

  const retry = (i: number) => {
    if (mine !== session) return;
    if (retried) return fail();
    retried = true;
    voice = undefined;
    synth.cancel();
    setTimeout(() => say(i), 80);
  };

  say(0);
}

export function onSpeechChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function speakingId(): string | null {
  return playing;
}
