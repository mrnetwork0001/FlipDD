import { transcribe } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST raw audio (the browser's recording, any audio/* type) → { text }. Used where the browser can't do speech-to-text itself. */
export async function POST(req: Request) {
  const mime = req.headers.get("content-type") || "audio/webm";
  if (!mime.startsWith("audio/") && !mime.startsWith("video/")) {
    return Response.json({ error: "Send the recording as audio." }, { status: 415 });
  }
  if (Number(req.headers.get("content-length") || 0) > 15 * 1024 * 1024) {
    return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });
  }
  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.length < 1000) return Response.json({ error: "Didn't catch anything. Hold the mic a bit longer." }, { status: 400 });
  try {
    const text = await transcribe(audio, mime.replace(/^video\//, "audio/"));
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
