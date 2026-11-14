"use client";

// The check while it runs: one row per investor, three stages filling in as
// Cala answers (lookup, co-investor paths, portfolio), and the verdict as soon
// as it is known. Everything shown comes from the live run.

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { LEVEL_LABEL, type InvestorResult, type Level } from "@/lib/types";
import { LinkGlyph, LiveDot, SealGlyph, TwinGlyph, WatchGlyph } from "./Glyphs";

const CHIP: Record<Level, string> = {
  direct_high: "bg-signal text-white",
  direct_moderate: "bg-signal/10 text-signal ring-1 ring-inset ring-signal/30",
  indirect: "bg-caution/10 text-caution ring-1 ring-inset ring-caution/30",
  possible: "bg-ink/5 text-ink/75 ring-1 ring-inset ring-ink/15",
  thin: "text-muted ring-1 ring-inset ring-line",
  unresolved: "text-muted ring-1 ring-inset ring-line",
  clear: "bg-clear/10 text-clear ring-1 ring-inset ring-clear/30",
};
const BAR: Record<Level, string> = {
  direct_high: "bg-signal",
  direct_moderate: "bg-signal/60",
  indirect: "bg-caution",
  possible: "bg-ink/35",
  thin: "bg-ink/15",
  unresolved: "bg-ink/15",
  clear: "bg-clear",
};
function glyph(level: Level): ReactNode {
  if (level === "direct_high" || level === "direct_moderate") return <WatchGlyph size={13} />;
  if (level === "indirect") return <LinkGlyph size={13} />;
  if (level === "possible") return <TwinGlyph size={13} />;
  if (level === "clear") return <SealGlyph size={13} />;
  return null;
}

const STAGES = ["Lookup", "Co-investors", "Portfolio"] as const;

function stageState(r: InvestorResult | undefined, i: number): "done" | "active" | "todo" {
  const flags = [Boolean(r?.done.direct), Boolean(r?.done.leaks), Boolean(r?.done.scan)];
  if (flags[i]) return "done";
  const firstOpen = flags.findIndex((f) => !f);
  return firstOpen === i ? "active" : "todo";
}

function Stage({ state }: { state: "done" | "active" | "todo" }) {
  return (
    <span className="relative flex h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
      <span
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${
          state === "done" ? "w-full bg-ink" : state === "active" ? "w-1/2 bg-ink/40 skeleton" : "w-0"
        }`}
      />
    </span>
  );
}

export default function LiveScan({
  order,
  results,
  competitors,
  latestStep,
  calls,
  cached,
  elapsedMs,
}: {
  startupName?: string;
  order: string[];
  results: Record<string, InvestorResult>;
  competitors: string[];
  latestStep?: { scope: string; text: string };
  calls: number;
  cached: number;
  elapsedMs: number;
}) {
  const verdicts = order.filter((n) => results[n]?.done.direct).length;
  const finished = order.filter((n) => results[n]?.done.scan).length;
  const tied = order.filter((n) => {
    const r = results[n];
    return r?.done.direct && ["direct_high", "direct_moderate", "indirect"].includes(r.level);
  }).length;
  const s = Math.floor(elapsedMs / 1000);
  const time = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
  const against =
    competitors.length === 0
      ? "your description"
      : competitors.length <= 2
        ? competitors.join(" and ")
        : `${competitors.slice(0, 2).join(", ")} +${competitors.length - 2}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card" aria-live="polite">
      {/* Header */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <LiveDot /> Checking now
          </p>
          <h2 className="mt-2 font-serif text-[1.75rem] leading-tight">
            {order.length} investor{order.length === 1 ? "" : "s"} against {against}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {verdicts} of {order.length} verdicts in
            {tied ? ` · ${tied} tied to a competitor so far` : ""}
            {finished < order.length && verdicts === order.length ? " · reading portfolios" : ""}
          </p>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-6 text-right">
          {[
            [String(calls), "Live calls"],
            [String(calls + cached), "Records read"],
            [time, "Elapsed"],
          ].map(([v, l]) => (
            <div key={l}>
              <dd className="font-serif text-3xl leading-none tabular-nums">{v}</dd>
              <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{l}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* One segment per investor */}
      <div className="flex gap-1 px-5" aria-hidden>
        {order.map((n) => {
          const r = results[n];
          return (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                r?.done.direct ? BAR[r.level] : "bg-line skeleton"
              } ${r?.done.direct && !r.done.scan ? "opacity-60" : ""}`}
            />
          );
        })}
      </div>

      {/* Rows */}
      <div className="mt-4 border-t border-line">
        <div className="hidden grid-cols-[minmax(0,1fr)_240px_minmax(0,1.3fr)] gap-6 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted md:grid">
          <span>Investor</span>
          <span className="grid grid-cols-3 gap-1.5">
            {STAGES.map((st) => (
              <span key={st}>{st}</span>
            ))}
          </span>
          <span>Verdict</span>
        </div>
        <ul className="divide-y divide-line">
          {order.map((n) => {
            const r = results[n];
            const done = Boolean(r?.done.direct);
            return (
              <li key={n} className="grid gap-2 px-5 py-3 md:grid-cols-[minmax(0,1fr)_240px_minmax(0,1.3fr)] md:items-center md:gap-6">
                <span className="truncate text-sm font-semibold">{r?.name || n}</span>
                <span className="flex items-center gap-1.5" aria-label={STAGES.map((st, i) => `${st}: ${stageState(r, i)}`).join(", ")}>
                  {STAGES.map((st, i) => (
                    <Stage key={st} state={stageState(r, i)} />
                  ))}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {done ? (
                    <>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold animate-pop ${CHIP[r!.level]}`}>
                        {glyph(r!.level)}
                        {LEVEL_LABEL[r!.level]}
                      </span>
                      <span className="truncate text-xs text-muted">{r!.headline}</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" /> Looking up in Cala
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Latest real step */}
      <div className="flex items-center gap-2 border-t border-line bg-paper/60 px-5 py-2.5 text-xs">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Latest</span>
        <span className="min-w-0 truncate text-ink/80">
          {latestStep ? (
            <>
              <span className="font-semibold">{latestStep.scope}</span> · {latestStep.text}
            </>
          ) : (
            "Looking up your investors in Cala…"
          )}
        </span>
      </div>
    </section>
  );
}
