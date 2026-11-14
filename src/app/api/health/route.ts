import { spawnSync } from "node:child_process";
import { DATA_ROOT, sharedStore } from "@/lib/store";
import { ffmpegPath } from "@/lib/voice";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const set = (k: string) => Boolean(process.env[k]?.trim()) && !/^your_/.test(process.env[k] || "");

let ffmpeg: boolean | undefined;
const hasFfmpeg = () =>
  (ffmpeg ??= spawnSync(ffmpegPath(), ["-version"], { timeout: 3000 }).status === 0);

/** Liveness for the host's health check, plus which features are switched on. Says nothing secret: only yes or no. */
export async function GET() {
  let writable = false;
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.accessSync(DATA_ROOT, fs.constants.W_OK);
    writable = true;
  } catch {
    /* reported below */
  }
  return Response.json({
    ok: true,
    features: {
      cala: set("CALA_API_KEY"),
      gemini: set("GEMINI_API_KEY"),
      news: set("CONTEXT_DEV_API_KEY"),
      telegram: set("TELEGRAM_BOT_TOKEN"),
      telegramVoiceReplies: set("TELEGRAM_BOT_TOKEN") && set("GEMINI_API_KEY") && hasFfmpeg(),
      phone: set("TWILIO_AUTH_TOKEN"),
      mcpTokenRequired: set("FLIPDD_MCP_TOKEN"),
      publicUrl: set("FLIPDD_PUBLIC_URL"),
    },
    storage: { shared: sharedStore(), persistent: sharedStore() || set("FLIPDD_DATA_DIR"), writable },
  });
}
