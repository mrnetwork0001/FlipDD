"use client";

// The investor profile page: everything FlipDD knows about one investor from a
// finished check, opened in its own tab from a result row or the meeting prep.
// The check's own findings show at once. Three requests then run side by side,
// each with its own loading state and retry: the team, rounds and competitors
// (/api/prep core: Cala entity calls, a few seconds), the cited profile
// (/api/dossier: Cala Knowledge Search) and the exits (/api/prep exits: a Cala
// knowledge query). The last two take 30 to 60 seconds the first time.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, FileLock2, Loader2, MapPin, MessageSquareQuote, RotateCcw, UserRound } from "lucide-react";
import CalaLogo from "./CalaLogo";
import Markdown from "./Markdown";
import OwnCalaKey from "./OwnCalaKey";
import { Muted, Person, Rival, Rows, SPACE_LABEL, SPACE_STYLE, Slow, money } from "./MeetingPrepPanel";
import { CopyButton, Finding, KIND_LABEL, LEVEL_STYLE, PathNode, Reasons, SourceLink, Sources, fmtDate } from "./ResultParts";
import { installOwnKeyFetch } from "@/lib/client/calaKey";
import {
  LEVEL_LABEL,
  type CompetitorSummary,
  type InvestorDossier,
  type InvestorResult,
  type RoundRef,
  type RunDoc,
  type SlushCompetitor,
  type SourceRef,
} from "@/lib/types";
import type { MeetingPrep, PrepPerson, PrepRow, PrepSpace, PrepStyle } from "@/lib/prep";

// Every /api/ call carries the visitor's own Cala key when they have set one. The key
// lives in localStorage, so it applies in this tab too.
if (typeof window !== "undefined") installOwnKeyFetch();

/** What the page needs from the saved check, besides the investor's own result. */
export interface ProfileRun {
  id: string;
  createdAt: string;
  startupName: string;
  description?: string;
  competitors: string[];
  competitorSummaries: CompetitorSummary[];
  finished: boolean;
  stats?: RunDoc["stats"];
  /** Slush attendees that compete with the founder and that this investor backs. */
  slushCompetitors: SlushCompetitor[];
  slushEvent?: string;
}

// ---------- loading ----------

type Load<T> =
  | { state: "off" }
  | { state: "loading" }
  | { state: "done"; data: T }
  | { state: "error"; error: string; status?: number };

/**
 * POSTs once when the page opens, with its own abort and retry. React's strict mode
 * mounts twice in development; the request still goes out once, and it is only
 * aborted when the page really goes away.
 */
function usePost<T>(url: string, body: unknown, enabled: boolean): [Load<T>, () => void] {
  const [load, setLoad] = useState<Load<T>>(enabled ? { state: "loading" } : { state: "off" });
  const ctl = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const payload = useRef(body); // fixed for the life of the page

  const send = useCallback(() => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setLoad({ state: "loading" });
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.current),
      signal: c.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (ctl.current !== c) return;
        if (res.ok && json) setLoad({ state: "done", data: json as T });
        else setLoad({ state: "error", error: json?.error || `FlipDD could not load this (${res.status}).`, status: res.status });
      })
      .catch((err: unknown) => {
        if (c.signal.aborted || ctl.current !== c) return;
        setLoad({
          state: "error",
          error: err instanceof TypeError ? "Could not reach FlipDD. Check your connection, then retry." : String((err as Error)?.message || err),
        });
      });
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    if (enabled && !ctl.current) send();
    return () => {
      mounted.current = false;
      // Strict mode remounts straight away; a page that really closed stays unmounted.
      setTimeout(() => {
        if (!mounted.current) ctl.current?.abort();
      }, 0);
    };
  }, [enabled, send]);

  return [load, send];
}

// ---------- words ----------

