// Cala API client: paced, cached, and safe to call concurrently.
//
// Cala does not send rate-limit headers. So the client:
//   - runs requests through one process-wide priority queue,
//   - on a 429 stops everything and lets a single request probe every few
//     seconds until the window reopens,
//   - keeps every successful response on disk for CALA_CACHE_HOURS (24 by
//     default), and reports the age of anything it serves from there. A live
//     run (fresh: true) skips the stored copies and asks Cala again.

import { createHash } from "crypto";
import { cacheRead, cacheWrite } from "./store";

const BASE = "https://api.cala.ai/v1";
const CACHE_TTL_MS = Number(process.env.CALA_CACHE_HOURS || 24) * 3600 * 1000;
const PROBE_EVERY_MS = 5000;
const MAX_CONCURRENT = Math.max(1, Math.min(20, Number(process.env.CALA_MAX_CONCURRENT || 5)));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CalaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
  /** Cala refused the key (401/403): nothing in this run can be trusted. */
  get refused(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export const REFUSED_MESSAGE =
  "Cala refused the request (403 Forbidden). The API key may be out of credits, revoked or temporarily blocked. " +
  "Check it at console.cala.ai or ask the Cala team. No result was produced, so nothing here means \"no conflict\".";

type GateListener = (event: "limited" | "resumed") => void;

type Lane = "fast" | "slow";

interface QueuedTask {
  priority: number;
  seq: number;
  start: () => void;
}

/** One per process: orders requests and handles the shared rate limit. */
class Gate {
  // Slow natural-language queries get their own lane so they never hold up
  // the quick entity calls.
  private queues: Record<Lane, QueuedTask[]> = { fast: [], slow: [] };
  private active: Record<Lane, number> = { fast: 0, slow: 0 };
  private seq = 0;
  private blocked = false;
  private probing = false;
  private nextProbeAt = 0;
  listeners = new Set<GateListener>();

  /** Lower priority numbers run first. */
  schedule<T>(lane: Lane, priority: number, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask = {
        priority,
        seq: this.seq++,
        start: () => {
          this.active[lane]++;
          fn()
            .then(resolve, reject)
            .finally(() => {
              this.active[lane]--;
              this.pump(lane);
            });
        },
      };
      this.queues[lane].push(task);
      this.queues[lane].sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      this.pump(lane);
    });
  }

  private pump(lane: Lane) {
    while (this.active[lane] < MAX_CONCURRENT && this.queues[lane].length > 0) {
      this.queues[lane].shift()!.start();
    }
  }

  /** Resolves when this caller may send a request. */
  async waitOpen(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw new CalaError(499, "Cancelled");
      if (!this.blocked) return;
      const now = Date.now();
      if (!this.probing && now >= this.nextProbeAt) {
        this.probing = true; // this caller is the probe
        return;
      }
      await sleep(Math.min(1000, Math.max(100, this.nextProbeAt - now)));
    }
  }

  limited() {
    const first = !this.blocked;
    this.blocked = true;
    this.probing = false;
    this.nextProbeAt = Date.now() + PROBE_EVERY_MS;
    if (first) this.listeners.forEach((l) => l("limited"));
  }

  ok() {
    if (!this.blocked) return;
    this.blocked = false;
    this.probing = false;
    this.listeners.forEach((l) => l("resumed"));
  }
}

const globalForCala = globalThis as unknown as {
  __calaGate?: Gate;
  __calaInflight?: Map<string, Promise<unknown>>;
};
const gate = (globalForCala.__calaGate ??= new Gate());
const inflight = (globalForCala.__calaInflight ??= new Map<string, Promise<unknown>>());

async function readCache(key: string): Promise<{ t: number; data: unknown } | undefined> {
  const parsed = await cacheRead<{ t: number; data: unknown }>("cala", key);
  if (!parsed || Date.now() - parsed.t > CACHE_TTL_MS) return undefined;
  return parsed;
}

async function writeCache(key: string, req: string, data: unknown): Promise<void> {
  // A cache write failure only costs a repeat request later.
  await cacheWrite("cala", key, { t: Date.now(), req, data }, CACHE_TTL_MS / 1000);
}

export interface CalaEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
}

export interface CalaHooks {
  onCall?: () => void;
  /** savedAt: when Cala returned the stored response (epoch ms). */
  onCacheHit?: (savedAt: number) => void;
  onLimited?: () => void;
  /** Cala refused the key (401/403). */
  onRefused?: () => void;
  onResumed?: () => void;
}

export interface RelationshipQuery {
  outgoing?: Record<string, { limit: number; offset?: number }>;
  incoming?: Record<string, { limit: number; offset?: number }>;
}

export class Cala {
  private listener: GateListener;

  constructor(
    private apiKey: string,
    private hooks: CalaHooks = {},
    private signal?: AbortSignal,
    /** Skip stored responses and ask Cala again (still stores the new answers). */
    private fresh = false,
  ) {
    this.listener = (event) => {
      if (event === "limited") this.hooks.onLimited?.();
      else this.hooks.onResumed?.();
    };
    gate.listeners.add(this.listener);
  }

  dispose() {
    gate.listeners.delete(this.listener);
  }

