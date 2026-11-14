// FlipDD engine: checks a founder's meeting list against their competitors
// by walking Cala's graph. Everything shown to the user comes from Cala
// records; nothing here is preset.
//
// Graph shape used (confirmed against the live API):
//   Investor --PARTICIPATES_IN_FUNDING_ROUND{role, is_lead, sources}--> FundingRound
//   Investor --INVESTED_IN{sources}--> Company
//   Company  --PARTICIPATES_IN_FUNDING_ROUND{role: ISSUER}--> FundingRound
//   FundingRound <--PARTICIPATES_IN_FUNDING_ROUND-- every participant

import { Cala, CalaError, REFUSED_MESSAGE, type CalaEntity, type RawEdge, type RawEntity, type RawSource } from "./cala";
import type {
  Activity,
  AnalyzeEvent,
  AnalyzeInput,
  CompanyStatus,
  CompetitorSummary,
  Coverage,
  DirectConflict,
  FinderCandidate,
  FinderReport,
  InvestorKind,
  InvestorResult,
  InvestorSlush,
  PersonTie,
  RadarEvent,
  RadarRound,
  SlushReport,
  LeakPath,
  Level,
  PossibleOverlap,
  Reason,
  RoundRef,
  ShareLevel,
  SourceRef,
  StepState,
} from "./types";
import { LEVEL_RANK } from "./types";
import { geminiEnabled, geminiModel, judgeCompetition, writeQuestions, type AskFacts } from "./gemini";
import { coreKey, coreTokens, exactKey, sameCompany, tokens } from "./names";
import { fmtAgo, isLateStage, leakStrength, monthsSince } from "./scoring";
import { checkSlush, type SlushInvestorInput } from "./slush";

// Request budgets. Cala allows about 10 requests per window, so each run is
// kept to the calls that change the answer.
const MAX_ENTITIES_PER_NAME = 3;
/** Investor search results read; common names (e.g. "Paradigm") bury the fund past the first ten. */
const INVESTOR_SEARCH_LIMIT = 30;
/** Most same-name records retrieved, in batches of three, while looking for one with investments. */
const MAX_INVESTOR_TRIES = 12;
const MAX_COMPETITOR_ROUNDS = 4;
const MAX_VIA_PER_COMPETITOR = 4;
const MAX_ROUND_ENRICH = 6;
const REL_LIMIT = 100;

type Emit = (event: AnalyzeEvent) => void;

// ---------- text helpers ----------
// (shared with the Slush check, see names.ts)

// ---------- dates and money ----------

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function validDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}(-\d{2}){0,2}/.test(value)) return undefined;
  const t = Date.parse(value.slice(0, 10));
  if (Number.isNaN(t) || t > Date.now() + 7 * DAY) return undefined;
  return value.slice(0, 10);
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] || m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}
function fmtMonthYear(iso: string): string {
  const [y, m] = iso.split("-");
  return m ? `${MONTHS[Number(m) - 1] || m} ${y}` : y;
}
function fmtMoney(amount?: number, currency?: string): string | undefined {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return undefined;
  const symbol: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
  const prefix = currency ? symbol[currency] ?? `${currency} ` : "";
  const scaled =
    amount >= 1e9
      ? `${(amount / 1e9).toFixed(1)}B`
      : amount >= 1e6
        ? `${(amount / 1e6).toFixed(1)}M`
        : amount >= 1e3
          ? `${Math.round(amount / 1e3)}K`
          : String(Math.round(amount));
  return `${prefix}${scaled.replace(/\.0(?=[BM])/, "")}`;
}

// ---------- sources ----------

const AGGREGATOR_HOSTS =
  /(tracxn|crunchbase|pitchbook|cbinsights|dealroom|wellfound|golden\.com|craft\.co|zoominfo|linkedin|wikipedia|f6s\.com|owler|apollo\.io|rocketreach|parsers\.vc|vcsheet|nfx\.com|openvc|investorhunt|nordicstartuphub)/i;
const RANK_ORDER: Record<string, number> = { PRIMARY: 0, PRESS: 1, NONE: 2, AGGREGATOR: 3 };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function toSources(raw: RawSource[] | undefined): SourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const url =
      typeof s?.document === "string" && /^https?:\/\//.test(s.document) ? s.document : undefined;
    const host = url ? hostOf(url) : "";
    const label = host || String(s?.name || "Cala");
    const key = url || label;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = s?.name && s.name !== host ? String(s.name) : undefined;
    out.push({ label, title, url, date: validDate(s?.date), rank: s?.source_rank });
  }
  return out.sort(
    (a, b) =>
      (RANK_ORDER[a.rank || "NONE"] ?? 2) - (RANK_ORDER[b.rank || "NONE"] ?? 2) ||
      (b.date || "").localeCompare(a.date || ""),
  );
}

/**
 * Is this source an article about an event, as opposed to a page that is
 * re-crawled (a portfolio page, a database profile)? Only article dates say
 * when something happened.
 */
function isArticleLike(s: SourceRef): boolean {
  if (!s.url || !s.date) return false;
  if (s.rank === "AGGREGATOR" || AGGREGATOR_HOSTS.test(s.url)) return false;
  try {
    const u = new URL(s.url);
    const path = u.pathname.replace(/\/+$/, "");
    const depth = path.split("/").filter(Boolean).length;
    const hyphens = (path.match(/-/g) || []).length;
    return hyphens >= 2 || depth >= 3 || u.searchParams.has("p");
  } catch {
    return false;
  }
}

/** Earliest article date on an edge: the best available proxy for when it happened. */
export function edgeDate(sources: SourceRef[]): string | undefined {
  const dates = sources.filter(isArticleLike).map((s) => s.date!).sort();
  return dates[0];
}

export function bestSource(sources: SourceRef[]): SourceRef | undefined {
  return sources.find(isArticleLike) || sources.find((s) => s.url) || sources[0];
}

function mergeSources(...lists: (SourceRef[] | undefined)[]): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const s of list || []) {
      const key = s.url || s.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.slice(0, 6);
}

// ---------- graph parsing ----------

const rel = (e: RawEntity | undefined, dir: "outgoing" | "incoming", name: string): RawEdge[] => {
  const list = e?.relationships?.[dir]?.[name];
  return Array.isArray(list) ? list : [];
};
const prop = (e: RawEntity | undefined, name: string): unknown => e?.properties?.[name]?.value;

interface EntityLite {
  id: string;
  name: string;
  type: string;
}
interface InvRound {
  id: string;
  label: string;
  isLead: boolean;
  /** INVESTOR for equity, LENDER for debt. */
  role: string;
  date?: string;
  sources: SourceRef[];
}
interface PersonLink {
  id: string;
  name: string;
  role: string;
  sources: SourceRef[];
}
interface PortfolioCo {
  id: string;
  name: string;
  date?: string;
  sources: SourceRef[];
}
interface InvestorProfile {
  input: string;
  name: string;
  key: string;
  /** Name keys of every record checked as this investor (more than one for "Fund + Parent"). */
  keys: Set<string>;
  description?: string;
  entities: EntityLite[];
  ids: Set<string>;
  candidates: number;
  rounds: Map<string, InvRound>;
  portfolio: PortfolioCo[];
  truncated: boolean;
  /** The record is a person (an angel), not a fund. */
  isPerson: boolean;
  kind: InvestorKind;
  /** People who work at the fund (fund records only). */
  team: PersonLink[];
  /** Companies the person founded, runs or sits on the board of (person records only). */
  roles: PersonLink[];
}
interface Participant {
  id: string;
  name: string;
  role: string;
  isLead: boolean;
  sources: SourceRef[];
}
interface RoundDetail extends RoundRef {
  participants: Participant[];
  instrument?: string;
}
interface CompetitorProfile {
  input: string;
  name: string;
  description?: string;
  status: CompanyStatus;
  statusRaw?: string;
  industries: string[];
  entities: EntityLite[];
  ids: Set<string>;
  roundEdges: Map<string, { id: string; label: string; date?: string; sources: SourceRef[] }>;
  rounds: Map<string, RoundDetail>;
  investors: Map<string, { id: string; name: string; date?: string; sources: SourceRef[] }>;
  /** Founders, executives and board members, with their role at this company. */
  people: PersonLink[];
  /** Acquisitions and other corporate events (opened later for the counterparty). */
  eventEdges: { id: string; name: string; role: string; date?: string; sources: SourceRef[] }[];
  events: RadarEvent[];
  totalFunding?: number;
  totalFundingCurrency?: string;
  stage?: string;
  headcount?: string;
}

function toStatus(raw: unknown): { status: CompanyStatus; raw?: string } {
  if (typeof raw !== "string" || !raw.trim()) return { status: "unknown" };
  const v = raw.toLowerCase();
  if (/(acquir|merg)/.test(v)) return { status: "acquired", raw };
  if (/(clos|dissol|bankrupt|liquidat|inactive|defunct|ceased|dead)/.test(v))
    return { status: "closed", raw };
  if (/(activ|operat|open|live)/.test(v)) return { status: "operating", raw };
  return { status: "unknown", raw };
}

function parseRound(e: RawEntity): RoundDetail {
  const participants: Participant[] = rel(e, "incoming", "PARTICIPATES_IN_FUNDING_ROUND").map(
    (p) => ({
      id: p.id,
      name: p.name,
      role: String(p.properties?.role || "INVESTOR").toUpperCase(),
      isLead: p.properties?.is_lead === true,
      sources: toSources(p.properties?.sources),
    }),
  );
  const issuer = participants.find((p) => p.role === "ISSUER");
  const amount = prop(e, "transaction_value");
  const currency = prop(e, "transaction_value_units");
  const valuation = prop(e, "post_money_valuation");
  const valuationCurrency = prop(e, "post_money_valuation_units");
  const instrument = prop(e, "instrument");
  return {
    id: e.id,
    label: e.name || "Funding round",
    date: validDate(prop(e, "announcement_date")) || validDate(prop(e, "event_date")),
    amount: typeof amount === "number" ? amount : undefined,
    currency: typeof currency === "string" ? currency : undefined,
    valuation: typeof valuation === "number" && valuation > 0 ? valuation : undefined,
    valuationCurrency: typeof valuationCurrency === "string" ? valuationCurrency : undefined,
    instrument: typeof instrument === "string" ? instrument : undefined,
    issuer: issuer?.name,
    sources: mergeSources(
      toSources(e.properties?.announcement_date?.sources),
      issuer?.sources,
      ...participants.map((p) => p.sources),
    ),
    participants,
  };
}

export const ROUND_QUERY = {
  properties: [
    "name",
    "round_label",
    "instrument",
    "transaction_value",
    "transaction_value_units",
    "post_money_valuation",
    "post_money_valuation_units",
    "announcement_date",
    "event_date",
  ],
  relationships: { incoming: { PARTICIPATES_IN_FUNDING_ROUND: { limit: 50, offset: 0 } } },
};

