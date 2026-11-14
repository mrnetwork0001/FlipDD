// Storage for runs, briefs and watchlists, plus caches of third-party answers.
//
// Two backends:
// - Redis over HTTP (Upstash, e.g. added through Vercel's Storage tab), when
//   KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + _TOKEN)
//   are set. Shared by every server instance, so shared links, history and
//   caches survive serverless cold starts.
// - JSON files under FLIPDD_DATA_DIR (default .cache/, git-ignored; /tmp on
//   Vercel, where only /tmp is writable). Fine locally or with a persistent volume.

import { createHash, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";

export const DATA_ROOT =
  process.env.FLIPDD_DATA_DIR?.trim() || (process.env.VERCEL ? "/tmp/flipdd" : path.join(process.cwd(), ".cache"));
const ROOT = DATA_ROOT;

const REDIS_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
const REDIS_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
export const sharedStore = () => Boolean(REDIS_URL && REDIS_TOKEN);

/** One Redis command over Upstash's REST API. */
async function redis<T = unknown>(cmd: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const out = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || out.error) throw new Error(`Redis ${cmd[0]}: ${out.error || res.status}`);
  return out.result as T;
}

// Large values (a fund with hundreds of portfolio links) stay below Upstash's request limit.
const MAX_SHARED_BYTES = 5 * 1024 * 1024;

export type StoreKind = "briefs" | "watch" | "runs";

const ID_RE = /^[a-z0-9]{12}$/;

export function newId(): string {
  // 12 base-36 characters: about 62 bits, hard to guess.
  const bytes = randomBytes(12);
  return [...bytes].map((b) => (b % 36).toString(36)).join("");
}

export const validId = (id: string) => ID_RE.test(id);

function fileFor(kind: StoreKind, id: string): string {
  if (!validId(id)) throw new Error("Bad id");
  return path.join(ROOT, kind, `${id}.json`);
}

export async function saveDoc<T>(kind: StoreKind, id: string, doc: T): Promise<void> {
  if (!validId(id)) throw new Error("Bad id");
  if (sharedStore()) {
    await redis(["SET", `doc:${kind}:${id}`, JSON.stringify(doc)]);
    await redis(["ZADD", `docs:${kind}`, Date.now(), id]);
    return;
  }
  const file = fileFor(kind, id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc));
  await fs.rename(tmp, file);
}

export async function loadDoc<T>(kind: StoreKind, id: string): Promise<T | null> {
  if (!validId(id)) return null;
  try {
    if (sharedStore()) {
      const raw = await redis<string | null>(["GET", `doc:${kind}:${id}`]);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    return JSON.parse(await fs.readFile(fileFor(kind, id), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Ids of stored documents of one kind, newest first. */
export async function listDocs(kind: StoreKind, limit = 50): Promise<string[]> {
  try {
    if (sharedStore()) return await redis<string[]>(["ZRANGE", `docs:${kind}`, 0, limit - 1, "REV"]);
    const dir = path.join(ROOT, kind);
    const names = (await fs.readdir(dir)).filter((n) => /^[a-z0-9]{12}\.json$/.test(n));
    const stats = await Promise.all(
      names.map(async (n) => ({ id: n.slice(0, 12), t: (await fs.stat(path.join(dir, n))).mtimeMs })),
    );
    return stats.sort((a, b) => b.t - a.t).slice(0, limit).map((x) => x.id);
  } catch {
    return [];
  }
}

const safeKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, "_");

/** A cached entry ({ t: saved at, data, … }) from namespace `ns`, or undefined. Expiry is the caller's job. */
export async function cacheRead<T extends { t: number }>(ns: string, key: string): Promise<T | undefined> {
  try {
    if (sharedStore()) {
      const raw = await redis<string | null>(["GET", `cache:${ns}:${key}`]);
      return raw ? (JSON.parse(raw) as T) : undefined;
    }
    return JSON.parse(await fs.readFile(path.join(ROOT, ns, `${safeKey(key)}.json`), "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Stores an entry for `ttlSeconds` (Redis expires it; on disk the reader checks `t`). Failures are ignored. */
export async function cacheWrite(ns: string, key: string, value: { t: number; [k: string]: unknown }, ttlSeconds: number): Promise<void> {
  try {
    const json = JSON.stringify(value);
    if (sharedStore()) {
      if (json.length > MAX_SHARED_BYTES) return;
      await redis(["SET", `cache:${ns}:${key}`, json, "EX", Math.max(60, Math.round(ttlSeconds))]);
      return;
    }
    await fs.mkdir(path.join(ROOT, ns), { recursive: true });
    await fs.writeFile(path.join(ROOT, ns, `${safeKey(key)}.json`), json);
  } catch {
    // A failed cache write only costs a repeat request.
  }
}

/** Cache for third-party API answers, keyed by the request. */
export function diskCache(dir: string, ttlHours: number) {
  const ttl = ttlHours * 3600 * 1000;
  const keyOf = (req: unknown) => createHash("sha1").update(JSON.stringify(req)).digest("hex");
  return {
    async get<T>(req: unknown): Promise<T | undefined> {
      const raw = await cacheRead<{ t: number; data: T }>(dir, keyOf(req));
      if (!raw || Date.now() - raw.t > ttl) return undefined;
      return raw.data;
    },
    async set(req: unknown, data: unknown): Promise<void> {
      await cacheWrite(dir, keyOf(req), { t: Date.now(), data }, ttlHours * 3600);
    },
  };
}
