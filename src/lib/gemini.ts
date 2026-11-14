// Optional Gemini judgement. FlipDD runs without it; with GEMINI_API_KEY set,
// Gemini decides whether two companies really compete and words the question
// for each meeting. It only sees facts FlipDD already pulled from Cala and is
// told not to add any.

import { diskCache } from "./store";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const FALLBACK_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 40_000;

const cache = diskCache("gemini", 168);
let modelPromise: Promise<string> | null = null;

// Gemini calls in flight at once. Lower it on a free-tier key if you see 429s.
const MAX_CONCURRENT = Math.max(1, Math.min(16, Number(process.env.GEMINI_MAX_CONCURRENT || 6)));
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function geminiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== "your_gemini_api_key_here" ? key : undefined;
}

export const geminiEnabled = () => Boolean(geminiKey());

/** Picks the newest stable Flash model the key can use, unless GEMINI_MODEL is set. */
async function pickModel(key: string): Promise<string> {
  const forced = process.env.GEMINI_MODEL?.trim();
  if (forced) return forced.replace(/^models\//, "");
  try {
    const res = await fetch(`${BASE}/models?pageSize=1000`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return FALLBACK_MODEL;
    const body = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    const version = (name: string) => {
      const m = name.match(/gemini-(\d+(?:\.\d+)?)-flash/);
      return m ? Number(m[1]) : 0;
    };
    const usable = (body.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
    const stable = usable.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
    const preview = usable.filter((n) => /^gemini-\d+(\.\d+)?-flash-preview(-[\d-]+)?$/.test(n));
    const pool = stable.length ? stable : preview;
    pool.sort((a, b) => version(b) - version(a));
    return pool[0] || FALLBACK_MODEL;
  } catch {
    return FALLBACK_MODEL;
  }
}

export async function geminiModel(): Promise<string | undefined> {
  const key = geminiKey();
  if (!key) return undefined;
  modelPromise ??= pickModel(key);
  return modelPromise;
}

/** A JSON schema in Gemini's OpenAPI subset. */
export type GSchema =
  | { type: "STRING"; enum?: string[]; description?: string }
  | { type: "NUMBER" | "INTEGER" | "BOOLEAN"; description?: string }
  | { type: "ARRAY"; items: GSchema; description?: string }
  | { type: "OBJECT"; properties: Record<string, GSchema>; required?: string[]; description?: string };

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

/**
 * Ask Gemini for JSON matching `schema`. Returns undefined when Gemini is not
 * configured or the call fails, so every caller keeps a non-AI fallback.
 */
export async function geminiJson<T>(
  system: string,
  prompt: string,
  schema: GSchema,
  signal?: AbortSignal,
): Promise<T | undefined> {
  const key = geminiKey();
  if (!key) return undefined;
  const model = await geminiModel();
  const cacheKey = { model, system, prompt, schema };
  const hit = await cache.get<T>(cacheKey);
  if (hit !== undefined) return hit;

  // Gemini 3 models think by default; a low level is enough for these short judgements.
  const thinks = /^gemini-([3-9]|\d{2,})/.test(model || "");
  const call = async (withSchema: boolean) => {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          ...(withSchema ? { responseSchema: schema } : {}),
          ...(withSchema && thinks ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return res;
  };

  return slot(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // If the model rejects the schema, retry once with JSON mode alone.
        const res = await call(attempt < 2);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          if (res.status === 400 && attempt === 0) {
            attempt = 1;
            continue;
          }
          console.warn(`[gemini] ${res.status}: ${(await res.text()).slice(0, 300)}`);
          return undefined;
        }
        const body = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        };
        const text = body.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
        if (!text) return undefined;
        const data = parseJson(text) as T;
        await cache.set(cacheKey, data);
        return data;
      } catch (err) {
        if (signal?.aborted) return undefined;
        // A timeout is retried once, not twice: a slow answer rarely gets faster.
        if (attempt >= 1) {
          console.warn(`[gemini] ${(err as Error).message}`);
          return undefined;
        }
      }
    }
    return undefined;
  });
}

// ---------- the three judgements FlipDD asks for ----------

export type CompeteVerdict = "direct" | "adjacent" | "no";

export interface CompeteJudgement {
  name: string;
  verdict: CompeteVerdict;
  why: string;
}

const JUDGE_SYSTEM =
  "You are a venture analyst helping a founder decide which investors might have a conflict of interest. " +
  "Judge only from the descriptions given. 'direct' means a customer would compare the two products when " +
  "choosing one. 'adjacent' means they serve the same buyers or could move into each other's market within " +
  "a year. 'no' means neither. Sharing a broad label like 'AI' or 'SaaS' is not enough. Keep each reason under " +
  "20 words, plain English, no hype. Return only the companies that are 'direct' or 'adjacent'; leave out the rest.";

