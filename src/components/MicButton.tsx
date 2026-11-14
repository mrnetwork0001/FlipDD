"use client";

// Ask by voice. Tap to talk, tap again (or pause) to send. Chrome and Edge
// hear you directly (Web Speech API) and show the words as you speak. Where
// that isn't available (iPhone Safari, Firefox) it records and the server
// transcribes with Gemini.

import { useEffect, useRef, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { MicGlyph } from "./Glyphs";
import { stopSpeaking } from "@/lib/client/speech";

type Mode = "idle" | "listening" | "recording" | "transcribing";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const canRecord = () =>
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

// Web Speech on Chrome sends audio to Google; when that fails (offline, blocked)
// we switch to recording for the rest of the session.
let browserSttBroken = false;

export default function MicButton({
  onPartial,
  onFinal,
  onError,
  disabled,
}: {
  /** Words so far, while speaking (Web Speech only). */
  onPartial?: (text: string) => void;
  /** The finished question. */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [supported, setSupported] = useState(false);
  const [level, setLevel] = useState(0);
  const recRef = useRef<Recognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const stopMeter = useRef<() => void>(() => undefined);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()) || canRecord());
    return () => {
      recRef.current?.abort();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      stopMeter.current();
    };
  }, []);

  if (!supported) return null;

  function listen(Ctor: new () => Recognition) {
    const rec = new Ctor();
    rec.lang = navigator.language?.startsWith("en") ? navigator.language : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = "";
    let failed = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      finalRef.current = text.trim();
      onPartial?.(finalRef.current);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      failed = true;
      if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") {
        browserSttBroken = true;
        if (canRecord()) {
          onError?.("Browser speech recognition is unavailable here. Tap the mic again to record instead.");
          return;
        }
      }
      onError?.(e.error === "not-allowed" ? "Allow microphone access to ask by voice." : `Couldn't hear that (${e.error}).`);
    };
    rec.onend = () => {
      recRef.current = null;
      setMode("idle");
      if (!failed && finalRef.current) onFinal(finalRef.current);
    };
    recRef.current = rec;
    setMode("listening");
    rec.start();
  }

  async function record() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.("Allow microphone access to ask by voice.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const media = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Input level for the ring, and an automatic stop after 1.6 s of silence.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let heard = false;
    let quietSince = performance.now();
    const started = performance.now();
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 6));
      const now = performance.now();
      if (rms > 0.04) {
        heard = true;
        quietSince = now;
      }
      if ((heard && now - quietSince > 1600) || now - started > 45_000) {
        if (media.state === "recording") media.stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stopMeter.current = () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => undefined);
      setLevel(0);
    };

    media.onstop = async () => {
      stopMeter.current();
      stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
      const blob = new Blob(chunks, { type: media.mimeType || type || "audio/webm" });
      if (!heard || blob.size < 1500) {
        setMode("idle");
        onError?.("Didn't catch anything. Tap the mic and speak.");
        return;
      }
      setMode("transcribing");
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": blob.type.split(";")[0] || "audio/webm" },
          body: blob,
        });
        const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(body.error || "Transcription failed.");
        if (body.text) onFinal(body.text);
        else onError?.("Didn't catch that. Try again a little closer to the mic.");
      } catch (err) {
        onError?.((err as Error).message);
      } finally {
        setMode("idle");
      }
    };
    mediaRef.current = media;
    media.start();
    setMode("recording");
  }

  function toggle() {
    if (mode === "listening") return recRef.current?.stop();
    if (mode === "recording") return mediaRef.current?.stop();
    if (mode !== "idle") return;
    stopSpeaking();
    const Ctor = recognitionCtor();
    if (Ctor && !browserSttBroken) listen(Ctor);
    else if (canRecord()) record();
  }

  const live = mode === "listening" || mode === "recording";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || mode === "transcribing"}
      aria-pressed={live}
      title={live ? "Stop and ask" : mode === "transcribing" ? "Transcribing" : "Ask by voice"}
      className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-50 ${
        live ? "bg-signal text-white" : "border border-ink/20 bg-white/70 text-ink hover:border-ink"
      }`}
    >
      {live && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-signal/40 transition-transform duration-75"
          style={{ transform: `scale(${1 + (mode === "recording" ? level * 0.35 : 0.12)})` }}
        />
      )}
      {live && mode === "listening" && <span aria-hidden className="absolute inset-0 animate-ping rounded-xl bg-signal/25" />}
      {mode === "transcribing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : live ? (
        <Square className="relative h-3.5 w-3.5 fill-current" />
      ) : (
        <MicGlyph size={18} />
      )}
      <span className="sr-only">{live ? "Stop and ask" : "Ask by voice"}</span>
    </button>
  );
}
