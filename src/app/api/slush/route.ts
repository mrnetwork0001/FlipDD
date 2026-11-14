import { calaKeyFor } from "@/lib/calaKey";
import { Cala } from "@/lib/cala";
import { loadSlushEvent } from "@/lib/slush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The Slush 2026 event as Cala records it: name, description and attendee count. */
export async function GET(req: Request) {
  const apiKey = calaKeyFor(req);
  if (!apiKey || apiKey === "your_cala_api_key_here") {
    return Response.json({ error: "CALA_API_KEY is not set." }, { status: 500 });
  }
  const cala = new Cala(apiKey);
  try {
    const event = await loadSlushEvent(cala);
    return Response.json({
      id: event.id,
      name: event.name,
      description: event.description,
      attendees: event.attendees.length,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  } finally {
    cala.dispose();
  }
}
