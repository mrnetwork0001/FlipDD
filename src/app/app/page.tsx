"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileLock2,
  Loader2,
  MapPin,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  MessageCircleQuestion,
  NotebookPen,
  Radar,
  ShieldCheck,
  UserRound,
  MessageSquareQuote,
  Play,
  Plus,
  Share2,
  Square,
} from "lucide-react";
import {
  LEVEL_LABEL,
  LEVEL_RANK,
  type Activity,
  type AnalyzeEvent,
  type CompetitorSummary,
  type DiscoveredCompetitor,
  type FinderReport,
  type InvestorKind,
  type RunDoc,
  type InvestorResult,
  type Level,
  type Reason,
  type SlushReport,
  type SourceRef,
  type StepState,
  type Tone,
} from "@/lib/types";
import ConflictMap from "@/components/ConflictMap";
import SlushPanel from "@/components/SlushPanel";
import RoundRiskPanel from "@/components/RoundRiskPanel";
import RadarPanel from "@/components/RadarPanel";
import FinderPanel from "@/components/FinderPanel";
import MeetingPrepPanel from "@/components/MeetingPrepPanel";
import ContactDock from "@/components/ContactDock";
import OwnCalaKey from "@/components/OwnCalaKey";
import { installOwnKeyFetch } from "@/lib/client/calaKey";

// Every /api/ call carries the visitor's own Cala key when they have set one.
if (typeof window !== "undefined") installOwnKeyFetch();
import AskCalaPanel from "@/components/AskCalaPanel";
import SpeakButton from "@/components/SpeakButton";
import { spokenBriefing, spokenDay } from "@/lib/voiceScript";
import WaitModal from "@/components/WaitModal";
import LiveScan from "@/components/LiveScan";
import Art from "@/components/Art";
import { LiveDot, ScoutGlyph, TwinGlyph } from "@/components/Glyphs";
import MeetingListDrawer, { MeetingListButton, MAX_INVESTORS as LIST_MAX } from "@/components/MeetingListDrawer";
import { computeRoundRisk } from "@/lib/roundRisk";
import CalaLogo from "@/components/CalaLogo";
import FlipLogo from "@/components/FlipLogo";
import { EXAMPLE_INPUT } from "@/lib/example";

