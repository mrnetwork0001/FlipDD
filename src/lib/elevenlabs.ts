// ElevenLabs speech for the Listen buttons and Play my day. The key stays on
// the server; each spoken chunk is cached (files or Redis), so a briefing
// heard twice costs nothing the second time.

import { createHash } from "crypto";
import { cacheRead, cacheWrite } from "./store";

const API = "https://api.elevenlabs.io/v1";

export const elevenKey = () => {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  return k && !/^your_/.test(k) ? k : undefined;
};

/** Liam: an energetic, quick American-English voice. Override with ELEVENLABS_VOICE_ID. */
export const voiceId = () => process.env.ELEVENLABS_VOICE_ID?.trim() || "TX3LPaxmHKxFdv7VOQHJ";
/** Flash: low latency, made for live playback. Override with ELEVENLABS_MODEL. */
const model = () => process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";

/** Spellings the voice gets right: names it would otherwise guess at. */
export function forVoice(text: string): string {
  return text.replace(/\bFlipDD\b/g, "Flip-D-D").replace(/\bCala\b/g, "Kahla").replace(/\bCala's\b/g, "Kahla's");
}

/** MP3 of `text`. Throws with ElevenLabs' message on failure (never the key). */
export async function elevenSpeech(text: string): Promise<Buffer> {
  const key = elevenKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const spoken = forVoice(text);
  const id = createHash("sha1").update(JSON.stringify([voiceId(), model(), spoken])).digest("hex");
  const hit = await cacheRead<{ t: number; mp3: string }>("tts", id);
  if (hit?.mp3) return Buffer.from(hit.mp3, "base64");
  const res = await fetch(`${API}/text-to-speech/${voiceId()}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: spoken,
      model_id: model(),
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true, speed: Number(process.env.ELEVENLABS_SPEED || 1.15) },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const mp3 = Buffer.from(await res.arrayBuffer());
  await cacheWrite("tts", id, { t: Date.now(), mp3: mp3.toString("base64") }, 30 * 86400);
  return mp3;
}

/** The same voice as an Ogg Opus voice note: Telegram's own format, so no conversion is needed. */
export async function elevenOpus(text: string): Promise<Buffer> {
  const key = elevenKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const spoken = forVoice(text).slice(0, 4500);
  const id = createHash("sha1").update(JSON.stringify(["opus", voiceId(), model(), spoken])).digest("hex");
  const hit = await cacheRead<{ t: number; ogg: string }>("tts", id);
  if (hit?.ogg) return Buffer.from(hit.ogg, "base64");
  const res = await fetch(`${API}/text-to-speech/${voiceId()}?output_format=opus_48000_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: spoken,
      model_id: model(),
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true, speed: Number(process.env.ELEVENLABS_SPEED || 1.15) },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const ogg = Buffer.from(await res.arrayBuffer());
  await cacheWrite("tts", id, { t: Date.now(), ogg: ogg.toString("base64") }, 30 * 86400);
  return ogg;
}
