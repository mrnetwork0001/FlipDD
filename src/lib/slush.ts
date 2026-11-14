// Slush 2026 check. Cala links every attending company to the Slush 2026
// event entity (incoming PARTICIPATES_IN_EVENT, role ATTENDEE). From that list
// FlipDD finds:
//   - which of the founder's named competitors are attending,
//   - which attendees build something like the founder's startup (Cala's
//     query endpoint proposes them; only names on the attendee list are kept),
//   - which investors on the meeting list back those attendees, and which of
//     their portfolio companies are attending.
// Every company shown is matched to an attendee record, never taken on trust.

import type { Cala, RawEdge, RawEntity } from "./cala";
import { judgeCompetition } from "./gemini";
import { coreKey, exactKey } from "./names";
import type { InvestorSlush, SlushCompany, SlushCompetitor, SlushReport, SourceRef, StepState } from "./types";

const EVENT_NAME = "Slush 2026";
/** Id Cala gave for Slush 2026; used only if the name search does not find it. */
const EVENT_ID_FALLBACK = "bc844d56-6ab4-452b-96bf-2661e86e592b";
const PAGE = 1000;
const MAX_PAGES = 8;
const MAX_COMPETITORS = 10;
const MAX_CANDIDATES = 16;
const MIN_KEY = 4;
const MEMO_MS = 10 * 60 * 1000;

interface Attendee extends SlushCompany {
  source?: SourceRef;
}

export interface SlushEvent {
  id: string;
  name: string;
  description?: string;
  attendees: Attendee[];
  byId: Map<string, Attendee>;
  byKey: Map<string, Attendee>;
}

const memo = globalThis as unknown as { __slushEvent?: { at: number; event: SlushEvent } };

function sourceOf(edge: RawEdge): SourceRef | undefined {
  const s = edge.properties?.sources?.find((x) => typeof x?.document === "string" && /^https?:\/\//.test(x.document as string));
  if (!s) return undefined;
  const url = s.document as string;
  let label = "slush.org";
  try {
    label = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // keep the default label
  }
  return { label, url, date: typeof s.date === "string" ? s.date.slice(0, 10) : undefined };
}

/** Reads the full attendee list (about 3,000 companies, three requests). */
export async function loadSlushEvent(cala: Cala, fresh = false): Promise<SlushEvent> {
  const hit = memo.__slushEvent;
  if (!fresh && hit && Date.now() - hit.at < MEMO_MS) return hit.event;

  const found = await cala.search(EVENT_NAME, 2, 5).catch(() => []);
  const match = found.find((e) => e.entity_type === "Event" && exactKey(e.name) === exactKey(EVENT_NAME));
  const id = match?.id || EVENT_ID_FALLBACK;

  const attendees: Attendee[] = [];
  let name = match?.name || EVENT_NAME;
  let description = match?.description || undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const e: RawEntity = await cala.retrieve(
      id,
      {
        properties: ["name", "description"],
        relationships: { incoming: { PARTICIPATES_IN_EVENT: { limit: PAGE, offset: page * PAGE } } },
      },
      2,
    );
    name = e.name || name;
    description = description || e.description || undefined;
    const edges = e.relationships?.incoming?.PARTICIPATES_IN_EVENT || [];
    for (const edge of edges) {
      if (edge.entity_type && !/company|organization/i.test(edge.entity_type)) continue;
      attendees.push({ id: edge.id, name: edge.name, source: sourceOf(edge) });
    }
    if (edges.length < PAGE) break;
  }

  const byId = new Map<string, Attendee>();
  const byKey = new Map<string, Attendee>();
  for (const a of attendees) {
    byId.set(a.id, a);
    const k = coreKey(a.name);
    if (k.length >= MIN_KEY && !byKey.has(k)) byKey.set(k, a);
  }
  const event = { id, name, description, attendees, byId, byKey };
  memo.__slushEvent = { at: Date.now(), event };
  return event;
}

/** The attendee record for a company, by Cala id or by name without legal suffixes. */
export function attendeeFor(event: SlushEvent, ids: Iterable<string>, ...names: string[]): Attendee | undefined {
  for (const id of ids) {
    const a = event.byId.get(id);
    if (a) return a;
  }
  for (const n of names) {
    const k = coreKey(n || "");
    if (k.length >= MIN_KEY) {
      const a = event.byKey.get(k);
      if (a) return a;
    }
  }
  return undefined;
}

