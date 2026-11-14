import type { Metadata } from "next";
import Link from "next/link";
import FlipLogo from "@/components/FlipLogo";
import { notFound } from "next/navigation";
import { ArrowUpRight, FileLock2, MessageSquareQuote } from "lucide-react";
import { loadDoc } from "@/lib/store";
import { LEVEL_LABEL, type BriefDoc, type Level, type Reason, type SourceRef, type Tone } from "@/lib/types";
import { CopyLinkButton, PrintButton } from "./PrintButton";
import CalaLogo from "@/components/CalaLogo";
import DossierPanel from "@/components/DossierPanel";
import SpeakButton from "@/components/SpeakButton";
import { spokenBriefing } from "@/lib/voiceScript";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const doc = await loadDoc<BriefDoc>("briefs", params.id);
  return {
    title: doc ? `${doc.investor.name}: meeting brief · FlipDD` : "Brief not found · FlipDD",
    robots: { index: false, follow: false },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!m) return y;
  return d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : `${MONTHS[Number(m) - 1]} ${y}`;
}

const PILL: Record<Level, string> = {
  direct_high: "bg-signal text-white",
  direct_moderate: "bg-signal/10 text-signal ring-1 ring-inset ring-signal/30",
  indirect: "bg-caution/10 text-caution ring-1 ring-inset ring-caution/30",
  possible: "bg-ink/5 text-ink/75 ring-1 ring-inset ring-ink/20",
  thin: "text-muted ring-1 ring-inset ring-line",
  unresolved: "text-muted ring-1 ring-inset ring-line",
  clear: "bg-clear/10 text-clear ring-1 ring-inset ring-clear/30",
};
const DOT: Record<Tone, string> = { bad: "bg-signal", warn: "bg-caution", good: "bg-clear", neutral: "bg-ink/25" };

function Src({ s }: { s: SourceRef }) {
  if (!s.url) return null;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 rounded border border-line bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-ink/75 hover:border-ink print:border-0 print:p-0 print:underline"
    >
      {s.label}
      {s.date ? ` · ${fmtDate(s.date)}` : ""}
      <ArrowUpRight className="h-3 w-3 print:hidden" />
    </a>
  );
}

