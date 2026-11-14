"use client";

// The Slush 2026 tab: who on the attendee list competes with the founder,
// who on the meeting list backs them, and which portfolio companies of each
// investor will be there. Everything here comes from the run's Slush report.

import { ArrowUpRight, Loader2, MapPin, Users } from "lucide-react";
import type { CompetitorSummary, InvestorResult, SlushCompetitor, SlushReport } from "@/lib/types";
import CalaLogo from "./CalaLogo";

function Pill({ tone, children }: { tone: "red" | "amber" | "slate" | "green"; children: React.ReactNode }) {
  const cls = {
    red: "bg-signal/10 text-signal ring-signal/30",
    amber: "bg-caution/10 text-caution ring-caution/30",
    slate: "bg-ink/5 text-ink/70 ring-ink/15",
    green: "bg-clear/10 text-clear ring-clear/30",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function siteUrl(website?: string): string | undefined {
  if (!website) return undefined;
  const w = website.trim();
  if (!w) return undefined;
  return /^https?:\/\//.test(w) ? w : `https://${w}`;
}

function CompetitorCard({ c, investorName }: { c: SlushCompetitor; investorName: (input: string) => string }) {
  const site = siteUrl(c.website);
  return (
    <li
      className={`rounded-xl border bg-card p-4 ${c.backedBy.length ? "border-signal/40 border-l-4 border-l-signal" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{c.name}</span>
        {c.verdict === "direct" && <Pill tone="red">Competes directly</Pill>}
        {c.verdict === "adjacent" && <Pill tone="amber">Adjacent</Pill>}
        {!c.verdict && <Pill tone="slate">Shared words</Pill>}
        {c.stage && <span className="font-mono text-[10.5px] text-muted">{c.stage}</span>}
      </div>
      {c.what && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink/85">{c.what}</p>}
      {c.why && <p className="mt-1 text-xs text-muted">{c.verdict ? `Gemini: ${c.why}` : c.why}</p>}
      {c.backedBy.length > 0 ? (
        <p className="mt-2 text-sm font-medium text-signal">
          Backed by {c.backedBy.map(investorName).join(", ")} on your meeting list
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {c.investorsRecorded
            ? `${c.investorsRecorded} investor${c.investorsRecorded === 1 ? "" : "s"} on record, none on your list`
            : "No investors on record in Cala"}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.source?.url && (
          <a
            href={c.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded border border-line bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-ink/75 hover:border-ink"
          >
            attendee · {c.source.label}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
        {site && (
          <a
            href={site}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded border border-line bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-ink/75 hover:border-ink"
          >
            {site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>
    </li>
  );
}

export default function SlushPanel({
  report,
  rows,
  competitors,
  running,
  hasDescription,
}: {
  report?: SlushReport;
  rows: InvestorResult[];
  competitors: CompetitorSummary[];
  running: boolean;
  hasDescription: boolean;
}) {
  if (!report) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
        {running ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
            <p className="mt-3 max-w-md text-sm text-muted">
              Reading the Slush 2026 attendee list from Cala and matching it against your competitors and
              investors. The competitor search among attendees takes 30 to 60 seconds.
            </p>
          </>
        ) : (
          <p className="max-w-md text-sm text-muted">The Slush check did not run for this list. Run the check again.</p>
        )}
      </div>
    );
  }

  const nameOf = (input: string) => rows.find((r) => r.input === input)?.name || input;
  const namedIds = new Set(report.namedAttending.map((a) => a.id));
  const rivalNames = new Set(report.competitors.map((c) => c.name));
  const backed = report.competitors.filter((c) => c.backedBy.length);
  const others = report.competitors.filter((c) => !c.backedBy.length);
  const withPortfolio = rows
    .filter((r) => r.slush && r.slush.portfolio.length)
    .sort((a, b) => b.slush!.portfolio.length - a.slush!.portfolio.length);
  const namedNotAttending = competitors.filter(
    (c) => c.resolved && !report.namedAttending.some((a) => c.entities.some((e) => e.id === a.id) || a.name === c.name),
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-ink bg-ink p-5 text-paper">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/55">
          <MapPin className="h-3.5 w-3.5" /> {report.event.name}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-2xl font-serif text-3xl leading-tight">
            {backed.length
              ? `${backed.length} attendee${backed.length === 1 ? "" : "s"} like you ${backed.length === 1 ? "is" : "are"} backed by investors you are meeting`
              : report.namedAttending.length
                ? `${report.namedAttending.map((a) => a.name).join(", ")} will be there too`
                : report.competitors.length
                  ? `${report.competitors.length} attendee${report.competitors.length === 1 ? "" : "s"} build something like yours`
                  : "No competitor of yours found on the attendee list"}
          </h2>
          <div className="flex flex-col items-end gap-1.5">
            <CalaLogo tone="light" height={16} />
            <p className="font-mono text-[11px] text-paper/60">
              {report.event.attendees.toLocaleString("en-GB")} companies on Cala&apos;s attendee list
            </p>
          </div>
        </div>
        {report.event.description && <p className="mt-2 text-sm text-paper/60">{report.event.description}</p>}
      </div>

      {/* Named competitors */}
      {(report.namedAttending.length > 0 || namedNotAttending.length > 0) && (
        <section>
          <p className="label">Your competitors at Slush</p>
          <div className="flex flex-wrap gap-2">
            {report.namedAttending.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/5 px-3 py-1.5 text-xs">
                <span className="font-semibold">{a.name}</span>
                <span className="text-signal">attending</span>
              </span>
            ))}
            {namedNotAttending.map((c) => (
              <span key={c.input} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted">
                <span className="font-semibold text-ink/80">{c.name}</span> not on the list
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Attendees like you */}
      <section>
        <p className="label">Attendees building something like yours</p>
        {report.competitors.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {[...backed, ...others].map((c) => (
              <CompetitorCard key={c.id} c={c} investorName={nameOf} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            {report.note ||
              (hasDescription
                ? "Cala's suggestions did not hold up against the attendees' own records, so none are shown."
                : "Add a sentence on what you build to search the attendees.")}
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Cala&apos;s query endpoint suggests attendees; FlipDD keeps only names on the {report.event.name} attendee
          list, then {report.judgedBy === "gemini" ? "has Gemini read" : "compares your description with"} each
          company&apos;s own Cala record.
          {report.judgedBy !== "gemini" && " Set GEMINI_API_KEY for a closer reading."}
        </p>
      </section>

      {/* Portfolio at Slush */}
      <section>
        <p className="label flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Your investors&apos; portfolio at Slush
        </p>
        {withPortfolio.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {withPortfolio.map((r) => (
              <li key={r.input} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{r.name}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {r.slush!.portfolio.length} portfolio compan{r.slush!.portfolio.length === 1 ? "y" : "ies"} attending
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.slush!.portfolio.map((p) => {
                    const rival = namedIds.has(p.id) || rivalNames.has(p.name);
                    return (
                      <span
                        key={p.id}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          rival ? "bg-signal/10 font-semibold text-signal ring-1 ring-inset ring-signal/30" : "bg-white/70 text-ink/75 ring-1 ring-inset ring-line"
                        }`}
                        title={rival ? "On your competitor list or builds something like yours" : undefined}
                      >
                        {p.name}
                        {rival ? " · competitor" : ""}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            None of your investors&apos; recorded portfolio companies are on the attendee list.
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          A portfolio founder at the same event is the easiest reference call you will get, and the person most
          likely to hear about your meeting. Grey names are neutral; red names compete with you.
        </p>
      </section>
    </div>
  );
}
