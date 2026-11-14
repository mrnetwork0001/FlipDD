// The landing page's "real run": the latest finished run of the built-in
// example, read from the runs the server saved. Nothing on the landing page
// is typed in by hand; if no such run exists yet, the page says so.

import { isExampleRun } from "./example";
import { computeRoundRisk } from "./roundRisk";
import { listDocs, loadDoc } from "./store";
import { LEVEL_LABEL, LEVEL_RANK, type InvestorResult, type Level, type RunDoc, type SourceRef } from "./types";

/** Funds that sit on the Junction grand jury: never shown with a red or amber verdict. */
const NO_NEGATIVE = /lifeline|founders\s*house/i;

export type ShowTone = "red" | "amber" | "slate" | "green" | "muted";

export interface ShowRow {
  fund: string;
  level: Level;
  pill: string;
  tone: ShowTone;
  line: string;
  share: string;
  source?: SourceRef;
}

export interface ShowLine {
  kind: "cmd" | "arg" | "step" | "wait" | "warn" | "ok";
  text: string;
  /** Milliseconds after the run started, as recorded. */
  t: number;
}

export interface HeroFund {
  name: string;
  tone: "red" | "amber" | "slate" | "green";
  pill: string;
  line: string;
  share: string;
  edges: [string, string];
  log: [string, string, string, string];
}

export interface HeroData {
  /** In the hero's fixed order: direct, co-investor, lookalike, clear. */
  funds: [HeroFund, HeroFund, HeroFund, HeroFund];
  mid: { round: string; coinv: string; look: string };
  competitor: string;
  requests: number;
  caption: string;
}

export interface Showcase {
  run: RunDoc;
  date: string;
  rows: ShowRow[];
  terminal: ShowLine[];
  hero?: HeroData;
  requests: number;
  liveCalls: number;
  seconds: number;
  /** A direct finding for the "reasons" and "ask" cards. */
  top?: { fund: string; competitor: string; reasons: { text: string; tone: string }[]; source?: SourceRef; ask: string };
  traps: { direct?: string; leak?: string; look?: string };
  slush?: { event: string; attendees: number; namedAttending: string[]; portfolioAtSlush: number; rivals: number };
  round: { score: number; grade: string; headline: string; hub?: string };
}

