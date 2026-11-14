import { Cala } from "@/lib/cala";
import { discoverCompetitors } from "@/lib/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { startupName?: unknown; description?: unknown } | null;
  const startupName = typeof body?.startupName === "string" ? body.startupName.trim().slice(0, 100) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 600) : "";
  if (description.length < 15) {
    return Response.json({ error: "Describe what you build in a sentence first." }, { status: 400 });
  }
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey || apiKey === "your_cala_api_key_here") {
    return Response.json({ error: "CALA_API_KEY is not set." }, { status: 500 });
  }
  const cala = new Cala(apiKey, {}, req.signal);
  try {
    const result = await discoverCompetitors(cala, startupName, description, req.signal);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  } finally {
    cala.dispose();
  }
}
