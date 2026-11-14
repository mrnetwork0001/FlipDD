// Types shared by the server engine and the browser UI. No Node imports here.

export interface SourceRef {
  /** Short label, normally the hostname. */
  label: string;
  /** Title of the document when Cala provides one. */
  title?: string;
  url?: string;
  date?: string;
  rank?: string;
}

export type Tone = "bad" | "warn" | "good" | "neutral";

export interface Reason {
  text: string;
  tone: Tone;
  source?: SourceRef;
}

export interface RoundRef {
  id: string;
  label: string;
  date?: string;
  amount?: number;
  currency?: string;
  /** Post-money valuation, when Cala has one. */
  valuation?: number;
  valuationCurrency?: string;
  issuer?: string;
  sources: SourceRef[];
}

export type CompanyStatus = "operating" | "closed" | "acquired" | "unknown";

export interface DirectConflict {
  competitor: string;
  competitorStatus: CompanyStatus;
  /** Name of the portfolio record when it differs from the competitor's name. */
  matchedAs?: string;
  round?: RoundRef;
  isLead: boolean;
  date?: string;
  monthsAgo?: number;
  level: "direct_high" | "direct_moderate";
  /** Joined a late-stage round (Series C or later, growth, or $100M+) without leading it. */
  lateStage?: boolean;
  /** The stake is a loan (lender role or a debt round), not equity. */
  debt?: boolean;
  reasons: Reason[];
  sources: SourceRef[];
}

export interface LeakPath {
  competitor: string;
  via: { id: string; name: string };
  viaLed: boolean;
  competitorRound?: RoundRef;
  sharedRoundCount: number;
  /** A few of the shared rounds, most recent first. */
  sharedRounds: RoundRef[];
  lastSharedDate?: string;
  /** 0 to 100, from how often and how recently they co-invest, and how close the via is to the competitor. */
  strength: number;
  strengthLabel: "strong" | "moderate" | "weak";
  reasons: Reason[];
  sources: SourceRef[];
}

export interface PossibleOverlap {
  company: string;
  sector?: string;
  description?: string;
  sharedTerms: string[];
  /** "graph": matched to a sourced portfolio record. "query": from Cala's query endpoint only. */
  origin: "graph" | "query";
  /** Who judged the overlap: Gemini reading both descriptions, or word overlap. */
  judgedBy: "gemini" | "terms";
  verdict?: "direct" | "adjacent";
  why?: string;
  sources: SourceRef[];
}

export type Level =
  | "direct_high"
  | "direct_moderate"
  | "indirect"
  | "possible"
  | "thin"
  | "unresolved"
  | "clear";

export type ShareLevel = "Teaser only" | "Deck without customer names" | "Full data room";

export interface Activity {
  roundsRecorded: number;
  portfolioRecorded: number;
  rounds12m: number;
  leads12m: number;
  leadsAll: number;
  lastRound?: { label: string; date: string; source?: SourceRef };
  truncated: boolean;
}

/** What kind of investor a record is, from how it shows up in rounds. */
export type InvestorKind = "fund" | "angel" | "lender" | "grant" | "corporate";

/** A person who links an investor to a competitor. */
export interface PersonTie {
  person: string;
  personId: string;
  competitor: string;
  /** The person's role at the competitor, e.g. "board member", "founder". */
  roleAtCompetitor: string;
  /** "self": the investor on the list is this person (an angel). "team": the person works at the fund. */
  side: "self" | "team";
  /** The person's role at the fund, when side is "team". */
  roleAtInvestor?: string;
  text: string;
  source?: SourceRef;
}

/** Which kinds of data Cala holds for the investor's record (from entity introspection). */
export interface Coverage {
  has: string[];
  missing: string[];
}

export interface InvestorResult {
  input: string;
  resolved: boolean;
  name: string;
  description?: string;
  entities: { id: string; name: string; type: string }[];
  candidates: number;
  activity: Activity;
  level: Level;
  headline: string;
  direct: DirectConflict[];
  leaks: LeakPath[];
  possible: PossibleOverlap[];
  share: { level: ShareLevel; why: string };
  ask: { question: string; source?: SourceRef; draftedBy?: "gemini" };
  /** Which checks have finished for this investor. */
  done: { direct: boolean; leaks: boolean; scan: boolean };
  scanNote?: string;
  /** What ties this investor to Slush 2026 attendees, once the Slush check has run. */
  slush?: InvestorSlush;
  kind?: InvestorKind;
  /** People who tie this investor to a competitor: an angel who founded one, a partner on its board. */
  people?: PersonTie[];
  coverage?: Coverage;
}

// ---------- the round as a whole ----------

