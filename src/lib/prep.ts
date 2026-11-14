// Meeting prep: what a founder should know before sitting down with one
// investor, built only from Cala's graph. Opened per investor, after a check:
//   core   (fast, entity calls): who you'll meet and their background, who left,
//          how they invest, their stake in your space, what they already know
//          about your competitors, and what Cala says about you
//   exits  (slow, knowledge query): their portfolio companies that were acquired or listed
//   market (slow, knowledge query): who raised in your space this year, and who led
// Professional facts only: roles, companies, schools. Never birth dates or contact details.

import { Cala, type RawEdge, type RawEntity, type RawSeries } from "./cala";
import { INVESTOR_QUERY, ROUND_QUERY, edgeDate, toSources } from "./engine";
import { exactKey } from "./names";
import type { CompetitorSummary, InvestorResult, SourceRef } from "./types";

const DAY = 86_400_000;

export interface PrepPerson {
  id: string;
  name: string;
  role?: string;
  since?: string;
  until?: string;
  about?: string;
  studied: string[];
  past: { org: string; role?: string; from?: string; to?: string }[];
  founded: string[];
  boards: string[];
  spoke: string[];
  awards: string[];
  source?: SourceRef;
}

export interface PrepSeriesPoint { date: string; value: number; source?: string; url?: string }

export interface PrepRival {
  name: string;
  stage?: string;
  totalFunding?: { value: number; units: string };
  headcountBand?: string;
  arr: PrepSeriesPoint[];
  arrUnits?: string;
  headcount: PrepSeriesPoint[];
  board: { name: string; since?: string }[];
}

export interface PrepStyle {
  roundsSeen: number;
  window: string;
  stages: { label: string; count: number }[];
  medianRound?: { value: number; units: string };
  led: number;
  lastDeal?: { label: string; company?: string; date?: string };
}

export interface PrepYou {
  status: "found" | "several" | "none";
  name: string;
  records: { id: string; name: string; type: string; description?: string }[];
  stage?: string;
  totalFunding?: { value: number; units: string };
  headcountBand?: string;
  founded?: string;
  website?: string;
  rounds: { label: string; date?: string; amount?: string }[];
  investors: string[];
  founders: string[];
  sourceCount: number;
}

export interface PrepSpace {
  holdings: { name: string; how: "competitor" | "lookalike"; detail: string }[];
  signal: "several" | "one" | "none";
  text: string;
}

export interface MeetingPrep {
  investor: string;
  team: { current: PrepPerson[]; left: PrepPerson[]; recorded: number };
  style?: PrepStyle;
  space: PrepSpace;
  rivals: PrepRival[];
  you?: PrepYou;
  calls: number;
}

export interface PrepRow { [k: string]: string }

// ---------- small helpers ----------

const val = (e: RawEntity | undefined, key: string): unknown => e?.properties?.[key]?.value;
const str = (e: RawEntity | undefined, key: string) => {
  const v = val(e, key);
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
};
const num = (e: RawEntity | undefined, key: string) => {
  const v = val(e, key);
  return typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(Number(v)) ? Number(v) : undefined;
};
const edges = (e: RawEntity | undefined, dir: "outgoing" | "incoming", type: string): RawEdge[] => e?.relationships?.[dir]?.[type] || [];
const prop = (edge: RawEdge, key: string) => {
  const v = edge.properties?.[key];
  return typeof v === "string" ? v : undefined;
};
const current = (until?: string) => !until || Date.parse(until) > Date.now();
const band = (v: unknown) => (Array.isArray(v) ? (v.length === 1 ? String(v[0]) : `${v[0]} to ${v[1]}`) : typeof v === "number" ? String(v) : undefined);
const STAGE: Record<string, string> = {
  PRE_SEED: "Pre-seed", SEED: "Seed", SERIES_A: "Series A", SERIES_B: "Series B", SERIES_C: "Series C",
  SERIES_D: "Series D", SERIES_E: "Series E", GROWTH: "Growth", VENTURE_DEBT: "Venture debt", GRANT: "Grant",
};
const stageName = (s?: string) => (s ? STAGE[s] || s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : undefined);