function ReasonList({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.tone]}`} />
          <span>
            {r.text}
            {r.source?.url && (
              <span className="ml-1.5 inline-block align-middle">
                <Src s={r.source} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Block({ tag, title, tone, children }: { tag: string; title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className={`break-inside-avoid rounded-xl border border-line border-l-4 bg-white/60 p-4 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tag}</p>
      <h3 className="mt-0.5 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export default async function BriefPage({ params }: { params: { id: string } }) {
  const doc = await loadDoc<BriefDoc>("briefs", params.id);
  if (!doc) notFound();
  const r = doc.investor;
  const a = r.activity;

  return (
    <div className="min-h-screen bg-paper print:bg-white">
      <header className="border-b border-line/70 print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center transition hover:opacity-75" aria-label="FlipDD">
            <FlipLogo height={26} />
          </Link>
          <div className="flex items-center gap-2">
            <CopyLinkButton />
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 print:py-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Meeting brief{doc.startupName ? ` · prepared for ${doc.startupName}` : ""} · {fmtDate(doc.createdAt)}
        </p>
        <h1 className="mt-3 font-serif text-5xl leading-none">{r.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PILL[r.level]}`}>{LEVEL_LABEL[r.level]}</span>
          <span className="text-base text-ink/85">{r.headline}</span>
          <SpeakButton text={spokenBriefing(r)} label="Listen to brief" className="print:hidden" />
        </div>
        {r.resolved && (
          <p className="mt-2 text-xs text-muted">
            {a.roundsRecorded} rounds and {a.portfolioRecorded} portfolio companies on record
            {a.rounds12m > 0 ? ` · led ${a.leads12m} of ${a.rounds12m} rounds in the past 12 months` : ""}
            {a.lastRound ? ` · last sourced round ${a.lastRound.label}, ${fmtDate(a.lastRound.date)}` : ""}
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="break-inside-avoid rounded-xl border border-line bg-white/70 p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <FileLock2 className="h-3.5 w-3.5" /> What to share
            </p>
            <p className="mt-1 font-serif text-3xl leading-tight">{r.share.level}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{r.share.why}</p>
          </div>
          <div className="break-inside-avoid rounded-xl border border-ink bg-ink p-5 text-paper print:bg-white print:text-ink">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-paper/60 print:text-muted">
              <MessageSquareQuote className="h-3.5 w-3.5" /> Ask this
            </p>
            <p className="mt-2 font-serif text-xl leading-snug">&ldquo;{r.ask.question}&rdquo;</p>
            <p className="mt-3 text-[11px] text-paper/60 print:text-muted">
              {r.ask.draftedBy === "gemini" ? "Worded by Gemini from the sourced findings below. " : ""}
              {r.ask.source?.url && (
                <a href={r.ask.source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Based on {r.ask.source.label}
                </a>
              )}
            </p>
          </div>
        </div>

        <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-wider text-muted">Why</h2>
        <div className="mt-3 space-y-3">
          {(r.people || []).map((t) => (
            <Block key={`p-${t.personId}-${t.competitor}`} tag="Person" title={t.person} tone="border-l-signal">
              <p className="mt-2 text-sm leading-relaxed">{t.text}.</p>
              {t.source?.url && (
                <div className="mt-2">
                  <Src s={t.source} />
                </div>
              )}
            </Block>
          ))}
          {r.direct.map((d) => (
            <Block key={d.competitor} tag="Direct stake" title={d.competitor} tone="border-l-signal">
              <ReasonList reasons={d.reasons} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.sources.filter((s) => s.url).slice(0, 4).map((s) => (
                  <Src key={s.url} s={s} />
                ))}
              </div>
            </Block>
          ))}
          {r.leaks.map((l, i) => (
            <Block
              key={`${l.via.id}-${i}`}
              tag={`Co-investor path · ${l.strengthLabel} ${l.strength}/100`}
              title={`${r.name} → ${l.via.name} → ${l.competitor}`}
              tone={l.strengthLabel === "weak" ? "border-l-ink/30" : "border-l-caution"}
            >
              <ReasonList reasons={l.reasons} />
            </Block>
          ))}
          {r.possible.map((p) => (
            <Block
              key={p.company}
              tag={p.judgedBy === "gemini" ? `Lookalike · Gemini: ${p.verdict === "direct" ? "competes" : "adjacent"}` : "Lookalike · word match"}
              title={p.company}
              tone="border-l-ink/30"
            >
              {p.description && <p className="mt-2 text-sm leading-relaxed text-ink/85">{p.description}</p>}
              <p className="mt-2 text-sm text-muted">
                {p.why || (p.sharedTerms.length ? `Matched on ${p.sharedTerms.join(", ")}.` : "")}
              </p>
            </Block>
          ))}
          {(doc.slushCompetitors || []).map((c) => (
            <Block key={`slush-${c.id}`} tag={`${doc.slushEvent || "Slush"} attendee`} title={c.name} tone="border-l-signal">
              <p className="mt-2 text-sm leading-relaxed text-ink/85">
                Cala has {r.name} on record as an investor in {c.name}, which is on the {doc.slushEvent} attendee list.
              </p>
              {c.what && <p className="mt-1 text-sm leading-relaxed text-muted">{c.what}</p>}
              {c.why && <p className="mt-1 text-xs text-muted">{c.verdict ? `Gemini: ${c.why}` : c.why}</p>}
              {c.source?.url && (
                <div className="mt-2">
                  <Src s={c.source} />
                </div>
              )}
            </Block>
          ))}
          {!r.direct.length && !r.leaks.length && !r.possible.length && !(doc.slushCompetitors || []).length && !(r.people || []).length && (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No direct stake, co-investor path or lookalike portfolio company found in Cala&apos;s records.
            </p>
          )}
        </div>

        {r.coverage && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Data coverage: Cala holds {r.coverage.has.join(", ") || "little"} for this investor
            {r.coverage.missing.length ? `; no ${r.coverage.missing.join(" or ")} on record.` : "."}
          </p>
        )}

        {r.resolved && (
          <section className="mt-8 break-inside-avoid">
            <DossierPanel investor={r.name} autoLoad />
          </section>
        )}

        {r.slush && r.slush.portfolio.length > 0 && (
          <section className="mt-8 break-inside-avoid">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Their portfolio at {doc.slushEvent || "Slush 2026"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">
              {r.slush.portfolio.map((p) => p.name).join(", ")}.{" "}
              <span className="text-muted">
                Founders you can ask about working with {r.name}, and who may hear about your meeting.
              </span>
            </p>
          </section>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          <CalaLogo label="Data from" height={18} className="mb-3" />
          <p>
            Checked against {doc.competitors.length ? doc.competitors.join(", ") : "no named competitors"}. Every fact
            comes from Cala&apos;s knowledge graph and links to its source. Public records lag behind real deals, so
            treat this as the start of the conversation, not the end of it.
          </p>
          <p className="mt-2 print:hidden">
            <Link href="/app" className="font-semibold text-ink underline-offset-2 hover:underline">
              Check your own meeting list with FlipDD
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
