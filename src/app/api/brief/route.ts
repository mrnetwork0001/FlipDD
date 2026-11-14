import { loadDoc, newId, saveDoc, validId } from "@/lib/store";
import type { BriefDoc, RunDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cuts a one-investor brief out of a finished run the server saved itself. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: unknown; investor?: unknown } | null;
  const runId = typeof body?.runId === "string" ? body.runId : "";
  const investor = typeof body?.investor === "string" ? body.investor : "";
  if (!validId(runId) || !investor) {
    return Response.json({ error: "Run the check first, then share a brief." }, { status: 400 });
  }
  const run = await loadDoc<RunDoc>("runs", runId);
  if (!run) return Response.json({ error: "That run has expired. Run the check again." }, { status: 404 });
  const result = run.investors.find((r) => r.input === investor);
  if (!result) return Response.json({ error: "That investor is not in this run." }, { status: 404 });
  if (!run.finished) {
    return Response.json({ error: "Wait for the check to finish before sharing." }, { status: 409 });
  }

  const id = newId();
  const doc: BriefDoc = {
    id,
    createdAt: new Date().toISOString(),
    startupName: run.startupName,
    competitors: run.competitors,
    investor: result,
    slushCompetitors: run.slush?.competitors.filter((c) => c.backedBy.includes(result.input)),
    slushEvent: run.slush?.event.name,
  };
  await saveDoc("briefs", id, doc);
  return Response.json({ id, url: `/brief/${id}` });
}
