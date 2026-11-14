// Server-side voice on the same Gemini key: speech to text for the mic and
// Telegram voice notes, text to speech for Telegram voice replies, and an
// ffmpeg step to turn that speech into the OGG/Opus Telegram plays inline.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { geminiJson, geminiKey, geminiModel } from "./gemini";
import { parseSpokenCheck, type SpokenCheck } from "./voiceScript";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

let ttsModelPromise: Promise<string | null> | null = null;

/** Newest Flash TTS model the key can use (GEMINI_TTS_MODEL overrides). */
async function ttsModel(key: string): Promise<string | null> {
  const forced = process.env.GEMINI_TTS_MODEL?.trim();
  if (forced) return forced.replace(/^models\//, "");
  return (ttsModelPromise ??= (async () => {
    try {
      const res = await fetch(`${BASE}/models?pageSize=1000`, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return "gemini-2.5-flash-preview-tts";
      const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const names = (body.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /^gemini-[\d.]+-flash(-preview)?-tts(-preview)?$/.test(n));
      const ver = (n: string) => Number(n.match(/gemini-([\d.]+)/)?.[1] || 0);
      const stable = names.filter((n) => !n.includes("preview"));
      const pool = (stable.length ? stable : names).sort((a, b) => ver(b) - ver(a));
      return pool[0] || null;
    } catch {
      ttsModelPromise = null;
      return "gemini-2.5-flash-preview-tts";
    }
  })());
}

interface GenResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] } }[];
  error?: { message?: string };
}

async function generate(model: string, key: string, body: unknown, timeoutMs: number): Promise<GenResponse> {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as GenResponse;
  if (!res.ok) throw new Error(json.error?.message || `Gemini ${res.status}`);
  return json;
}

/** Gemini's audio formats: WAV, MP3, AIFF, AAC, OGG, FLAC; browsers record WebM or MP4. */
function audioMime(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m === "audio/x-m4a" || m === "audio/m4a") return "audio/mp4";
  if (m === "audio/oga" || m === "audio/opus") return "audio/ogg";
  return m || "audio/ogg";
}

/** What was said, in the speaker's words; empty when nothing intelligible was heard. */
export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("Voice needs GEMINI_API_KEY.");
  if (audio.length > 18 * 1024 * 1024) throw new Error("That recording is too long. Keep it under a minute.");
  const model = await geminiModel();
  if (!model) throw new Error("No Gemini model available for transcription.");
  const out = await generate(
    model,
    key,
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: audioMime(mime), data: audio.toString("base64") } },
            {
              text:
                "Transcribe this voice note word for word, in the language spoken. It is a startup founder asking about " +
                "investors and competitors, so spell fund and company names the way they are usually written " +
                "(Creandum, Northzone, Lovable, a16z, Index Ventures). Return only the transcript, no quotes or notes. " +
                "If nothing intelligible is said, return an empty string.",
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
    },
    45_000,
  );
  const text = (out.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("")
    .trim();
  return text.replace(/^["'“]|["'”]$/g, "").trim();
}

/** 16-bit mono PCM to a WAV file. */
function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Speech as a WAV file, or null when TTS is unavailable on this key. */
export async function synthesize(text: string): Promise<Buffer | null> {
  const key = geminiKey();
  if (!key) return null;
  const model = await ttsModel(key);
  if (!model) return null;
  const out = await generate(
    model,
    key,
    {
      contents: [{ parts: [{ text: `Read this calmly and clearly, like a briefing before a meeting:\n\n${text.slice(0, 3500)}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || "Kore" } } },
      },
    },
    90_000,
  );
  const part = out.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData) return null;
  const bytes = Buffer.from(part.inlineData.data, "base64");
  if (bytes.subarray(0, 4).toString() === "RIFF") return bytes;
  const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] || 24000);
  return pcmToWav(bytes, rate);
}

/** FFMPEG_PATH, else the binary bundled by ffmpeg-static (serverless hosts have no ffmpeg), else ffmpeg on PATH. */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return existsSync(bundled) ? bundled : "ffmpeg";
}

/** WAV to OGG/Opus (Telegram's voice format). Null when ffmpeg is not installed. */
export function toOggOpus(wav: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let p;
    try {
      p = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-ac", "1", "-f", "ogg", "pipe:1"]);
    } catch {
      return resolve(null);
    }
    const chunks: Buffer[] = [];
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.on("error", () => resolve(null));
    p.on("close", (code) => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
    p.stdin.on("error", () => undefined);
    p.stdin.end(wav);
  });
}

/** Seconds of audio in a 16-bit mono WAV, for Telegram's duration field. */
export function wavSeconds(wav: Buffer): number {
  const rate = wav.readUInt32LE(24) || 24000;
  return Math.max(1, Math.round((wav.length - 44) / (rate * 2)));
}

export type SpokenRequest = ({ kind: "check" } & SpokenCheck) | { kind: "ask"; question: string };

/**
 * What a spoken message wants: a check of a meeting list, or a question for
 * Ask Cala. Rules first; Gemini reads the phrasings the rules miss.
 */
export async function interpretSpoken(text: string): Promise<SpokenRequest> {
  const rule = parseSpokenCheck(text);
  if (rule) return { kind: "check", ...rule };
  if (/\?\s*$/.test(text) || /^(who|what|which|when|where|why|how|has|have|did|does|is|are|tell me)\b/i.test(text.trim())) {
    return { kind: "ask", question: text };
  }
  const out = await geminiJson<{ kind: string; investors?: string[]; competitors?: string[]; description?: string }>(
    "A startup founder spoke to FlipDD, which checks investors against the founder's competitors. Decide whether they " +
      "want a CHECK (they name investors they are meeting and one or more competitors) or are ASKING a question. For a " +
      "check, list the investor names and competitor names exactly as said (fix obvious transcription spelling of well-known " +
      "funds and startups), and what their startup builds if they said it. Never invent names.",
    text,
    {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["check", "ask"] },
        investors: { type: "ARRAY", items: { type: "STRING" } },
        competitors: { type: "ARRAY", items: { type: "STRING" } },
        description: { type: "STRING" },
      },
      required: ["kind"],
    },
  );
  const investors = (out?.investors || []).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const competitors = (out?.competitors || []).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  if (out?.kind === "check" && investors.length && competitors.length) {
    return { kind: "check", investors, competitors, description: (out.description || "").slice(0, 400) };
  }
  return { kind: "ask", question: text };
}
