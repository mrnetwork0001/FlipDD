import { contextDevKey } from "@/lib/contextdev";
import { newId, saveDoc } from "@/lib/store";
import type { WatchDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown, max: number) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 100)))]
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Saves a meeting list to watch. The check itself runs on GET /api/watch/[id]. */
export async function POST(req: Request) {
  if (!contextDevKey()) {
    return Response.json(
      { error: "Watching needs CONTEXT_DEV_API_KEY in .env.local (credits code JUNCTION26 at context.dev)." },
      { status: 500 },
    );
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const investors = clean(body?.investors, 12);
  const competitors = clean(body?.competitors, 6);
  if (!investors.length || !competitors.length) {
    return Response.json({ error: "Add at least one investor and one competitor to watch." }, { status: 400 });
  }
  const id = newId();
  const doc: WatchDoc = {
    id,
    createdAt: new Date().toISOString(),
    startupName: typeof body?.startupName === "string" ? body.startupName.trim().slice(0, 100) : "",
    investors,
    competitors,
    seen: [],
  };
  await saveDoc("watch", id, doc);
  return Response.json({ id, url: `/watch/${id}` });
}