/** How close one meeting is to a competitor. */
export type Exposure = "direct" | "one_step" | "lookalike" | "unknown" | "clear";

export interface RoundRiskInvestor {
  input: string;
  name: string;
  level: Level;
  exposure: Exposure;
  /** Competitors this investor reaches directly or through one co-investor. */
  reaches: string[];
  /** 0 to 1: how much this meeting adds to the round's exposure. */
  weight: number;
}

export interface RoundRisk {
  total: number;
  /** Investors whose verdict is in (the rest are still being checked). */
  settled: number;
  counts: Record<Exposure, number>;
  /** 0 to 100, the average exposure of the meetings checked so far. */
  score: number;
  grade: "low" | "medium" | "high";
  headline: string;
  investors: RoundRiskInvestor[];
  /** Per competitor: who reaches it directly, and who through which co-investor. */
  reach: {
    competitor: string;
    direct: string[];
    oneStep: { investor: string; via: string; strength: number }[];
  }[];
  /** Co-investors that connect two or more of your meetings to a competitor. */
  hubs: { via: string; investors: string[]; competitors: string[]; strongest: number }[];
  /** Funds with no stake or co-investor path that led rounds in the past year: the likeliest leads. */
  leadCandidates: { input: string; name: string; leads12m: number; rounds12m: number }[];
  /** Suggested meeting order, safest first. */
  order: { title: string; share: string; why: string; investors: string[] }[];
  slush?: { event: string; backingRivals: string[]; portfolioAttending: number };
}

// ---------- Slush 2026 ----------

export interface SlushCompany {
  id: string;
  name: string;
}

/** A Slush attendee that competes with the founder, verified against the attendee list. */
export interface SlushCompetitor extends SlushCompany {
  /** Cala's description of the company, or its one-line focus from the query. */
  what?: string;
  website?: string;
  stage?: string;
  verdict?: "direct" | "adjacent";
  why?: string;
  /** Investors on the founder's list that are on record as backing it (their input names). */
  backedBy: string[];
  /** Investors Cala has on record for it. */
  investorsRecorded: number;
  source?: SourceRef;
}

export interface SlushReport {
  event: { id: string; name: string; description?: string; attendees: number };
  /** Named competitors (from the form) that are on the attendee list. */
  namedAttending: SlushCompany[];
  /** Attendees Cala lists as building something like the founder's startup. */
  competitors: SlushCompetitor[];
  judgedBy: "gemini" | "cala";
  /** Why the competitor search was skipped or failed, if it was. */
  note?: string;
  checkedAt: string;
}

export interface InvestorSlush {
  /** Portfolio companies of this investor that are attending. */
  portfolio: SlushCompany[];
  /** Slush competitors (from SlushReport.competitors) this investor backs. */
  competitors: string[];
}

export interface RadarRound extends RoundRef {
  leads: string[];
  participants: string[];
  /** Investors on the founder's list who took part. */
  onList: string[];
  /** False when FlipDD has the round's name and date but did not open it for participants. */
  opened: boolean;
}

export interface RadarEvent {
  id: string;
  /** "acquired": the competitor bought someone. "was_acquired": someone bought the competitor. */
  kind: "acquired" | "was_acquired" | "other";
  label: string;
  date?: string;
  counterparty?: string;
  source?: SourceRef;
}

/** Who just raised, how much, from whom: one competitor's funding history and deals. */
export interface CompetitorRadar {
  totalFunding?: number;
  totalFundingCurrency?: string;
  stage?: string;
  rounds: RadarRound[];
  events: RadarEvent[];
  people: { name: string; role: string }[];
}

export interface CompetitorSummary {
  input: string;
  resolved: boolean;
  name: string;
  description?: string;
  status: CompanyStatus;
  statusRaw?: string;
  industries: string[];
  roundsRecorded: number;
  investorsRecorded: number;
  entities: { id: string; name: string; type: string }[];
  radar?: CompetitorRadar;
}

// ---------- clean investor finder ----------

export interface FinderCandidate {
  id: string;
  name: string;
  kind: InvestorKind;
  /** Companies like the founder's that this investor backs. */
  similar: { name: string; via: "lookalike" | "slush" | "query" }[];
  roundsRecorded: number;
  rounds12m: number;
  leads12m: number;
  lastRound?: { label: string; date: string };
  /** The checks it passed, in plain words. */
  checks: string[];
  why: string;
  score: number;
  source?: SourceRef;
}

export interface FinderReport {
  candidates: FinderCandidate[];
  /** How many investors were considered before the conflict checks. */
  considered: number;
  /** Investors dropped because they are tied to a competitor, with the reason. */
  excluded: { name: string; reason: string }[];
  note?: string;
}

