import { elevenKey, elevenSpeech } from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 1200;
// Per-visitor limit, so an open endpoint can't burn the ElevenLabs credits.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 150;
const g = globalThis as unknown as { __flipddSpeak?: Map<string, number[]> };
const hits = (g.__flipddSpeak ??= new Map<string, number[]>());

/** GET: is ElevenLabs speech available? The browser falls back to its own voice when not. */
export async function GET() {
  return Response.json({ enabled: Boolean(elevenKey()) });
}

/** POST { text } -> audio/mpeg in FlipDD's ElevenLabs voice. */
export async function POST(req: Request) {
  if (!elevenKey()) return Response.json({ error: "ElevenLabs is not configured." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return Response.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  recent.push(now);
  hits.set(ip, recent);

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Send at most ${MAX_CHARS} characters at a time.` }, { status: 413 });
  try {
    const mp3 = await elevenSpeech(text);
    return new Response(new Uint8Array(mp3), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
