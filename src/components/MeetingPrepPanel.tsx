"use client";

// Meeting prep: one investor, everything a founder should know before sitting
// down, from Cala's graph. Fast facts arrive first; exits and the market's
// recent raises (Cala knowledge queries, 30 to 60 s) fill in after. The note at
// the bottom is the founder's own, kept in this browser per check and investor.

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy, Loader2, X } from "lucide-react";
import type { CompetitorSummary, InvestorResult } from "@/lib/types";
import type { MeetingPrep, PrepPerson, PrepRival, PrepRow, PrepSeriesPoint } from "@/lib/prep";
import { LEVEL_LABEL } from "@/lib/types";

const money = (v: number, units = "USD") => {
  const sym = units === "USD" ? "$" : units === "EUR" ? "€" : units === "GBP" ? "£" : `${units} `;
  if (v >= 1e9) return `${sym}${(v / 1e9).toFixed(v >= 1e10 ? 0 : 2).replace(/\.?0+$/, "")}B`;
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${sym}${Math.round(v / 1e3)}K`;
  return `${sym}${v}`;
};
const month = (d?: string) => {
  if (!d) return "";
  const t = new Date(d.length === 7 ? `${d}-01` : d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

const HOLD_BACK: Record<string, string[]> = {
  "Teaser only": ["Customer names and logos", "Revenue and growth figures", "Product roadmap", "Data room access"],
  "Deck without customer names": ["Customer names and logos", "Detailed roadmap"],
  "Full data room": [],
};

interface Note { hold: Record<string, boolean>; ask: string; notes: string; outcome: "" | "interested" | "follow_up" | "pass"; next: string }
const emptyNote = (r: InvestorResult): Note => ({ hold: Object.fromEntries((HOLD_BACK[r.share.level] || []).map((h) => [h, true])), ask: r.ask.question || "", notes: "", outcome: "", next: "" });
const NOTE_KEY = "flipdd.notes.v1";
function loadNote(key: string): Note | undefined {
  try {
    return (JSON.parse(localStorage.getItem(NOTE_KEY) || "{}") as Record<string, Note>)[key];
  } catch {
    return undefined;
  }
}
function saveNote(key: string, note: Note) {
  try {
    const all = JSON.parse(localStorage.getItem(NOTE_KEY) || "{}") as Record<string, Note>;
    all[key] = note;
    localStorage.setItem(NOTE_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: the note still works for this visit */
  }
}

function Section({ n, title, children, aside }: { n: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-[15px] font-semibold">
          <span className="font-mono text-[11px] text-signal">{n}</span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-relaxed text-muted">{children}</p>;

function opener(p: PrepPerson): string | undefined {
  const past = p.past.find((x) => x.role);
  if (past) return `Ask about their time as ${past.role} at ${past.org}${past.from ? ` (${past.from}${past.to ? `–${past.to}` : ""})` : ""}: it shapes what they will probe.`;
  if (p.founded.length && !/creandum|ventures|capital|partners/i.test(p.founded[0])) return `Ask what they learned building ${p.founded[0]}.`;
  if (p.spoke[0]) return `They spoke at ${p.spoke[0]}: a natural opener.`;
  return undefined;
}

function Person({ p }: { p: PrepPerson }) {
  const line = [
    p.past.length ? `Before: ${p.past.slice(0, 2).map((x) => `${x.role ? `${x.role}, ` : ""}${x.org}${x.from ? ` (${x.from}${x.to ? `–${x.to}` : ""})` : ""}`).join("; ")}` : "",
    p.founded.length ? `Founded: ${p.founded.slice(0, 2).join(", ")}` : "",
    p.studied.length ? `Studied: ${p.studied.slice(0, 2).join(", ")}` : "",
  ].filter(Boolean);
  const o = opener(p);
  return (
    <li className="rounded-xl border border-line bg-white/60 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">
          {p.name}
          {p.role && <span className="ml-2 text-xs font-normal text-muted">{p.role}{p.since ? ` since ${p.since.slice(0, 4)}` : ""}</span>}
        </p>
        {p.source?.url && (
          <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-muted underline-offset-2 hover:underline">
            {p.source.label} ↗
          </a>
        )}
      </div>
      {line.map((l) => <p key={l} className="mt-1 text-[13px] leading-snug text-ink/80">{l}</p>)}
      {!line.length && p.about && <p className="mt-1 text-[13px] leading-snug text-ink/80">{p.about}</p>}
      {p.boards.length > 0 && <p className="mt-1 text-[12px] text-muted">On the board of {p.boards.slice(0, 4).join(", ")}{p.boards.length > 4 ? ` and ${p.boards.length - 4} more` : ""}</p>}
      {o && <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-[12.5px] text-ink/80"><span className="font-semibold">Opener · </span>{o}</p>}
    </li>
  );
}

function Curve({ points, fmt }: { points: PrepSeriesPoint[]; fmt: (v: number) => string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="mt-1.5 flex items-end gap-2">
      {points.slice(-5).map((p) => (
        <a key={p.date + p.value} href={p.url} target="_blank" rel="noopener noreferrer" title={p.source} className="group flex flex-col items-center gap-1">
          <span className="text-[12px] font-semibold tabular-nums">{fmt(p.value)}</span>
          <span className="w-9 rounded-t bg-ink/80 transition group-hover:bg-signal" style={{ height: Math.max(6, (p.value / max) * 54) }} />
          <span className="font-mono text-[10px] text-muted">{month(p.date)}</span>
        </a>
      ))}
    </div>
  );
}

function Rival({ r, comp }: { r: PrepRival; comp?: CompetitorSummary }) {
  const lastRound = comp?.radar?.rounds?.[0];
  const has = r.arr.length || r.headcount.length || r.totalFunding || r.board.length || lastRound;
  if (!has) return null;
  return (
    <div className="rounded-xl border border-line bg-white/60 p-3.5">
      <p className="font-semibold">
        {r.name}
        <span className="ml-2 text-xs font-normal text-muted">
          {[r.stage, r.totalFunding ? `${money(r.totalFunding.value, r.totalFunding.units)} raised` : "", r.headcountBand ? `${r.headcountBand} people` : ""].filter(Boolean).join(" · ")}
        </span>
      </p>
      {lastRound && (
        <p className="mt-1 text-[13px] text-ink/80">
          Latest round: {lastRound.label}{lastRound.date ? `, ${month(lastRound.date)}` : ""}{lastRound.leads?.length ? `, led by ${lastRound.leads.join(", ")}` : ""}
        </p>
      )}
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {r.arr.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Annual recurring revenue</p>
            <Curve points={r.arr} fmt={(v) => money(v, r.arrUnits || "USD")} />
          </div>
        )}
        {r.headcount.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">People</p>
            <Curve points={r.headcount} fmt={(v) => String(Math.round(v))} />
          </div>
        )}
      </div>
      {r.board.length > 0 && <p className="mt-2 text-[12.5px] text-ink/75"><span className="font-semibold">Board · </span>{r.board.map((b) => b.name).join(", ")}</p>}
    </div>
  );
}

function Rows({ rows, cols }: { rows: PrepRow[]; cols: [string, string][] }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-white/60">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 px-3.5 py-2 text-[13px]">
          <span className="font-semibold">{r[cols[0][0]]}</span>
          {cols.slice(1).map(([k, label]) => (r[k] ? <span key={k} className="text-muted">{label ? `${label} ` : ""}{r[k]}</span> : null))}
        </li>
      ))}
    </ul>
  );
}

function Slow({ state, rows, cols, empty }: { state: "loading" | "done" | "error"; rows: PrepRow[]; cols: [string, string][]; empty: string }) {
  if (state === "loading")
    return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking Cala&apos;s knowledge query. This one takes 30 to 60 seconds.</p>;
  if (state === "error") return <Muted>Cala didn&apos;t answer this in time. Close and reopen the prep to try again.</Muted>;
  if (!rows.length) return <Muted>{empty}</Muted>;
  return <Rows rows={rows} cols={cols} />;
}

export default function MeetingPrepPanel({
  investor, competitors, startupName, description, runId, onClose,
}: {
  investor: InvestorResult; competitors: CompetitorSummary[]; startupName: string; description: string; runId: string; onClose: () => void;
}) {
  const [prep, setPrep] = useState<MeetingPrep | null>(null);
  const [error, setError] = useState("");
  const [exits, setExits] = useState<{ state: "loading" | "done" | "error"; rows: PrepRow[] }>({ state: "loading", rows: [] });
  const [market, setMarket] = useState<{ state: "loading" | "done" | "error"; rows: PrepRow[]; note?: string }>({ state: "loading", rows: [] });
  const noteKey = `${runId}:${investor.input}`;
  const [note, setNote] = useState<Note>(() => emptyNote(investor));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNote(loadNote(noteKey) || emptyNote(investor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey]);
  useEffect(() => saveNote(noteKey, note), [noteKey, note]);

  useEffect(() => {
    const ctl = new AbortController();
    const body = { investor, competitors, startupName, description };
    const call = (part?: string) =>
      fetch("/api/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, part }), signal: ctl.signal }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        return j;
      });
    call().then(setPrep).catch((e) => !ctl.signal.aborted && setError((e as Error).message));
    call("exits").then((j) => setExits({ state: "done", rows: j.rows || [] })).catch(() => !ctl.signal.aborted && setExits({ state: "error", rows: [] }));
    call("market").then((j) => setMarket({ state: "done", rows: j.rows || [], note: j.note })).catch(() => !ctl.signal.aborted && setMarket({ state: "error", rows: [] }));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investor.input]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const compByName = useMemo(() => new Map(competitors.map((c) => [c.name, c])), [competitors]);
  const signalStyle = { several: "bg-clear/10 text-clear ring-clear/30", one: "bg-caution/10 text-caution ring-caution/30", none: "bg-ink/5 text-ink/70 ring-ink/15" } as const;
  const signalLabel = { several: "Not a blocker", one: "Expect the comparison", none: "First bet in your space" } as const;

  const plain = () => {
    const lines = [`Meeting prep: ${investor.name}`, `${LEVEL_LABEL[investor.level]}. ${investor.headline}.`];
    if (prep) {
      const meet = prep.team.current.slice(0, 3).map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`);
      if (meet.length) lines.push(`Who you may meet: ${meet.join(", ")}`);
      lines.push(`Their stake in your space: ${prep.space.text}`);
    }
    const hold = Object.entries(note.hold).filter(([, v]) => v).map(([k]) => k);
    if (hold.length) lines.push(`Hold back: ${hold.join(", ")}`);
    if (note.ask) lines.push(`Ask: ${note.ask}`);
    if (note.notes) lines.push(`Notes: ${note.notes}`);
    if (note.outcome) lines.push(`Outcome: ${note.outcome.replace("_", " ")}${note.next ? `. Next: ${note.next}` : ""}`);
    return lines.join("\n");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-[720px] flex-col overflow-hidden bg-paper shadow-2xl sm:rounded-l-3xl" role="dialog" aria-label={`Meeting prep for ${investor.name}`}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted"><span className="text-signal">[ meeting prep ]</span> from Cala&apos;s graph</p>
            <h2 className="mt-1 truncate font-serif text-4xl leading-tight">{investor.name}</h2>
            <p className="mt-0.5 text-sm text-ink/80">{investor.headline}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(plain()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })} className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold hover:border-ink">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy note"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-ink/5"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-10 sm:px-7">
          {error && <p className="mt-5 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p>}
          {!prep && !error && <p className="mt-6 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Reading {investor.name}&apos;s team, rounds and your competitors in Cala…</p>}

          {prep && (
            <>
              <Section n="01" title="Their stake in your space" aside={<span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${signalStyle[prep.space.signal]}`}>{signalLabel[prep.space.signal]}</span>}>
                <p className="text-[15px] leading-relaxed">{prep.space.text}</p>
                {prep.space.holdings.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {prep.space.holdings.map((h) => (
                      <li key={h.name} title={h.detail} className={`rounded-full px-2.5 py-0.5 text-[12px] ring-1 ring-inset ${h.how === "competitor" ? "ring-signal/30 text-signal" : "ring-line text-ink/75"}`}>
                        {h.name} <span className="text-muted">· {h.how === "competitor" ? "on your list" : "close to you"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section n="02" title="Who you'll meet" aside={prep.team.recorded ? <span className="text-[11px] text-muted">{prep.team.recorded} people on record</span> : undefined}>
                {prep.team.current.length ? (
                  <ul className="grid gap-2.5">{prep.team.current.slice(0, 4).map((p) => <Person key={p.id} p={p} />)}</ul>
                ) : (
                  <Muted>Cala has no team on record for {investor.name}. Ask who leads your sector before the meeting.</Muted>
                )}
                {prep.team.current.length > 4 && <p className="mt-2 text-[12px] text-muted">Also: {prep.team.current.slice(4).map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}</p>}
                {prep.team.left.length > 0 && (
                  <p className="mt-3 rounded-lg bg-caution/10 px-3 py-2 text-[13px] text-ink/85">
                    <span className="font-semibold">Recently left · </span>
                    {prep.team.left.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}, ${month(p.until)}`).join("; ")}. Ask who covers your sector now.
                  </p>
                )}
              </Section>

              <Section n="03" title="What they already know about your competitors">
                {prep.rivals.some((r) => r.arr.length || r.headcount.length || r.totalFunding || r.board.length) ? (
                  <div className="grid gap-2.5">{prep.rivals.map((r) => <Rival key={r.name} r={r} comp={compByName.get(r.name)} />)}</div>
                ) : (
                  <Muted>Cala has no funding, revenue or headcount on record for your competitors yet.</Muted>
                )}
                {prep.rivals.some((r) => r.arr.length) && <p className="mt-2 text-[12px] text-muted">If they backed a competitor, this is the bar they will hold you to.</p>}
              </Section>

              <Section n="04" title="How they invest">
                {prep.style ? (
                  <div className="space-y-1.5 text-[14px]">
                    <p>
                      Last {prep.style.roundsSeen} rounds on record ({prep.style.window}): {prep.style.stages.map((s) => `${s.label} ×${s.count}`).join(", ")}. Led {prep.style.led} of them.
                    </p>
                    {prep.style.medianRound && <p>Typical round they join: {money(prep.style.medianRound.value, prep.style.medianRound.units)} <span className="text-muted">(the whole round, not their cheque)</span></p>}
                    {prep.style.lastDeal && <p className="text-muted">Latest: {prep.style.lastDeal.label}{prep.style.lastDeal.company ? ` in ${prep.style.lastDeal.company}` : ""}{prep.style.lastDeal.date ? `, ${month(prep.style.lastDeal.date)}` : ""}</p>}
                  </div>
                ) : (
                  <Muted>No rounds on record for {investor.name}.</Muted>
                )}
              </Section>

              <Section n="05" title="What they'll find on you">
                {!prep.you ? (
                  <Muted>Add your startup&apos;s name to the check to see what Cala holds on you.</Muted>
                ) : prep.you.status === "none" ? (
                  <Muted>Cala has no record of {prep.you.name}. An analyst who looks you up finds nothing, so bring your own numbers and sources to the meeting.</Muted>
                ) : (
                  <div className="space-y-1.5 text-[14px]">
                    {prep.you.status === "several" && <p className="rounded-lg bg-caution/10 px-3 py-2 text-[13px]">Cala has {prep.you.records.length} records named {prep.you.name}. Analysts may land on the wrong one; this is the fullest.</p>}
                    <p>{[prep.you.founded ? `Founded ${prep.you.founded}` : "", prep.you.stage, prep.you.totalFunding ? `${money(prep.you.totalFunding.value, prep.you.totalFunding.units)} raised` : "", prep.you.headcountBand ? `${prep.you.headcountBand} people` : ""].filter(Boolean).join(" · ") || "A record with few facts on it."}</p>
                    {prep.you.rounds.length > 0 && <p className="text-muted">Rounds on record: {prep.you.rounds.map((r) => `${r.label}${r.date ? ` (${month(r.date)})` : ""}`).join(", ")}</p>}
                    {prep.you.investors.length > 0 && <p className="text-muted">Investors on record: {prep.you.investors.slice(0, 6).join(", ")}{prep.you.investors.length > 6 ? "…" : ""}</p>}
                    <p className="text-[12px] text-muted">From {prep.you.sourceCount} sources. If anything is wrong or missing, fix it before investors read it.</p>
                  </div>
                )}
              </Section>
            </>
          )}

          <Section n="06" title="Their exits">
            <Slow state={exits.state} rows={exits.rows} cols={[["company", ""], ["outcome", ""], ["acquirer_or_exchange", "·"], ["year", "·"]]} empty="No acquisitions or listings of their portfolio companies on record." />
          </Section>

          <Section n="07" title="Who raised in your space this year">
            <Slow state={market.state} rows={market.rows} cols={[["company", ""], ["round", ""], ["amount", "·"], ["date", "·"], ["lead_investor", "· led by"]]} empty={market.note || "No raises in your space on record for the past year."} />
          </Section>

          <Section n="08" title="Your note" aside={<span className="text-[11px] text-muted">saved in this browser</span>}>
            {Object.keys(note.hold).length > 0 && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Hold back ({investor.share.level})</p>
                <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {Object.entries(note.hold).map(([k, v]) => (
                    <li key={k}>
                      <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                        <input type="checkbox" checked={v} onChange={(e) => setNote({ ...note, hold: { ...note.hold, [k]: e.target.checked } })} className="h-4 w-4 accent-[#16130E]" />
                        {k}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wider text-muted" htmlFor="prep-ask">Ask them</label>
            <textarea id="prep-ask" className="field mt-1.5 min-h-[72px]" value={note.ask} onChange={(e) => setNote({ ...note, ask: e.target.value })} />
            <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wider text-muted" htmlFor="prep-notes">Your notes</label>
            <textarea id="prep-notes" className="field mt-1.5 min-h-[96px]" placeholder="What you want from this meeting, what you heard, who to follow up with…" value={note.notes} onChange={(e) => setNote({ ...note, notes: e.target.value })} />
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-muted">After the meeting</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {([["interested", "Interested"], ["follow_up", "Follow up"], ["pass", "Pass"]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setNote({ ...note, outcome: note.outcome === k ? "" : k })} className={`rounded-full px-3 py-1 text-[13px] font-semibold ring-1 ring-inset transition ${note.outcome === k ? "bg-ink text-paper ring-ink" : "ring-line hover:ring-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <input className="field mt-2" placeholder="Next step, e.g. send the deck by Friday" value={note.next} onChange={(e) => setNote({ ...note, next: e.target.value })} />
          </Section>
          {prep && <p className="pt-2 text-[11px] text-muted">Every fact above comes from Cala&apos;s records, with sources where Cala has them. {prep.calls} live Cala call{prep.calls === 1 ? "" : "s"}, the rest from today&apos;s cache.</p>}
          <a href="https://cala.ai" target="_blank" rel="noopener noreferrer" className="sr-only">Cala<ArrowUpRight /></a>
        </div>
      </aside>
    </div>
  );
}