// Who a founder actually meets: investing roles first.
const ROLE_RANK = (role?: string) => {
  const r = (role || "").toLowerCase();
  if (/general partner|managing partner|founding partner|co-?founder/.test(r)) return 0;
  if (/\bpartner\b/.test(r) && !/venture partner|visiting/.test(r)) return 1;
  if (/principal|investment director|director/.test(r)) return 2;
  if (/venture partner|investor|associate|analyst/.test(r)) return 3;
  if (/residence|visiting|advisor|scout/.test(r)) return 5;
  return role ? 4 : 6;
};

const PERSON_QUERY = {
  properties: ["name", "description"],
  relationships: {
    outgoing: {
      STUDIED_AT: { limit: 5, offset: 0 },
      WORKS_AT: { limit: 10, offset: 0 },
      FOUNDED: { limit: 6, offset: 0 },
      IS_BOARD_MEMBER_OF: { limit: 12, offset: 0 },
      SPOKE_AT: { limit: 5, offset: 0 },
      RECEIVED_AWARD: { limit: 5, offset: 0 },
    },
  },
};

const RIVAL_QUERY_BASE = {
  properties: ["name", "funding_stage", "total_funding", "total_funding_units", "employee_count_range"],
  relationships: { incoming: { IS_BOARD_MEMBER_OF: { limit: 12, offset: 0 } } },
};

const YOU_QUERY = {
  properties: ["name", "description", "website", "founding_date", "funding_stage", "total_funding", "total_funding_units", "employee_count_range", "operational_status"],
  relationships: {
    outgoing: { PARTICIPATES_IN_FUNDING_ROUND: { limit: 20, offset: 0 } },
    incoming: { FOUNDED: { limit: 8, offset: 0 }, INVESTED_IN: { limit: 30, offset: 0 } },
  },
};