// One query serves funds and people: Cala leaves out relationship types a
// record does not have, so a fund returns its team and a person their roles.
export const INVESTOR_QUERY = {
  properties: ["name", "description", "website"],
  relationships: {
    outgoing: {
      PARTICIPATES_IN_FUNDING_ROUND: { limit: REL_LIMIT, offset: 0 },
      INVESTED_IN: { limit: REL_LIMIT, offset: 0 },
      FOUNDED: { limit: 20, offset: 0 },
      IS_CEO_OF: { limit: 20, offset: 0 },
      IS_CTO_OF: { limit: 20, offset: 0 },
      IS_BOARD_MEMBER_OF: { limit: 20, offset: 0 },
      IS_EXECUTIVE_OF: { limit: 20, offset: 0 },
      WORKS_AT: { limit: 20, offset: 0 },
    },
    incoming: {
      WORKS_AT: { limit: 60, offset: 0 },
      FOUNDED: { limit: 20, offset: 0 },
    },
  },
};

/** Words that mark a record as a fund vehicle of a firm, not a different company. */
const VEHICLE_WORDS = new Set([
  "investment", "investments", "management", "managers", "gp", "lp", "l", "p", "fund", "funds", "founder", "founders",
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "llp", "ltd", "limited", "llc", "sarl", "scsp", "ab", "oy", "as", "partnership",
]);

// ---------- similarity for the portfolio scan ----------

const STOP = new Set(
  (
    "a an the and or of for to in on at by with from as is are be we our us it its their that this " +
    "they them you your into over under more most new first next other than then also not no can " +
    "will has have had was were been being who what which when where how why all any each both " +
    "company companies startup startups firm platform software solution solutions technology " +
    "technologies tech service services provider based using use uses used help helps helping " +
    "build builds building built make makes making enable enables enabling offer offers offering " +
    "develop develops developing developer provide provides providing create creates creating " +
    "through across between within while per via around about one two three leading world global"
  ).split(" "),
);
const GENERIC = new Set(
  (
    "ai ml data saas b2b b2c cloud digital enterprise analytics automation automated intelligence " +
    "artificial machine learning online mobile app apps tool tools system systems management " +
    "business businesses customer customers user users product products market markets industry " +
    "europe european nordic finland finnish sweden swedish infrastructure model models agent agents " +
    "team teams work workflow workflows process processes operation operations smart powered driven"
  ).split(" "),
);

function stem(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}
function termSet(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tokens(text)) {
    if (t.length < 3 && t !== "ai" && t !== "ml" && t !== "vr" && t !== "ar") continue;
    if (STOP.has(t)) continue;
    const s = stem(t);
    if (STOP.has(s)) continue;
    if (!out.has(s)) out.set(s, t);
  }
  return out;
}

function overlapScore(
  founderTerms: Map<string, string>,
  sector: string,
  description: string,
): { score: number; shared: string[] } {
  const sectorTerms = termSet(sector);
  const allTerms = termSet(`${sector} ${description}`);
  let score = 0;
  const shared: string[] = [];
  for (const [s, original] of founderTerms) {
    if (!allTerms.has(s)) continue;
    const generic = GENERIC.has(s) || GENERIC.has(original);
    score += generic ? 0.3 : sectorTerms.has(s) ? 1.5 : 1;
    if (!generic) shared.push(original);
  }
  return { score, shared };
}

// ---------- the run ----------

