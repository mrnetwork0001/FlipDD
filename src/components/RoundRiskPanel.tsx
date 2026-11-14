"use client";

// "Your round": the meeting list as a whole. How many meetings sit within one
// step of a competitor, which co-investor ties several of them together, who
// is likeliest to lead, and the order to take the meetings in. Computed by
// computeRoundRisk from the same results as the rows below.

import { Crown, GitMerge, Loader2, Route } from "lucide-react";
import type { Exposure, RoundRisk } from "@/lib/types";
import SpeakButton from "./SpeakButton";

const EXPOSURE_STYLE: Record<Exposure, { block: string; dot: string; label: string }> = {
  direct: { block: "bg-signal text-white", dot: "bg-signal", label: "Stake in a competitor" },
  one_step: { block: "bg-caution text-white", dot: "bg-caution", label: "One co-investor away" },
  lookalike: { block: "bg-ink/15 text-ink", dot: "bg-ink/40", label: "Lookalike in portfolio" },
  unknown: { block: "bg-white text-muted ring-1 ring-inset ring-line", dot: "bg-line", label: "Too little on record" },
  clear: { block: "bg-clear text-white", dot: "bg-clear", label: "Clear" },
};
const GRADE_STYLE: Record<RoundRisk["grade"], string> = {
  low: "bg-clear/10 text-clear ring-clear/30",
  medium: "bg-caution/10 text-caution ring-caution/30",
  high: "bg-signal/10 text-signal ring-signal/30",
};

function FundButton({ name, onSelect, className = "" }: { name: string; onSelect: () => void; className?: string }) {
  return (
    <button type="button" onClick={onSelect} className={`font-semibold underline-offset-2 hover:underline ${className}`}>
      {name}
    </button>
  );
}