const JUDGE_SCHEMA: GSchema = {
  type: "OBJECT",
  properties: {
    companies: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          verdict: { type: "STRING", enum: ["direct", "adjacent"] },
          why: { type: "STRING" },
        },
        required: ["name", "verdict", "why"],
      },
    },
  },
  required: ["companies"],
};

const JUDGE_CHUNK = 15;

/** Does each company compete with the founder's startup? Long lists are judged in parallel chunks. */
export async function judgeCompetition(
  founder: { name: string; description: string },
  companies: { name: string; description?: string; sector?: string }[],
  signal?: AbortSignal,
): Promise<Map<string, CompeteJudgement> | undefined> {
  if (!companies.length || !geminiEnabled()) return undefined;
  const all = companies.slice(0, 60);
  const chunks: (typeof all)[] = [];
  for (let i = 0; i < all.length; i += JUDGE_CHUNK) chunks.push(all.slice(i, i + JUDGE_CHUNK));
  const answers = await Promise.all(
    chunks.map((chunk) => {
      const list = chunk
        .map(
          (c, i) =>
            `${i + 1}. ${c.name}${c.sector ? ` [${c.sector}]` : ""}: ${(c.description || "no description").slice(0, 300)}`,
        )
        .join("\n");
      const prompt =
        `Founder's startup: ${founder.name || "(unnamed)"}\nWhat it builds: ${founder.description}\n\n` +
        `Companies to judge:\n${list}\n\nList only the competing ones, using each name exactly as written. ` +
        "Return an empty list if none compete.";
      return geminiJson<{ companies: CompeteJudgement[] }>(JUDGE_SYSTEM, prompt, JUDGE_SCHEMA, signal);
    }),
  );
  if (answers.every((a) => !a?.companies)) return undefined;
  const map = new Map<string, CompeteJudgement>();
  answers.forEach((out, i) => {
    if (!out?.companies) return; // this chunk failed: its companies stay unjudged
    for (const c of out.companies) {
      if (c && typeof c.name === "string" && ["direct", "adjacent"].includes(c.verdict)) {
        map.set(c.name.trim().toLowerCase(), { ...c, why: String(c.why || "").slice(0, 200) });
      }
    }
    // Gemini lists only the competitors; everything else in the chunk was judged "no".
    for (const c of chunks[i]) {
      const k = c.name.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { name: c.name, verdict: "no", why: "" });
    }
  });
  return map;
}

export interface AskFacts {
  id: string;
  investor: string;
  verdict: string;
  facts: string[];
  draft: string;
}

const ASK_SYSTEM =
  "You write one question a founder will ask an investor in a first meeting, to find out whether the fund " +
  "has a conflict with the founder's competitors. Use only the facts given; never add names, numbers or dates " +
  "that are not in them. Be direct and polite, at most 40 words, one or two sentences, no preamble, no quotes. " +
  "Mention the specific company or round so the investor cannot give a generic answer.";

const ASK_SCHEMA: GSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, question: { type: "STRING" } },
        required: ["id", "question"],
      },
    },
  },
  required: ["questions"],
};

/** Rewrites the template question for each investor into a sharper one. */
export async function writeQuestions(
  founder: { name: string; description: string },
  items: AskFacts[],
  signal?: AbortSignal,
): Promise<Map<string, string> | undefined> {
  if (!items.length || !geminiEnabled()) return undefined;
  const blocks = items
    .map(
      (it) =>
        `id: ${it.id}\ninvestor: ${it.investor}\nverdict: ${it.verdict}\nfacts:\n${it.facts.map((f) => `- ${f}`).join("\n")}\ndraft: ${it.draft}`,
    )
    .join("\n\n");
  const prompt =
    `Founder's startup: ${founder.name || "(unnamed)"}, which builds: ${founder.description || "(not given)"}\n\n` +
    `Write one improved question per id.\n\n${blocks}`;
  const out = await geminiJson<{ questions: { id: string; question: string }[] }>(
    ASK_SYSTEM,
    prompt,
    ASK_SCHEMA,
    signal,
  );
  if (!out?.questions) return undefined;
  const map = new Map<string, string>();
  for (const q of out.questions) {
    const text = typeof q?.question === "string" ? q.question.trim().replace(/^["“]|["”]$/g, "") : "";
    if (q?.id && text.length > 15 && text.length < 400) map.set(String(q.id), text);
  }
  return map;
}