// ---------- small helpers ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] || m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}
const splitList = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const fmtAge = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const fmtElapsed = (ms: number) => {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const LEVEL_STYLE: Record<Level, { pill: string; bar: string }> = {
  direct_high: { pill: "bg-signal text-white ring-signal", bar: "bg-signal" },
  direct_moderate: { pill: "bg-signal/10 text-signal ring-signal/30", bar: "bg-signal/60" },
  indirect: { pill: "bg-caution/10 text-caution ring-caution/30", bar: "bg-caution" },
  possible: { pill: "bg-ink/5 text-ink/75 ring-ink/20", bar: "bg-ink/40" },
  thin: { pill: "bg-transparent text-muted ring-line", bar: "bg-line" },
  unresolved: { pill: "bg-transparent text-muted ring-line", bar: "bg-line" },
  clear: { pill: "bg-clear/10 text-clear ring-clear/30", bar: "bg-clear" },
};
const KIND_LABEL: Record<InvestorKind, string> = {
  fund: "VC fund",
  angel: "Angel",
  lender: "Lender",
  grant: "Grant programme",
  corporate: "Corporate investor",
};
const TONE_DOT: Record<Tone, string> = {
  bad: "bg-signal",
  warn: "bg-caution",
  good: "bg-clear",
  neutral: "bg-ink/25",
};

interface Step {
  scope: string;
  text: string;
  state: StepState;
}
interface FormState {
  startupName: string;
  description: string;
  competitors: string;
  investors: string;
  /** Cala entity IDs for competitors added from discovery. */
  competitorIds?: Record<string, string>;
}

const EMPTY: FormState = { startupName: "", description: "", competitors: "", investors: "", competitorIds: {} };
const EXAMPLE: FormState = {
  startupName: EXAMPLE_INPUT.startupName,
  description: EXAMPLE_INPUT.description,
  competitors: EXAMPLE_INPUT.competitors.join("\n"),
  investors: EXAMPLE_INPUT.investors.join("\n"),
  competitorIds: {},
};
const STORAGE_KEY = "flipdd.form.v1";
const MAX_COMPETITORS = 6;

// ---------- pieces ----------

function SourceLink({ source, compact }: { source: SourceRef; compact?: boolean }) {
  const text = compact ? source.label : `${source.label}${source.date ? ` · ${fmtDate(source.date)}` : ""}`;
  if (!source.url) return <span className="text-xs text-muted">{text}</span>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title || source.url}
      className="inline-flex items-center gap-0.5 rounded-md border border-line bg-white/60 px-1.5 py-0.5 font-mono text-[11px] text-ink/80 transition hover:border-ink hover:text-ink"
    >
      {text}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

function Sources({ sources }: { sources: SourceRef[] }) {
  const linked = sources.filter((s) => s.url).slice(0, 4);
  if (!linked.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sources</span>
      {linked.map((s) => (
        <SourceLink key={s.url} source={s} />
      ))}
    </div>
  );
}

function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[r.tone]}`} />
          <span className="leading-relaxed">
            {r.text}
            {r.source?.url && (
              <span className="ml-1.5 inline-block align-middle">
                <SourceLink source={r.source} compact />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PathNode({ tone, children }: { tone: "ink" | "amber" | "red"; children: React.ReactNode }) {
  const cls =
    tone === "ink"
      ? "border-ink bg-ink text-paper"
      : tone === "amber"
        ? "border-caution/40 bg-caution/10 text-caution"
        : "border-signal/40 bg-signal/10 text-signal";
  return <span className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Finding({
  tone,
  tag,
  title,
  children,
}: {
  tone: "red" | "amber" | "slate";
  tag: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const border = tone === "red" ? "border-l-signal" : tone === "amber" ? "border-l-caution" : "border-l-ink/30";
  return (
    <div className={`rounded-xl border border-line border-l-4 bg-white/50 p-4 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tag}</span>
        <span className="font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ContextLine({ activity }: { activity: Activity }) {
  const parts: React.ReactNode[] = [];
  if (activity.lastRound) {
    parts.push(
      <span key="last">
        Last sourced round: {activity.lastRound.label}, {fmtDate(activity.lastRound.date)}
        {activity.lastRound.source?.url && (
          <a
            href={activity.lastRound.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-0.5 inline-flex align-middle text-ink/60 hover:text-ink"
            title={activity.lastRound.source.title || activity.lastRound.source.url}
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </span>,
    );
  }
  parts.push(
    <span key="lead">
      {activity.rounds12m > 0
        ? `led ${activity.leads12m} of ${activity.rounds12m} rounds sourced in the past 12 months`
        : "no rounds sourced in the past 12 months"}
    </span>,
  );
  parts.push(
    <span key="total">
      {activity.roundsRecorded} rounds, {activity.portfolioRecorded} companies on record
      {activity.truncated ? " (first 100 read)" : ""}
    </span>,
  );
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-line">|</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted transition hover:border-ink hover:text-ink"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ShareBriefButton({ runId, investor, ready }: { runId: string; investor: string; ready: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  async function share() {
    setState("busy");
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, investor }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      const full = `${window.location.origin}${body.url}`;
      setUrl(full);
      await navigator.clipboard?.writeText(full).catch(() => undefined);
      setState("done");
    } catch (err) {
      setMessage((err as Error).message);
      setState("error");
    }
  }
  if (state === "done") {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-clear">
          <Check className="h-3.5 w-3.5" /> Link copied
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-ink underline underline-offset-2">
          Open brief
        </a>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        disabled={!ready || !runId || state === "busy"}
        title={ready ? "Make a one-page brief you can send to a co-founder or print for the meeting" : "Available when the check finishes"}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink/25 px-3 py-1.5 text-xs font-semibold transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        Share meeting brief
      </button>
      {state === "error" && <span className="text-xs text-signal">{message}</span>}
    </span>
  );
}

function InvestorRow({
  rank,
  result,
  open,
  onToggle,
  running,
  runId,
  slushReport,
  onPrep,
}: {
  rank: number;
  result: InvestorResult;
  open: boolean;
  onToggle: () => void;
  running: boolean;
  runId: string;
  slushReport?: SlushReport;
  onPrep: () => void;
}) {
  const pending = !result.done.direct;
  const style = LEVEL_STYLE[result.level];
  const stillChecking = running && result.resolved && (!result.done.leaks || !result.done.scan);
  const slushRivals = (slushReport?.competitors || []).filter((c) => result.slush?.competitors.includes(c.name));
  const slushPortfolio = result.slush?.portfolio.length || 0;
  const peopleTies = result.people || [];
  const nothingFound =
    !result.direct.length && !result.leaks.length && !result.possible.length && !slushRivals.length && !peopleTies.length;

  return (
    <li
      id={`row-${encodeURIComponent(result.input)}`}
      className="animate-rise scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-card"
    >
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-stretch text-left transition hover:bg-white/60 disabled:cursor-default"
      >
        <span className={`w-1.5 shrink-0 ${pending ? "bg-line" : style.bar}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-5">
          <span className="hidden w-5 pt-0.5 font-mono text-xs text-muted sm:block">{rank}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">{result.name}</span>
              {pending ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> looking up
                </span>
              ) : (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style.pill}`}
                >
                  {LEVEL_LABEL[result.level]}
                </span>
              )}
              {!pending && result.kind && result.kind !== "fund" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-semibold text-ink/70 ring-1 ring-inset ring-ink/15">
                  {result.kind === "angel" && <UserRound className="h-3 w-3" />}
                  {KIND_LABEL[result.kind]}
                </span>
              )}
              {!pending && (slushRivals.length > 0 || slushPortfolio > 0) && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${
                    slushRivals.length ? "bg-signal/5 text-signal ring-signal/25" : "text-ink/60 ring-line"
                  }`}
                  title={slushReport?.event.name}
                >
                  <MapPin className="h-3 w-3" />
                  {slushRivals.length
                    ? `Backs ${slushRivals.map((c) => c.name).join(", ")} at Slush`
                    : `${slushPortfolio} portfolio co${slushPortfolio === 1 ? "" : "s"} at Slush`}
                </span>
              )}
              {stillChecking && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {!result.done.leaks ? "checking co-investors" : "scanning portfolio"}
                </span>
              )}
            </span>
            {pending ? (
              <span className="mt-2 block space-y-1.5">
                <span className="skeleton block h-3 w-3/4" />
                <span className="skeleton block h-3 w-1/2" />
              </span>
            ) : (
              <>
                <span className="mt-1 block text-sm text-ink/85">{result.headline}</span>
              </>
            )}
          </span>
          {!pending && (
            <span className="flex shrink-0 items-center gap-3 sm:w-52 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Share</span>
              <span className="text-sm font-semibold sm:text-right">{result.share.level}</span>
            </span>
          )}
        </span>
        {!pending && (
          <span className="flex items-center pr-2 text-muted">
            <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} />
          </span>
        )}
      </button>
      {!pending && result.resolved && (
        <span className="flex items-center pr-4">
          <button
            type="button"
            onClick={onPrep}
            disabled={running}
            title={running ? "Available when the check finishes" : `Who you'll meet at ${result.name}, what they know, and your note`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-paper transition hover:bg-signal disabled:opacity-40"
          >
            <NotebookPen className="h-3.5 w-3.5" /> Prep
          </button>
        </span>
      )}
      </div>

      {open && !pending && (
        <div className="grid gap-6 border-t border-line bg-paper/50 p-5 lg:grid-cols-[1.35fr_1fr]">
          {/* Findings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="label !mb-0">Why</p>
              <SpeakButton text={() => spokenBriefing(result)} label="Listen to briefing" />
            </div>
            {result.resolved && <ContextLine activity={result.activity} />}
            {peopleTies.map((t) => (
              <Finding key={`${t.personId}-${t.competitor}`} tone="red" tag={t.side === "self" ? "Person · this is them" : "Person · on their team"} title={t.person}>
                <p className="mt-2 text-sm leading-relaxed text-ink/85">{t.text}.</p>
                <p className="mt-1 text-xs text-muted">
                  {t.side === "self"
                    ? "Matched to the same person record in Cala's graph, not just the same name."
                    : `Cala lists ${t.person} at ${result.name} and in ${t.competitor}'s leadership or board, as the same person record.`}
                </p>
                {t.source && <Sources sources={[t.source]} />}
              </Finding>
            ))}
            {result.direct.map((d) => (
              <Finding key={d.competitor} tone="red" tag="Direct" title={d.competitor}>
                <Reasons reasons={d.reasons} />
                <Sources sources={d.sources} />
              </Finding>
            ))}
            {result.leaks.map((l, i) => (
              <Finding
                key={`${l.via.id}-${l.competitor}-${i}`}
                tone={l.strengthLabel === "weak" ? "slate" : "amber"}
                tag={`Leak path · ${l.strengthLabel} ${l.strength}/100`}
                title={`via ${l.via.name}`}
              >
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                  <PathNode tone="ink">{result.name}</PathNode>
                  <span className="font-mono text-[11px] text-muted">
                    — {l.sharedRoundCount} shared round{l.sharedRoundCount === 1 ? "" : "s"} →
                  </span>
                  <PathNode tone="amber">{l.via.name}</PathNode>
                  <span className="font-mono text-[11px] text-muted">
                    — {l.viaLed ? "led" : "in"} {l.competitorRound?.label || "investor"} →
                  </span>
                  <PathNode tone="red">{l.competitor}</PathNode>
                </div>
                <Reasons reasons={l.reasons} />
                <Sources sources={l.sources} />
              </Finding>
            ))}
            {result.possible.map((p) => (
              <Finding
                key={p.company}
                tone="slate"
                tag={
                  p.judgedBy === "gemini"
                    ? `Lookalike · Gemini: ${p.verdict === "direct" ? "competes" : "adjacent"}`
                    : "Possible overlap"
                }
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
                <Sources sources={p.sources} />
              </Finding>
            ))}
            {slushRivals.map((c) => (
              <Finding key={`slush-${c.id}`} tone="red" tag={`${slushReport?.event.name || "Slush"} attendee`} title={c.name}>
                <p className="mt-2 text-sm leading-relaxed text-ink/85">
                  Cala has {result.name} on record as an investor in {c.name}, which is on the{" "}
                  {slushReport?.event.name} attendee list.
                </p>
                {c.what && <p className="mt-1 text-sm leading-relaxed text-muted">{c.what}</p>}
                {c.why && <p className="mt-1 text-xs text-muted">{c.verdict ? `Gemini: ${c.why}` : c.why}</p>}
                {c.source && <Sources sources={[c.source]} />}
              </Finding>
            ))}
            {nothingFound && (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                {result.resolved
                  ? stillChecking
                    ? "Nothing found so far. Co-investor and portfolio checks are still running."
                    : "No direct stake, no co-investor path and no lookalike portfolio company found."
                  : "Cala has no investment record under this name. Try the fund's legal name or a shorter spelling."}
              </p>
            )}
            {result.resolved && (
              <p className="pt-1 text-xs leading-relaxed text-muted">
                Matched to {result.entities.length > 1 ? `${result.entities.length} merged Cala records` : "Cala record"}
                : {result.entities.map((e) => `${e.name} (${e.type})`).join(", ")}, from {result.candidates}{" "}
                candidates. {result.scanNote}
              </p>
            )}
            {result.coverage && (
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-semibold text-ink/70">Data coverage:</span> Cala holds{" "}
                {result.coverage.has.length ? result.coverage.has.join(", ") : "little"} for this record
                {result.coverage.missing.length
                  ? `; no ${result.coverage.missing.join(" or ")}, so ${result.coverage.missing.includes("team") ? "conflicts through people can't be checked" : "this part could not be checked"}.`
                  : "."}
              </p>
            )}
          </div>

          {/* Advice */}
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-white/60 p-4">
              <p className="label flex items-center gap-1.5">
                <FileLock2 className="h-3.5 w-3.5" /> What to share
              </p>
              <p className="font-serif text-2xl leading-tight">{result.share.level}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{result.share.why}</p>
            </div>
            <div className="rounded-xl border border-ink bg-ink p-4 text-paper">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-paper/60">
                <MessageSquareQuote className="h-3.5 w-3.5" /> Ask this
              </p>
              <p className="font-serif text-xl leading-snug">&ldquo;{result.ask.question}&rdquo;</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="[&_button]:border-paper/25 [&_button]:text-paper/70 [&_button:hover]:border-paper [&_button:hover]:text-paper">
                  <CopyButton text={result.ask.question} />
                </span>
                {result.ask.source?.url && (
                  <a
                    href={result.ask.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[11px] text-paper/60 underline-offset-2 hover:text-paper hover:underline"
                  >
                    Based on {result.ask.source.label}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
                {result.ask.draftedBy === "gemini" && (
                  <span className="text-[11px] text-paper/50">Worded by Gemini from these findings</span>
                )}
              </div>
            </div>
            <ShareBriefButton runId={runId} investor={result.input} ready={!running && result.done.scan} />

          </div>
        </div>
      )}
    </li>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "run") return <span className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-ink" />;
  if (state === "wait") return <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caution" />;
  if (state === "warn") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caution" />;
  return <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clear" />;
}

// ---------- page ----------

export default function AppPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [investors, setInvestors] = useState<Record<string, InvestorResult>>({});
  const [competitors, setCompetitors] = useState<Record<string, CompetitorSummary>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [stats, setStats] = useState({ calls: 0, cached: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [runId, setRunId] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [prepFor, setPrepFor] = useState<InvestorResult | null>(null);
  const [ai, setAi] = useState<{ enabled: boolean; model?: string } | null>(null);
  const [watchState, setWatchState] = useState<{ busy: boolean; url?: string; error?: string }>({ busy: false });
  const [slush, setSlush] = useState<SlushReport | undefined>();
  const [tab, setTab] = useState<"investors" | "competitors" | "finder" | "slush" | "ask">("investors");
  const [finder, setFinder] = useState<FinderReport | undefined>();
  const [askStatus, setAskStatus] = useState<"idle" | "busy" | "ready">("idle");
  // Phones and tablets: the form lives in a left drawer.
  const [formOpen, setFormOpen] = useState(false);
  // Desktop: the form column can fold into a slim rail (remembered across visits).
  const [formCollapsed, setFormCollapsed] = useState(false);
  useEffect(() => {
    try {
      setFormCollapsed(localStorage.getItem("flipdd.formCollapsed") === "1");
    } catch {
      // storage may be unavailable
    }
  }, []);
  function toggleCollapsed(next: boolean) {
    setFormCollapsed(next);
    try {
      localStorage.setItem("flipdd.formCollapsed", next ? "1" : "0");
    } catch {
      // storage may be unavailable
    }
  }
  useEffect(() => {
    if (!formOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFormOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [formOpen]);
  // The meeting list as a cart: names added from Find investors since the last check.
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number; action?: { label: string; run: () => void } } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const [askSeen, setAskSeen] = useState(true);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (tab === "ask") setAskSeen(true);
    setFormOpen(false); // close the mobile drawer on navigation
  }, [tab]);
  const [live, setLive] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ oldestCachedAt?: number; fresh: boolean }>({ fresh: false });
  const [slushEvent, setSlushEvent] = useState<{ name: string; description?: string; attendees: number } | null>(null);
  useEffect(() => {
    fetch("/api/slush", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && typeof d.attendees === "number" && setSlushEvent(d))
      .catch(() => undefined);
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(0);

  const [autoRun, setAutoRun] = useState(false);
  // Read once: React runs effects twice in development, and the URL is cleaned below.
  const wantsExample = useRef<boolean | null>(null);
  // Set with the loaded form, so both reach the save effect in the same render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // /app?example=1 (from the landing page) loads the example and runs it.
    if (wantsExample.current === null) {
      wantsExample.current = new URLSearchParams(window.location.search).get("example") === "1";
    }
    if (wantsExample.current) {
      setForm(EXAMPLE);
      setAutoRun(true);
      window.history.replaceState(null, "", "/app");
      setHydrated(true);
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setForm({ ...EMPTY, ...JSON.parse(saved) });
    } catch {
      // ignore unreadable saved form
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    // Save only after the saved form was read, or the first (empty) render would overwrite it.
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // storage may be unavailable
    }
  }, [form, hydrated]);
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => setElapsed(Date.now() - startedRef.current), 500);
    return () => clearInterval(timer);
  }, [phase]);

  const investorList = useMemo(() => splitList(form.investors), [form.investors]);
  const competitorList = useMemo(() => splitList(form.competitors), [form.competitors]);

  // ----- competitor discovery -----
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredCompetitor[] | null>(null);
  const [discoverError, setDiscoverError] = useState("");
  const [discoverMeta, setDiscoverMeta] = useState<{ judgedBy: "gemini" | "cala"; dropped: number } | null>(null);
  const [discoverStarted, setDiscoverStarted] = useState(0);
  const [discoverTick, setDiscoverTick] = useState(0);
  useEffect(() => {
    if (!discovering) return;
    const id = setInterval(() => setDiscoverTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [discovering]);

  const [discoverModal, setDiscoverModal] = useState(false);
  const discoverAbort = useRef<AbortController | null>(null);
  async function discover() {
    if (discovering || form.description.trim().length < 15) return;
    const controller = new AbortController();
    discoverAbort.current = controller;
    // Give up after 2.5 minutes rather than spin forever behind a busy Cala queue.
    const timer = setTimeout(() => controller.abort("timeout"), 150_000);
    setDiscovering(true);
    setDiscoverModal(true);
    setDiscoverError("");
    setDiscovered(null);
    setDiscoverStarted(Date.now());
    setDiscoverTick(Date.now());
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupName: form.startupName, description: form.description }),
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => null)) as
        | { competitors?: DiscoveredCompetitor[]; judgedBy?: "gemini" | "cala"; dropped?: number; error?: string }
        | null;
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      setDiscovered(payload?.competitors || []);
      setDiscoverMeta({ judgedBy: payload?.judgedBy || "cala", dropped: payload?.dropped || 0 });
    } catch (err) {
      setDiscoverError(
        controller.signal.aborted
          ? controller.signal.reason === "timeout"
            ? "Cala's query endpoint did not answer in time (it may be busy with another search). Try again in a minute, or add competitors by hand."
            : "Search cancelled."
          : (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
      setDiscovering(false);
      setDiscoverModal(false);
    }
  }

  const listed = (name: string) => competitorList.some((c) => c.toLowerCase() === name.toLowerCase());
  function addCompetitors(items: DiscoveredCompetitor[]) {
    setForm((f) => {
      const current = splitList(f.competitors);
      const ids = { ...(f.competitorIds || {}) };
      for (const item of items) {
        if (current.length >= MAX_COMPETITORS) break;
        if (current.some((c) => c.toLowerCase() === item.name.toLowerCase())) continue;
        current.push(item.name);
        if (item.entityId) ids[item.name] = item.entityId;
      }
      return { ...f, competitors: current.join("\n"), competitorIds: ids };
    });
  }
  const running = phase === "running";

  function handle(event: AnalyzeEvent) {
    switch (event.type) {
      case "step":
        setSteps((s) => [...s, { scope: event.scope, text: event.text, state: event.state }]);
        break;
      case "investor":
        setInvestors((m) => ({ ...m, [event.data.input]: event.data }));
        break;
      case "competitor":
        setCompetitors((m) => ({ ...m, [event.data.input]: event.data }));
        break;
      case "stats":
        setStats({ calls: event.calls, cached: event.cached });
        setCacheInfo({ oldestCachedAt: event.oldestCachedAt, fresh: event.fresh });
        break;
      case "slush":
        setSlush(event.data);
        break;
      case "finder":
        setFinder(event.data);
        break;
      case "run":
        setRunId(event.id);
        break;
      case "ai":
        setAi({ enabled: event.enabled, model: event.model });
        break;
      case "done":
        setElapsed(event.ms);
        setPhase("done");
        break;
      case "error":
        setError(event.message);
        setPhase("error");
        // A refused key means every "not found" on screen is false: clear them.
        if (/refused/i.test(event.message)) {
          setInvestors({});
          setCompetitors({});
          setSlush(undefined);
          setFinder(undefined);
        }
        break;
    }
  }

  // ----- new check, undo, and recent checks -----
  const HISTORY_KEY = "flipdd.history.v1";
  interface HistoryEntry {
    id: string;
    startupName: string;
    competitors: string[];
    investors: number;
    conflicts: number;
    createdAt: string;
  }
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!historyOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-history]")) setHistoryOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [historyOpen]);
  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch {
      // unreadable history
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Record each finished check once it is saved on the server.
  useEffect(() => {
    if (phase !== "done" || !runId) return;
    const results = order.map((n) => investors[n]).filter(Boolean);
    if (!results.length) return;
    const entry: HistoryEntry = {
      id: runId,
      startupName: form.startupName || "Untitled check",
      competitors: competitorList,
      investors: results.length,
      conflicts: results.filter((r) => ["direct_high", "direct_moderate", "indirect"].includes(r.level)).length,
      createdAt: new Date().toISOString(),
    };
    setHistory((h) => {
      const next = [entry, ...h.filter((x) => x.id !== runId)].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // storage may be unavailable
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId]);

  function snapshot() {
    return { form, phase, error, order, investors, competitors, steps, stats, elapsed, runId, slush, finder, cacheInfo, ai };
  }
  function restore(snap: ReturnType<typeof snapshot>) {
    setForm(snap.form);
    setPhase(snap.phase);
    setError(snap.error);
    setOrder(snap.order);
    setInvestors(snap.investors);
    setCompetitors(snap.competitors);
    setSteps(snap.steps);
    setStats(snap.stats);
    setElapsed(snap.elapsed);
    setRunId(snap.runId);
    setSlush(snap.slush);
    setFinder(snap.finder);
    setCacheInfo(snap.cacheInfo);
    setAi(snap.ai);
  }
  function clearResults() {
    setPhase("idle");
    setError("");
    setOrder([]);
    setInvestors({});
    setCompetitors({});
    setSteps([]);
    setStats({ calls: 0, cached: 0 });
    setElapsed(0);
    setOpen({});
    setRunId("");
    setSlush(undefined);
    setFinder(undefined);
    setCacheInfo({ fresh: false });
    setWatchState({ busy: false });
    setAddedNames([]);
  }
  /** Clears the form and results for a new check, with an undo. */
  function newCheck() {
    if (running) return;
    const snap = snapshot();
    clearResults();
    setForm(EMPTY);
    setDiscovered(null);
    setTab("investors");
    toggleCollapsed(false);
    setFormOpen(true);
    setToast({ text: "Started a new check", key: Date.now(), action: { label: "Undo", run: () => restore(snap) } });
    setTimeout(() => document.getElementById("startupName")?.focus(), 80);
  }
  /** Reopens a saved check from the server, without asking Cala again. */
  async function openRun(id: string) {
    if (running) return;
    setHistoryOpen(false);
    try {
      const res = await fetch(`/api/run/${id}`, { cache: "no-store" });
      const doc = (await res.json()) as RunDoc & { error?: string };
      if (!res.ok) throw new Error(doc.error || `Failed (${res.status})`);
      const inputs = doc.investorInputs || doc.investors.map((r) => r.input);
      clearResults();
      setForm({
        startupName: doc.startupName,
        description: doc.description || "",
        competitors: doc.competitors.join("\n"),
        investors: inputs.join("\n"),
        competitorIds: {},
      });
      setOrder(inputs);
      setInvestors(Object.fromEntries(doc.investors.map((r) => [r.input, r])));
      setCompetitors(Object.fromEntries((doc.competitorSummaries || []).map((c) => [c.input, c])));
      setSteps((doc.log || []).map((l) => ({ scope: l.scope, text: l.text, state: l.state })));
      setStats({ calls: doc.stats?.calls || 0, cached: doc.stats?.cached || 0 });
      setCacheInfo({ oldestCachedAt: doc.stats?.oldestCachedAt, fresh: Boolean(doc.stats?.fresh) });
      setElapsed(doc.ms || 0);
      setSlush(doc.slush);
      setFinder(doc.finder);
      setRunId(doc.id);
      setPhase("done");
      setTab("investors");
      setFormOpen(false);
      setToast({ text: `Reopened ${doc.startupName || "a saved check"}`, key: Date.now(), action: { label: "Close", run: () => undefined } });
    } catch (err) {
      setHistory((h) => {
        const next = h.filter((x) => x.id !== id);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          // storage may be unavailable
        }
        return next;
      });
      setToast({ text: (err as Error).message, key: Date.now(), action: { label: "OK", run: () => undefined } });
    }
  }

  function addToList(name: string) {
    if (investorList.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    if (investorList.length >= LIST_MAX) {
      setToast({ text: `Your list is full (${LIST_MAX}). Remove someone first.`, key: Date.now() });
      setListOpen(true);
      return;
    }
    setForm((f) => ({ ...f, investors: [...splitList(f.investors), name].join("\n") }));
    setAddedNames((a) => [...a, name]);
    setToast({ text: `Added ${name} to your meeting list`, key: Date.now() });
  }
  function removeFromList(name: string) {
    setForm((f) => ({
      ...f,
      investors: splitList(f.investors)
        .filter((n) => n.toLowerCase() !== name.toLowerCase())
        .join("\n"),
    }));
    setAddedNames((a) => a.filter((n) => n.toLowerCase() !== name.toLowerCase()));
  }

  async function run() {
    if (!investorList.length || running) return;
    setFormOpen(false);
    setAddedNames([]);
    const controller = new AbortController();
    abortRef.current = controller;
    startedRef.current = Date.now();
    setPhase("running");
    setError("");
    setOrder(investorList);
    setInvestors({});
    setCompetitors({});
    setSteps([]);
    setStats({ calls: 0, cached: 0 });
    setElapsed(0);
    setOpen({});
    setRunId("");
    setWatchState({ busy: false });
    setSlush(undefined);
    setFinder(undefined);
    setCacheInfo({ fresh: live });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startupName: form.startupName,
          description: form.description,
          competitors: competitorList,
          competitorIds: form.competitorIds || {},
          investors: investorList,
          fresh: live,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as AnalyzeEvent);
        }
      }
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase("done");
      } else {
        setError((err as Error).message);
        setPhase("error");
      }
    }
  }

  async function startWatch() {
    setWatchState({ busy: true });
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupName: form.startupName, investors: investorList, competitors: competitorList }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setWatchState({ busy: false, url: body.url });
      window.open(body.url, "_blank", "noopener");
    } catch (err) {
      setWatchState({ busy: false, error: (err as Error).message });
    }
  }

  useEffect(() => {
    if (!autoRun || form.startupName !== EXAMPLE.startupName || form.investors !== EXAMPLE.investors) return;
    setAutoRun(false);
    wantsExample.current = false;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, form]);

  const rows = useMemo(() => {
    const list = order.map((key) => investors[key]).filter((r): r is InvestorResult => Boolean(r));
    const rank = (r: InvestorResult) => (r.done.direct ? LEVEL_RANK[r.level] : -1);
    return [...list].sort((a, b) => rank(b) - rank(a) || order.indexOf(a.input) - order.indexOf(b.input));
  }, [order, investors]);

  // The round as a whole, recomputed live as each investor's result arrives.
  const roundRisk = useMemo(() => computeRoundRisk(rows, slush), [rows, slush]);
  function openRow(input: string) {
    setTab("investors");
    setOpen((o) => ({ ...o, [input]: true }));
    setTimeout(
      () => document.getElementById(`row-${encodeURIComponent(input)}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  // What the Slush tab's badge counts, in words for its tooltip. Red: things to act on
  // (a named competitor attending, or a fund on the list backing a similar attendee).
  const slushAlert = useMemo(() => {
    if (!slush) return null;
    const named = slush.namedAttending.map((a) => a.name);
    const backed = slush.competitors.filter((c) => c.backedBy.length);
    const parts: string[] = [];
    if (named.length) parts.push(`${named.join(", ")} ${named.length === 1 ? "is" : "are"} attending ${slush.event.name}`);
    if (backed.length) {
      parts.push(`${backed.length} similar attendee${backed.length === 1 ? " is" : "s are"} backed by a fund on your list`);
    }
    const similar = slush.competitors.length;
    if (!parts.length && similar) parts.push(`${similar} attendee${similar === 1 ? " builds" : "s build"} something like yours`);
    if (!parts.length) return null;
    return { count: named.length + backed.length, similar, text: parts.join("; ") };
  }, [slush]);

  const visibleSteps = showAllSteps ? steps : steps.slice(-5);
  const competitorRows = competitorList.map((c) => competitors[c]).filter(Boolean);
  const hasRun = phase !== "idle";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-3">
          <Link href="/" className="flex items-center text-sm transition hover:opacity-75" aria-label="FlipDD home">
            <FlipLogo height={26} />
          </Link>
          <span className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted">
            {ai?.enabled && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1 text-[11px] text-ink/75 sm:inline-flex"
                title={`Gemini reviews lookalikes and words the questions${ai.model ? ` (${ai.model})` : ""}`}
              >
                <TwinGlyph size={12} />
                Gemini review
              </span>
            )}
            {hasRun && (
              <span
                className="hidden items-stretch divide-x divide-line overflow-hidden rounded-full border border-line bg-card/70 text-[11px] text-muted md:inline-flex"
                title={
                  cacheInfo.oldestCachedAt
                    ? `Oldest saved answer came from Cala ${new Date(cacheInfo.oldestCachedAt).toLocaleString("en-GB")}`
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5 px-3 py-1">
                  {running ? <LiveDot /> : <span className="h-2 w-2 rounded-full bg-clear" aria-hidden />}
                  <span className="font-semibold tabular-nums text-ink">{stats.calls}</span> live
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1">
                  {cacheInfo.fresh ? (
                    "cache off"
                  ) : (
                    <>
                      <span className="font-semibold tabular-nums text-ink">{stats.cached}</span> cached
                      {cacheInfo.oldestCachedAt && stats.cached > 0 && (
                        <span className="text-muted/80">· {fmtAge(Date.now() - cacheInfo.oldestCachedAt)}</span>
                      )}
                    </>
                  )}
                </span>
                <span className="inline-flex items-center px-3 py-1 font-mono font-semibold tabular-nums text-ink">
                  {fmtElapsed(elapsed)}
                </span>
              </span>
            )}
            {hasRun && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-2.5 py-1 text-[11px] tabular-nums text-ink/80 md:hidden">
                {running ? <LiveDot /> : <span className="h-2 w-2 rounded-full bg-clear" aria-hidden />}
                {stats.calls + stats.cached} · {fmtElapsed(elapsed)}
              </span>
            )}
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="hidden sm:inline-flex">
              <CalaLogo label="powered by" height={16} />
            </span>
            <span className="sm:hidden">
              <CalaLogo height={14} />
            </span>
            <button
              type="button"
              onClick={() => setFormOpen((o) => !o)}
              aria-expanded={formOpen}
              aria-controls="meeting-form"
              aria-label={formOpen ? "Close the form" : "Open the form"}
              className="burger lg:hidden"
              data-open={formOpen ? "true" : "false"}
            >
              <span />
              <span />
              <span />
            </button>
          </span>
        </div>
      </header>

      {/* Mobile drawer backdrop */}
      <button
        type="button"
        aria-label="Close the form"
        onClick={() => setFormOpen(false)}
        className={`fixed inset-0 z-40 bg-night/45 backdrop-blur-[2px] transition-opacity lg:hidden ${
          formOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`grid gap-6 px-3 py-4 sm:py-6 lg:gap-8 lg:py-8 ${
          formCollapsed ? "lg:grid-cols-[56px_1fr]" : "lg:grid-cols-[380px_1fr]"
        }`}
      >
        {/* Form: a left drawer on phones and tablets, a sticky column on desktop */}
        <aside
          id="meeting-form"
          className={`fixed inset-y-0 left-0 z-50 h-[100dvh] w-[min(88vw,380px)] overflow-y-auto bg-paper p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] lg:static lg:z-auto lg:h-auto lg:w-auto lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:sticky lg:top-20 lg:self-start ${
            formOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1 lg:hidden">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Your meeting list</span>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted"
            >
              Close
            </button>
          </div>
          {/* Desktop rail when the form is folded */}
          {formCollapsed && (
            <div className="hidden flex-col items-center gap-3 rounded-3xl border border-line bg-card py-4 lg:flex">
              <button
                type="button"
                onClick={() => toggleCollapsed(false)}
                className="rounded-full p-2 text-muted transition hover:bg-ink/5 hover:text-ink"
                aria-label="Expand the meeting list form"
                title="Expand"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <span className="font-serif text-2xl leading-none tabular-nums" title={`${investorList.length} investors on your list`}>
                {investorList.length}
              </span>
              <button
                type="button"
                onClick={() => toggleCollapsed(false)}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted [writing-mode:vertical-rl] hover:text-ink"
              >
                Meeting list
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className={`rounded-3xl border border-line bg-card p-5 ${formCollapsed ? "lg:hidden" : ""}`}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <h1 className="font-serif text-3xl leading-none">Check your meeting list</h1>
              <div className="relative flex shrink-0 items-center gap-1" data-history>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  disabled={running}
                  aria-expanded={historyOpen}
                  className="rounded-full p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                  aria-label="Recent checks"
                  title="Recent checks"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={newCheck}
                  disabled={running}
                  className="rounded-full p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                  aria-label="New check"
                  title="New check (clears the form)"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                {historyOpen && (
                  <div className="absolute right-0 top-9 z-30 w-[300px] overflow-hidden rounded-2xl border border-line bg-card shadow-xl animate-pop">
                    <p className="border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Recent checks</p>
                    {history.length ? (
                      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                        {history.map((h) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              onClick={() => openRun(h.id)}
                              className={`w-full px-4 py-2.5 text-left transition hover:bg-ink/[0.03] ${h.id === runId ? "bg-ink/[0.04]" : ""}`}
                            >
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-semibold">{h.startupName}</span>
                                <span className="shrink-0 font-mono text-[10px] text-muted">
                                  {new Date(h.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {h.investors} investors vs {h.competitors.join(", ") || "no competitors"}
                                {h.conflicts ? <span className="text-signal"> · {h.conflicts} tied</span> : " · none tied"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-4 text-sm text-muted">Finished checks appear here, so you can reopen them without waiting.</p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setForm(EXAMPLE)}
                  disabled={running}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  Load example
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(true)}
                  className="hidden rounded-full p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink lg:inline-flex"
                  aria-label="Collapse the meeting list form"
                  title="Collapse"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            <label className="label" htmlFor="startupName">
              Your startup
            </label>
            <input
              id="startupName"
              className="field"
              placeholder="Name"
              value={form.startupName}
              onChange={(e) => setForm({ ...form, startupName: e.target.value })}
            />
            <textarea
              className="field mt-2 min-h-[76px] resize-y"
              placeholder="What you build, in a sentence or two"
              aria-label="What you build"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <label className="label mt-5" htmlFor="competitors">
              Competitors <span className="font-normal normal-case tracking-normal">(up to {MAX_COMPETITORS})</span>
            </label>
            <textarea
              id="competitors"
              className="field min-h-[60px] resize-y"
              placeholder={"One per line, or find them below"}
              value={form.competitors}
              onChange={(e) => setForm({ ...form, competitors: e.target.value })}
            />
            <button
              type="button"
              onClick={discover}
              disabled={discovering || running || form.description.trim().length < 15}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink/30 px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-ink hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScoutGlyph size={16} />}
              {discovering
                ? `Searching Cala's graph… ${Math.max(0, Math.floor((discoverTick - discoverStarted) / 1000))}s`
                : "Find competitors from your description"}
            </button>
            <WaitModal
              open={discoverModal}
              title="Finding your competitors"
              subtitle={form.description}
              centerLabel={form.startupName || "Your startup"}
              hints={["Funded companies", "What they build", "Total funding", "Latest rounds", "Countries", "Graph records"]}
              expected="about a minute"
              slowAfter={75}
              onHide={() => setDiscoverModal(false)}
              onCancel={() => discoverAbort.current?.abort("cancel")}
            />
            {discovering && (
              <p className="mt-1.5 text-xs text-muted">
                Cala is matching your description against funded companies. This takes about a minute.
              </p>
            )}
            {discoverError && <p className="mt-2 rounded-lg bg-signal/10 px-3 py-2 text-xs text-signal">{discoverError}</p>}
            {discovered && (
              <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white/50">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-xs font-semibold">
                    {discovered.length ? `${discovered.length} companies found in Cala` : "No competitors found"}
                    {discoverMeta?.judgedBy === "gemini" && (
                      <span className="ml-1.5 font-normal text-muted">
                        · checked by Gemini{discoverMeta.dropped ? `, ${discoverMeta.dropped} dropped` : ""}
                      </span>
                    )}
                  </span>
                  {discovered.length > 0 && (
                    <button
                      type="button"
                      onClick={() => addCompetitors(discovered)}
                      className="text-xs font-semibold text-signal hover:underline"
                    >
                      Add all
                    </button>
                  )}
                </div>
                <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                  {discovered.map((c) => {
                    const added = listed(c.name);
                    return (
                      <li key={c.name} className="flex items-start gap-2.5 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight">
                            {c.label}
                            {!c.entityId && (
                              <span className="ml-1.5 text-[10px] font-normal text-muted">no graph record</span>
                            )}
                          </p>
                          {c.atSlush && (
                            <span className="mr-1 mt-1 inline-flex items-center gap-0.5 rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold text-paper">
                              <MapPin className="h-2.5 w-2.5" /> At {c.atSlush}
                            </span>
                          )}
                          {c.verdict && (
                            <span
                              className={`mt-1 inline-block rounded-full px-1.5 py-px text-[10px] font-semibold ${
                                c.verdict === "direct" ? "bg-signal/10 text-signal" : "bg-caution/10 text-caution"
                              }`}
                            >
                              {c.verdict === "direct" ? "Competes directly" : "Adjacent"}
                            </span>
                          )}
                          {(c.why || c.what) && (
                            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{c.why || c.what}</p>
                          )}
                          {(c.country || c.funding) && (
                            <p className="mt-1 font-mono text-[10.5px] text-ink/60">
                              {[c.country, c.funding].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            added
                              ? setForm((f) => ({
                                  ...f,
                                  competitors: splitList(f.competitors)
                                    .filter((n) => n.toLowerCase() !== c.name.toLowerCase())
                                    .join("\n"),
                                }))
                              : addCompetitors([c])
                          }
                          disabled={!added && competitorList.length >= MAX_COMPETITORS}
                          className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
                            added ? "bg-ink text-paper" : "border border-ink/25 hover:border-ink"
                          }`}
                        >
                          {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {added ? "Added" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="label mt-5" htmlFor="investors">
              Investors you are meeting <span className="font-normal normal-case tracking-normal">(up to 12)</span>
            </label>
            <textarea
              id="investors"
              className="field min-h-[132px] resize-y font-mono text-[13px]"
              placeholder={"One per line"}
              value={form.investors}
              onChange={(e) => setForm({ ...form, investors: e.target.value })}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Same investor under two names? Join them with +, e.g.{" "}
              <span className="font-mono text-ink/80">a16z crypto + Andreessen Horowitz</span>.
            </p>

            <div className="mt-5 flex items-center gap-2">
              <button type="submit" disabled={running || !investorList.length} className="btn-primary flex-1">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? "Checking…" : `Check ${investorList.length || ""} investor${investorList.length === 1 ? "" : "s"}`}
              </button>
              {running && (
                <button type="button" onClick={() => abortRef.current?.abort()} className="btn-ghost !px-4" aria-label="Stop">
                  <Square className="h-4 w-4" />
                </button>
              )}
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
                disabled={running}
                className="mt-0.5 accent-[#16130E]"
              />
              <span>
                <span className="font-semibold text-ink">Ask Cala live.</span> Skip answers saved in the last 24 hours
                and fetch every record again. Slower, but nothing is older than this run.
              </span>
            </label>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Every result comes from Cala during the run. Answers are saved for a day so repeat checks are quick;
              the header shows how many calls were live and how old the saved ones are.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Also works from Claude or Cursor: add <span className="font-mono text-ink/80">/api/mcp</span> on this
              site as an MCP server.
            </p>
            <OwnCalaKey open={/credits|refused/i.test(error)} />
          </form>
        </aside>

        {/* Results */}
        <main className="min-w-0 lg:pr-[4.25rem]">
          {/* Tabs */}
          {/* Phones and tablets: what is being checked, with the two actions that matter */}
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-card p-3 lg:hidden">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{form.startupName || "Your startup"}</p>
              <p className="truncate text-xs text-muted">
                {investorList.length} investor{investorList.length === 1 ? "" : "s"}
                {competitorList.length ? ` vs ${competitorList.slice(0, 2).join(", ")}${competitorList.length > 2 ? ` +${competitorList.length - 2}` : ""}` : " · no competitors yet"}
              </p>
            </div>
            <button type="button" onClick={() => setFormOpen(true)} className="btn-ghost !min-h-[40px] !px-3 !py-2 !text-xs">
              Edit list
            </button>
            <button
              type="button"
              onClick={run}
              disabled={running || !investorList.length}
              className="btn-primary !min-h-[40px] !px-3 !py-2 !text-xs"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Checking" : "Check"}
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Results"
            className="no-scrollbar -mx-3 mb-5 flex items-center gap-1 overflow-x-auto border-b border-line px-3 lg:mx-0 lg:px-0"
          >
            {(
              [
                ["investors", `Investors${rows.length ? ` · ${rows.length}` : ""}`],
                ["competitors", `Competitors${competitorRows.length ? ` · ${competitorRows.length}` : ""}`],
                ["finder", `Find investors${finder ? ` · ${finder.candidates.length}` : ""}`],
                [
                  "slush",
                  "Slush 2026",
                ],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
                  tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {key === "slush" && <MapPin className="h-3.5 w-3.5" />}
                {key === "competitors" && <Radar className="h-3.5 w-3.5" />}
                {key === "finder" && <ShieldCheck className="h-3.5 w-3.5" />}
                {label}
                {key === "slush" && running && !slush && <Loader2 className="h-3 w-3 animate-spin" />}
                {key === "finder" && running && !finder && <Loader2 className="h-3 w-3 animate-spin" />}
                {key === "slush" && slushAlert && (
                  <span
                    title={slushAlert.text}
                    aria-label={slushAlert.text}
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      slushAlert.count ? "bg-signal text-white" : "bg-ink/10 text-ink/70"
                    }`}
                  >
                    {slushAlert.count || slushAlert.similar}
                  </span>
                )}
              </button>
            ))}
          </div>


          {/* Kept mounted on other tabs, so a running question keeps its answer. */}
          <div className="hidden">
            <AskCalaPanel
              startupName={form.startupName}
              description={form.description}
              competitors={competitorList}
              investors={investorList}
              onStatus={(st) => {
                setAskStatus(st);
                if (st === "ready" && tabRef.current === "ask") setAskSeen(true);
                if (st === "busy") setAskSeen(false);
              }}
            />
          </div>

          {!hasRun && tab === "slush" && (
            <div className="overflow-hidden rounded-3xl border border-ink bg-ink text-paper">
              <Art name="empty-slush" alt="A conference hall in Helsinki" className="aspect-[21/9] w-full object-cover" />
              <div className="p-8">
              <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/55">
                <MapPin className="h-3.5 w-3.5" /> {slushEvent?.name || "Slush 2026"}
              </p>
              <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight">
                {slushEvent
                  ? `${slushEvent.attendees.toLocaleString("en-GB")} companies are on the attendee list. See which ones compete with you.`
                  : "Reading the Slush 2026 attendee list from Cala…"}
              </h2>
              {slushEvent?.description && <p className="mt-3 max-w-2xl text-sm text-paper/60">{slushEvent.description}</p>}
              <ul className="mt-6 space-y-2 text-sm text-paper/80">
                <li>· Which of your competitors are attending</li>
                <li>· Attendees that build something like yours, checked against their own Cala record</li>
                <li>· Which investors on your list back them</li>
                <li>· Your investors&apos; portfolio companies at the event, for reference calls</li>
              </ul>
              <p className="mt-6 text-sm text-paper/60">
                Fill in the form and press Check. The Slush results appear here while the check runs.
              </p>
              </div>
            </div>
          )}

          {!hasRun && (tab === "competitors" || tab === "finder") && (
            <div className="dots flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-line p-10 text-center">
              <Art
                key={tab}
                name={tab === "competitors" ? "empty-competitors" : "empty-finder"}
                alt=""
                className="mb-7 w-full max-w-md rounded-2xl"
              />
              <h2 className="max-w-lg font-serif text-3xl leading-tight">
                {tab === "competitors"
                  ? "Who just raised, how much, and from whom."
                  : "Investors who know your market, with no tie to your competitors."}
              </h2>
              <p className="mt-3 max-w-md text-sm text-muted">
                {tab === "competitors"
                  ? "Each competitor's rounds with amount, valuation and lead investor, its acquisitions and its leadership, with the funds on your list highlighted."
                  : "FlipDD finds the investors behind companies near yours (same customers, not on your competitor list), then checks each one the way it checks your list: no stake in a competitor, nobody on a competitor's board, no co-investor path."}
              </p>
              <button type="button" onClick={() => setForm(EXAMPLE)} className="btn-ghost mt-6">
                Load an example
              </button>
            </div>
          )}

          {!hasRun && tab === "investors" && (
            <div className="dots flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-line p-10 text-center">
              <Art name="empty-investors" alt="" className="mb-7 w-full max-w-md rounded-2xl" />
              <h2 className="max-w-md font-serif text-4xl leading-tight">
                Your investors, ranked by how careful to be.
              </h2>
              <p className="mt-4 max-w-md text-muted">
                Each row will show the conflict found, the reasons behind it, what to share, and a question
                to ask, with a link to every source.
              </p>
              <button type="button" onClick={() => setForm(EXAMPLE)} className="btn-ghost mt-7">
                Load an example
              </button>
            </div>
          )}

          {hasRun && tab !== "ask" && (
            <div className="space-y-5">
              {/* Live scan while the check runs */}
              {running && tab === "investors" && (
                <LiveScan
                  startupName={form.startupName}
                  order={order}
                  results={investors}
                  competitors={competitorList}
                  latestStep={steps[steps.length - 1]}
                  calls={stats.calls}
                  cached={stats.cached}
                  elapsedMs={elapsed}
                />
              )}

              {/* Status (the live scan covers this while a check runs) */}
              {!(running && tab === "investors") && (
                <>
              <div className="rounded-2xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm font-semibold">
                    {running ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : phase === "error" ? (
                      <AlertTriangle className="h-4 w-4 text-signal" />
                    ) : (
                      <Check className="h-4 w-4 text-clear" />
                    )}
                    {running
                      ? `Checking ${order.length} investor${order.length === 1 ? "" : "s"} against ${competitorList.length} competitor${competitorList.length === 1 ? "" : "s"}`
                      : phase === "error"
                        ? "The check stopped"
                        : `Checked ${order.length} investor${order.length === 1 ? "" : "s"} in ${fmtElapsed(elapsed)}`}
                  </div>
                  <div className="flex items-center gap-3">
                    {(running ? steps.length > 5 : steps.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setShowAllSteps((v) => !v)}
                        className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        {showAllSteps ? (running ? "Show recent steps" : "Hide steps") : `Show all ${steps.length} steps`}
                      </button>
                    )}
                    {!running && (
                      <button
                        type="button"
                        onClick={newCheck}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> New check
                      </button>
                    )}
                  </div>
                </div>
                {error && (
                  <div className="mt-3 rounded-lg bg-signal/10 px-3 py-2 text-sm text-signal">
                    <p>{error}</p>
                    {/credits|refused/i.test(error) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormOpen(true);
                          toggleCollapsed(false);
                          setTimeout(() => document.getElementById("own-cala-key")?.scrollIntoView({ block: "center" }), 120);
                        }}
                        className="mt-2 inline-flex items-center rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:bg-signal"
                      >
                        Use your own Cala key and try again
                      </button>
                    )}
                  </div>
                )}
                {visibleSteps.length > 0 && (running || showAllSteps) && (
                  <ul className={`mt-3 space-y-1.5 border-t border-line pt-3 ${showAllSteps ? "max-h-72 overflow-y-auto" : ""}`}>
                    {visibleSteps.map((s, i) => (
                      <li key={`${steps.length}-${i}`} className="flex items-start gap-2.5 text-xs leading-relaxed">
                        <StepIcon state={!running && s.state === "run" ? "ok" : s.state} />
                        <span>
                          <span className="font-semibold">{s.scope}</span>
                          <span className="text-muted"> · {s.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
                </>
              )}

              {/* Competitors */}
              {competitorRows.length > 0 && tab === "competitors" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label !mb-0">Competitors</span>
                  {competitorRows.map((c) => (
                    <span
                      key={c.input}
                      title={c.description || undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                        c.resolved ? "border-signal/30 bg-signal/5" : "border-dashed border-line text-muted"
                      }`}
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-muted">
                        {c.resolved
                          ? `${c.status === "unknown" ? "status not recorded" : c.status} · ${c.roundsRecorded} rounds · ${c.investorsRecorded} investors on record`
                          : "not found in Cala"}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {tab === "competitors" && <RadarPanel competitors={competitorRows} running={running} />}

              {tab === "finder" && (
                <FinderPanel
                  report={finder}
                  running={running}
                  listed={(name) => investorList.some((n) => n.toLowerCase() === name.toLowerCase())}
                  onAdd={addToList}
                  onRemove={(name) => {
                    removeFromList(name);
                    setToast({ text: `Removed ${name} from your meeting list`, key: Date.now() });
                  }}
                />
              )}

              {tab === "slush" && (
                <SlushPanel
                  report={slush}
                  rows={rows}
                  competitors={competitorRows}
                  running={running}
                  hasDescription={form.description.trim().length >= 15}
                />
              )}

              {tab === "investors" && (
                <>
              {/* The round as a whole */}
              <RoundRiskPanel
                risk={roundRisk}
                running={running}
                daySpeech={() => spokenDay(rows, roundRisk)}
                onSelect={(name) => {
                  const row = rows.find((r) => r.name === name || r.input === name);
                  if (row) openRow(row.input);
                }}
              />

              {/* Map, on request */}
              {rows.length > 0 && !running && (
                <button type="button" onClick={() => setShowMap((v) => !v)} className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
                  {showMap ? "Hide the map" : "Show how they connect (map)"}
                </button>
              )}
              {rows.length > 0 && showMap && (
                <ConflictMap
                  rows={rows}
                  competitors={competitorRows}
                  startupName={form.startupName}
                  onSelect={openRow}
                />
              )}

              {/* Rows */}
              <ol className="space-y-3">
                {rows.map((r, i) => (
                  <InvestorRow
                    key={r.input}
                    rank={i + 1}
                    result={r}
                    running={running}
                    open={Boolean(open[r.input])}
                    onToggle={() => setOpen((o) => ({ ...o, [r.input]: !o[r.input] }))}
                    runId={runId}
                    slushReport={slush}
                    onPrep={() => setPrepFor(r)}
                  />
                ))}
              </ol>
              {prepFor && (
                <MeetingPrepPanel
                  investor={rows.find((x) => x.input === prepFor.input) || prepFor}
                  competitors={competitorRows}
                  startupName={form.startupName}
                  description={form.description}
                  runId={runId}
                  onClose={() => setPrepFor(null)}
                />
              )}

                </>
              )}

              {/* Keep watching */}
              {tab === "investors" && phase === "done" && competitorList.length > 0 && (
                <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <BellRing className="h-4 w-4" /> Keep watching this list
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      Cala&apos;s records cover rounds already on file. A watchlist reads live news through
                      Context.dev and flags it when a fund you are meeting turns up in a competitor&apos;s new round.
                    </p>
                    {watchState.error && <p className="mt-2 text-xs text-signal">{watchState.error}</p>}
                  </div>
                  {watchState.url ? (
                    <a href={watchState.url} target="_blank" rel="noopener noreferrer" className="btn-ghost shrink-0">
                      Open watchlist
                    </a>
                  ) : (
                    <button type="button" onClick={startWatch} disabled={watchState.busy} className="btn-primary shrink-0">
                      {watchState.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                      Watch for new rounds
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {/* Meeting list cart */}
      {investorList.length > 0 && (addedNames.length > 0 || tab === "finder") && !listOpen && (
        <MeetingListButton count={investorList.length} added={addedNames.length} onOpen={() => setListOpen(true)} />
      )}
      <MeetingListDrawer
        open={listOpen}
        onClose={() => setListOpen(false)}
        investors={investorList}
        results={investors}
        added={addedNames}
        running={running}
        onRemove={removeFromList}
        onCheck={() => {
          setListOpen(false);
          setTab("investors");
          window.scrollTo({ top: 0, behavior: "smooth" });
          run();
        }}
      />
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-[calc(11.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 flex items-center gap-3 rounded-xl bg-night px-4 py-3 text-sm text-paper shadow-xl animate-rise sm:bottom-[5.5rem] sm:left-auto sm:right-24"
          role="status"
        >
          <Check className="h-4 w-4 text-[#7CC4A4]" />
          {toast.text}
          <button
            type="button"
            onClick={() => {
              if (toast.action) toast.action.run();
              else setListOpen(true);
              setToast(null);
            }}
            className="font-semibold text-paper underline-offset-2 hover:underline"
          >
            {toast.action ? toast.action.label : "View list"}
          </button>
        </div>
      )}
      <ContactDock raised />
    </div>
  );
}
