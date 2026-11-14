// Context.dev News API: live news about a company, used by the watchlist to
// spot new rounds after the Cala check. Docs: https://docs.context.dev/news/overview

import { diskCache } from "./store";
import type { NewsArticle } from "./types";

const BASE = "https://api.context.dev/v1";
// Short cache: the point of the watchlist is fresh news.
const cache = diskCache("contextdev", 0.5);

export function contextDevKey(): string | undefined {
  const key = process.env.CONTEXT_DEV_API_KEY?.trim();
  return key && key !== "your_context_dev_api_key_here" ? key : undefined;
}

export class ContextDevError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface RawArticle {
  id: string;
  story_id?: string;
  url: string;
  title: string;
  description?: string | null;
  published_at?: string | null;
  type?: string;
  source?: { name?: string; domain?: string };
  match?: { level?: "primary" | "secondary"; confidence?: number | null } | null;
}

export interface CompanyNews extends NewsArticle {
  storyId?: string;
  matchLevel?: "primary" | "secondary";
}

/** News about one company by name, newest first, within the last `days`. */
export async function companyNews(
  name: string,
  days: number,
  opts: { force?: boolean; signal?: AbortSignal; limit?: number } = {},
): Promise<CompanyNews[]> {
  const key = contextDevKey();
  if (!key) throw new ContextDevError("CONTEXT_DEV_API_KEY is not set", 500);
  // Round the window to the hour so repeat checks within the cache window share a key.
  const hour = 3600_000;
  const to = Math.ceil(Date.now() / hour) * hour;
  const body = {
    searchBy: { type: "entity", entity: { type: "name", name: name.slice(0, 200) } },
    filterBy: { date: { from: to - days * 86_400_000, to } },
    sortBy: { type: "newest" },
    limit: Math.min(100, opts.limit ?? 40),
  };
  if (!opts.force) {
    const hit = await cache.get<CompanyNews[]>(body);
    if (hit) return hit;
  }

  let lastError: ContextDevError | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}/news/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    if (res.status === 429 || res.status >= 500) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      lastError = new ContextDevError(`Context.dev ${res.status}`, res.status);
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 30
          ? retryAfter * 1000
          : Number.isFinite(reset) && reset > 0 && reset < 30
            ? reset * 1000
            : 1500 * 2 ** attempt + Math.random() * 500;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new ContextDevError(payload?.message || `Context.dev ${res.status}`, res.status);
    }
    const payload = (await res.json()) as { data?: RawArticle[] };
    const out: CompanyNews[] = (payload.data || [])
      .filter((a) => a && a.url && a.title)
      .map((a) => ({
        id: a.id,
        storyId: a.story_id,
        url: a.url,
        title: a.title,
        description: a.description || undefined,
        publishedAt: a.published_at || undefined,
        source: a.source?.name || a.source?.domain || new URL(a.url).hostname,
        type: a.type,
        matchLevel: a.match?.level,
      }));
    await cache.set(body, out);
    return out;
  }
  throw lastError || new ContextDevError("Context.dev did not answer", 502);
}
