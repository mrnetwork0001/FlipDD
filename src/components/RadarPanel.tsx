"use client";

// Competitors tab: who just raised, how much, at what valuation, from whom,
// and whether anyone on the founder's meeting list was in the round. Plus the
// competitor's acquisitions and the people who run it.

import { ArrowUpRight, Building2, Handshake, Loader2, Users } from "lucide-react";
import type { CompetitorSummary, RadarRound } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso?: string): string {
  if (!iso) return "undated";
  const [y, m, d] = iso.split("-");
  if (!m) return y;
  return d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : `${MONTHS[Number(m) - 1]} ${y}`;
}
function money(amount?: number, currency?: string): string | undefined {
  if (typeof amount !== "number" || amount <= 0) return undefined;
  const symbol: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
  const p = currency ? symbol[currency] ?? `${currency} ` : "";
  const v = amount >= 1e9 ? `${(amount / 1e9).toFixed(1)}B` : amount >= 1e6 ? `${(amount / 1e6).toFixed(1)}M` : `${Math.round(amount / 1e3)}K`;
  return `${p}${v.replace(/\.0(?=[BM])/, "")}`;
}
function monthsAgo(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (30.44 * 86_400_000)));
}

function RoundRow({ r, latest }: { r: RadarRound; latest: boolean }) {
  const amt = money(r.amount, r.currency);
  const val = money(r.valuation, r.valuationCurrency || r.currency);
  const src = r.sources.find((s) => s.url && s.rank !== "AGGREGATOR") || r.sources.find((s) => s.url);
  const ago = monthsAgo(r.date);
  return (
    <li className="relative pl-6">
      <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${r.onList.length ? "bg-signal" : latest ? "bg-ink" : "bg-ink/30"}`} />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold">{r.label}</span>
        <span className="font-mono text-[11px] text-muted">
          {fmtDate(r.date)}
          {ago !== undefined && ago <= 12 ? ` · ${ago === 0 ? "this month" : `${ago} mo ago`}` : ""}
        </span>
        {amt && <span className="text-sm">{amt}</span>}
        {val && <span className="text-sm text-muted">at {val} valuation</span>}
      </div>
      {r.opened ? (
        <p className="mt-0.5 text-xs leading-relaxed text-ink/80">
          {r.leads.length ? (
            <>
              <span className="text-muted">Led by</span> <span className="font-semibold">{r.leads.join(", ")}</span>
            </>
          ) : (
            <span className="text-muted">No lead flagged</span>
          )}
          {r.participants.length > r.leads.length && (
            <span className="text-muted">
              {" "}
              · with {r.participants.filter((p) => !r.leads.includes(p)).slice(0, 6).join(", ")}
              {r.participants.length - r.leads.length > 6 ? ` and ${r.participants.length - r.leads.length - 6} more` : ""}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-muted">Participants not opened (older round)</p>
      )}
      {r.onList.length > 0 && (
        <p className="mt-1 inline-flex rounded-md bg-signal/10 px-2 py-0.5 text-xs font-semibold text-signal">
          On your list: {r.onList.join(", ")}
        </p>
      )}
      {src?.url && (
        <a href={src.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-mono text-[11px] text-ink/60 hover:text-ink">
          {src.label}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

export default function RadarPanel({ competitors, running }: { competitors: CompetitorSummary[]; running: boolean }) {
  if (!competitors.length) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
        {running ? <Loader2 className="mb-2 h-5 w-5 animate-spin" /> : null}
        {running ? "Reading your competitors' rounds from Cala…" : "Add competitors to see who just raised, and from whom."}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {competitors.map((c) => {
        const radar = c.radar;
        if (!c.resolved || !radar) {
          return (
            <div key={c.input} className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
              {c.name}: not found in Cala.
            </div>
          );
        }
        const latest = radar.rounds[0];
        const ago = monthsAgo(latest?.date);
        const raisedRecently = ago !== undefined && ago <= 12;
        const total = money(radar.totalFunding, radar.totalFundingCurrency);
        const people = [...new Map(radar.people.map((p) => [p.name, p])).values()];
        return (
          <section key={c.input} className="overflow-hidden rounded-2xl border border-line bg-card">
            <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span className="text-signal">[ competitor ]</span> {c.status === "unknown" ? "status not recorded" : c.status}
                  {radar.stage ? ` · ${radar.stage}` : ""}
                </p>
                <h3 className="mt-1.5 font-serif text-3xl leading-none">{c.name}</h3>
                {c.description && <p className="mt-2 max-w-2xl text-sm text-muted">{c.description}</p>}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {total && (
                  <p className="font-serif text-3xl leading-none">
                    {total}
                    <span className="ml-1 text-sm text-muted">raised</span>
                  </p>
                )}
                {latest && (
                  <p className={`mt-1.5 text-xs font-semibold ${raisedRecently ? "text-signal" : "text-muted"}`}>
                    {raisedRecently ? "Raised in the past year: " : "Last round: "}
                    {latest.label}, {fmtDate(latest.date)}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-px bg-line lg:grid-cols-[1.6fr_1fr]">
              <div className="bg-card p-5">
                <p className="label">Funding rounds, newest first</p>
                {radar.rounds.length ? (
                  <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[4px] before:top-2 before:w-px before:bg-line">
                    {radar.rounds.map((r, i) => (
                      <RoundRow key={r.id} r={r} latest={i === 0} />
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted">No funding rounds on record.</p>
                )}
              </div>
              <div className="space-y-5 bg-card p-5">
                <div>
                  <p className="label flex items-center gap-1.5">
                    <Handshake className="h-3.5 w-3.5" /> Acquisitions
                  </p>
                  {radar.events.length ? (
                    <ul className="space-y-2 text-sm">
                      {radar.events.map((e) => (
                        <li key={e.id}>
                          <span className="font-semibold">
                            {e.kind === "was_acquired" ? `Acquired by ${e.counterparty || "unknown buyer"}` : `Bought ${e.counterparty || "a company"}`}
                          </span>
                          <span className="ml-1.5 font-mono text-[11px] text-muted">{fmtDate(e.date)}</span>
                          {e.source?.url && (
                            <a href={e.source.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[11px] text-ink/60 hover:text-ink">
                              {e.source.label}
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None on record.</p>
                  )}
                </div>
                <div>
                  <p className="label flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> People
                  </p>
                  {people.length ? (
                    <ul className="space-y-1 text-sm">
                      {people.map((p) => (
                        <li key={p.name} className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted">
                            {radar.people
                              .filter((x) => x.name === p.name)
                              .map((x) => x.role)
                              .join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No founders, executives or board members on record.</p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    FlipDD checks these people against the angels on your list and the teams of the funds you are
                    meeting.
                  </p>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Building2 className="h-3 w-3" /> {c.roundsRecorded} rounds and {c.investorsRecorded} investors on record in Cala
                </p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