const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] || "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
};
const roundMoney = (r?: RoundRef) => (r?.amount ? money(r.amount, r.currency || "USD") : "");
/** "2024-03 to 2026-06" → "Mar 2024 to Jun 2026". */
const span = (window: string) => window.split(" to ").map((d) => fmtDate(d)).join(" to ");
/** Cala's answer usually opens with its own title; the page already has one. */
const withoutTitle = (md: string) => md.replace(/^\s*#{1,3}[^\n]*\bprofile\b[^\n]*\n+/i, "");
/** Errors a founder can fix with their own Cala key (as in the app), or when the server has none. */
const KEY_TROUBLE = /credits|refused|rate limit|CALA_API_KEY/i;
const MINI = "text-[11px] font-semibold uppercase tracking-wider text-muted";

// ---------- pieces ----------

function Section({ n, id, title, aside, children }: { n: string; id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="flex min-w-0 items-baseline gap-3">
          <span className="font-mono text-xs text-signal">{n}</span>
          <span className="min-w-0 font-serif text-3xl leading-tight sm:text-[2.5rem]">{title}</span>
        </h2>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div>
      <p className={MINI}>
        {title}
        {count !== undefined && <span className="ml-1.5 font-mono font-normal text-muted/80">{count}</span>}
      </p>
      <div className="mt-2.5 space-y-3">{children}</div>
    </div>
  );
}

/** Seconds since this loading line appeared, once it has been a few. */
function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return s >= 5 ? <span className="font-mono text-[11px] tabular-nums text-muted/80">{s} s</span> : null;
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      <span>{children}</span>
      <Elapsed />
    </p>
  );
}

function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-signal/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-relaxed text-signal">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-signal"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