function series(s: RawSeries | undefined): PrepSeriesPoint[] {
  return (s?.data || [])
    .filter((d) => typeof d.value === "number" && d.time)
    .map((d) => {
      const o = typeof d.origin === "object" ? d.origin : undefined;
      return { date: d.time.slice(0, 10), value: d.value, source: o?.name || (typeof d.origin === "string" ? d.origin : undefined), url: typeof o?.document === "string" ? o.document : undefined };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- the parts ----------

async function team(cala: Cala, fund: RawEntity[]): Promise<MeetingPrep["team"]> {
  const seen = new Map<string, PrepPerson>();
  for (const f of fund) {
    for (const e of [...edges(f, "incoming", "WORKS_AT"), ...edges(f, "incoming", "FOUNDED")]) {
      if (e.entity_type !== "Person" || seen.has(e.name)) continue;
      const src = toSources(e.properties?.sources as never)[0];
      seen.set(e.name, {
        id: e.id, name: e.name, role: prop(e, "role") || (edges(f, "incoming", "FOUNDED").includes(e) ? "Co-founder" : undefined),
        since: prop(e, "valid_since"), until: prop(e, "valid_until"),
        studied: [], past: [], founded: [], boards: [], spoke: [], awards: [], source: src,
      });
    }
  }
  const all = [...seen.values()];
  const now = all.filter((p) => current(p.until)).sort((a, b) => ROLE_RANK(a.role) - ROLE_RANK(b.role) || (b.since || "").localeCompare(a.since || ""));
  const left = all
    .filter((p) => !current(p.until) && Date.now() - Date.parse(p.until!) < 730 * DAY)
    .sort((a, b) => (b.until || "").localeCompare(a.until || ""));
  // Background for the people a founder is likeliest to meet.
  const meet = now.slice(0, 4);
  await Promise.all(
    meet.map(async (p) => {
      const e = await cala.retrieve(p.id, PERSON_QUERY, 2).catch(() => undefined);
      if (!e) return;
      // Professional facts only: drop birth years and similar personal details from the description.
      p.about = str(e, "description")?.replace(/,?\s*\(?\s*born(?: in| on)?[^,.;)]*\d{4}\)?/gi, "").replace(/\s+([,.])/g, "$1").trim();
      p.studied = edges(e, "outgoing", "STUDIED_AT").map((x) => x.name).slice(0, 3);
      p.past = edges(e, "outgoing", "WORKS_AT")
        .filter((x) => x.id !== fund[0]?.id && !fund.some((f) => exactKey(f.name) === exactKey(x.name)))
        .map((x) => ({ org: x.name, role: prop(x, "role"), from: prop(x, "valid_since")?.slice(0, 4), to: prop(x, "valid_until")?.slice(0, 4) }))
        .sort((a, b) => (b.from || "").localeCompare(a.from || ""))
        .slice(0, 4);
      p.founded = edges(e, "outgoing", "FOUNDED").map((x) => x.name).slice(0, 4);
      p.boards = edges(e, "outgoing", "IS_BOARD_MEMBER_OF").map((x) => x.name).slice(0, 8);
      p.spoke = edges(e, "outgoing", "SPOKE_AT").map((x) => x.name).slice(0, 3);
      p.awards = edges(e, "outgoing", "RECEIVED_AWARD").map((x) => x.name).slice(0, 3);
    }),
  );
  return { current: now.slice(0, 8), left: left.slice(0, 5), recorded: all.length };
}

async function style(cala: Cala, fund: RawEntity[]): Promise<PrepStyle | undefined> {
  const rounds = fund
    .flatMap((f) => edges(f, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND"))
    .filter((e) => (prop(e, "role") || "INVESTOR") === "INVESTOR")
    .map((e) => ({ e, date: edgeDate(toSources(e.properties?.sources as never)) }))
    .filter((x, i, a) => a.findIndex((y) => y.e.id === x.e.id) === i);
  if (!rounds.length) return undefined;
  const recent = rounds.filter((x) => x.date).sort((a, b) => b.date!.localeCompare(a.date!)).slice(0, 10);
  const opened = (await Promise.allSettled(recent.map((x) => cala.retrieve(x.e.id, ROUND_QUERY, 2)))).map((r) => (r.status === "fulfilled" ? r.value : undefined));
  const stages = new Map<string, number>();
  const amounts: Record<string, number[]> = {};
  let led = 0;
  let lastDeal: PrepStyle["lastDeal"];
  opened.forEach((r, i) => {
    const label = stageName(str(r, "round_label")) || str(r, "name") || recent[i].e.name;
    stages.set(label, (stages.get(label) || 0) + 1);
    const v = num(r, "transaction_value");
    const u = str(r, "transaction_value_units") || "USD";
    if (v && v > 0) (amounts[u] ||= []).push(v);
    if (recent[i].e.properties?.is_lead) led++;
    if (i === 0) {
      const issuer = edges(r, "incoming", "PARTICIPATES_IN_FUNDING_ROUND").find((p) => prop(p, "role") === "ISSUER");
      lastDeal = { label, company: issuer?.name, date: recent[i].date };
    }
  });
  const [units, list] = Object.entries(amounts).sort((a, b) => b[1].length - a[1].length)[0] || [];
  const sorted = (list || []).sort((a, b) => a - b);
  return {
    roundsSeen: opened.filter(Boolean).length,
    window: recent.length ? `${recent[recent.length - 1].date?.slice(0, 7)} to ${recent[0].date?.slice(0, 7)}` : "",
    stages: [...stages.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 4),
    medianRound: sorted.length ? { value: sorted[Math.floor(sorted.length / 2)], units: units! } : undefined,
    led,
    lastDeal,
  };
}

/** Does their stake in your space block you? Read from the check's own findings. */
export function spaceOf(r: InvestorResult, competitors: string[]): PrepSpace {
  const holdings: PrepSpace["holdings"] = [];
  for (const d of r.direct) holdings.push({ name: d.competitor, how: "competitor", detail: d.round ? `${d.isLead ? "led" : "joined"} its ${d.round.label}` : "in their portfolio" });
  for (const p of r.possible.filter((x) => x.verdict === "direct" || (!x.verdict && x.origin === "graph")))
    if (!holdings.some((h) => exactKey(h.name) === exactKey(p.company))) holdings.push({ name: p.company, how: "lookalike", detail: p.why || p.description || "builds something close to you" });
  const names = holdings.map((h) => h.name);
  const list = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ");
  if (holdings.length >= 2)
    return { holdings, signal: "several", text: `They already hold ${holdings.length} companies in your space (${list}). Backing overlapping companies is normal for them, so their stake is unlikely to block you. Lead with what makes you different.` };
  if (holdings.length === 1)
    return { holdings, signal: "one", text: `One bet in your space so far: ${list}. Expect "how are you different from ${names[0]}?" early, and ask how they handle overlap before you share details.` };
  return { holdings, signal: "none", text: `No company in your space on record${competitors.length ? `, and no stake in ${competitors.join(" or ")}` : ""}. You would be their first bet here: explain the market, not just the product.` };
}

async function rival(cala: Cala, c: CompetitorSummary): Promise<PrepRival | undefined> {
  const id = c.entities[0]?.id;
  if (!id) return undefined;
  const intro = await cala.introspect(id, 2).catch(() => undefined);
  const find = (re: RegExp) => Object.values(intro?.numerical || {}).flat().find((s) => re.test(s.name));
  const arrS = find(/annual recurring revenue/i);
  const empS = find(/number of employees/i);
  const numerical: Record<string, string[]> = {};
  if (arrS) numerical.FinancialMetric = [arrS.id];
  if (empS) numerical.ObservableProperty = [empS.id];
  const e = await cala.retrieve(id, Object.keys(numerical).length ? { ...RIVAL_QUERY_BASE, numerical_observations: numerical } : RIVAL_QUERY_BASE, 2).catch(() => undefined);
  if (!e) return undefined;
  const all = e.numerical_observations || [];
  const total = num(e, "total_funding");
  return {
    name: c.name,
    stage: stageName(str(e, "funding_stage")),
    totalFunding: total ? { value: total, units: str(e, "total_funding_units") || "USD" } : undefined,
    headcountBand: band(val(e, "employee_count_range")),
    arr: series(all.find((s) => s.id === arrS?.id || /recurring revenue/i.test(s.name || ""))),
    arrUnits: arrS?.unit,
    headcount: series(all.find((s) => s.id === empS?.id || /employees/i.test(s.name || ""))),
    board: edges(e, "incoming", "IS_BOARD_MEMBER_OF").map((b) => ({ name: b.name, since: prop(b, "valid_since")?.slice(0, 7) })).slice(0, 10),
  };
}

/** What an investor's analyst finds when they look you up in Cala. Exact name matches only. */
async function you(cala: Cala, startupName: string): Promise<PrepYou | undefined> {
  const name = startupName.trim();
  if (!name) return undefined;
  const hits = (await cala.search(name, 2, 15).catch(() => []))
    .filter((h) => (h.entity_type === "Company" || h.entity_type === "Organization") && exactKey(h.name) === exactKey(name));
  const base: PrepYou = { status: "none", name, records: hits.map((h) => ({ id: h.id, name: h.name, type: h.entity_type, description: h.description || undefined })), rounds: [], investors: [], founders: [], sourceCount: 0 };
  if (!hits.length) return base;
  // A brand can be several records (a Company and an Organization): open each, keep the richest.
  const opened = (await Promise.all(hits.slice(0, 3).map((h) => cala.retrieve(h.id, YOU_QUERY, 2).catch(() => undefined)))).filter((x): x is RawEntity => Boolean(x));
  const weight = (x: RawEntity) => Object.keys(x.properties || {}).length + Object.values(x.relationships?.outgoing || {}).flat().length + Object.values(x.relationships?.incoming || {}).flat().length;
  const e = opened.sort((a, b) => weight(b) - weight(a))[0];
  if (!e) return { ...base, status: hits.length > 1 ? "several" : "found" };
  const rounds = edges(e, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND").filter((x) => prop(x, "role") === "ISSUER");
  const total = num(e, "total_funding");
  const sources = new Set<string>();
  for (const p of Object.values(e.properties || {})) for (const s of p.sources || []) if (typeof s.document === "string") sources.add(s.document);
  return {
    ...base,
    status: hits.length > 1 ? "several" : "found",
    stage: stageName(str(e, "funding_stage")),
    totalFunding: total ? { value: total, units: str(e, "total_funding_units") || "USD" } : undefined,
    headcountBand: band(val(e, "employee_count_range")),
    founded: str(e, "founding_date")?.slice(0, 4),
    website: str(e, "website"),
    rounds: rounds.map((x) => ({ label: x.name, date: edgeDate(toSources(x.properties?.sources as never)) })).slice(0, 6),
    investors: edges(e, "incoming", "INVESTED_IN").map((x) => x.name).slice(0, 10),
    founders: edges(e, "incoming", "FOUNDED").map((x) => x.name).slice(0, 6),
    sourceCount: sources.size,
  };
}

// ---------- entry points ----------

export async function meetingPrep(
  args: { investor: InvestorResult; competitors: CompetitorSummary[]; startupName: string },
  apiKey: string,
  signal?: AbortSignal,
): Promise<MeetingPrep> {
  let calls = 0;
  const cala = new Cala(apiKey, { onCall: () => calls++ }, signal);
  try {
    const ids = args.investor.entities.slice(0, 2).map((e) => e.id);
    const fund = (await Promise.all(ids.map((id) => cala.retrieve(id, INVESTOR_QUERY, 1).catch(() => undefined)))).filter((e): e is RawEntity => Boolean(e));
    const [teamR, styleR, rivalsR, youR] = await Promise.all([
      team(cala, fund),
      style(cala, fund).catch(() => undefined),
      Promise.all(args.competitors.filter((c) => c.resolved).slice(0, 3).map((c) => rival(cala, c).catch(() => undefined))),
      you(cala, args.startupName).catch(() => undefined),
    ]);
    return {
      investor: args.investor.name,
      team: teamR,
      style: styleR,
      space: spaceOf(args.investor, args.competitors.map((c) => c.name)),
      rivals: rivalsR.filter((r): r is PrepRival => Boolean(r)),
      you: youR,
      calls,
    };
  } finally {
    cala.dispose();
  }
}

const rows = (results: Record<string, unknown>[], keys: string[]): PrepRow[] =>
  results
    .map((r) => Object.fromEntries(keys.map((k) => [k, typeof r[k] === "string" || typeof r[k] === "number" ? String(r[k]) : ""])))
    .filter((r) => r[keys[0]])
    .slice(0, 8);

/** Their portfolio companies that were acquired or listed (Cala knowledge query, slow). */
export async function exitsOf(investor: string, apiKey: string): Promise<PrepRow[]> {
  const cala = new Cala(apiKey);
  try {
    const { results } = await cala.query(`Portfolio companies of the venture investor ${investor} that were acquired or went public: company, outcome, acquirer_or_exchange, year`, 6);
    return rows(results, ["company", "outcome", "acquirer_or_exchange", "year"]);
  } finally {
    cala.dispose();
  }
}

/** Who raised in the founder's space in the past year, and who led (Cala knowledge query, slow). */
export async function marketOf(description: string, apiKey: string): Promise<PrepRow[]> {
  const cala = new Cala(apiKey);
  try {
    const { results } = await cala.query(`Startups building ${description.slice(0, 220)} that raised a funding round in the past 12 months: company, round, amount, date, lead_investor`, 6);
    return rows(results, ["company", "round", "amount", "date", "lead_investor"]);
  } finally {
    cala.dispose();
  }
}