// ---------- cited investor profile (Cala Knowledge Search) ----------

export interface InvestorDossier {
  investor: string;
  markdown: string;
  sources: SourceRef[];
  fetchedAt: string;
}

export interface AnalyzeInput {
  startupName: string;
  description: string;
  competitors: string[];
  investors: string[];
  /** Cala entity IDs for competitors found by discovery, keyed by name. */
  competitorIds?: Record<string, string>;
  /** Ask Cala for everything again instead of using responses stored in the last day. */
  fresh?: boolean;
}

export interface DiscoveredCompetitor {
  /** Name to use as the competitor, e.g. "Bolt.new". */
  name: string;
  /** Name as Cala's answer wrote it, e.g. "Bolt.new (by StackBlitz)". */
  label: string;
  what?: string;
  country?: string;
  funding?: string;
  latestRound?: string;
  entityId?: string;
  entityType?: string;
  /** Gemini's judgement of how closely it competes, when Gemini is configured. */
  verdict?: "direct" | "adjacent";
  why?: string;
  /** Name of the event when the company is on the Slush 2026 attendee list. */
  atSlush?: string;
}

export type StepState = "run" | "ok" | "warn" | "wait";

export type AnalyzeEvent =
  | { type: "step"; scope: string; text: string; state: StepState }
  | { type: "competitor"; data: CompetitorSummary }
  | { type: "investor"; data: InvestorResult }
  | {
      type: "stats";
      calls: number;
      cached: number;
      /** When the oldest stored response used in this run came from Cala (epoch ms). */
      oldestCachedAt?: number;
      fresh: boolean;
    }
  | { type: "ai"; enabled: boolean; model?: string }
  | { type: "slush"; data: SlushReport }
  | { type: "finder"; data: FinderReport }
  | { type: "run"; id: string }
  | { type: "done"; ms: number }
  | { type: "error"; message: string };

export const LEVEL_RANK: Record<Level, number> = {
  direct_high: 6,
  direct_moderate: 5,
  indirect: 4,
  possible: 3,
  thin: 2,
  unresolved: 1,
  clear: 0,
};

export const LEVEL_LABEL: Record<Level, string> = {
  direct_high: "Backs your competitor",
  direct_moderate: "Smaller stake in a competitor",
  indirect: "One step away",
  possible: "Lookalike in portfolio",
  thin: "Too little data",
  unresolved: "Not found",
  clear: "No tie found",
};

// ---------- shareable briefs ----------

/** A finished run as the server saw it; briefs are cut from this, never from client data. */
export interface RunLogLine {
  /** Milliseconds after the run started. */
  t: number;
  scope: string;
  text: string;
  state: StepState;
}

export interface RunDoc {
  id: string;
  createdAt: string;
  startupName: string;
  description?: string;
  competitors: string[];
  /** The investor names as the founder typed them. */
  investorInputs?: string[];
  investors: InvestorResult[];
  competitorSummaries?: CompetitorSummary[];
  slush?: SlushReport;
  finder?: FinderReport;
  /** Every progress line the run emitted, as it happened. */
  log?: RunLogLine[];
  /** The round-wide summary, as computed when the run was saved. */
  round?: RoundRisk;
  stats?: { calls: number; cached: number; oldestCachedAt?: number; fresh: boolean };
  ms?: number;
  finished: boolean;
}

export interface BriefDoc {
  id: string;
  createdAt: string;
  startupName: string;
  competitors: string[];
  investor: InvestorResult;
  /** The Slush competitors this investor backs, copied from the run. */
  slushCompetitors?: SlushCompetitor[];
  slushEvent?: string;
}

// ---------- watchlist (Context.dev news) ----------

export interface NewsArticle {
  id: string;
  url: string;
  title: string;
  description?: string;
  publishedAt?: string;
  source: string;
  type?: string;
}

export type AlertKind = "listed_investor_in_competitor_news" | "competitor_raised" | "investor_news_mentions_competitor";

export interface WatchAlert {
  key: string;
  kind: AlertKind;
  investor?: string;
  competitor: string;
  article: NewsArticle;
  /** Plain-language line shown to the founder. */
  text: string;
  severity: "high" | "medium" | "low";
  isNew: boolean;
}

export interface WatchDoc {
  id: string;
  createdAt: string;
  startupName: string;
  investors: string[];
  competitors: string[];
  lastCheckedAt?: string;
  /** Alert keys already shown, so the next check can flag what is new. */
  seen: string[];
}

export interface WatchReport {
  watch: Omit<WatchDoc, "seen">;
  checkedAt: string;
  windowDays: number;
  alerts: WatchAlert[];
  articlesRead: number;
  errors: string[];
}