const TONE: Record<Level, ShowTone> = {
  direct_high: "red",
  direct_moderate: "red",
  indirect: "amber",
  possible: "slate",
  thin: "muted",
  unresolved: "muted",
  clear: "green",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m) - 1]} ${y}`;
}
const monthYear = (iso?: string) => {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function sourceOf(r: InvestorResult): SourceRef | undefined {
  const pick = (list: SourceRef[] | undefined) => list?.find((s) => s.url && s.rank !== "AGGREGATOR") || list?.find((s) => s.url);
  return pick(r.direct[0]?.sources) || pick(r.leaks[0]?.sources) || (r.ask.source?.url ? r.ask.source : undefined);
}

/** Finished runs of the built-in example, newest first (the pinned run, if set, comes first). */
async function exampleRuns(limit = 40): Promise<RunDoc[]> {
  const out: RunDoc[] = [];
  const pinned = process.env.FLIPDD_SHOWCASE_RUN?.trim();
  if (pinned) {
    const run = await loadDoc<RunDoc>("runs", pinned);
    if (run?.finished) out.push(run);
  }
  for (const id of await listDocs("runs", 200)) {
    if (out.length >= limit) break;
    if (id === pinned) continue;
    const run = await loadDoc<RunDoc>("runs", id);
    if (run?.finished && run.log?.length && isExampleRun(run) && run.investors.length >= 4) out.push(run);
  }
  return out;
}

function terminalLines(run: RunDoc): ShowLine[] {
  const inv = run.investorInputs || run.investors.map((r) => r.input);
  const out: ShowLine[] = [
    {
      kind: "cmd",
      t: 0,
      text: `flipdd check --startup "${run.startupName}"${run.competitors.map((c) => ` --competitor "${c}"`).join("")}`,
    },
  ];
  // Investor names, wrapped like a shell argument list.
  let line = "";
  for (const n of inv) {
    const next = line ? `${line}, ${n}` : n;
    if (next.length > 52) {
      out.push({ kind: "arg", t: 0, text: `  ${line},` });
      line = n;
    } else line = next;
  }
  if (line) out.push({ kind: "arg", t: 0, text: `  ${line}` });

  // The recorded steps that carry a finding or a milestone, in order.
  const log = run.log || [];
  const keep = log.filter(
    (l) =>
      l.state === "warn" ||
      l.state === "wait" ||
      (l.state === "ok" && (/^(Merged|Found|Picked)/.test(l.text) || l.scope === "Slush 2026" || l.scope === "Gemini")),
  );
  const seenText = new Set<string>();
  for (const l of keep) {
    const prefix = l.scope === "Cala" || l.text.startsWith(l.scope) ? "" : `${l.scope}: `;
    const text = clip(`${prefix}${l.text}`, 120);
    if (seenText.has(text)) continue;
    seenText.add(text);
    out.push({ kind: l.state === "warn" ? "warn" : l.state === "wait" ? "wait" : "step", t: l.t, text });
  }
  const s = run.stats;
  out.push({
    kind: "ok",
    t: run.ms || (log.length ? log[log.length - 1].t : 0),
    text: `Checked ${run.investors.length} investors · ${s ? s.calls + s.cached : 0} Cala requests (${s?.calls ?? 0} live) · ${((run.ms || 0) / 1000).toFixed(1)} s`,
  });
  return out;
}

function heroFrom(run: RunDoc, rows: InvestorResult[], requests: number): HeroData | undefined {
  const scopeSteps = (r: InvestorResult) =>
    (run.log || []).filter((l) => l.scope === r.input || l.scope === r.name).map((l) => l.text);
  const logFor = (r: InvestorResult, last: string): [string, string, string, string] => {
    const s = scopeSteps(r);
    return [s[0] || `Searching Cala for "${r.input}"`, s[1] || "Reading rounds and portfolio", s[2] || s[1] || "Tracing co-investors", last];
  };
  const safe = (r: InvestorResult) => !NO_NEGATIVE.test(r.name);
  const direct = rows.find((r) => r.level === "direct_high" && safe(r) && r.direct[0]) || rows.find((r) => r.direct[0] && safe(r));
  const leak = rows.find((r) => r.level === "indirect" && safe(r) && r.leaks[0]);
  const look = rows.find((r) => r.level === "possible" && safe(r) && r.possible[0]);
  const clear = rows.find((r) => r.level === "clear" && r.resolved);
  if (!direct || !leak || !look || !clear) return undefined;
  const d = direct.direct[0];
  const l = leak.leaks[0];
  const p = look.possible[0];
  const share = (r: InvestorResult) => (r.share.level === "Deck without customer names" ? "Deck, no customer names" : r.share.level);
  return {
    competitor: clip(d.competitor, 20),
    requests,
    mid: {
      round: clip(d.round ? `${d.round.label}${d.date ? ` · ${d.date.slice(0, 4)}` : ""}` : `${d.competitor} stake`, 18),
      coinv: clip(l.via.name, 18),
      look: clip(p.company, 18),
    },
    funds: [
      {
        name: clip(direct.name, 13),
        tone: "red",
        pill: LEVEL_LABEL[direct.level],
        line: direct.headline,
        share: share(direct),
        edges: [d.isLead ? "led" : d.round ? "joined" : "invested", d.round ? "round of" : "in"],
        log: logFor(direct, direct.headline),
      },
      {
        name: clip(leak.name, 13),
        tone: "amber",
        pill: LEVEL_LABEL[leak.level],
        line: leak.headline,
        share: share(leak),
        edges: [`${l.sharedRoundCount} shared round${l.sharedRoundCount === 1 ? "" : "s"}`, l.viaLed ? "led a round" : "backs"],
        log: logFor(leak, `Path: ${leak.name} → ${l.via.name} → ${l.competitor}`),
      },
      {
        name: clip(look.name, 13),
        tone: "slate",
        pill: LEVEL_LABEL[look.level],
        line: look.headline,
        share: share(look),
        edges: ["portfolio", p.judgedBy === "gemini" ? "judged close" : "similar"],
        log: logFor(look, look.headline),
      },
      {
        name: clip(clear.name, 13),
        tone: "green",
        pill: LEVEL_LABEL[clear.level],
        line: clear.headline,
        share: share(clear),
        edges: ["", ""],
        log: logFor(clear, "No link to your competitors"),
      },
    ],
    caption: `Replay of a real run on ${fmtDay(run.createdAt)}: ${run.investors.length} funds checked against ${run.competitors.join(", ")}, ${requests} Cala requests. Four of the funds shown.`,
  };
}

export async function loadShowcase(): Promise<Showcase | null> {
  const runs = await exampleRuns();
  const run = runs[0];
  if (!run) return null;
  const sorted = [...run.investors].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  const shown = sorted.filter((r) => !(NO_NEGATIVE.test(r.name) && LEVEL_RANK[r.level] >= LEVEL_RANK.possible));
  const requests = (run.stats?.calls || 0) + (run.stats?.cached || 0);
  const rows: ShowRow[] = shown.slice(0, 6).map((r) => ({
    fund: r.name,
    level: r.level,
    pill: LEVEL_LABEL[r.level],
    tone: TONE[r.level],
    line: r.headline,
    share: r.share.level,
    source: sourceOf(r),
  }));

  const topRow = shown.find((r) => r.direct[0]);
  const top = topRow
    ? {
        fund: topRow.name,
        competitor: topRow.direct[0].competitor,
        reasons: topRow.direct[0].reasons.slice(0, 3).map((x) => ({ text: x.text, tone: x.tone })),
        source: sourceOf(topRow),
        ask: topRow.ask.question,
      }
    : undefined;
  const leakRow = shown.find((r) => r.level === "indirect" && r.leaks[0]);
  const lookRow = shown.find((r) => r.possible[0]);
  const traps = {
    direct: topRow
      ? `${topRow.name} → ${topRow.direct[0].competitor}${topRow.direct[0].date ? ` · ${monthYear(topRow.direct[0].date)}` : ""}`.toUpperCase()
      : undefined,
    leak: leakRow
      ? `${leakRow.name} → ${leakRow.leaks[0].via.name} → ${leakRow.leaks[0].competitor} · ${leakRow.leaks[0].sharedRoundCount} SHARED`.toUpperCase()
      : undefined,
    look: lookRow ? `${lookRow.name} → ${lookRow.possible[0].company}`.toUpperCase() : undefined,
  };

  const sl = run.slush;
  // Recomputed from the saved results, so older runs get the same summary.
  const risk = computeRoundRisk(run.investors, run.slush);
  const hub = risk.hubs[0];
  return {
    round: {
      score: risk.score,
      grade: risk.grade,
      headline: risk.headline,
      hub: hub ? `${hub.via} ties ${hub.investors.join(" and ")} to ${hub.competitors.join(", ")}.` : undefined,
    },
    run,
    date: fmtDay(run.createdAt),
    rows,
    terminal: terminalLines(run),
    // The hero needs one fund of each kind (direct, co-investor, lookalike, clear).
    // If the newest run lacks one, use the newest real run that has all four.
    hero:
      heroFrom(run, sorted, requests) ??
      runs
        .slice(1)
        .map((r) =>
          heroFrom(
            r,
            [...r.investors].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]),
            (r.stats?.calls || 0) + (r.stats?.cached || 0),
          ),
        )
        .find(Boolean),
    requests,
    liveCalls: run.stats?.calls || 0,
    seconds: Math.round((run.ms || 0) / 100) / 10,
    top,
    traps,
    slush: sl
      ? {
          event: sl.event.name,
          attendees: sl.event.attendees,
          namedAttending: sl.namedAttending.map((a) => a.name),
          portfolioAtSlush: run.investors.reduce((n, r) => n + (r.slush?.portfolio.length || 0), 0),
          rivals: sl.competitors.length,
        }
      : undefined,
  };
}