export async function analyze(
  input: AnalyzeInput,
  emit: Emit,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  let calls = 0;
  let cached = 0;
  let oldestCachedAt: number | undefined;
  /** Cala refused the key: the run stops with an error instead of reporting "nothing found". */
  let refused = false;
  let refusedMessage = REFUSED_MESSAGE;
  const fresh = input.fresh === true;
  const step = (scope: string, text: string, state: StepState = "ok") =>
    emit({ type: "step", scope, text, state });
  const stats = () => emit({ type: "stats", calls, cached, oldestCachedAt, fresh });

  const cala = new Cala(
    apiKey,
    {
      onCall: () => {
        calls++;
        stats();
      },
      onCacheHit: (savedAt) => {
        cached++;
        if (oldestCachedAt === undefined || savedAt < oldestCachedAt) oldestCachedAt = savedAt;
        stats();
      },
      onLimited: () => step("Cala", "Rate limit reached. Waiting for the window to reopen.", "wait"),
      onRefused: (message) => {
        refused = true;
        refusedMessage = message;
      },
      onResumed: () => step("Cala", "Rate limit window reopened. Continuing.", "ok"),
    },
    signal,
    fresh,
  );

  const investorInputs = input.investors;
  const competitorInputs = input.competitors;
  const investors: (InvestorProfile | null)[] = investorInputs.map(() => null);
  const investorFailed: boolean[] = investorInputs.map(() => false);
  const competitors: (CompetitorProfile | null)[] = competitorInputs.map(() => null);
  const leakState = new Map<number, LeakPath[]>();
  const scanState = new Map<number, PossibleOverlap[]>();
  const scanNote = new Map<number, string>();
  const done = investorInputs.map(() => ({ direct: false, leaks: false, scan: false }));
  const askOverride = new Map<number, string>();
  const founder = { name: input.startupName, description: input.description };
  const coverageState = new Map<number, Coverage>();
  let finderState: FinderReport | undefined;
  /** Every competitor backer whose rounds were read, for the finder's co-investor check. */
  const viaIndex: {
    id: string;
    name: string;
    competitor: string;
    led: boolean;
    date?: string;
    rounds: Set<string>;
    competitorRounds: Map<string, unknown>;
  }[] = [];
  let slushReport: SlushReport | undefined;
  let slushByInvestor = new Map<number, InvestorSlush>();

  // ----- resolution -----

  async function retrieveAll(
    pool: CalaEntity[],
    query: Parameters<Cala["retrieve"]>[1],
    priority: number,
  ): Promise<RawEntity[]> {
    const settled = await Promise.allSettled(pool.map((c) => cala.retrieve(c.id, query, priority)));
    return settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  }

  const investingWeight = (e: RawEntity) =>
    rel(e, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND").length + rel(e, "outgoing", "INVESTED_IN").length;

  /**
   * "a16z crypto + Andreessen Horowitz": the founder says these records are one
   * investor (a fund and its parent, or two vehicles). Each part is resolved on
   * its own and the results are merged.
   */
  async function resolveInvestor(input: string): Promise<InvestorProfile | null> {
    const parts = input
      .split(/\s+\+\s+|\s*\+\s*(?=[A-Z0-9])/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return resolveOne(input, input);
    step(input, `Checking ${parts.join(" and ")} together, as you listed them`, "run");
    const found = (await Promise.all(parts.map((p) => resolveOne(p, input)))).filter(
      (p): p is InvestorProfile => Boolean(p),
    );
    if (!found.length) return null;
    const rounds = new Map<string, InvRound>();
    const portfolio = new Map<string, PortfolioCo>();
    for (const P of found) {
      P.rounds.forEach((r, id) => {
        const prev = rounds.get(id);
        rounds.set(id, prev ? { ...r, isLead: r.isLead || prev.isLead, sources: mergeSources(r.sources, prev.sources) } : r);
      });
      P.portfolio.forEach((c) => portfolio.has(c.id) || portfolio.set(c.id, c));
    }
    if (found.length < parts.length) {
      const missing = parts.filter((p) => !found.some((f) => f.input === p));
      step(input, `Not found in Cala: ${missing.join(", ")}. Checking the rest.`, "warn");
    }
    return {
      input,
      name: found.map((f) => f.name).join(" + "),
      key: found[0].key,
      keys: new Set(found.flatMap((f) => [...f.keys])),
      description: found.map((f) => f.description).find(Boolean),
      entities: found.flatMap((f) => f.entities),
      ids: new Set(found.flatMap((f) => [...f.ids])),
      candidates: found.reduce((n, f) => n + f.candidates, 0),
      rounds,
      portfolio: [...portfolio.values()],
      truncated: found.some((f) => f.truncated),
      isPerson: found.every((f) => f.isPerson),
      kind: found[0].kind,
      team: found.flatMap((f) => f.team),
      roles: found.flatMap((f) => f.roles),
    };
  }

  /** Retrieves candidates three at a time until some hold investments. */
  async function firstInvesting(cands: CalaEntity[], max: number): Promise<RawEntity[]> {
    for (let i = 0; i < Math.min(cands.length, max); i += MAX_ENTITIES_PER_NAME) {
      const batch = cands.slice(i, Math.min(i + MAX_ENTITIES_PER_NAME, max));
      const got = (await retrieveAll(batch, INVESTOR_QUERY, 1)).filter((e) => investingWeight(e) > 0);
      if (got.length) return got;
    }
    return [];
  }

  async function resolveOne(name: string, scope: string): Promise<InvestorProfile | null> {
    step(scope, `Searching Cala for "${name}"`, "run");
    const all = await cala.search(name, 0, INVESTOR_SEARCH_LIMIT);
    const orgs = all.filter((c) => /company|organization|group|institution/i.test(c.entity_type));
    const key = exactKey(name);
    // "Seedcamp Limited" is Seedcamp: legal suffixes don't make a different firm.
    const core = coreKey(name);
    // Funds are usually "Organization" records; registry companies that share the name are "Company".
    const typeRank = (c: CalaEntity) => (/organization/i.test(c.entity_type) ? 0 : 1);
    const exact = orgs.filter((c) => exactKey(c.name) === key || coreKey(c.name) === core).sort((a, b) => typeRank(a) - typeRank(b));
    const nameTokens = tokens(name);
    const prefixed = orgs.filter((c) => {
      const t = tokens(c.name);
      return exactKey(c.name) !== key && coreKey(c.name) !== core && nameTokens.every((x, i) => t[i] === x);
    });

    const first = exact.length ? exact : prefixed.length ? prefixed : orgs.slice(0, MAX_ENTITIES_PER_NAME);
    // Several records can carry the firm's exact name, and the first one found is
    // often the thinnest (Seedcamp: 3 investments vs 68 on "Seedcamp Limited").
    // Read every exact match, up to six, and let the heaviest lead.
    let retrieved = exact.length
      ? (await retrieveAll(exact.slice(0, 6), INVESTOR_QUERY, 1)).filter((e) => investingWeight(e) > 0)
      : first.length
        ? await firstInvesting(first, MAX_INVESTOR_TRIES)
        : [];
    if (!retrieved.length && exact.length && prefixed.length) {
      // The exact-name records hold no investments; try close names instead.
      retrieved = await firstInvesting(prefixed, 6);
    }
    if (!retrieved.length) {
      // No fund by that name: the founder may have listed an angel.
      const people = all.filter((c) => /person/i.test(c.entity_type) && exactKey(c.name) === key);
      if (people.length) {
        const got = (await retrieveAll(people.slice(0, MAX_ENTITIES_PER_NAME), INVESTOR_QUERY, 1)).filter(
          (e) => investingWeight(e) > 0 || roleEdges(e).length > 0,
        );
        if (got.length) {
          got.sort((a, b) => investingWeight(b) + roleEdges(b).length - (investingWeight(a) + roleEdges(a).length));
          return buildProfile(name, [got[0]], all.length, scope);
        }
      }
    }
    if (!first.length && !retrieved.length) {
      step(scope, `No organisation or person named "${name}" in Cala`, "warn");
      return null;
    }
    if (!retrieved.length) {
      step(
        scope,
        `Read ${Math.min(first.length, MAX_INVESTOR_TRIES)} of ${all.length} records named like "${name}"; none hold investments`,
        "warn",
      );
      return null;
    }

    retrieved.sort((a, b) => investingWeight(b) - investingWeight(a));
    // A thin organisation record can share a person's name (e.g. a founder's
    // holding company). If a person record with that exact name holds more,
    // the founder most likely listed the person, an angel.
    const exactPeople = all.filter((c) => /person/i.test(c.entity_type) && exactKey(c.name) === key);
    if (exactPeople.length && investingWeight(retrieved[0]) < 10) {
      const people = await retrieveAll(exactPeople.slice(0, 2), INVESTOR_QUERY, 1);
      const best = people.sort((a, b) => personWeight(b) - personWeight(a))[0];
      if (best && personWeight(best) > investingWeight(retrieved[0])) return buildProfile(name, [best], all.length, scope);
    }
    const primaryKey = coreKey(retrieved[0].name);
    const firm = retrieved.filter((e) => coreKey(e.name) === primaryKey);
    // The firm's own fund vehicles ("Seedcamp Investment Management LLP", "Seedcamp VI L.P.")
    // hold investments too. Merge them only when the extra words are vehicle words.
    const vehicles = prefixed.filter((c) => {
      const extra = tokens(c.name).slice(nameTokens.length);
      return extra.length > 0 && extra.every((t) => VEHICLE_WORDS.has(t));
    });
    if (vehicles.length && exact.length) {
      const got = (await retrieveAll(vehicles.slice(0, 3), INVESTOR_QUERY, 1)).filter((e) => investingWeight(e) > 0);
      firm.push(...got);
      if (got.length) step(scope, `Merged ${got.length} fund vehicle record${got.length === 1 ? "" : "s"} (${got.map((g) => g.name).join(", ")})`, "ok");
    }
    const profile = buildProfile(name, firm, all.length, scope);
    // Show the name the founder typed when it is the same firm ("Seedcamp", not "Seedcamp Limited").
    if (coreKey(profile.name) === core) profile.name = name.trim();
    return profile;
  }

  /** A person's weight: investments, plus roles at companies (each counts double: they are the conflict signal). */
  const personWeight = (e: RawEntity) => investingWeight(e) + 2 * roleEdges(e).length;

  /** Roles a person holds at companies, from a retrieved person record. */
  const ROLE_TYPES: [string, string][] = [
    ["FOUNDED", "founder"],
    ["IS_CEO_OF", "CEO"],
    ["IS_CTO_OF", "CTO"],
    ["IS_BOARD_MEMBER_OF", "board member"],
    ["IS_EXECUTIVE_OF", "executive"],
    ["WORKS_AT", "works at"],
  ];
  function roleEdges(e: RawEntity): PersonLink[] {
    if (!/person/i.test(e.entity_type)) return [];
    return ROLE_TYPES.flatMap(([relName, label]) =>
      rel(e, "outgoing", relName).map((x) => ({
        id: x.id,
        name: x.name,
        role: typeof x.properties?.role === "string" && x.properties.role ? String(x.properties.role) : label,
        sources: toSources(x.properties?.sources),
      })),
    );
  }

  /**
   * Fund, angel, lender or grant programme, from how the record takes part in
   * rounds. A loan is not a stake: lenders rarely get a board seat or
   * information rights, so their conflicts are weaker.
   */
  function classifyKind(isPerson: boolean, rounds: InvRound[], description?: string): InvestorKind {
    if (isPerson) return "angel";
    // A company whose own description says nothing about investing is a corporate investor.
    if (
      description &&
      !/(venture|capital|invest|fund|\bvc\b|accelerator|angel|partners|private equity|asset management|holding|family office|incubator|seed)/i.test(description)
    ) {
      return "corporate";
    }
    if (rounds.length < 3) return "fund";
    const debt = rounds.filter((r) => r.role === "LENDER" || /\b(debt|loan|credit|facility)\b/i.test(r.label)).length;
    const grant = rounds.filter((r) => /\bgrants?\b/i.test(r.label)).length;
    if (debt / rounds.length >= 0.6) return "lender";
    if (grant / rounds.length >= 0.6) return "grant";
    return "fund";
  }

  /** Builds an investor profile from one or more retrieved records of the same investor. */
  function buildProfile(name: string, merged: RawEntity[], candidates: number, scope?: string): InvestorProfile {
    const primary = merged[0];
    const primaryKey = exactKey(primary.name);
    const isPerson = /person/i.test(primary.entity_type);
    const rounds = new Map<string, InvRound>();
    const portfolio = new Map<string, PortfolioCo>();
    const team = new Map<string, PersonLink>();
    const roles = new Map<string, PersonLink>();
    let truncated = false;
    for (const e of merged) {
      const roundEdges = rel(e, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND");
      const investedEdges = rel(e, "outgoing", "INVESTED_IN");
      if (roundEdges.length >= REL_LIMIT || investedEdges.length >= REL_LIMIT) truncated = true;
      for (const r of roundEdges) {
        const sources = toSources(r.properties?.sources);
        const previous = rounds.get(r.id);
        rounds.set(r.id, {
          id: r.id,
          label: r.name || "Funding round",
          isLead: r.properties?.is_lead === true || previous?.isLead === true,
          role: String(r.properties?.role || previous?.role || "INVESTOR").toUpperCase(),
          date: edgeDate(sources) || previous?.date,
          sources: mergeSources(sources, previous?.sources),
        });
      }
      for (const c of investedEdges) {
        const sources = toSources(c.properties?.sources);
        const previous = portfolio.get(c.id);
        portfolio.set(c.id, {
          id: c.id,
          name: c.name,
          date: edgeDate(sources) || previous?.date,
          sources: mergeSources(sources, previous?.sources),
        });
      }
      for (const [relName, label] of [["WORKS_AT", "team"], ["FOUNDED", "founder"]] as const) {
        for (const p of rel(e, "incoming", relName)) {
          if (!/person/i.test(p.entity_type || "Person") || team.has(p.id)) continue;
          const role = typeof p.properties?.role === "string" && p.properties.role ? String(p.properties.role) : label;
          team.set(p.id, { id: p.id, name: p.name, role, sources: toSources(p.properties?.sources) });
        }
      }
      for (const r of roleEdges(e)) if (!roles.has(`${r.id}:${r.role}`)) roles.set(`${r.id}:${r.role}`, r);
    }

    const description =
      merged.map((e) => e.description || (prop(e, "description") as string | undefined)).find(Boolean) ||
      undefined;
    const kind = classifyKind(isPerson, [...rounds.values()], description ? String(description) : undefined);
    if (scope) {
      const picked =
        merged.length > 1
          ? `Merged ${merged.length} Cala records for ${primary.name}`
          : `Picked ${primary.name} (${primary.entity_type}) from ${candidates} candidates`;
      const extra = isPerson
        ? `${roles.size} roles at companies`
        : `${team.size} people on record${kind !== "fund" ? `; looks like a ${kind === "lender" ? "lender" : kind === "grant" ? "grant programme" : "corporate investor"}` : ""}`;
      step(scope, `${picked}: ${rounds.size} rounds, ${portfolio.size} portfolio companies, ${extra}`, "ok");
    }

    return {
      input: name,
      name: primary.name,
      key: primaryKey,
      keys: new Set([primaryKey]),
      description: description ? String(description) : undefined,
      entities: merged.map((e) => ({ id: e.id, name: e.name, type: e.entity_type })),
      ids: new Set(merged.map((e) => e.id)),
      candidates,
      rounds,
      portfolio: [...portfolio.values()],
      truncated,
      isPerson,
      kind,
      team: [...team.values()],
      roles: [...roles.values()],
    };
  }

  const COMPANY_QUERY = {
    properties: [
      "name",
      "description",
      "operational_status",
      "funding_stage",
      "founding_date",
      "website",
      "total_funding",
      "total_funding_units",
      "employee_count_range",
    ],
    relationships: {
      outgoing: {
        OPERATES_IN_INDUSTRY: { limit: 8, offset: 0 },
        PARTICIPATES_IN_FUNDING_ROUND: { limit: 50, offset: 0 },
        PARTICIPATES_IN_CORPORATE_EVENT: { limit: 20, offset: 0 },
      },
      incoming: {
        INVESTED_IN: { limit: REL_LIMIT, offset: 0 },
        FOUNDED: { limit: 20, offset: 0 },
        IS_CEO_OF: { limit: 10, offset: 0 },
        IS_CTO_OF: { limit: 10, offset: 0 },
        IS_EXECUTIVE_OF: { limit: 20, offset: 0 },
        IS_BOARD_MEMBER_OF: { limit: 30, offset: 0 },
      },
    },
  };
  const COMPANY_PEOPLE: [string, string][] = [
    ["FOUNDED", "founder"],
    ["IS_CEO_OF", "CEO"],
    ["IS_CTO_OF", "CTO"],
    ["IS_BOARD_MEMBER_OF", "board member"],
    ["IS_EXECUTIVE_OF", "executive"],
  ];

  async function resolveCompetitor(name: string): Promise<CompetitorProfile | null> {
    step(name, `Searching Cala for competitor "${name}"`, "run");
    const all = await cala.search(name, 0);
    const orgs = all.filter((c) => /company|organization/i.test(c.entity_type));
    const exact = orgs.filter((c) => sameCompany(c.name, name) === "exact");
    const close = orgs.filter((c) => sameCompany(c.name, name) === "prefix");
    let pool = (exact.length ? exact : close.length ? close : orgs.slice(0, 1)).slice(
      0,
      MAX_ENTITIES_PER_NAME,
    );
    // Discovery already tied this name to a graph record: start from it.
    const hinted = input.competitorIds?.[name];
    if (hinted) {
      const others = exact.filter((c) => c.id !== hinted).slice(0, MAX_ENTITIES_PER_NAME - 1);
      pool = [{ id: hinted, name, entity_type: "Company" }, ...others];
    }
    if (!pool.length) {
      step(name, `No company named "${name}" in Cala`, "warn");
      return null;
    }
    const retrieved = await retrieveAll(pool, COMPANY_QUERY, 1);
    if (!retrieved.length) {
      step(name, `Could not read "${name}" from Cala`, "warn");
      return null;
    }
    const weight = (e: RawEntity) =>
      rel(e, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND").length + rel(e, "incoming", "INVESTED_IN").length;
    retrieved.sort((a, b) => weight(b) - weight(a));
    const primary = retrieved[0];

    const roundEdges: CompetitorProfile["roundEdges"] = new Map();
    const investorEdges: CompetitorProfile["investors"] = new Map();
    const industries = new Set<string>();
    const people = new Map<string, PersonLink>();
    const eventEdges = new Map<string, CompetitorProfile["eventEdges"][number]>();
    let statusRaw: unknown;
    let description: string | undefined;
    let totalFunding: number | undefined;
    let totalFundingCurrency: string | undefined;
    let stage: string | undefined;
    let headcount: string | undefined;
    for (const e of retrieved) {
      statusRaw ??= prop(e, "operational_status");
      const tf = prop(e, "total_funding");
      if (typeof tf === "number" && tf > 0 && (totalFunding === undefined || tf > totalFunding)) {
        totalFunding = tf;
        const u = prop(e, "total_funding_units");
        totalFundingCurrency = typeof u === "string" ? u : undefined;
      }
      const st = prop(e, "funding_stage");
      if (typeof st === "string" && !stage) stage = st.replace(/_/g, " ").toLowerCase();
      const hc = prop(e, "employee_count_range");
      if (hc !== undefined && !headcount) headcount = Array.isArray(hc) ? hc.join("–") : String(hc);
      for (const [relName, label] of COMPANY_PEOPLE) {
        for (const p of rel(e, "incoming", relName)) {
          const key = `${p.id}:${label}`;
          if (!people.has(key)) people.set(key, { id: p.id, name: p.name, role: label, sources: toSources(p.properties?.sources) });
        }
      }
      for (const ev of rel(e, "outgoing", "PARTICIPATES_IN_CORPORATE_EVENT")) {
        const date = validDate(ev.properties?.event_date);
        eventEdges.set(ev.id, {
          id: ev.id,
          name: ev.name,
          role: String(ev.properties?.role || "").toUpperCase(),
          date,
          sources: toSources(ev.properties?.sources),
        });
      }
      description ??= (e.description || (prop(e, "description") as string | undefined)) ?? undefined;
      for (const i of rel(e, "outgoing", "OPERATES_IN_INDUSTRY")) {
        industries.add(i.name.replace(/_/g, " ").toLowerCase());
      }
      for (const r of rel(e, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND")) {
        const role = String(r.properties?.role || "ISSUER").toUpperCase();
        if (role !== "ISSUER") continue; // rounds this company invested in are not its own
        const sources = toSources(r.properties?.sources);
        roundEdges.set(r.id, {
          id: r.id,
          label: r.name || "Funding round",
          date: edgeDate(sources),
          sources,
        });
      }
      for (const inv of rel(e, "incoming", "INVESTED_IN")) {
        const sources = toSources(inv.properties?.sources);
        investorEdges.set(inv.id, { id: inv.id, name: inv.name, date: edgeDate(sources), sources });
      }
    }
    const { status, raw } = toStatus(statusRaw);
    step(
      name,
      `${retrieved.length > 1 ? `Merged ${retrieved.length} records for` : "Found"} ${primary.name}: ` +
        `${roundEdges.size} rounds, ${investorEdges.size} investors on record`,
      "ok",
    );
    return {
      input: name,
      name: primary.name,
      description,
      status,
      statusRaw: raw,
      industries: [...industries],
      entities: retrieved.map((e) => ({ id: e.id, name: e.name, type: e.entity_type })),
      ids: new Set(retrieved.map((e) => e.id)),
      roundEdges,
      rounds: new Map(),
      investors: investorEdges,
      people: [...people.values()],
      eventEdges: [...eventEdges.values()],
      events: [],
      totalFunding,
      totalFundingCurrency,
      stage,
      headcount,
    };
  }

  // ----- direct conflicts -----

  function findDirect(I: InvestorProfile, K: CompetitorProfile): DirectConflict | null {
    interface Evidence {
      round?: RoundRef;
      isLead: boolean;
      date?: string;
      matchedAs?: string;
      /** The investor came in as a lender, or the round is debt. */
      debt?: boolean;
      sources: SourceRef[];
    }
    const isDebtRound = (label?: string, instrument?: string) =>
      /\b(debt|loan|credit|facility)\b/i.test(`${label || ""} ${instrument || ""}`);
    const evidence: Evidence[] = [];

    // 1. The investor took part in a round the competitor raised.
    for (const r of I.rounds.values()) {
      const edge = K.roundEdges.get(r.id);
      if (!edge) continue;
      const detail = K.rounds.get(r.id);
      const date = detail?.date || r.date || edge.date;
      evidence.push({
        round: {
          id: r.id,
          label: detail?.label || r.label,
          date,
          amount: detail?.amount,
          currency: detail?.currency,
          issuer: K.name,
          sources: mergeSources(r.sources, detail?.sources, edge.sources),
        },
        isLead: r.isLead,
        date,
        debt: r.role === "LENDER" || isDebtRound(detail?.label || r.label, detail?.instrument),
        sources: mergeSources(r.sources, edge.sources),
      });
    }
    // 2. A round we opened lists the investor as a participant.
    for (const d of K.rounds.values()) {
      for (const p of d.participants) {
        if (p.role === "ISSUER") continue;
        if (!I.ids.has(p.id) && !I.keys.has(exactKey(p.name))) continue;
        evidence.push({
          round: { ...d, issuer: K.name, sources: mergeSources(p.sources, d.sources) },
          isLead: p.isLead,
          date: d.date,
          debt: p.role === "LENDER" || isDebtRound(d.label, d.instrument),
          sources: mergeSources(p.sources, d.sources),
        });
      }
    }
    // 3. The competitor's record names the investor.
    for (const inv of K.investors.values()) {
      if (!I.ids.has(inv.id) && !I.keys.has(exactKey(inv.name))) continue;
      evidence.push({ isLead: false, date: inv.date, sources: inv.sources });
    }
    // 4. The investor's portfolio names the competitor.
    for (const c of I.portfolio) {
      const byId = K.ids.has(c.id);
      const byName = byId ? "exact" : sameCompany(c.name, K.name) || sameCompany(c.name, K.input);
      if (!byId && !byName) continue;
      evidence.push({
        isLead: false,
        date: c.date,
        matchedAs: exactKey(c.name) === exactKey(K.name) ? undefined : c.name,
        sources: c.sources,
      });
    }
    if (!evidence.length) return null;

    evidence.sort(
      (a, b) =>
        Number(Boolean(b.round)) - Number(Boolean(a.round)) || (b.date || "").localeCompare(a.date || ""),
    );
    const main = evidence[0];
    const isLead = evidence.some((e) => e.isLead);
    const date = main.date || evidence.map((e) => e.date).filter(Boolean).sort().pop();
    const monthsAgo = date ? monthsSince(date) : undefined;
    const sources = mergeSources(...evidence.map((e) => e.sources));
    const source = bestSource(sources);
    const round = main.round;
    const money = fmtMoney(round?.amount, round?.currency);

    const reasons: Reason[] = [];
    if (round) {
      reasons.push({
        text: isLead
          ? `Led ${K.name}'s ${round.label} round${money ? ` (${money})` : ""}`
          : `Took part in ${K.name}'s ${round.label} round${money ? ` (${money})` : ""}; not flagged as lead`,
        tone: isLead ? "bad" : "warn",
        source,
      });
    } else {
      reasons.push({
        text: main.matchedAs
          ? `Portfolio lists "${main.matchedAs}", which matches ${K.name}`
          : `${K.name} is on record as one of its investments`,
        tone: "warn",
        source,
      });
    }
    if (date && monthsAgo !== undefined) {
      reasons.push({
        text: `Dated ${fmtDate(date)}, ${fmtAgo(monthsAgo)}`,
        tone: monthsAgo <= 12 ? "bad" : monthsAgo <= 24 ? "warn" : "neutral",
      });
    } else {
      reasons.push({ text: "No dated source, so recency is unknown", tone: "neutral" });
    }
    if (K.status === "operating") {
      reasons.push({ text: `${K.name} is still operating`, tone: "warn" });
    } else if (K.status === "closed") {
      reasons.push({ text: `${K.name} is recorded as ${K.statusRaw?.toLowerCase()}`, tone: "good" });
    } else if (K.status === "acquired") {
      reasons.push({ text: `${K.name} is recorded as acquired`, tone: "good" });
    } else {
      reasons.push({ text: `Cala has no operating status for ${K.name}`, tone: "neutral" });
    }

    const lateStage = Boolean(round) && !isLead && isLateStage(round?.label, round?.amount);
    // Only rounds count here: a portfolio listing does not say whether it was a loan.
    const roundEvidence = evidence.filter((e) => e.round);
    const debt = roundEvidence.length > 0 && roundEvidence.every((e) => e.debt);
    if (debt) {
      reasons.push({
        text: "A loan, not equity: lenders usually get no board seat or information rights",
        tone: "neutral",
      });
    }
    if (lateStage) {
      reasons.push({
        text: "Late-stage round and not the lead: usually a smaller, financial stake with no board seat",
        tone: "neutral",
      });
    }
    const stale = monthsAgo !== undefined && monthsAgo > 24 && !isLead;
    const level: DirectConflict["level"] =
      K.status === "closed" || K.status === "acquired" || stale || lateStage || debt
        ? "direct_moderate"
        : "direct_high";

    return {
      competitor: K.name,
      competitorStatus: K.status,
      matchedAs: main.matchedAs,
      round,
      isLead,
      date,
      monthsAgo,
      level,
      lateStage,
      debt,
      reasons,
      sources,
    };
  }

  // ----- people -----

  const ROLE_PHRASE: Record<string, string> = {
    founder: "a founder of",
    CEO: "the CEO of",
    CTO: "the CTO of",
    "board member": "on the board of",
    executive: "an executive at",
  };

  /**
   * People who tie an investor to a competitor: the angel on the list founded
   * or runs it, or someone on the fund's team sits on its board or founded it.
   */
  function findPeople(I: InvestorProfile, K: CompetitorProfile): PersonTie[] {
    const ties: PersonTie[] = [];
    const seen = new Set<string>();
    const add = (t: PersonTie) => {
      const key = `${t.personId}:${t.roleAtCompetitor}`;
      if (!seen.has(key)) {
        seen.add(key);
        ties.push(t);
      }
    };
    for (const p of K.people) {
      const phrase = ROLE_PHRASE[p.role] || `${p.role} at`;
      if (I.ids.has(p.id)) {
        add({
          person: p.name,
          personId: p.id,
          competitor: K.name,
          roleAtCompetitor: p.role,
          side: "self",
          text: `${p.name} is ${phrase} ${K.name}`,
          source: bestSource(p.sources),
        });
      }
      const member = I.team.find((m) => m.id === p.id);
      if (member) {
        add({
          person: p.name,
          personId: p.id,
          competitor: K.name,
          roleAtCompetitor: p.role,
          side: "team",
          roleAtInvestor: member.role,
          text: `${p.name} (${member.role === "team" ? "on the team" : member.role} at ${I.name}) is ${phrase} ${K.name}`,
          source: bestSource(mergeSources(p.sources, member.sources)),
        });
      }
    }
    // A person record can also name the company directly in its own roles.
    if (I.isPerson) {
      for (const r of I.roles) {
        if (!K.ids.has(r.id) || r.role === "works at") continue;
        add({
          person: I.name,
          personId: [...I.ids][0],
          competitor: K.name,
          roleAtCompetitor: r.role,
          side: "self",
          text: `${I.name} is ${ROLE_PHRASE[r.role] || `${r.role} at`} ${K.name}`,
          source: bestSource(r.sources),
        });
      }
    }
    return mergeTies(ties);
  }

  /** One line per person and competitor: "a founder, the CEO and on the board of Lovable". */
  function mergeTies(ties: PersonTie[]): PersonTie[] {
    const groups = new Map<string, PersonTie[]>();
    for (const t of ties) {
      const key = `${t.personId}|${t.competitor}|${t.side}`;
      groups.set(key, [...(groups.get(key) || []), t]);
    }
    const order = ["founder", "CEO", "CTO", "board member", "executive"];
    return [...groups.values()].map((g) => {
      const roles = [...new Set(g.map((t) => t.roleAtCompetitor))].sort(
        (a, b) => (order.indexOf(a) + 99) % 99 - ((order.indexOf(b) + 99) % 99),
      );
      const known = roles.filter((r) => ROLE_PHRASE[r]);
      if (!known.length) return g[0];
      const phrases = known.map((r) => ROLE_PHRASE[r].replace(/ (of|at)$/, ""));
      const joined =
        phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
      const first = g[0];
      const who = first.side === "team" ? `${first.person} (${first.roleAtInvestor === "team" ? "on the team" : first.roleAtInvestor} at the fund)` : first.person;
      return {
        ...first,
        roleAtCompetitor: known[0],
        text: `${who} is ${joined} of ${first.competitor}`.replace(/ an executive at of /, " an executive at "),
        source: g.find((t) => t.source?.url)?.source,
      };
    });
  }

  // ----- results -----

  function activityOf(I: InvestorProfile): Activity {
    const rounds = [...I.rounds.values()];
    const cutoff = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
    const recent = rounds.filter((r) => r.date && r.date >= cutoff);
    const dated = rounds.filter((r) => r.date).sort((a, b) => b.date!.localeCompare(a.date!));
    const last = dated[0];
    return {
      roundsRecorded: rounds.length,
      portfolioRecorded: new Set(I.portfolio.map((c) => coreTokens(c.name).join(""))).size,
      rounds12m: recent.length,
      leads12m: recent.filter((r) => r.isLead).length,
      leadsAll: rounds.filter((r) => r.isLead).length,
      lastRound: last
        ? { label: last.label, date: last.date!, source: last.sources.find(isArticleLike) }
        : undefined,
      truncated: I.truncated,
    };
  }

  const emptyActivity: Activity = {
    roundsRecorded: 0,
    portfolioRecorded: 0,
    rounds12m: 0,
    leads12m: 0,
    leadsAll: 0,
    truncated: false,
  };

  function buildResult(idx: number): InvestorResult {
    const I = investors[idx];
    const name = investorInputs[idx];
    if (!I) {
      const failed = investorFailed[idx];
      return {
        input: name,
        resolved: false,
        name,
        entities: [],
        candidates: 0,
        activity: emptyActivity,
        level: failed ? "unresolved" : "clear",
        headline: failed ? `No investor record found for "${name}"` : "Looking up…",
        direct: [],
        leaks: [],
        possible: [],
        share: {
          level: "Deck without customer names",
          why: "Cala has no investment record under this name, so nothing could be checked. Try the fund's legal name.",
        },
        ask: {
          question:
            "Which companies in your portfolio, announced or not, work on something close to what we do?",
        },
        done: failed ? { direct: true, leaks: true, scan: true } : done[idx],
      };
    }

    const known = competitors.filter((k): k is CompetitorProfile => Boolean(k));
    const direct = known
      .map((K) => findDirect(I, K))
      .filter((d): d is DirectConflict => Boolean(d))
      .sort(
        (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (b.date || "").localeCompare(a.date || ""),
      );
    const directNames = new Set(direct.map((d) => d.competitor));
    const leaks = (leakState.get(idx) || [])
      .filter((l) => !directNames.has(l.competitor))
      .sort(
        (a, b) =>
          b.strength - a.strength ||
          b.sharedRoundCount - a.sharedRoundCount ||
          (b.lastSharedDate || "").localeCompare(a.lastSharedDate || ""),
      )
      .slice(0, 6);
    const realLeaks = leaks.filter((l) => l.strengthLabel !== "weak");
    const possible = scanState.get(idx) || [];
    const activity = activityOf(I);
    const records = activity.roundsRecorded + activity.portfolioRecorded;

    let level: Level = "clear";
    if (direct.some((d) => d.level === "direct_high")) level = "direct_high";
    else if (direct.length) level = "direct_moderate";
    else if (realLeaks.length) level = "indirect";
    else if (possible.length) level = "possible";
    else if (records < 5) level = "thin";

    const top = direct[0];
    const leak = realLeaks[0];
    const weakLeak = realLeaks.length ? undefined : leaks[0];
    const maybe = possible[0];
    let headline: string;
    let share: { level: ShareLevel; why: string };
    let ask: InvestorResult["ask"];

    if (top) {
      const verb = top.isLead ? "Led" : "Backed";
      const what = top.round ? `${top.competitor}'s ${top.round.label}` : top.competitor;
      const more = direct.length > 1 ? ` (+${direct.length - 1} more)` : "";
      headline = `${verb} ${what}${top.date ? `, ${fmtMonthYear(top.date)}` : ""}${more}`;
      if (level === "direct_high") {
        share = {
          level: "Teaser only",
          why: `They hold a ${top.isLead ? "lead" : "recent or undated"} position in ${top.competitor}, which is on your competitor list. Hold the deck until they explain how they keep the two apart.`,
        };
      } else {
        share = {
          level: "Deck without customer names",
          why:
            top.competitorStatus === "closed" || top.competitorStatus === "acquired"
              ? `Their position in ${top.competitor} looks finished (${top.competitorStatus}), but the people who worked on it are still at the fund.`
              : top.lateStage
                ? `They joined ${top.competitor}'s ${top.round?.label || "late-stage"} round without leading it, which is usually a financial stake with no board seat. Share the story, keep customer names and roadmap back.`
                : `Their investment in ${top.competitor} is more than two years old and they did not lead it. Share the story, keep customer names back.`,
        };
      }
      const action = top.round
        ? `${top.isLead ? "led" : "joined"} ${top.competitor}'s ${top.round.label} round${top.date ? ` in ${fmtMonthYear(top.date)}` : ""}`
        : `have ${top.competitor} in your portfolio`;
      ask = {
        question: `You ${action}. Who at the fund works with that company, and how do you keep what we share away from them?`,
        source: bestSource(top.sources),
      };
    } else if (leak) {
      const more = realLeaks.length > 1 ? ` (+${realLeaks.length - 1} more)` : "";
      headline = `Co-invests with ${leak.via.name}, which ${leak.viaLed ? "led" : "backed"} ${leak.competitor}${more}`;
      share = {
        level: "Deck without customer names",
        why: `No direct stake in your competitors, but they have shared ${leak.sharedRoundCount} recorded round${leak.sharedRoundCount === 1 ? "" : "s"} with ${leak.via.name}, an investor in ${leak.competitor} (link strength ${leak.strength}/100). Decks travel between co-investors.`,
      };
      const example = leak.sharedRounds[0];
      const exampleText = example
        ? ` (most recently ${example.issuer ? `${example.issuer}'s ${example.label}` : `a ${example.label} round`}${example.date ? `, ${fmtMonthYear(example.date)}` : ""})`
        : "";
      ask = {
        question: `You have co-invested with ${leak.via.name}${exampleText}, and ${leak.via.name} ${leak.viaLed ? "led a round in" : "backs"} ${leak.competitor}. Do you pass decks or deal notes to co-investors?`,
        source: bestSource(leak.sources),
      };
    } else if (maybe) {
      headline =
        maybe.verdict === "direct"
          ? `${maybe.company} in their portfolio competes with you`
          : `${maybe.company} in their portfolio looks close to you`;
      share = {
        level: "Deck without customer names",
        why:
          maybe.judgedBy === "gemini" && maybe.why
            ? `${maybe.company}: ${maybe.why} Gemini judged this from Cala's descriptions, so confirm it in the meeting.`
            : `${maybe.company} overlaps with your description (${maybe.sharedTerms.slice(0, 3).join(", ") || "named competitor"}). This is a text match, so confirm it before deciding.`,
      };
      ask = {
        question: `${maybe.company} in your portfolio looks close to what we do. Do you see us as competing with them, and could you still invest if so?`,
        source: bestSource(maybe.sources),
      };
    } else if (level === "thin") {
      headline = `Only ${records} record${records === 1 ? "" : "s"} in Cala for this investor`;
      share = {
        level: "Deck without customer names",
        why: "Too little is on record to rule a conflict in or out. Treat this as unknown.",
      };
      ask = {
        question:
          "Which companies in your portfolio, announced or not, work on something close to what we do?",
      };
    } else {
      headline = weakLeak
        ? `Only a weak co-investor link: ${weakLeak.via.name} → ${weakLeak.competitor} (${weakLeak.strength}/100)`
        : activity.roundsRecorded === 0
          ? `No link in ${activity.portfolioRecorded} portfolio companies; no rounds on record to trace co-investors`
          : `No link to your competitors in ${activity.roundsRecorded} rounds and ${activity.portfolioRecorded} portfolio companies`;
      share = {
        level: "Full data room",
        why: weakLeak
          ? `No direct stake in your competitors. They share ${weakLeak.sharedRoundCount} old or minor round${weakLeak.sharedRoundCount === 1 ? "" : "s"} with ${weakLeak.via.name}, which is too weak to hold back. Public records lag, so still ask about unannounced deals.`
          : `Nothing on record ties them to the competitors on your list${known.length ? "" : " (the list was empty)"}. Public records lag, so still ask about unannounced deals.`,
      };
      ask = {
        question:
          "We found no overlap with your portfolio in public records. Is there anything unannounced or in your pipeline that competes with us?",
      };
    }

    // A stake in a Slush attendee that competes with the founder counts as a
    // possible overlap when nothing stronger was found.
    const slush = slushByInvestor.get(idx);
    const slushRival = slush?.competitors.length
      ? slushReport?.competitors.find((c) => slush.competitors.includes(c.name))
      : undefined;
    if (slushRival && LEVEL_RANK[level] < LEVEL_RANK.possible) {
      const event = slushReport!.event.name;
      level = "possible";
      headline = `Backs ${slushRival.name}, an ${event} attendee that ${slushRival.verdict === "direct" ? "competes with you" : "builds something like yours"}`;
      share = {
        level: "Deck without customer names",
        why:
          `Cala has ${I.name} on record as an investor in ${slushRival.name}, which is on the ${event} attendee list` +
          (slushRival.why ? ` (${slushRival.why.replace(/\.$/, "")})` : slushRival.what ? ` (${slushRival.what.slice(0, 120).replace(/\.$/, "")})` : "") +
          ". You may both be pitching the same people that week.",
      };
      ask = {
        question: `You back ${slushRival.name}, which works on something close to what we do and is also at ${event}. Do you see us as competing, and how would you handle backing both?`,
        source: slushRival.source,
      };
    }

    // People outrank everything else: a partner on the competitor's board, or
    // an angel who founded it, sees the deck the day it is sent.
    const peopleTies = known.flatMap((K) => findPeople(I, K));
    if (peopleTies.length) {
      const t = peopleTies[0];
      const phrase = ROLE_PHRASE[t.roleAtCompetitor] || `${t.roleAtCompetitor} at`;
      if (!top) {
        headline = t.text;
        share = {
          level: "Teaser only",
          why:
            t.side === "self"
              ? `${t.person} is ${phrase} ${t.competitor}, which is on your competitor list. Anything you share goes straight to them.`
              : `${t.person} works at ${I.name} and is ${phrase} ${t.competitor}. Ask who at the fund would see your materials before you send them.`,
        };
        ask = {
          question:
            t.side === "self"
              ? `You're ${phrase} ${t.competitor}. How would you handle investing in a company that competes with it?`
              : `${t.person} on your team is ${phrase} ${t.competitor}. Would they see our materials, and how do you keep the two apart?`,
          source: t.source,
        };
      }
      level = "direct_high";
    }

    const rewritten = askOverride.get(idx);
    if (rewritten) ask = { ...ask, question: rewritten, draftedBy: "gemini" };

    return {
      input: name,
      resolved: true,
      name: I.name,
      description: I.description,
      entities: I.entities,
      candidates: I.candidates,
      activity,
      level,
      headline,
      direct,
      leaks,
      possible,
      share,
      ask,
      done: done[idx],
      scanNote: scanNote.get(idx),
      slush,
      kind: I.kind,
      people: peopleTies,
      coverage: coverageState.get(idx),
    };
  }

  const emitInvestor = (idx: number) => emit({ type: "investor", data: buildResult(idx) });
  const emitAll = () => investorInputs.forEach((_, i) => emitInvestor(i));

  function competitorSummary(idx: number): CompetitorSummary {
    const K = competitors[idx];
    if (!K) {
      return {
        input: competitorInputs[idx],
        resolved: false,
        name: competitorInputs[idx],
        status: "unknown",
        industries: [],
        roundsRecorded: 0,
        investorsRecorded: 0,
        entities: [],
      };
    }
    const investorKeys = new Set<string>();
    K.investors.forEach((i) => investorKeys.add(exactKey(i.name)));
    K.rounds.forEach((r) =>
      r.participants.forEach((p) => p.role !== "ISSUER" && investorKeys.add(exactKey(p.name))),
    );
    return {
      input: K.input,
      resolved: true,
      name: K.name,
      description: K.description,
      status: K.status,
      statusRaw: K.statusRaw,
      industries: K.industries.slice(0, 4),
      roundsRecorded: K.roundEdges.size,
      investorsRecorded: investorKeys.size,
      entities: K.entities,
      radar: radarOf(K),
    };
  }

  /** Who just raised, how much, from whom: the competitor's rounds, newest first, and its deals. */
  function radarOf(K: CompetitorProfile): CompetitorSummary["radar"] {
    const listed = (id: string, name: string) =>
      investors
        .filter((I): I is InvestorProfile => Boolean(I) && (I!.ids.has(id) || I!.keys.has(exactKey(name))))
        .map((I) => I.name);
    const rounds: RadarRound[] = [...K.roundEdges.values()]
      .map((edge) => {
        const d = K.rounds.get(edge.id);
        const others = (d?.participants || []).filter((p) => p.role !== "ISSUER");
        const onList = new Set<string>();
        others.forEach((p) => listed(p.id, p.name).forEach((n) => onList.add(n)));
        investors.forEach((I) => I && I.rounds.has(edge.id) && onList.add(I.name));
        return {
          id: edge.id,
          label: d?.label || edge.label,
          date: d?.date || edge.date,
          amount: d?.amount,
          currency: d?.currency,
          valuation: d?.valuation,
          valuationCurrency: d?.valuationCurrency,
          issuer: K.name,
          sources: mergeSources(d?.sources, edge.sources),
          leads: others.filter((p) => p.isLead).map((p) => p.name),
          participants: others.map((p) => p.name),
          onList: [...onList],
          opened: Boolean(d),
        };
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return {
      totalFunding: K.totalFunding,
      totalFundingCurrency: K.totalFundingCurrency,
      stage: K.stage,
      rounds,
      events: K.events,
      people: K.people.filter((p) => p.role !== "executive" || K.people.length < 8).map((p) => ({ name: p.name, role: p.role })),
    };
  }

  /** Opens the competitor's latest corporate events to name the other side (who bought whom). */
  async function radarEventsFor(K: CompetitorProfile): Promise<void> {
    const recent = [...K.eventEdges]
      .filter((e) => /MNA|ACQUI|MERG/i.test(e.name))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 4);
    if (!recent.length) return;
    const opened = await Promise.allSettled(
      recent.map((ev) =>
        cala.retrieve(
          ev.id,
          {
            properties: ["name", "event_date", "description"],
            relationships: { incoming: { PARTICIPATES_IN_CORPORATE_EVENT: { limit: 10, offset: 0 } } },
          },
          4,
        ),
      ),
    );
    K.events = recent.flatMap((ev, i): RadarEvent[] => {
      const o = opened[i];
      const parties = o.status === "fulfilled" ? rel(o.value, "incoming", "PARTICIPATES_IN_CORPORATE_EVENT") : [];
      const other = parties.find((p) => !K.ids.has(p.id) && exactKey(p.name) !== exactKey(K.name));
      const isMna = /MNA|ACQUI|MERG/i.test(ev.name);
      const kind: RadarEvent["kind"] = !isMna
        ? "other"
        : ev.role === "TARGET"
          ? "was_acquired"
          : "acquired";
      const label = /MNA_COMPLETED/i.test(ev.name)
        ? "Acquisition completed"
        : /MNA/i.test(ev.name)
          ? "Acquisition announced"
          : ev.name.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
      // Financing filings repeat the funding rounds already shown, so only deals are kept.
      if (kind === "other") return [];
      return [{ id: ev.id, kind, label, date: ev.date, counterparty: other?.name, source: bestSource(ev.sources) }];
    });
    if (K.events.some((e) => e.kind !== "other")) {
      const deals = K.events.filter((e) => e.kind === "acquired" && e.counterparty).map((e) => e.counterparty);
      if (deals.length) step(K.name, `${K.name} acquired ${deals.join(", ")}`, "ok");
    }
    emit({ type: "competitor", data: competitorSummary(competitors.indexOf(K)) });
  }

  // ----- leak paths -----

  async function leakPathsFor(K: CompetitorProfile, enrichBudget: { left: number }): Promise<void> {
    // Open the competitor's most recent rounds to see who else is in them.
    const edges = [...K.roundEdges.values()]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, MAX_COMPETITOR_ROUNDS);
    if (edges.length) step(K.name, `Opening ${edges.length} of ${K.name}'s rounds to read the participants`, "run");
    const details = await Promise.allSettled(edges.map((e) => cala.retrieve(e.id, ROUND_QUERY, 2)));
    details.forEach((d) => {
      if (d.status !== "fulfilled") return;
      const detail = parseRound(d.value);
      K.rounds.set(detail.id, detail);
    });
    emit({ type: "competitor", data: competitorSummary(competitors.indexOf(K)) });
    emitAll(); // round details can upgrade a direct conflict (amount, date, lead)

    // Who backs the competitor, other than the people on the meeting list?
    const onList = (id: string, name: string) =>
      investors.some((I) => I && (I.ids.has(id) || I.keys.has(exactKey(name))));
    interface Via {
      id: string;
      name: string;
      led: boolean;
      round?: RoundDetail;
      date?: string;
      sources: SourceRef[];
    }
    const vias = new Map<string, Via>();
    for (const d of K.rounds.values()) {
      for (const p of d.participants) {
        if (p.role === "ISSUER" || onList(p.id, p.name)) continue;
        const key = exactKey(p.name);
        const previous = vias.get(key);
        if (!previous || (p.isLead && !previous.led) || (d.date || "") > (previous.date || "")) {
          vias.set(key, {
            id: p.id,
            name: p.name,
            led: p.isLead || previous?.led === true,
            round: d,
            date: d.date,
            sources: mergeSources(p.sources, d.sources),
          });
        }
      }
    }
    for (const inv of K.investors.values()) {
      const key = exactKey(inv.name);
      if (vias.has(key) || onList(inv.id, inv.name)) continue;
      vias.set(key, { id: inv.id, name: inv.name, led: false, date: inv.date, sources: inv.sources });
    }
    const ranked = [...vias.values()]
      .sort((a, b) => Number(b.led) - Number(a.led) || (b.date || "").localeCompare(a.date || ""))
      .slice(0, MAX_VIA_PER_COMPETITOR);
    if (!ranked.length) {
      step(K.name, `No other investors on record for ${K.name}, so no indirect paths to check`, "warn");
      return;
    }
    step(
      K.name,
      `${K.name}'s other backers: ${ranked.map((v) => v.name).join(", ")}. Checking who on your list co-invests with them`,
      "run",
    );

    await Promise.allSettled(
      ranked.map(async (via) => {
        const entity = await cala.retrieve(
          via.id,
          { relationships: { outgoing: { PARTICIPATES_IN_FUNDING_ROUND: { limit: REL_LIMIT, offset: 0 } } } },
          3,
        );
        const viaRounds = new Set(rel(entity, "outgoing", "PARTICIPATES_IN_FUNDING_ROUND").map((r) => r.id));
        viaIndex.push({
          id: via.id,
          name: via.name,
          competitor: K.name,
          led: via.led,
          date: via.round?.date || via.date,
          rounds: viaRounds,
          competitorRounds: K.roundEdges,
        });
        for (let idx = 0; idx < investors.length; idx++) {
          const I = investors[idx];
          if (!I) continue;
          const shared = [...I.rounds.values()]
            .filter((r) => viaRounds.has(r.id) && !K.roundEdges.has(r.id))
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          if (!shared.length) continue;

          const sharedRounds: RoundRef[] = shared.slice(0, 3).map((r) => ({
            id: r.id,
            label: r.label,
            date: r.date,
            sources: r.sources,
          }));
          // Name the company behind the most recent shared round.
          if (enrichBudget.left > 0) {
            enrichBudget.left--;
            try {
              const detail = parseRound(await cala.retrieve(sharedRounds[0].id, ROUND_QUERY, 4));
              sharedRounds[0] = {
                ...sharedRounds[0],
                issuer: detail.issuer,
                date: detail.date || sharedRounds[0].date,
                amount: detail.amount,
                currency: detail.currency,
                sources: mergeSources(sharedRounds[0].sources, detail.sources),
              };
            } catch {
              // The path still stands without the company name.
            }
          }

          const n = shared.length;
          const first = sharedRounds[0];
          const strength = leakStrength(n, first.date, via.led, via.round?.date || via.date);
          const reasons: Reason[] = [
            {
              text:
                `Shares ${n} recorded round${n === 1 ? "" : "s"} with ${via.name}` +
                (first.issuer || first.date
                  ? `, most recently ${first.issuer ? `${first.issuer}'s ${first.label}` : first.label}${first.date ? ` (${fmtMonthYear(first.date)})` : ""}`
                  : ""),
              tone: n >= 2 ? "warn" : "neutral",
              source: bestSource(first.sources),
            },
            {
              text: via.round
                ? `${via.name} ${via.led ? "led" : "took part in"} ${K.name}'s ${via.round.label}${via.round.date ? ` (${fmtMonthYear(via.round.date)})` : ""}`
                : `${via.name} is on record as an investor in ${K.name}`,
              tone: via.led ? "bad" : "warn",
              source: bestSource(via.sources),
            },
            {
              text: `Link strength ${strength.score}/100 (${strength.label}): ${strength.parts.join(", ")}`,
              tone: strength.label === "strong" ? "bad" : strength.label === "moderate" ? "warn" : "neutral",
            },
          ];
          const path: LeakPath = {
            competitor: K.name,
            via: { id: via.id, name: via.name },
            viaLed: via.led,
            competitorRound: via.round
              ? {
                  id: via.round.id,
                  label: via.round.label,
                  date: via.round.date,
                  amount: via.round.amount,
                  currency: via.round.currency,
                  issuer: K.name,
                  sources: via.round.sources,
                }
              : undefined,
            sharedRoundCount: n,
            sharedRounds,
            lastSharedDate: first.date,
            strength: strength.score,
            strengthLabel: strength.label,
            reasons,
            sources: mergeSources(via.sources, first.sources),
          };
          leakState.set(idx, [...(leakState.get(idx) || []), path]);
          step(
            I.name,
            `Path found: ${I.name} → ${via.name} → ${K.name} (${n} shared round${n === 1 ? "" : "s"}, ${strength.label} ${strength.score}/100)`,
            strength.label === "weak" ? "ok" : "warn",
          );
          emitInvestor(idx);
        }
      }),
    );
  }

  // ----- portfolio scan -----

  const founderTerms = termSet(`${input.startupName} ${input.description}`);

  async function scanPortfolio(idx: number): Promise<void> {
    const I = investors[idx];
    if (!I) return;
    step(I.name, `Asking Cala to describe ${I.name}'s portfolio (slow query, 30 to 60 seconds)`, "run");
    try {
      const { results } = await cala.query(
        `Portfolio companies of the venture investor ${I.name}: company, sector, what_it_does`,
        5,
      );
      const pick = (row: Record<string, unknown>, test: RegExp): string => {
        const key = Object.keys(row).find((k) => test.test(k));
        const value = key ? row[key] : undefined;
        return typeof value === "string" ? value : "";
      };
      const known = competitors.filter((k): k is CompetitorProfile => Boolean(k));
      const seen = new Set<string>();
      const hits: (PossibleOverlap & { score: number })[] = [];
      const rows: { company: string; sector: string; description: string; record?: PortfolioCo }[] = [];
      for (const row of results) {
        const company = pick(row, /^(company|name|portfolio_company|company_name|startup)$/i);
        if (!company) continue;
        const key = coreTokens(company).join("");
        if (seen.has(key)) continue;
        seen.add(key);
        const sector = pick(row, /(sector|industry|category|vertical)/i);
        const description = pick(row, /(does|desc|summary|about|focus)/i);
        const record = I.portfolio.find((c) => sameCompany(c.name, company));
        const named = known.find((K) => sameCompany(company, K.name) || sameCompany(company, K.input));
        if (named) {
          // Cala's query lists a named competitor in this portfolio. If the graph
          // already links them it is reported as a direct conflict instead.
          if (findDirect(I, named)) continue;
          hits.push({
            company,
            sector: sector || undefined,
            description: description || undefined,
            sharedTerms: [`${named.name} is on your competitor list`],
            origin: record ? "graph" : "query",
            judgedBy: "terms",
            sources: record?.sources || [],
            score: 99,
          });
          continue;
        }
        rows.push({ company, sector, description, record });
      }

      // Gemini reads both descriptions when it is configured; word overlap otherwise.
      const judged =
        input.description.trim().length >= 15 && rows.length
          ? await judgeCompetition(
              founder,
              rows.map((r) => ({ name: r.company, description: r.description, sector: r.sector })),
              signal,
            )
          : undefined;
      for (const r of rows) {
        const { score, shared } = overlapScore(founderTerms, r.sector, r.description);
        const base = {
          company: r.company,
          sector: r.sector || undefined,
          description: r.description || undefined,
          sharedTerms: shared.slice(0, 5),
          origin: r.record ? ("graph" as const) : ("query" as const),
          sources: r.record?.sources || [],
        };
        if (judged) {
          const j = judged.get(r.company.trim().toLowerCase());
          if (!j || j.verdict === "no") continue;
          hits.push({
            ...base,
            judgedBy: "gemini",
            verdict: j.verdict,
            why: j.why,
            score: (j.verdict === "direct" ? 20 : 10) + score,
          });
          continue;
        }
        if (score < 1.8 || !shared.length) continue;
        hits.push({ ...base, judgedBy: "terms", score });
      }
      hits.sort((a, b) => b.score - a.score);
      scanState.set(
        idx,
        hits.slice(0, 4).map(({ score: _score, ...rest }) => rest),
      );
      scanNote.set(
        idx,
        judged
          ? `Gemini compared your description with ${seen.size} portfolio companies.`
          : `Compared your description with ${seen.size} portfolio companies by shared words.`,
      );
      step(
        I.name,
        hits.length
          ? `Portfolio scan: ${hits.length} of ${seen.size} companies look close to you`
          : `Portfolio scan: none of ${seen.size} companies look close to you`,
        hits.length ? "warn" : "ok",
      );
    } catch (err) {
      scanNote.set(idx, "The portfolio scan did not finish, so lookalike companies were not checked.");
      step(I.name, `Portfolio scan failed: ${(err as Error).message}`, "warn");
    } finally {
      done[idx].scan = true;
      emitInvestor(idx);
    }
  }

  // ----- Gemini question writing -----

  async function sharpenQuestions(): Promise<void> {
    const items: AskFacts[] = [];
    investorInputs.forEach((_, idx) => {
      const r = buildResult(idx);
      if (!r.resolved || !["direct_high", "direct_moderate", "indirect", "possible"].includes(r.level)) return;
      const facts: string[] = [r.headline];
      const d = r.direct[0];
      const l = r.leaks[0];
      const p = r.possible[0];
      if (d) facts.push(...d.reasons.map((x) => x.text));
      else if (l) facts.push(...l.reasons.map((x) => x.text));
      else if (p) facts.push(`${p.company}${p.sector ? ` (${p.sector})` : ""}: ${p.description || ""}`, p.why || "");
      facts.push(`Advice on what to share: ${r.share.level}. ${r.share.why}`);
      items.push({
        id: String(idx),
        investor: r.name,
        verdict: r.headline,
        facts: facts.filter(Boolean),
        draft: r.ask.question,
      });
    });
    if (!items.length) return;
    step("Gemini", `Writing ${items.length} meeting question${items.length === 1 ? "" : "s"} from the findings`, "run");
    const out = await writeQuestions(founder, items, signal);
    if (!out?.size) {
      step("Gemini", "Kept the template questions (Gemini did not answer)", "warn");
      return;
    }
    out.forEach((q, id) => askOverride.set(Number(id), q));
    step("Gemini", `Rewrote ${out.size} question${out.size === 1 ? "" : "s"} to name the specific deal`, "ok");
    emitAll();
  }

  // ----- data coverage (entity introspection) -----

  /**
   * What Cala holds for each investor's record. A "no conflict" verdict is
   * only as good as the data behind it, so the founder sees which kinds of
   * data were there to check and which were missing.
   */
  async function runCoverage(): Promise<void> {
    await Promise.allSettled(
      investors.map(async (I, idx) => {
        if (!I) return;
        const id = I.entities[0]?.id;
        if (!id) return;
        const intro = await cala.introspect(id, 3);
        const out = new Set(intro.relationships.outgoing);
        const inc = new Set(intro.relationships.incoming);
        const checks: [string, boolean][] = I.isPerson
          ? [
              ["investments", out.has("INVESTED_IN")],
              ["funding rounds", out.has("PARTICIPATES_IN_FUNDING_ROUND")],
              ["company roles", ["FOUNDED", "IS_CEO_OF", "IS_BOARD_MEMBER_OF", "WORKS_AT"].some((r) => out.has(r))],
            ]
          : [
              ["funding rounds", out.has("PARTICIPATES_IN_FUNDING_ROUND")],
              ["portfolio", out.has("INVESTED_IN")],
              ["team", inc.has("WORKS_AT") || inc.has("FOUNDED")],
            ];
        coverageState.set(idx, {
          has: checks.filter(([, ok]) => ok).map(([label]) => label),
          missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
        });
      }),
    );
    emitAll();
  }

  // ----- Slush 2026 -----

  async function runSlush(): Promise<void> {
    const scope = "Slush 2026";
    try {
      const { report, perInvestor } = await checkSlush(cala, {
        founder,
        named: competitors
          .filter((k): k is CompetitorProfile => Boolean(k))
          .map((K) => ({ input: K.input, name: K.name, ids: K.ids })),
        investors: investors.flatMap((I, idx): SlushInvestorInput[] =>
          I
            ? [{ idx, input: I.input, name: I.name, keys: I.keys, ids: I.ids, portfolio: I.portfolio.map((c) => ({ id: c.id, name: c.name })) }]
            : [],
        ),
        step: (text, state) => step(scope, text, state),
        score: (text) => overlapScore(founderTerms, "", text),
        fresh,
        signal,
      });
      slushReport = report;
      slushByInvestor = perInvestor;
      emit({ type: "slush", data: report });
      emitAll();
    } catch (err) {
      if (err instanceof CalaError && err.status === 499) return;
      step(scope, `Slush check failed: ${(err as Error).message}`, "warn");
    }
  }

  // ----- clean investor finder -----

  const FINDER_MAX_NEIGHBOURS = 10;
  const FINDER_MAX_CANDIDATES = 10;
  const FINDER_SHOW = 6;
  /** Same query the Slush check uses for attendees, so those reads come from the cache. */
  const NEIGHBOUR_QUERY = {
    properties: ["name", "description", "website", "funding_stage"],
    relationships: { incoming: { INVESTED_IN: { limit: 100, offset: 0 } } },
  };

  /**
   * Investors who back companies like the founder's and have no tie to the
   * founder's competitors: no stake, nobody on a competitor's board, no
   * co-investor path of moderate strength or more. Candidates come from the
   * graph (investors in lookalike companies and similar Slush attendees) and
   * from Cala's query endpoint; every one is then checked against the graph.
   */
  async function findCleanInvestors(queryJob: Promise<{ results: Record<string, unknown>[]; entities: CalaEntity[] }> | null): Promise<void> {
    const scope = "Investor finder";
    const known = competitors.filter((k): k is CompetitorProfile => Boolean(k));
    if (input.description.trim().length < 15) {
      emit({ type: "finder", data: { candidates: [], considered: 0, excluded: [], note: "Add a sentence on what you build to find investors." } });
      return;
    }
    step(scope, "Looking for investors who know your market and have no tie to your competitors", "run");

    // 1. Companies near the founder's, from the graph. Only "adjacent" ones
    // (same buyers, not rivals): a company judged a direct competitor is a
    // competitor even if the founder did not list it, so its backers are not clean.
    const neighbours = new Map<string, { id: string; name: string; via: "lookalike" | "slush" }>();
    const unlistedRivals = new Map<string, string>(); // id or name key -> name
    investors.forEach((I, idx) => {
      if (!I) return;
      for (const p of scanState.get(idx) || []) {
        const rec = I.portfolio.find((c) => sameCompany(c.name, p.company));
        if (p.verdict === "direct") {
          unlistedRivals.set(rec?.id || coreKey(p.company), rec?.name || p.company);
          continue;
        }
        if (!rec || neighbours.has(rec.id)) continue;
        neighbours.set(rec.id, { id: rec.id, name: rec.name, via: "lookalike" });
      }
    });
    for (const c of slushReport?.competitors || []) {
      if (c.verdict === "direct") {
        unlistedRivals.set(c.id, c.name);
        continue;
      }
      if (!neighbours.has(c.id)) neighbours.set(c.id, { id: c.id, name: c.name, via: "slush" });
    }
    for (const id of unlistedRivals.keys()) neighbours.delete(id);
    const pickedNeighbours = [...neighbours.values()].slice(0, FINDER_MAX_NEIGHBOURS);

    // 2. Who backs them.
    interface Cand {
      id: string;
      name: string;
      type: string;
      similar: Map<string, FinderCandidate["similar"][number]["via"]>;
    }
    const cands = new Map<string, Cand>();
    const addCand = (id: string, name: string, type: string, company: string, via: FinderCandidate["similar"][number]["via"]) => {
      if (/person/i.test(type)) return; // the finder suggests funds; angels are too thinly recorded to rank
      // "Index Ventures Limited" and "INDEX VENTURES (UK) LLP" are one investor.
      const existing = [...cands.values()].find((c) => c.id === id || sameCompany(c.name, name));
      const c = existing || { id, name, type, similar: new Map() };
      if (!c.similar.has(company)) c.similar.set(company, via);
      if (!existing) cands.set(id, c);
    };
    const reads = await Promise.allSettled(pickedNeighbours.map((n) => cala.retrieve(n.id, NEIGHBOUR_QUERY, 4)));
    reads.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      for (const e of rel(r.value, "incoming", "INVESTED_IN")) addCand(e.id, e.name, e.entity_type, pickedNeighbours[i].name, pickedNeighbours[i].via);
    });

    // 3. Who Cala says invests in this space (names tied to graph records only).
    if (queryJob) {
      try {
        const { results, entities } = await queryJob;
        for (const row of results) {
          const name = Object.entries(row).find(([k, v]) => /^(investor|investor_name|firm|fund|name)$/i.test(k) && typeof v === "string")?.[1] as string | undefined;
          const company = Object.entries(row).find(([k, v]) => /(portfolio|company|startup)/i.test(k) && typeof v === "string")?.[1] as string | undefined;
          if (!name) continue;
          const ent = entities.find((e) => exactKey(e.name) === exactKey(name) && /company|organization/i.test(e.entity_type));
          if (ent) addCand(ent.id, ent.name, ent.entity_type, company || "your space", "query");
        }
      } catch {
        // the graph-based candidates still stand
      }
    }

    // 4. Drop the obvious: already on the list, already backing a competitor.
    const excluded: FinderReport["excluded"] = [];
    const competitorBackers = new Map<string, string>();
    for (const K of known) {
      K.investors.forEach((inv) => competitorBackers.set(exactKey(inv.name), K.name));
      K.rounds.forEach((r) => r.participants.forEach((p) => p.role !== "ISSUER" && competitorBackers.set(exactKey(p.name), K.name)));
    }
    const pool = [...cands.values()].filter((c) => {
      const key = exactKey(c.name);
      if (investors.some((I) => I && (I.ids.has(c.id) || I.keys.has(key) || sameCompany(I.name, c.name) || sameCompany(I.input, c.name)))) return false;
      if (known.some((K) => K.ids.has(c.id) || sameCompany(K.name, c.name))) return false;
      const backs = competitorBackers.get(key) || [...competitorBackers.entries()].find(([k]) => k === coreKey(c.name))?.[1];
      if (backs) {
        excluded.push({ name: c.name, reason: `Backs ${backs}` });
        return false;
      }
      return true;
    });
    const considered = cands.size;
    pool.sort((a, b) => b.similar.size - a.similar.size);
    const shortlist = pool.slice(0, FINDER_MAX_CANDIDATES);
    step(scope, `${considered} investors back companies near yours; checking the top ${shortlist.length} against your competitors`, "run");

    // 5. Open each candidate and run the same checks as for the founder's own list.
    const opened = await Promise.allSettled(shortlist.map((c) => cala.retrieve(c.id, INVESTOR_QUERY, 4)));
    const candidates: FinderCandidate[] = [];
    const cutoff = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
    opened.forEach((o, i) => {
      if (o.status !== "fulfilled") return;
      const c = shortlist[i];
      const P = buildProfile(c.name, [o.value], 1);
      // Only investors with a real record of investing are worth a meeting.
      if (P.rounds.size + P.portfolio.length < 5) return;
      const direct = known.map((K) => findDirect(P, K)).find(Boolean);
      if (direct) {
        excluded.push({ name: P.name, reason: `Backs ${direct.competitor}` });
        return;
      }
      const rival = P.portfolio.find((c) => unlistedRivals.has(c.id) || unlistedRivals.has(coreKey(c.name)));
      if (rival) {
        excluded.push({ name: P.name, reason: `Backs ${rival.name}, which Gemini judged a direct competitor` });
        return;
      }
      const tie = known.flatMap((K) => findPeople(P, K))[0];
      if (tie) {
        excluded.push({ name: P.name, reason: tie.text });
        return;
      }
      let path: string | undefined;
      for (const v of viaIndex) {
        if (P.ids.has(v.id) || exactKey(v.name) === P.key) continue;
        const shared = [...P.rounds.values()].filter((r) => v.rounds.has(r.id) && !v.competitorRounds.has(r.id));
        if (!shared.length) continue;
        const last = shared.map((r) => r.date).filter(Boolean).sort().pop();
        const st = leakStrength(shared.length, last, v.led, v.date);
        if (st.label !== "weak") {
          path = `Co-invests with ${v.name} (${shared.length} round${shared.length === 1 ? "" : "s"}, ${st.score}/100), which backs ${v.competitor}`;
          break;
        }
      }
      if (path) {
        excluded.push({ name: P.name, reason: path });
        return;
      }
      const rounds = [...P.rounds.values()];
      const recent = rounds.filter((r) => r.date && r.date >= cutoff);
      const leads12m = recent.filter((r) => r.isLead).length;
      const last = rounds.filter((r) => r.date).sort((a, b) => b.date!.localeCompare(a.date!))[0];
      const similar = [...c.similar.entries()].map(([name, via]) => ({ name, via }));
      const score =
        similar.length * 10 + leads12m * 4 + recent.length + (last && last.date! >= cutoff ? 5 : 0) - (P.kind === "corporate" ? 15 : 0);
      const named = similar.filter((x) => x.name !== "your space").map((x) => x.name);
      candidates.push({
        id: c.id,
        name: P.name,
        kind: P.kind,
        similar,
        roundsRecorded: rounds.length,
        rounds12m: recent.length,
        leads12m,
        lastRound: last ? { label: last.label, date: last.date! } : undefined,
        checks: [
          `No stake in ${known.map((K) => K.name).join(", ") || "your competitors"}`,
          "Nobody on its team is a founder, executive or board member of a competitor",
          viaIndex.length ? `No co-investor path to a competitor (${viaIndex.length} backers checked)` : "No competitor backers on record to trace",
        ],
        why:
          (named.length
            ? `Knows your market: backs ${named.slice(0, 3).join(", ")}, ${named.length === 1 ? "a company" : "companies"} near yours but not on your competitor list. `
            : "Cala lists it as an investor in your space. ") +
          (recent.length
            ? `Took part in ${recent.length} round${recent.length === 1 ? "" : "s"} in the past year${leads12m ? `, leading ${leads12m}` : ""}.`
            : `${rounds.length} round${rounds.length === 1 ? "" : "s"} and ${P.portfolio.length} portfolio companies on record.`) +
          (P.kind === "corporate" ? " A corporate investor: expect strategic interest, not just financial." : ""),
        score,
        source: bestSource(rounds[0]?.sources || []),
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    const report: FinderReport = {
      candidates: candidates.slice(0, FINDER_SHOW),
      considered,
      excluded: excluded.slice(0, 12),
      note: considered
        ? undefined
        : "No investors found behind companies near yours yet. Adjacent companies from the portfolio scan and Slush attendees feed this list.",
    };
    finderState = report;
    step(
      scope,
      `${report.candidates.length} clean investor${report.candidates.length === 1 ? "" : "s"} found; ${excluded.length} dropped for ties to your competitors`,
      report.candidates.length ? "ok" : "warn",
    );
    emit({ type: "finder", data: report });
  }

  // ----- orchestration -----

  try {
    const aiOn = geminiEnabled();
    emit({ type: "ai", enabled: aiOn, model: aiOn ? await geminiModel() : undefined });
    emitAll();

    const [investorSettled, competitorSettled] = await Promise.all([
      Promise.allSettled(investorInputs.map((n) => resolveInvestor(n))),
      Promise.allSettled(competitorInputs.map((n) => resolveCompetitor(n))),
    ]);
    investorSettled.forEach((s, i) => {
      if (s.status === "fulfilled" && s.value) investors[i] = s.value;
      else {
        investorFailed[i] = true;
        if (s.status === "rejected" && !(s.reason instanceof CalaError && s.reason.status === 499)) {
          step(investorInputs[i], `Lookup failed: ${(s.reason as Error).message}`, "warn");
        }
      }
      done[i].direct = true;
    });
    competitorSettled.forEach((s, i) => {
      if (s.status === "fulfilled" && s.value) competitors[i] = s.value;
      else if (s.status === "rejected") {
        step(competitorInputs[i], `Lookup failed: ${(s.reason as Error).message}`, "warn");
      }
      emit({ type: "competitor", data: competitorSummary(i) });
    });
    emitAll();
    if (refused) {
      emit({ type: "error", message: refusedMessage });
      return;
    }

    // Start the slow portfolio scans now so they run alongside the leak-path work.
    const scans = investors.map((I, idx) => (I ? scanPortfolio(idx) : Promise.resolve()));
    const slushJob = runSlush();
    // The finder's query is slow, so it starts now and is read when the finder runs.
    const finderQuery =
      input.description.trim().length >= 15
        ? cala.queryWithEntities(
            `Venture capital investors that invested in seed or Series A startups building: ${input.description.slice(0, 300)}. Return investor and portfolio_company.`,
            6,
          )
        : null;
    finderQuery?.catch(() => undefined);
    const coverageJob = runCoverage();
    const eventsJob = Promise.allSettled(
      competitors.filter((k): k is CompetitorProfile => Boolean(k)).map((K) => radarEventsFor(K)),
    );

    const enrichBudget = { left: MAX_ROUND_ENRICH };
    const known = competitors.filter((k): k is CompetitorProfile => Boolean(k));
    await Promise.allSettled(known.map((K) => leakPathsFor(K, enrichBudget)));
    done.forEach((d) => (d.leaks = true));
    emitAll();

    await Promise.allSettled([...scans, slushJob, coverageJob, eventsJob]);
    done.forEach((d) => (d.scan = true));
    emitAll();

    await Promise.allSettled([aiOn ? sharpenQuestions() : Promise.resolve(), findCleanInvestors(finderQuery)]);
    if (refused) {
      emit({ type: "error", message: refusedMessage });
      return;
    }

    emit({ type: "done", ms: Date.now() - started });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  } finally {
    cala.dispose();
  }
}
