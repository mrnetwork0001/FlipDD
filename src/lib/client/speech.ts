"use client";

// One speech player for the whole page, on the browser's own voices
// (speechSynthesis): no key, works offline, on iPhone too. Starting a new
// briefing stops the one playing. Text is spoken sentence by sentence, since
// long utterances get cut off on Chrome and Safari.

import { speechChunks } from "@/lib/voiceScript";

type Listener = (playingId: string | null) => void;

let playing: string | null = null;
let session = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(playing);
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** A clear English voice when the device has one; the default voice otherwise. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const prefer = [/Google UK English Female/i, /Samantha/i, /Daniel/i, /Google US English/i, /Microsoft (Aria|Jenny|Guy)/i, /Natural/i];
  for (const re of prefer) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en.find((v) => v.localService) || en[0];
}

export function stopSpeaking() {
  session++;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (playing !== null) {
    playing = null;
    emit();
  }
}

/** Speaks `text`; `id` names who asked, so their button shows Stop. */
export function speak(id: string, text: string, onEnd?: () => void) {
  if (!speechSupported()) return;
  stopSpeaking();
  const mine = ++session;
  playing = id;
  emit();
  const chunks = speechChunks(text);
  const voice = pickVoice();
  const next = (i: number) => {
    if (mine !== session) return;
    if (i >= chunks.length) {
      playing = null;
      emit();
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-GB";
    u.rate = 1.04;
    u.onend = () => next(i + 1);
    u.onerror = () => next(i + 1);
    window.speechSynthesis.speak(u);
  };
  next(0);
}

export function onSpeechChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function speakingId(): string | null {
  return playing;
}
