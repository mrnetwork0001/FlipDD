"use client";

// Listen / Stop for any spoken text. The text is built when pressed, so a row
// still filling in is read as it stands at that moment.

import { useEffect, useId, useState } from "react";
import { Square } from "lucide-react";
import { ListenGlyph } from "./Glyphs";
import { onSpeechChange, speak, speakingId, speechSupported, stopSpeaking } from "@/lib/client/speech";

export default function SpeakButton({
  text,
  label = "Listen",
  className = "",
  tone = "light",
  id: fixedId,
}: {
  /** The words to say, or a function that builds them when pressed. */
  text: string | (() => string);
  label?: string;
  className?: string;
  tone?: "light" | "dark" | "solid";
  /** Lets another control (the mic) start or stop this same player. */
  id?: string;
}) {
  const autoId = useId();
  const id = fixedId || autoId;
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // ElevenLabs plays through an audio element, which every browser has; the built-in voice is the fallback.
    setSupported(typeof Audio !== "undefined" || speechSupported());
    setOn(speakingId() === id);
    return onSpeechChange((p, f) => {
      setOn(p === id);
      setFailed(f === id);
    });
  }, [id]);
  useEffect(() => () => {
    if (speakingId() === id) stopSpeaking();
  }, [id]);
  if (!supported) return null;

  const styles = {
    light: on ? "bg-ink text-paper" : "border border-ink/20 text-ink/80 hover:border-ink hover:text-ink",
    dark: on ? "bg-paper text-ink" : "border border-paper/30 text-paper/85 hover:border-paper hover:text-paper",
    solid: on ? "bg-signal text-white" : "bg-ink text-paper hover:bg-ink/85",
  }[tone];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (on) stopSpeaking();
        else speak(id, typeof text === "function" ? text() : text);
      }}
      aria-pressed={on}
      title={failed ? "This browser didn't play any speech. Check the volume, or try Chrome or Safari." : on ? "Stop" : label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${styles} ${className}`}
    >
      {on ? <Square className="h-3 w-3 fill-current" /> : <ListenGlyph size={13} />}
      {on ? "Stop" : failed ? "No sound? Tap to retry" : label}
      {on && (
        <span className="flex h-3 items-end gap-[2px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="voice-bar w-[2px] rounded-full bg-current" style={{ animationDelay: `${i * 0.14}s` }} />
          ))}
        </span>
      )}
    </button>
  );
}
