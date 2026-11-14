import { loadDoc, validId } from "@/lib/store";
import type { RunDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A saved run, to reopen a past check without asking Cala again. Run ids are 12 random characters. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!validId(params.id)) return Response.json({ error: "Not found." }, { status: 404 });
  const run = await loadDoc<RunDoc>("runs", params.id);
  if (!run) return Response.json({ error: "That check has expired. Run it again." }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