/** Loading and error states for the three sections that share one /api/prep core request. */
function CoreState({ load, onRetry, what }: { load: Load<MeetingPrep>; onRetry: () => void; what: string }) {
  if (load.state === "loading") return <Waiting>{what}</Waiting>;
  if (load.state === "error") return <Failed error={load.error} onRetry={onRetry} />;
  return null;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card p-4">
      <p className="text-[12px] leading-snug text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none text-ink">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

/** Ranked bars, one hue, the count at each bar's tip. */
function StageBars({ stages }: { stages: PrepStyle["stages"] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="mt-3 space-y-2.5">
      {stages.map((s) => (
        <li key={s.label} title={`${s.label}: ${plural(s.count, "round")}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-[13px]">
          <span className="truncate text-ink/80">{s.label}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 shrink-0 rounded-r-[4px] bg-ink/80" style={{ width: `calc((100% - 2.5rem) * ${s.count / max})` }} />
            <span className="font-semibold text-ink">{s.count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** How strong a co-investor path is, 0 to 100: a meter with its label beside it. */
function Strength({ value, label }: { value: number; label: "strong" | "moderate" | "weak" }) {
  const tone = { strong: ["bg-signal", "bg-signal/15"], moderate: ["bg-caution", "bg-caution/15"], weak: ["bg-ink/40", "bg-ink/10"] }[label];
  return (
    <span className="inline-flex items-center gap-2" title={`Link strength ${value} out of 100`}>
      <span className={`block h-1.5 w-20 rounded-full ${tone[1]}`}>
        <span className={`block h-full rounded-full ${tone[0]}`} style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </span>
      <span className="text-[12px] font-semibold text-ink/80">
        {label} · {value}/100
      </span>
    </span>
  );
}

/** One funding round on a line: who raised, when, how much, and up to three sources. */
function RoundLine({ r, note }: { r: RoundRef; note?: string }) {
  const facts = [
    r.date ? fmtDate(r.date) : "undated",
    roundMoney(r),
    r.valuation ? `valued at ${money(r.valuation, r.valuationCurrency || r.currency || "USD")}` : "",
    note || "",
  ].filter(Boolean);
  const linked = r.sources.filter((s) => s.url).slice(0, 3);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 px-3 py-2.5 text-[13px]">
      <span className="font-semibold">
        {r.issuer ? `${r.issuer} · ` : ""}
        {r.label}
      </span>
      <span className="text-muted">{facts.join(" · ")}</span>
      {linked.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {linked.map((s) => (
            <SourceLink key={s.url} source={s} />
          ))}
        </span>
      )}
    </li>
  );
}

function PeopleList({ people, left = false }: { people: PrepPerson[]; left?: boolean }) {
  return (
    <ul className="mt-2.5 divide-y divide-line rounded-xl border border-line bg-white/60">
      {people.map((p) => (
        <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-[13px]">
          <span className="min-w-0">
            <span className="font-semibold">{p.name}</span>
            {p.role && <span className="text-muted"> · {p.role}</span>}
            {left
              ? p.until && <span className="text-muted"> · left {fmtDate(p.until.slice(0, 7))}</span>
              : p.since && <span className="text-muted"> · since {p.since.slice(0, 4)}</span>}
          </span>
          {p.source?.url && <SourceLink source={p.source} compact />}
        </li>
      ))}
    </ul>
  );
}

function SpaceCard({ space }: { space: PrepSpace }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className={MINI}>Their stake in your space</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SPACE_STYLE[space.signal]}`}>{SPACE_LABEL[space.signal]}</span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed">{space.text}</p>
      {space.holdings.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {space.holdings.map((h) => (
            <li
              key={h.name}
              title={h.detail}
              className={`rounded-full px-2.5 py-0.5 text-[12px] ring-1 ring-inset ${h.how === "competitor" ? "text-signal ring-signal/30" : "text-ink/75 ring-line"}`}
            >
              {h.name} <span className="text-muted">· {h.how === "competitor" ? "on your list" : "close to you"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- the page ----------

export default function InvestorProfile({ run, result }: { run: ProfileRun; result: InvestorResult }) {
  const r = result;
  const a = r.activity;
  const live = r.resolved && r.entities.length > 0;

  const [core, retryCore] = usePost<MeetingPrep>(
    "/api/prep",
    { part: "core", investor: r, competitors: run.competitorSummaries, startupName: run.startupName },
    live,
  );
  const [dossier, retryDossier] = usePost<InvestorDossier>("/api/dossier", { investor: r.name }, r.resolved);
  const [exits, retryExits] = usePost<{ rows: PrepRow[] }>("/api/prep", { part: "exits", investor: r }, live);

  const prep = core.state === "done" ? core.data : undefined;
  const keyTrouble = [core, dossier, exits].some((l) => l.state === "error" && KEY_TROUBLE.test(l.error));
  const comps = run.competitors;
  const tiesTo = comps.length === 0 ? "your competitors" : comps.length <= 3 ? and(comps) : `${comps.slice(0, 2).join(", ")} and ${comps.length - 2} more`;
  const people = r.people || [];
  const nothingFound = !r.direct.length && !r.leaks.length && !r.possible.length && !people.length && !run.slushCompetitors.length;
  const compByName = new Map(run.competitorSummaries.map((c) => [c.name, c]));

  const ties = (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-8">
        {r.direct.length > 0 && (
          <Group title="Direct stakes" count={r.direct.length}>
            {r.direct.map((d) => {
              const inRound = new Set((d.round?.sources || []).map((s) => s.url));
              return (
                <Finding
                  key={d.competitor}
                  tone="red"
                  tag="Direct stake"
                  title={
                    <>
                      {d.competitor}
                      {d.matchedAs && <span className="ml-2 font-normal text-muted">recorded as {d.matchedAs}</span>}
                    </>
                  }
                >
                  <Reasons reasons={d.reasons} />
                  {d.round && (
                    <div className="mt-4">
                      <p className={MINI}>The round</p>
                      <ul className="mt-1.5 rounded-lg border border-line bg-white/60">
                        <RoundLine r={d.round} note={d.isLead ? "they led it" : "they joined, not as lead"} />
                      </ul>
                    </div>
                  )}
                  <Sources sources={d.sources.filter((s) => !inRound.has(s.url))} max={8} />
                </Finding>
              );
            })}
          </Group>
        )}

        {r.leaks.length > 0 && (
          <Group title="One step away, through co-investors" count={r.leaks.length}>
            {r.leaks.map((l, i) => (
              <Finding key={`${l.via.id}-${l.competitor}-${i}`} tone={l.strengthLabel === "weak" ? "slate" : "amber"} tag="Co-investor path" title={`via ${l.via.name}`}>
                <div className="mt-2">
                  <Strength value={l.strength} label={l.strengthLabel} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                  <PathNode tone="ink">{r.name}</PathNode>
                  <span className="font-mono text-[11px] text-muted">{plural(l.sharedRoundCount, "shared round")} →</span>
                  <PathNode tone="amber">{l.via.name}</PathNode>
                  <span className="font-mono text-[11px] text-muted">
                    {l.competitorRound ? `${l.viaLed ? "led" : "joined"} its ${l.competitorRound.label}` : l.viaLed ? "led a round" : "invested"} →
                  </span>
                  <PathNode tone="red">{l.competitor}</PathNode>
                </div>
                <Reasons reasons={l.reasons} />
                {l.sharedRounds.length > 0 && (
                  <div className="mt-4">
                    <p className={MINI}>
                      Rounds {r.name} and {l.via.name} shared
                    </p>
                    <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line bg-white/60">
                      {l.sharedRounds.map((s) => (
                        <RoundLine key={s.id} r={s} />
                      ))}
                    </ul>
                    {l.sharedRoundCount > l.sharedRounds.length && (
                      <p className="mt-1.5 text-[12px] text-muted">and {l.sharedRoundCount - l.sharedRounds.length} more on record</p>
                    )}
                  </div>
                )}
                {l.competitorRound ? (
                  <div className="mt-4">
                    <p className={MINI}>
                      {l.via.name}&apos;s round in {l.competitor}
                    </p>
                    <ul className="mt-1.5 rounded-lg border border-line bg-white/60">
                      <RoundLine r={l.competitorRound} note={l.viaLed ? `${l.via.name} led it` : `${l.via.name} joined it`} />
                    </ul>
                  </div>
                ) : (
                  <Sources sources={l.sources} max={8} />
                )}
              </Finding>
            ))}
          </Group>
        )}

        {r.possible.length > 0 && (
          <Group title="Lookalikes in their portfolio" count={r.possible.length}>
            {r.possible.map((p) => (
              <Finding
                key={p.company}
                tone="slate"
                tag={p.judgedBy === "gemini" ? `Lookalike · Gemini: ${p.verdict === "direct" ? "competes" : "adjacent"}` : "Possible overlap"}
                title={
                  <>
                    {p.company}
                    {p.sector && <span className="ml-2 font-normal text-muted">{p.sector}</span>}
                  </>
                }
              >
                {p.description && <p className="mt-2 text-sm leading-relaxed text-ink/85">{p.description}</p>}
                {p.judgedBy === "gemini" && p.why ? (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-medium text-ink/85">Why Gemini flagged it:</span> {p.why}{" "}
                    {p.origin === "graph"
                      ? "Judged from Cala's descriptions; confirm before acting on it."
                      : "Listed by Cala's query endpoint; no sourced graph record ties it to this investor yet."}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Matched on: <span className="font-medium text-ink/85">{p.sharedTerms.join(", ")}</span>.{" "}
                    {p.origin === "graph"
                      ? "Text match; confirm before acting on it."
                      : "Listed by Cala's query endpoint; no sourced graph record ties it to this investor yet."}
                  </p>
                )}
                <Sources sources={p.sources} max={8} />
              </Finding>
            ))}
          </Group>
        )}

        {people.length > 0 && (
          <Group title="People who link them" count={people.length}>
            {people.map((t) => (
              <Finding key={`${t.personId}-${t.competitor}`} tone="red" tag={t.side === "self" ? "Person · this is them" : "Person · on their team"} title={t.person}>
                <p className="mt-2 text-sm leading-relaxed text-ink/85">{t.text}.</p>
                <p className="mt-1 text-xs text-muted">
                  {t.side === "self"
                    ? "Matched to the same person record in Cala's graph, not just the same name."
                    : `Cala lists ${t.person} at ${r.name} and in ${t.competitor}'s leadership or board, as the same person record.`}
                </p>
                {t.source && <Sources sources={[t.source]} />}
              </Finding>
            ))}
          </Group>
        )}

        {run.slushCompetitors.length > 0 && (
          <Group title={`At ${run.slushEvent || "Slush"}`} count={run.slushCompetitors.length}>
            {run.slushCompetitors.map((c) => (
              <Finding key={`slush-${c.id}`} tone="red" tag={`${run.slushEvent || "Slush"} attendee`} title={c.name}>
                <p className="mt-2 text-sm leading-relaxed text-ink/85">
                  Cala has {r.name} on record as an investor in {c.name}, which is on the {run.slushEvent || "Slush"} attendee list.
                </p>
                {c.what && <p className="mt-1 text-sm leading-relaxed text-muted">{c.what}</p>}
                {c.why && <p className="mt-1 text-xs text-muted">{c.verdict ? `Gemini: ${c.why}` : c.why}</p>}
                {c.source && <Sources sources={[c.source]} />}
              </Finding>
            ))}
          </Group>
        )}

        {nothingFound && (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
            {r.resolved
              ? "No direct stake, no co-investor path and no lookalike portfolio company found."
              : "Cala has no investment record under this name. Try the fund's legal name or a shorter spelling."}
          </p>
        )}

        {r.slush && r.slush.portfolio.length > 0 && (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink/85">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>
              Their portfolio at {run.slushEvent || "Slush"}: {and(r.slush.portfolio.map((p) => p.name))}.{" "}
              <span className="text-muted">Founders you can ask about working with {r.name}, and who may hear about your meeting.</span>
            </span>
          </p>
        )}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-line bg-white/60 p-5">
          <p className="label flex items-center gap-1.5">
            <FileLock2 className="h-3.5 w-3.5" /> What to share
          </p>
          <p className="font-serif text-3xl leading-tight">{r.share.level}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{r.share.why}</p>
        </div>
        <div className="rounded-xl border border-ink bg-ink p-5 text-paper">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-paper/60">
            <MessageSquareQuote className="h-3.5 w-3.5" /> Ask this
          </p>
          <p className="font-serif text-xl leading-snug">&ldquo;{r.ask.question}&rdquo;</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="[&_button]:border-paper/25 [&_button]:text-paper/70 [&_button:hover]:border-paper [&_button:hover]:text-paper">
              <CopyButton text={r.ask.question} />
            </span>
            {r.ask.source?.url && (
              <a
                href={r.ask.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-paper/60 underline-offset-2 hover:text-paper hover:underline"
              >
                Based on {r.ask.source.label}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
            {r.ask.draftedBy === "gemini" && <span className="text-[11px] text-paper/50">Worded by Gemini from these findings</span>}
          </div>
        </div>
      </aside>
    </div>
  );

  const profile =
    dossier.state === "loading" ? (
      <div>
        <Waiting>Reading Cala&apos;s sources, 30 to 60 seconds the first time</Waiting>
        <div className="mt-5 max-w-4xl space-y-2.5" aria-hidden>
          <span className="skeleton block h-3 w-11/12" />
          <span className="skeleton block h-3 w-4/5" />
          <span className="skeleton block h-3 w-9/12" />
          <span className="skeleton block h-3 w-2/3" />
        </div>
      </div>
    ) : dossier.state === "error" ? (
      dossier.status === 404 ? (
        <Muted>Cala Knowledge Search has no written profile of {r.name}.</Muted>
      ) : (
        <Failed error={dossier.error} onRetry={retryDossier} />
      )
    ) : dossier.state === "done" ? (
      <div className="min-w-0 max-w-4xl rounded-xl border border-line bg-card p-4 sm:p-7">
        <Markdown text={withoutTitle(dossier.data.markdown)} className="text-ink/90 [&>*:first-child]:mt-0" />
        {dossier.data.sources.length > 0 && (
          <div className="mt-6 border-t border-line pt-3">
            <p className={MINI}>Sources Cala used</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dossier.data.sources.map((s: SourceRef) => (
                <SourceLink key={s.url} source={s} />
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Written by Cala Knowledge Search from public sources. Check the facts that matter before the meeting.</p>
      </div>
    ) : null;

  const team = prep ? (
    <>
      {prep.team.current.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {prep.team.current.map((p) => (
            <Person key={p.id} p={p} withOpener plainRanges />
          ))}
        </ul>
      ) : (
        <Muted>Cala has no partners on record for {r.name}. Ask who leads your sector before the meeting.</Muted>
      )}
      {prep.team.others.length > 0 && (
        <div className="mt-7">
          <p className={MINI}>Also on record</p>
          <PeopleList people={prep.team.others} />
        </div>
      )}
      {prep.team.left.length > 0 && (
        <div className="mt-7">
          <p className={MINI}>Left the firm</p>
          <PeopleList people={prep.team.left} left />
          <p className="mt-2 text-[13px] text-muted">If one of them covered your sector, ask who covers it now.</p>
        </div>
      )}
    </>
  ) : (
    <CoreState load={core} onRetry={retryCore} what={`Reading ${r.name}'s team in Cala`} />
  );

  const style = prep?.style;
  const last = style?.lastDeal;
  // The check's own last round carries a source link; use it when it is the same round.
  const lastSource = last?.date && a.lastRound && a.lastRound.date === last.date ? a.lastRound.source : undefined;
  const invest = (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rounds on record" value={a.roundsRecorded.toLocaleString("en-GB")} sub={a.leadsAll ? `they led ${a.leadsAll}` : undefined} />
        <Stat label="Companies on record" value={a.portfolioRecorded.toLocaleString("en-GB")} sub={a.truncated ? "the first 100 were read" : undefined} />
        <Stat label="Last 12 months" value={a.rounds12m} sub={a.rounds12m ? `${a.rounds12m === 1 ? "round" : "rounds"}, they led ${a.leads12m}` : "rounds with a dated source"} />
        <Stat
          label="Typical round"
          value={
            core.state === "loading" ? (
              <span className="skeleton block h-6 w-16" />
            ) : style?.medianRound ? (
              money(style.medianRound.value, style.medianRound.units)
            ) : (
              <span className="text-muted">Unknown</span>
            )
          }
          sub={
            style?.medianRound
              ? "the whole round they join, not their cheque"
              : core.state === "done"
                ? "no round amounts on record"
                : core.state === "error"
                  ? "could not load"
                  : undefined
          }
        />
      </div>
      <div className="mt-7">
        {prep ? (
          style ? (
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
              <div className="min-w-0">
                <p className={MINI}>
                  Stages of their last {plural(style.roundsSeen, "round")} on record{style.window ? `, ${span(style.window)}` : ""}
                </p>
                {style.stages.length ? <StageBars stages={style.stages} /> : <p className="mt-3 text-sm text-muted">Cala has no stage for these rounds.</p>}
              </div>
              <div className="min-w-0 space-y-2 text-sm leading-relaxed">
                <p>
                  They led {style.led} of the last {plural(style.roundsSeen, "round")} on record.
                </p>
                {last ? (
                  <p>
                    Latest: {last.label}
                    {last.company ? ` in ${last.company}` : ""}
                    {last.date ? `, ${fmtDate(last.date)}` : ""}
                    {lastSource?.url && (
                      <span className="ml-1.5 inline-block align-middle">
                        <SourceLink source={lastSource} compact />
                      </span>
                    )}
                  </p>
                ) : (
                  a.lastRound && (
                    <p>
                      Last sourced round: {a.lastRound.label}, {fmtDate(a.lastRound.date)}
                    </p>
                  )
                )}
                <p className="text-[13px] text-muted">Round sizes are whole rounds. Cala rarely records one investor&apos;s cheque.</p>
              </div>
            </div>
          ) : (
            <Muted>No rounds on record for {r.name}.</Muted>
          )
        ) : (
          <CoreState load={core} onRetry={retryCore} what="Reading their recent rounds in Cala" />
        )}
      </div>
    </>
  );

  const rivalsWithData = prep?.rivals.filter((x) => x.arr.length || x.headcount.length || x.totalFunding || x.board.length || compByName.get(x.name)?.radar?.rounds?.length) || [];
  const competitors = prep ? (
    <div className="space-y-7">
      <SpaceCard space={prep.space} />
      <div>
        <p className={MINI}>Your competitors in Cala&apos;s records</p>
        {rivalsWithData.length ? (
          <div className="mt-2.5 grid grid-cols-1 gap-3">
            {rivalsWithData.map((x) => (
              <Rival key={x.name} r={x} comp={compByName.get(x.name)} />
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <Muted>
              {run.competitorSummaries.some((c) => c.resolved)
                ? "Cala has no funding, revenue or headcount on record for your competitors yet."
                : "None of the competitors in this check has a record in Cala."}
            </Muted>
          </div>
        )}
        {rivalsWithData.some((x) => x.arr.length) && <p className="mt-2 text-[13px] text-muted">If they backed a competitor, this is the bar they will hold you to.</p>}
      </div>
    </div>
  ) : (
    <CoreState load={core} onRetry={retryCore} what="Reading your competitors in Cala" />
  );

  const exitList =
    exits.state === "error" ? (
      <Failed error={exits.error} onRetry={retryExits} />
    ) : exits.state === "done" ? (
      exits.data.rows?.length ? (
        <Rows rows={exits.data.rows} cols={[["company", ""], ["outcome", ""], ["acquirer_or_exchange", "·"], ["year", "·"]]} />
      ) : (
        <Muted>No acquisitions or listings of their portfolio companies on record.</Muted>
      )
    ) : (
      <Slow state="loading" rows={[]} cols={[]} empty="" />
    );

  const stats = run.stats;
  const where = (
    <div className="space-y-7">
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
        <div className="min-w-0">
          <p className={MINI}>{r.entities.length > 1 ? `${r.entities.length} Cala records merged into ${r.name}` : "The Cala record behind it"}</p>
          {r.entities.length ? (
            <ul className="mt-2.5 divide-y divide-line rounded-xl border border-line bg-white/60">
              {r.entities.map((e) => (
                <li key={e.id} className="px-3.5 py-2.5 text-[13px]">
                  <span className="font-semibold">{e.name}</span> <span className="text-muted">· {e.type}</span>
                  <span className="mt-0.5 block break-all font-mono text-[11px] text-muted">{e.id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No Cala record matched this name.</p>
          )}
          {r.candidates > 0 && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Matched from {plural(r.candidates, "candidate")} in Cala&apos;s name search.{r.scanNote ? ` ${r.scanNote}` : ""}
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-5 text-sm leading-relaxed">
          {r.coverage && (
            <div>
              <p className={MINI}>Data coverage</p>
              <p className="mt-1.5">
                Cala holds {r.coverage.has.length ? r.coverage.has.join(", ") : "little"} for this record
                {r.coverage.missing.length
                  ? `; no ${r.coverage.missing.join(" or ")}, so ${r.coverage.missing.includes("team") ? "conflicts through people can't be checked" : "this part could not be checked"}.`
                  : "."}
              </p>
            </div>
          )}
          <div>
            <p className={MINI}>Cala calls</p>
            {stats && (
              <p className="mt-1.5">
                Your check made {plural(stats.calls + stats.cached, "request")} to Cala: {stats.calls} live, {stats.cached} answered from responses saved
                earlier.
              </p>
            )}
            <p className="mt-1.5">
              {core.state === "off" ? (
                "With no Cala record under this name, this page asks Cala for nothing more."
              ) : (
                <>
                  {prep
                    ? prep.calls
                      ? `Opening this page took ${plural(prep.calls, "more live call")} for the team, rounds and competitors.`
                      : "This page's team, rounds and competitors came from Cala responses saved earlier, with no new calls."
                    : core.state === "loading"
                      ? "Counting this page's calls once the team and rounds are in."
                      : "This page asks Cala for the team, rounds and competitors when it opens."}{" "}
                  The written profile and the exits are one Cala knowledge request each.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-line pt-5">
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Every fact on this page comes from Cala&apos;s knowledge graph and links to its source where Cala has one. Public records lag behind real
          deals, so treat this as the start of the conversation, not the end of it.
        </p>
        <CalaLogo label="Data from" height={18} className="mt-4 text-xs text-muted" />
      </div>
    </div>
  );

  const sections: { id: string; title: string; aside?: ReactNode; body: ReactNode }[] = [
    { id: "ties", title: `Their ties to ${tiesTo}`, body: ties },
    ...(r.resolved
      ? [
          { id: "profile", title: "Profile", body: profile },
          {
            id: "team",
            title: "Who you'll meet",
            aside: prep?.team.recorded ? <span className="text-[12px] text-muted">{plural(prep.team.recorded, "person", "people")} on record</span> : undefined,
            body: team,
          },
          { id: "style", title: "How they invest", body: invest },
          { id: "competitors", title: "What they know about your competitors", body: competitors },
          { id: "exits", title: "Exits", body: exitList },
        ]
      : []),
    { id: "sources", title: "Where this comes from", body: where },
  ];

  const level = LEVEL_STYLE[r.level];
  return (
    <main className="mx-auto max-w-5xl break-words px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Investor profile</p>
        <h1 className="mt-3 font-serif text-5xl leading-[1.05] sm:text-6xl">{r.name}</h1>
        {r.description && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/75">{sentence(r.description)}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${level.pill}`}>{LEVEL_LABEL[r.level]}</span>
          {r.kind && r.kind !== "fund" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink/70 ring-1 ring-inset ring-ink/15">
              {r.kind === "angel" && <UserRound className="h-3 w-3" />}
              {KIND_LABEL[r.kind]}
            </span>
          )}
          <span className="text-base text-ink/85">{r.headline}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          From your check{run.startupName ? <> of <span className="font-medium text-ink/80">{run.startupName}</span></> : null}
          {comps.length ? <> against <span className="font-medium text-ink/80">{and(comps)}</span></> : null}, {fmtDate(run.createdAt)}
        </p>
        {!run.finished && <p className="mt-2 text-[13px] text-caution">This check stopped before it finished, so some ties may be missing.</p>}
        {keyTrouble && (
          <div className="mt-6 max-w-2xl rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm leading-relaxed">
            <p className="font-semibold text-signal">Cala turned down part of this page.</p>
            <p className="mt-1 text-muted">If FlipDD&apos;s Cala key is out of credits or busy, use your own key, then press Retry in each section.</p>
            <OwnCalaKey open />
          </div>
        )}
      </header>

      <div className="mt-14 space-y-14">
        {sections.map((s, i) => (
          <Section key={s.id} n={String(i + 1).padStart(2, "0")} id={s.id} title={s.title} aside={s.aside}>
            {s.body}
          </Section>
        ))}
      </div>
    </main>
  );
}
