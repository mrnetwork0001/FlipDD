import { Cala } from "@/lib/cala";
import { investorDossier } from "@/lib/dossier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** POST { investor } → a cited profile of the investor from Cala Knowledge Search. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { investor?: unknown } | null;
  const investor = typeof body?.investor === "string" ? body.investor.trim() : "";
  if (investor.length < 2 || investor.length > 120) {
    return Response.json({ error: "Give an investor name." }, { status: 400 });
  }
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey || apiKey === "your_cala_api_key_here") {
    return Response.json({ error: "CALA_API_KEY is not set." }, { status: 500 });
  }
  const cala = new Cala(apiKey, {}, req.signal);
  try {
    const dossier = await investorDossier(cala, investor);
    if (!dossier.markdown) return Response.json({ error: "Cala had no profile for this investor." }, { status: 404 });
    return Response.json(dossier);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  } finally {
    cala.dispose();
  }
}