export interface SlushInvestorInput {
  idx: number;
  input: string;
  name: string;
  keys: Set<string>;
  ids: Set<string>;
  portfolio: { id: string; name: string }[];
}

export interface SlushArgs {
  founder: { name: string; description: string };
  named: { input: string; name: string; ids: Set<string> }[];
  investors: SlushInvestorInput[];
  step: (text: string, state?: StepState) => void;
  /** Shared-words score of a description against the founder's, used when Gemini is off. */
  score: (text: string) => { score: number; shared: string[] };
  fresh?: boolean;
  signal?: AbortSignal;
}

function pickField(row: Record<string, unknown>, test: RegExp, skip?: string): string {
  for (const [k, v] of Object.entries(row)) {
    if (k === skip || !test.test(k)) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function checkSlush(
  cala: Cala,
  args: SlushArgs,
): Promise<{ report: SlushReport; perInvestor: Map<number, InvestorSlush> }> {
  const { founder, named, investors, step, signal } = args;
  step(`Reading the ${EVENT_NAME} attendee list from Cala`, "run");
  const event = await loadSlushEvent(cala, args.fresh);
  step(`${event.name}: ${event.attendees.length.toLocaleString("en-GB")} companies attending`, "ok");

  // Named competitors that are attending.
  const namedAttending: SlushCompany[] = [];
  for (const k of named) {
    const a = attendeeFor(event, k.ids, k.name, k.input);
    if (a && !namedAttending.some((x) => x.id === a.id)) namedAttending.push({ id: a.id, name: a.name });
  }
  if (namedAttending.length) {
    step(`Attending: ${namedAttending.map((a) => a.name).join(", ")} from your competitor list`, "warn");
  }

  // Portfolio companies of each investor that are attending.
  const perInvestor = new Map<number, InvestorSlush>();
  for (const I of investors) {
    const seen = new Map<string, SlushCompany>();
    for (const c of I.portfolio) {
      const a = attendeeFor(event, [c.id], c.name);
      if (a) seen.set(a.id, { id: a.id, name: a.name });
    }
    perInvestor.set(I.idx, { portfolio: [...seen.values()], competitors: [] });
  }
  const withPortfolio = investors.filter((I) => (perInvestor.get(I.idx)?.portfolio.length || 0) > 0);
  if (withPortfolio.length) {
    step(
      `Portfolio companies at ${event.name}: ` +
        withPortfolio.map((I) => `${I.name} ${perInvestor.get(I.idx)!.portfolio.length}`).join(", "),
      "ok",
    );
  }

  // Attendees that build something like the founder's startup.
  let note: string | undefined;
  let judgedBy: SlushReport["judgedBy"] = "cala";
  const competitors: SlushCompetitor[] = [];
  const description = founder.description.trim();
  if (description.length < 15) {
    note = "Add a sentence on what you build to find competitors among the attendees.";
  } else {
    step(`Asking Cala which ${event.name} attendees build something like yours (30 to 60 seconds)`, "run");
    try {
      const { results, entities } = await cala.queryWithEntities(
        `Companies attending ${event.name} that build products similar to this startup: ${description.slice(0, 400)}. ` +
          "Return company and focus.",
        4,
      );
      const founderKey = coreKey(founder.name || "");
      const namedIds = new Set(namedAttending.map((a) => a.id));
      const candidates = new Map<string, { a: Attendee; what: string }>();
      let unverified = 0;
      let droppedCount = 0;
      for (const row of results) {
        const company = pickField(row, /^(company|name|company_name|startup|attendee)$/i);
        if (!company) continue;
        const what = pickField(row, /(focus|does|desc|what|product|summary|about)/i);
        const ent = entities.find((e) => coreKey(e.name) === coreKey(company));
        const a = attendeeFor(event, ent ? [ent.id] : [], company);
        if (!a) {
          unverified++;
          continue;
        }
        if ((founderKey && coreKey(a.name) === founderKey) || namedIds.has(a.id) || candidates.has(a.id)) continue;
        candidates.set(a.id, { a, what });
      }

      // Read each candidate's own record: its description decides whether it
      // competes, and its investors decide who on the list backs it.
      const pool = [...candidates.values()].slice(0, MAX_CANDIDATES);
      const records = await Promise.allSettled(
        pool.map((c) =>
          cala.retrieve(
            c.a.id,
            {
              properties: ["name", "description", "website", "funding_stage"],
              relationships: { incoming: { INVESTED_IN: { limit: 100, offset: 0 } } },
            },
            3,
          ),
        ),
      );
      const rows = pool.map((c, i) => {
        const rec = records[i].status === "fulfilled" ? (records[i] as PromiseFulfilledResult<RawEntity>).value : undefined;
        const prop = (k: string) => {
          const v = rec?.properties?.[k]?.value;
          return typeof v === "string" && v.trim() ? v.trim() : undefined;
        };
        return {
          ...c,
          rec,
          recorded: rec?.description || prop("description"),
          website: prop("website"),
          stage: prop("funding_stage")?.replace(/_/g, " ").toLowerCase(),
        };
      });

      // Gemini judges from the recorded descriptions when configured; otherwise
      // a shared-words test on the recorded description. Cala's one-line
      // focus from the query is only used when there is no record to read.
      const judged = rows.length
        ? await judgeCompetition(
            founder,
            rows.map((r) => ({ name: r.a.name, description: r.recorded || r.what })),
            signal,
          )
        : undefined;
      if (judged) judgedBy = "gemini";
      let dropped = 0;
      const kept = rows
        .map((r) => {
          if (judged) {
            const j = judged.get(r.a.name.trim().toLowerCase());
            if (!j || j.verdict === "no") return null;
            return { r, verdict: j.verdict as "direct" | "adjacent", why: j.why, score: j.verdict === "direct" ? 2 : 1 };
          }
          const text = r.recorded || "";
          const { score, shared } = args.score(text);
          if (!text || score < 1.8 || !shared.length) return null;
          return { r, verdict: undefined, why: `Shares ${shared.slice(0, 3).join(", ")} with your description.`, score };
        })
        .filter((x): x is NonNullable<typeof x> => {
          if (!x) dropped++;
          return Boolean(x);
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_COMPETITORS);

      for (const { r, verdict, why } of kept) {
        const investorEdges = r.rec?.relationships?.incoming?.INVESTED_IN || [];
        const edgeIds = new Set(investorEdges.map((e) => e.id));
        const edgeKeys = new Set(investorEdges.map((e) => exactKey(e.name)));
        const backedBy = investors
          .filter(
            (I) =>
              [...I.ids].some((id) => edgeIds.has(id)) ||
              [...I.keys].some((k) => edgeKeys.has(k)) ||
              I.portfolio.some((p) => p.id === r.a.id),
          )
          .map((I) => I.input);
        competitors.push({
          id: r.a.id,
          name: r.a.name,
          what: r.recorded || r.what || undefined,
          website: r.website,
          stage: r.stage,
          verdict,
          why,
          backedBy,
          investorsRecorded: investorEdges.length,
          source: r.a.source,
        });
        backedBy.forEach((input) => {
          const I = investors.find((x) => x.input === input);
          if (I) perInvestor.get(I.idx)?.competitors.push(r.a.name);
        });
      }
      droppedCount = dropped;
      competitors.sort(
        (a, b) =>
          b.backedBy.length - a.backedBy.length ||
          (a.verdict === "direct" ? 0 : 1) - (b.verdict === "direct" ? 0 : 1) ||
          a.name.localeCompare(b.name),
      );
      const backed = competitors.filter((c) => c.backedBy.length);
      const checks =
        `Cala suggested ${results.length}; ${unverified} not on the attendee list, ` +
        `${droppedCount} ruled out on ${judgedBy === "gemini" ? "Gemini's reading of" : "shared words in"} their recorded description`;
      step(
        competitors.length
          ? `${competitors.length} attendee${competitors.length === 1 ? " builds" : "s build"} something like yours` +
              (backed.length ? `; ${backed.length} backed by investors on your list` : "; none backed by your list") +
              ` (${checks})`
          : `No attendee matched your description (${checks})`,
        backed.length ? "warn" : "ok",
      );
    } catch (err) {
      note = `The competitor search did not finish: ${(err as Error).message}`;
      step(note, "warn");
    }
  }

  return {
    report: {
      event: { id: event.id, name: event.name, description: event.description, attendees: event.attendees.length },
      namedAttending,
      competitors,
      judgedBy,
      note,
      checkedAt: new Date().toISOString(),
    },
    perInvestor,
  };
}
