import { calaKeyFor } from "@/lib/calaKey";
import { analyze } from "@/lib/engine";
import { newId, saveDoc } from "@/lib/store";
import { computeRoundRisk } from "@/lib/roundRisk";
import type {
  AnalyzeEvent,
  AnalyzeInput,
  CompetitorSummary,
  FinderReport,
  InvestorResult,
  RunDoc,
  RunLogLine,
  SlushReport,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SLOW_MESSAGE =
  "Cala's rate limit slowed this check down, so it stopped before the time limit, and nothing here is a result yet. " +
  "Everything fetched so far is saved: run the check again to finish it (it picks up where it stopped), or use your own Cala key.";

export const maxDuration = 300; // the most Vercel allows on Hobby

const MAX_INVESTORS = 12;
const MAX_COMPETITORS = 6;
const MAX_LOG = 400;

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim().replace(/\s+/g, " ").slice(0, 100);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, max);
}

function cleanIds(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [name, id] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) out[name.trim().slice(0, 100)] = id;
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<AnalyzeInput> | null;
  const input: AnalyzeInput = {
    startupName: typeof body?.startupName === "string" ? body.startupName.trim().slice(0, 100) : "",
    description: typeof body?.description === "string" ? body.description.trim().slice(0, 600) : "",
    competitors: cleanList(body?.competitors, MAX_COMPETITORS),
    investors: cleanList(body?.investors, MAX_INVESTORS),
    competitorIds: cleanIds(body?.competitorIds),
    fresh: body?.fresh === true,
  };
  if (!input.investors.length) {
    return Response.json({ error: "Add at least one investor to check." }, { status: 400 });
  }
  const apiKey = calaKeyFor(req);
  if (!apiKey || apiKey === "your_cala_api_key_here") {
    return Response.json(
      { error: "CALA_API_KEY is not set. Add it to .env.local and restart the server." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  // The server keeps its own record of the run (results, every progress line,
  // the Slush report), so a shared brief or the landing page can only show
  // what this run actually found.
  const runId = newId();
  const started = Date.now();
  const createdAt = new Date(started).toISOString();
  const latest = new Map<string, InvestorResult>();
  const competitorSummaries = new Map<string, CompetitorSummary>();
  const log: RunLogLine[] = [];
  let slush: SlushReport | undefined;
  let finder: FinderReport | undefined;
  let stats: RunDoc["stats"];
  let ms: number | undefined;
  let finished = false;
  let pendingDone: Promise<void> = Promise.resolve();
  const saveRun = () => {
    const results = input.investors.map((n) => latest.get(n)).filter((r): r is InvestorResult => Boolean(r));
    const doc: RunDoc = {
      id: runId,
      createdAt,
      startupName: input.startupName,
      description: input.description,
      competitors: input.competitors,
      investorInputs: input.investors,
      investors: results,
      round: computeRoundRisk(results, slush),
      competitorSummaries: input.competitors
        .map((n) => competitorSummaries.get(n))
        .filter((c): c is CompetitorSummary => Boolean(c)),
      slush,
      finder,
      log,
      stats,
      ms,
      finished,
    };
    return saveDoc("runs", runId, doc).catch(() => undefined);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AnalyzeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const emit = (event: AnalyzeEvent) => {
        switch (event.type) {
          case "investor":
            latest.set(event.data.input, event.data);
            break;
          case "competitor":
            competitorSummaries.set(event.data.input, event.data);
            break;
          case "step":
            if (log.length < MAX_LOG) {
              log.push({ t: Date.now() - started, scope: event.scope, text: event.text, state: event.state });
            }
            break;
          case "slush":
            slush = event.data;
            break;
          case "finder":
            finder = event.data;
            break;
          case "stats":
            stats = { calls: event.calls, cached: event.cached, oldestCachedAt: event.oldestCachedAt, fresh: event.fresh };
            break;
          case "done":
            finished = true;
            ms = event.ms;
            // Save before telling the client, so "Share brief" works at once.
            pendingDone = saveRun().then(() => send(event));
            return;
        }
        send(event);
      };
      send({ type: "run", id: runId });
      // Stop cleanly before the host's 300 s limit. When Cala's rate limit holds a
      // check back (about 10 requests a minute on a free key), the founder gets
      // what was found, and everything fetched is cached for the next run.
      const budget = AbortSignal.timeout(Number(process.env.CHECK_BUDGET_MS || 270_000));
      const signal = AbortSignal.any([req.signal, budget]);
      analyze(input, emit, apiKey, signal).finally(async () => {
        if (!finished && budget.aborted && !req.signal.aborted && !closed) send({ type: "error", message: SLOW_MESSAGE });
        if (finished) await pendingDone;
        else await saveRun();
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