  private async request<T>(
    method: "GET" | "POST",
    pathAndQuery: string,
    body: unknown,
    priority: number,
    timeoutMs: number,
  ): Promise<T> {
    const reqId = `${method} ${pathAndQuery} ${body ? JSON.stringify(body) : ""}`;
    const key = createHash("sha1").update(reqId).digest("hex");

    const cached = this.fresh ? undefined : await readCache(key);
    if (cached !== undefined) {
      this.hooks.onCacheHit?.(cached.t);
      return cached.data as T;
    }

    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;

    const lane: Lane = timeoutMs > 60_000 ? "slow" : "fast";
    const promise = gate
      .schedule(lane, priority, async () => {
        let networkFailures = 0;
        for (let attempt = 0; attempt < 80; attempt++) {
          await gate.waitOpen(this.signal);
          let res: Response;
          try {
            res = await fetch(`${BASE}${pathAndQuery}`, {
              method,
              headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
              body: body ? JSON.stringify(body) : undefined,
              cache: "no-store",
              signal: AbortSignal.timeout(timeoutMs),
            });
          } catch (err) {
            if (++networkFailures > 2) {
              throw new CalaError(0, `Cala request failed: ${(err as Error).message}`);
            }
            await sleep(1500);
            continue;
          }
          if (res.status === 429) {
            gate.limited();
            continue;
          }
          gate.ok();
          this.hooks.onCall?.();
          if (res.status >= 500 && ++networkFailures <= 2) {
            // Cala occasionally returns a transient 502/503; try again shortly.
            await sleep(2000);
            continue;
          }
          if (res.status === 401 || res.status === 403) {
            this.hooks.onRefused?.();
            throw new CalaError(res.status, REFUSED_MESSAGE);
          }
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new CalaError(res.status, `Cala ${res.status}: ${text.slice(0, 200)}`);
          }
          const data = (await res.json()) as T;
          await writeCache(key, reqId, data);
          return data;
        }
        throw new CalaError(429, "Cala rate limit did not clear in time");
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
  }

  /** Fuzzy name search. Fast. */
  async search(name: string, priority = 0, limit = 10): Promise<CalaEntity[]> {
    const data = await this.request<{ entities?: CalaEntity[] }>(
      "GET",
      `/entities?name=${encodeURIComponent(name.slice(0, 100))}&limit=${limit}`,
      undefined,
      priority,
      45_000,
    );
    return data.entities || [];
  }

  /** Typed entity data with the requested properties and relationships. */
  async retrieve(
    id: string,
    query: { properties?: string[]; relationships?: RelationshipQuery },
    priority = 0,
  ): Promise<RawEntity> {
    return this.request<RawEntity>("POST", `/entities/${id}`, query, priority, 60_000);
  }

  /** Structured rows from a natural-language question. Slow: 30 to 60 seconds. */
  async query(input: string, priority = 5): Promise<{ results: Record<string, unknown>[] }> {
    const data = await this.request<{ results?: Record<string, unknown>[] }>(
      "POST",
      `/knowledge/query`,
      { input, return_entities: false },
      priority,
      150_000,
    );
    return { results: Array.isArray(data.results) ? data.results : [] };
  }

  /** Which properties, relationships and time series this record has. Fast. */
  async introspect(
    id: string,
    priority = 3,
  ): Promise<{ properties: string[]; relationships: { outgoing: string[]; incoming: string[] } }> {
    const data = await this.request<{
      properties?: string[];
      relationships?: { outgoing?: string[]; incoming?: string[] };
    }>("GET", `/entities/${id}/introspection`, undefined, priority, 45_000);
    return {
      properties: data.properties || [],
      relationships: { outgoing: data.relationships?.outgoing || [], incoming: data.relationships?.incoming || [] },
    };
  }

  /** A written answer with the documents it drew on (Cala Knowledge Search). Slow: 30 to 60 seconds. */
  async knowledgeSearch(
    input: string,
    priority = 6,
  ): Promise<{ content: string; context: { content?: string; origins?: KnowledgeOrigin[] }[] }> {
    const data = await this.request<{
      content?: string;
      context?: { content?: string; origins?: KnowledgeOrigin[] }[];
    }>("POST", `/knowledge/search`, { input, explainability: false, return_entities: false }, priority, 150_000);
    return { content: typeof data.content === "string" ? data.content : "", context: Array.isArray(data.context) ? data.context : [] };
  }

  /** Same as query, but also returns the graph entities Cala matched. */
  async queryWithEntities(
    input: string,
    priority = 5,
  ): Promise<{ results: Record<string, unknown>[]; entities: CalaEntity[] }> {
    const data = await this.request<{ results?: Record<string, unknown>[]; entities?: CalaEntity[] | null }>(
      "POST",
      `/knowledge/query`,
      { input, return_entities: true },
      priority,
      150_000,
    );
    return {
      results: Array.isArray(data.results) ? data.results : [],
      entities: Array.isArray(data.entities) ? data.entities : [],
    };
  }
}

export interface KnowledgeOrigin {
  source?: { name?: string; url?: string };
  document?: { name?: string; url?: string };
}

export interface RawSource {
  name?: string;
  document?: unknown;
  date?: string;
  source_rank?: string;
}

export interface RawEdge {
  id: string;
  name: string;
  entity_type: string;
  properties?: { role?: string; is_lead?: boolean; sources?: RawSource[] } & Record<string, unknown>;
}

export interface RawEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
  properties?: Record<string, { value?: unknown; sources?: RawSource[] }>;
  relationships?: {
    outgoing?: Record<string, RawEdge[]>;
    incoming?: Record<string, RawEdge[]>;
  };
}
