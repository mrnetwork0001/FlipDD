import { contextDevKey } from "@/lib/contextdev";
import { loadDoc, saveDoc } from "@/lib/store";
import type { WatchDoc } from "@/lib/types";
import { checkWatch } from "@/lib/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Runs the news check for a saved watchlist. ?force=1 skips the 30-minute cache. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const doc = await loadDoc<WatchDoc>("watch", params.id);
  if (!doc) return Response.json({ error: "No watchlist with this link." }, { status: 404 });
  if (!contextDevKey()) {
    return Response.json({ error: "CONTEXT_DEV_API_KEY is not set on the server." }, { status: 500 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const { report, seen } = await checkWatch(doc, { force, signal: req.signal });
    if (report.errors.length < doc.investors.length + doc.competitors.length) {
      await saveDoc("watch", doc.id, { ...doc, seen, lastCheckedAt: report.checkedAt });
    }
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