export default function RoundRiskPanel({
  risk,
  running,
  onSelect,
  daySpeech,
}: {
  risk: RoundRisk;
  running: boolean;
  /** Builds the spoken run-through of every meeting, for Play my day. */
  daySpeech?: () => string;
  /** Scrolls to an investor's row, by display name. */
  onSelect: (name: string) => void;
}) {
  if (!risk.settled) return null;
  const exposureOf = new Map(risk.investors.map((i) => [i.name, i.exposure]));
  const present = (Object.keys(EXPOSURE_STYLE) as Exposure[]).filter((e) => risk.counts[e] > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      {/* Headline and score */}
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <span className="text-signal">[ your round ]</span> {risk.settled} of {risk.total} meetings checked
            {running && risk.settled < risk.total && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
          </p>
          <h2 className="mt-2 max-w-3xl font-serif text-[1.65rem] leading-snug">{risk.headline}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <p className="font-serif text-5xl leading-none tabular-nums">
            {risk.score}
            <span className="text-xl text-muted">/100</span>
          </p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${GRADE_STYLE[risk.grade]}`}>
            {risk.grade === "high" ? "High" : risk.grade === "medium" ? "Medium" : "Low"} round exposure
          </span>
          {daySpeech && !(running && risk.settled < risk.total) && (
            <SpeakButton id="play-my-day" text={daySpeech} label="Play my day" tone="solid" className="sm:mt-1" />
          )}
        </div>
      </div>

      {/* Meeting order as a strip, safest first */}
      <div className="border-b border-line p-5">
        <p className="label flex items-center gap-1.5">
          <Route className="h-3.5 w-3.5" /> Suggested meeting order
        </p>
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {risk.order.map((o, i) => (
            <li key={o.title} className="rounded-xl border border-line bg-white/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  <span className="mr-1.5 font-mono text-xs text-muted">{i + 1}</span>
                  {o.title}
                </span>
                <span className="font-mono text-[10.5px] text-muted">{o.share}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.investors.map((name) => {
                  const e = exposureOf.get(name) || "unknown";
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onSelect(name)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold transition hover:opacity-85 ${EXPOSURE_STYLE[e].block}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{o.why}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {present.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`h-2 w-2 rounded-sm ${EXPOSURE_STYLE[e].dot}`} />
              {EXPOSURE_STYLE[e].label} · {risk.counts[e]}
            </span>
          ))}
        </div>
      </div>

      {/* Reach, hubs, leads */}
      <div className="grid gap-px bg-line md:grid-cols-3">
        <div className="bg-card p-5">
          <p className="label">Who can reach your competitors</p>
          {risk.reach.length ? (
            <ul className="space-y-3">
              {risk.reach.slice(0, 4).map((r) => (
                <li key={r.competitor} className="text-sm">
                  <p className="font-semibold">
                    {r.competitor}
                    <span className="ml-1.5 font-normal text-muted">
                      {r.direct.length + r.oneStep.length} of {risk.settled} meetings
                    </span>
                  </p>
                  {r.direct.length > 0 && (
                    <p className="mt-0.5 text-xs text-ink/80">
                      <span className="text-signal">Stake:</span>{" "}
                      {r.direct.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <FundButton name={n} onSelect={() => onSelect(n)} />
                        </span>
                      ))}
                    </p>
                  )}
                  {r.oneStep.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-xs text-ink/80">
                      {r.oneStep.map((x) => (
                        <li key={x.investor}>
                          <span className="text-caution">Via {x.via}:</span>{" "}
                          <FundButton name={x.investor} onSelect={() => onSelect(x.investor)} />{" "}
                          <span className="font-mono text-[10.5px] text-muted">{x.strength}/100</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No meeting reaches a competitor directly or through one co-investor.</p>
          )}
        </div>

        <div className="bg-card p-5">
          <p className="label flex items-center gap-1.5">
            <GitMerge className="h-3.5 w-3.5" /> Shared co-investors
          </p>
          {risk.hubs.length ? (
            <ul className="space-y-3">
              {risk.hubs.slice(0, 3).map((h) => (
                <li key={h.via} className="text-sm">
                  <p>
                    <span className="font-semibold">{h.via}</span>{" "}
                    <span className="text-muted">
                      ties {h.investors.length} of your meetings to {h.competitors.join(", ")}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink/80">
                    {h.investors.map((n, i) => (
                      <span key={n}>
                        {i > 0 && ", "}
                        <FundButton name={n} onSelect={() => onSelect(n)} />
                      </span>
                    ))}
                  </p>
                </li>
              ))}
              <li className="text-xs leading-relaxed text-muted">
                What one of these funds hears can reach the others through the same co-investor. Keep what you
                share with them consistent.
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted">No single co-investor ties two of your meetings to a competitor.</p>
          )}
        </div>

        <div className="bg-card p-5">
          <p className="label flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5" /> Likeliest leads, no competitor stake
          </p>
          {risk.leadCandidates.length ? (
            <ul className="space-y-2">
              {risk.leadCandidates.map((c) => (
                <li key={c.input} className="flex items-baseline justify-between gap-3 text-sm">
                  <FundButton name={c.name} onSelect={() => onSelect(c.name)} className="min-w-0 truncate text-left" />
                  <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted">
                    led {c.leads12m}/{c.rounds12m} · 12 mo
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No fund without a stake or co-investor path led a sourced round in the past year.</p>
          )}
          {risk.slush && (risk.slush.backingRivals.length > 0 || risk.slush.portfolioAttending > 0) && (
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              {risk.slush.event}: {risk.slush.portfolioAttending} portfolio companies of these funds are attending
              {risk.slush.backingRivals.length
                ? `; ${risk.slush.backingRivals.join(", ")} back${risk.slush.backingRivals.length === 1 ? "s" : ""} a competing attendee`
                : ""}
              .
            </p>
          )}
        </div>
      </div>

      <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted">
        Exposure averages your meetings: a stake in a competitor counts 1, a weaker or late-stage stake 0.7, a
        co-investor path its link strength ÷ 200, a lookalike 0.25, too little on record 0.15, clear 0.
      </p>
    </section>
  );
}
