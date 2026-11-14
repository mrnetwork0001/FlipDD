// Competitor discovery: asks Cala's knowledge graph which funded companies do
// what the founder does, then ties each answer row to a graph entity so the
// conflict check can walk its rounds and investors.

import { Cala, type CalaEntity } from "./cala";
import { judgeCompetition } from "./gemini";
import { attendeeFor, loadSlushEvent } from "./slush";
import type { DiscoveredCompetitor } from "./types";

const MAX_RESULTS = 8;
/** Candidates read from Cala before Gemini, if configured, drops the ones that do not compete. */
const MAX_CANDIDATES = 14;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();

const LEGAL = /\b(inc|ltd|limited|oy|ab|gmbh|llc|corp|corporation|co|sas|sl|bv|plc)\.?$/;
const core = (s: string) => norm(s).replace(LEGAL, "").trim();

/** "Bolt.new (by StackBlitz)" -> ["Bolt.new", "StackBlitz"]; "Lovable (fka GPT Engineer)" -> ["Lovable", "GPT Engineer"]. */
function nameParts(label: string): { main: string; inner?: string } {
  const m = label.match(/^(.*?)\s*\((?:by|fka|formerly|aka|from)?\s*([^)]+)\)\s*$/i);
  if (!m) return { main: label.trim() };
  return { main: m[1].trim(), inner: m[2].trim() };
}

function pick(row: Record<string, unknown>, test: RegExp): string | undefined {
  const key = Object.keys(row).find((k) => test.test(k));
  const v = key ? row[key] : undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function matchEntity(name: string, entities: CalaEntity[]): CalaEntity | undefined {
  const orgs = entities.filter((e) => /company|organization/i.test(e.entity_type));
  const key = core(name);
  if (!key) return undefined;
  return (
    orgs.find((e) => core(e.name) === key) ||
    orgs.find((e) => core(e.name).startsWith(`${key} `) || key.startsWith(`${core(e.name)} `))
  );
}

export async function discoverCompetitors(
  cala: Cala,
  startupName: string,
  description: string,
  signal?: AbortSignal,
): Promise<{ competitors: DiscoveredCompetitor[]; judgedBy: "gemini" | "cala"; dropped: number }> {
  const prompt =
    `Startups that compete with a company building: ${description.trim()}. ` +
    `Return company, what_it_does, country, total_funding, latest_round`;
  const { results, entities } = await cala.queryWithEntities(prompt, 0);

  const own = core(startupName);
  const seen = new Set<string>();
  const out: DiscoveredCompetitor[] = [];
  for (const row of results) {
    const label = pick(row, /^(company|name|startup|company_name)$/i);
    if (!label) continue;
    const { main, inner } = nameParts(label);
    if (own && (core(main) === own || core(label) === own)) continue;

    // Prefer the product's own record; fall back to the company behind it.
    const direct = matchEntity(main, entities);
    const parent = inner ? matchEntity(inner, entities) : undefined;
    const entity = direct || parent;
    const name = direct ? main : parent ? parent.name.replace(/,?\s*(Inc|Ltd|Oy|AB)\.?$/i, "") : main;

    const key = core(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      label,
      what: pick(row, /(what|does|desc|product|about)/i),
      country: pick(row, /(country|hq|headquarter|location)/i),
      funding: pick(row, /(funding|raised)/i),
      latestRound: pick(row, /(latest|last)_?round|round/i),
      entityId: entity?.id,
      entityType: entity?.entity_type,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }

  // Cala finds companies in the same space; Gemini, when configured, checks
  // which of them a customer would actually compare with the founder's product.
  const judged = await judgeCompetition(
    { name: startupName, description },
    out.map((c) => ({ name: c.name, description: c.what })),
    signal,
  );
  // Mark the ones on the Slush 2026 attendee list.
  const event = await loadSlushEvent(cala).catch(() => undefined);
  if (event) {
    for (const c of out) {
      const a = attendeeFor(event, c.entityId ? [c.entityId] : [], c.name);
      if (a) c.atSlush = event.name;
    }
  }
  if (!judged) return { competitors: out.slice(0, MAX_RESULTS), judgedBy: "cala", dropped: 0 };
  const kept: DiscoveredCompetitor[] = [];
  for (const c of out) {
    const j = judged.get(c.name.trim().toLowerCase());
    if (j?.verdict === "no") continue;
    kept.push(j ? { ...c, verdict: j.verdict, why: j.why } : c);
  }
  const rank = (c: DiscoveredCompetitor) => (c.verdict === "direct" ? 0 : c.verdict === "adjacent" ? 1 : 2);
  kept.sort((a, b) => rank(a) - rank(b));
  return {
    competitors: kept.slice(0, MAX_RESULTS),
    judgedBy: "gemini",
    dropped: out.length - kept.length,
  };
}
