"use client";

// Find investors tab: funds that back companies like the founder's and have
// passed the same conflict checks as the founder's own list. The dropped ones
// are shown too, so the founder sees the filter at work.

import { useState } from "react";
import { Check, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import type { FinderReport, InvestorKind } from "@/lib/types";

const KIND_LABEL: Record<InvestorKind, string> = {
  fund: "VC fund",
  angel: "Angel",
  lender: "Lender",
  grant: "Grant programme",
  corporate: "Corporate investor",
};

export default function FinderPanel({
  report,
  running,
  onAdd,
  onRemove,
  listed,
}: {
  report?: FinderReport;
  running: boolean;
  /** Adds the investor to the founder's meeting list. */
  onAdd: (name: string) => void;
  /** Takes it off again (undo a mistaken add). */
  onRemove: (name: string) => void;
  listed: (name: string) => boolean;
}) {
  const [showDropped, setShowDropped] = useState(false);
  if (!report) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
        {running && <Loader2 className="mb-3 h-5 w-5 animate-spin text-muted" />}
        <p className="max-w-md text-sm text-muted">
          {running
            ? "Finding investors who back companies near yours, then checking each one against your competitors. This runs after the portfolio scans."
            : "Run a check with a description of what you build to find investors with no tie to your competitors."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ink bg-ink p-5 text-paper">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/55">
          <ShieldCheck className="h-3.5 w-3.5" /> Clean investors
        </p>
        <h2 className="mt-2 max-w-3xl font-serif text-3xl leading-tight">
          {report.candidates.length
            ? `${report.candidates.length} investor${report.candidates.length === 1 ? "" : "s"} who know your market and have no tie to your competitors`
            : "No clean investor found yet"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-paper/60">
          {report.considered} investors back companies near yours in Cala&apos;s graph: same customers, but not on your
          competitor list. Each one shortlisted was opened and checked like your own list: no stake in a competitor or in
          a company that competes with you directly, nobody on a competitor&apos;s board, no co-investor path.{" "}
          {report.excluded.length} were dropped.
        </p>
      </div>

      {report.note && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{report.note}</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {report.candidates.map((c) => {
          const added = listed(c.name);
          return (
            <li key={c.id} className="flex flex-col rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {KIND_LABEL[c.kind]} · {c.roundsRecorded} rounds on record
                    {c.lastRound ? ` · last ${c.lastRound.label}, ${c.lastRound.date.slice(0, 7)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (added ? onRemove(c.name) : onAdd(c.name))}
                  title={added ? "Remove from your meeting list" : "Add to your meeting list"}
                  className={`group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    added ? "bg-ink text-paper hover:bg-signal" : "border border-ink/25 hover:border-ink"
                  }`}
                >
                  {added ? (
                    <>
                      <Check className="h-3 w-3 group-hover:hidden" />
                      <X className="hidden h-3 w-3 group-hover:inline" />
                      <span className="group-hover:hidden">On your list</span>
                      <span className="hidden group-hover:inline">Remove</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      Add to list
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink/85">{c.why}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.similar.slice(0, 5).map((s) => (
                  <span key={s.name} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-ink/75 ring-1 ring-inset ring-line">
                    {s.name}
                    <span className="ml-1 text-muted">{s.via === "slush" ? "· at Slush" : s.via === "query" ? "· Cala query" : "· adjacent"}</span>
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-1 border-t border-line pt-2">
                {c.checks.map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-xs text-ink/75">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-clear" />
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {report.excluded.length > 0 && (
        <div className="rounded-xl border border-line bg-card p-4">
          <button
            type="button"
            onClick={() => setShowDropped((v) => !v)}
            className="text-sm font-semibold underline-offset-2 hover:underline"
          >
            {showDropped ? "Hide" : "Show"} the {report.excluded.length} investors dropped for ties to your competitors
          </button>
          {showDropped && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {report.excluded.map((x) => (
                <li key={`${x.name}-${x.reason}`} className="flex items-start gap-1.5 text-xs">
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                  <span>
                    <span className="font-semibold">{x.name}</span> <span className="text-muted">· {x.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted">
        &ldquo;Companies near yours&rdquo; are ones Gemini judged adjacent (same buyers, different product), found in your
        meetings&apos; portfolios, among Slush attendees and through Cala&apos;s query endpoint. Companies it judged direct
        competitors are treated as competitors, and their backers are dropped. Add a fund to your list to get its full
        verdict.
      </p>
    </div>
  );
}
