import { askCala, type AskEvent } from "@/lib/askAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const list = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 100)).filter(Boolean).slice(0, max) : [];

/**
 * POST { question, context? } → NDJSON stream from an agent walking Cala's
 * graph through Cala's MCP server: {type:"thinking"}, {type:"step"} for each
 * Cala call as it finishes, then {type:"answer"} or {type:"error"}.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    question?: unknown;
    context?: { startupName?: unknown; description?: unknown; competitors?: unknown; investors?: unknown };
  } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (question.length < 5) return Response.json({ error: "Ask a question." }, { status: 400 });
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey || apiKey === "your_cala_api_key_here") {
    return Response.json({ error: "CALA_API_KEY is not set." }, { status: 500 });
  }
  const c = body?.context || {};
  const ctx = {
    startupName: typeof c.startupName === "string" ? c.startupName.slice(0, 100) : undefined,
    description: typeof c.description === "string" ? c.description.slice(0, 400) : undefined,
    competitors: list(c.competitors, 6),
    investors: list(c.investors, 12),
  };

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: AskEvent | { type: "answer"; [k: string]: unknown } | { type: "error"; message: string }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
      askCala(question, ctx, apiKey, req.signal, send)
        .then((out) => send({ type: "answer", ...out }))
        .catch((err) => send({ type: "error", message: (err as Error).message }))
        .finally(() => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // the client already went away
          }
        });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
