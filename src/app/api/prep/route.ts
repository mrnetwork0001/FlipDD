import { calaKeyFor } from "@/lib/calaKey";
import { exitsOf, marketOf, meetingPrep } from "@/lib/prep";
import type { CompetitorSummary, InvestorResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST { part?: "core" | "exits" | "market", investor, competitors, startupName, description }
 * core: the meeting note's Cala facts (entity calls, a few seconds).
 * exits / market: Cala knowledge queries (30 to 60 seconds), loaded after the note opens.
 */
export async function POST(req: Request) {
  const apiKey = calaKeyFor(req);
  if (!apiKey || apiKey === "your_cala_api_key_here") return Response.json({ error: "CALA_API_KEY is not set." }, { status: 500 });
  const body = (await req.json().catch(() => null)) as {
    part?: string; investor?: InvestorResult; competitors?: CompetitorSummary[]; startupName?: string; description?: string;
  } | null;
  const inv = body?.investor;
  if (!inv || !Array.isArray(inv.entities)) return Response.json({ error: "Send the investor from a finished check." }, { status: 400 });
  try {
    if (body?.part === "exits") return Response.json({ rows: await exitsOf(inv.name, apiKey) });
    if (body?.part === "market") {
      const d = (body.description || "").trim();
      if (d.length < 15) return Response.json({ rows: [], note: "Add a description of what you build to see who raised in your space." });
      return Response.json({ rows: await marketOf(d, apiKey) });
    }
    const competitors = Array.isArray(body?.competitors) ? body!.competitors.slice(0, 6) : [];
    const prep = await meetingPrep({ investor: inv, competitors, startupName: String(body?.startupName || "").slice(0, 100) }, apiKey, req.signal);
    return Response.json(prep);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
