import fs from "fs";
import path from "path";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import HeroVisual from "@/components/HeroVisual";
import PixelGraph, { PixelField } from "@/components/PixelGraph";
import Reveal from "@/components/Reveal";
import RunTerminal from "@/components/RunTerminal";
import CalaLogo from "@/components/CalaLogo";
import FlipLogo from "@/components/FlipLogo";
import MobileNav from "@/components/MobileNav";
import OnTheGo from "@/components/OnTheGo";
import ContactDock from "@/components/ContactDock";
import { PHONE_NUMBER, TELEGRAM_BOT } from "@/lib/contact";
import { FundGraph } from "@/components/bg/Backgrounds";
import { DisclosureMeter, FlipGlyph } from "@/components/Glyphs";
import { loadShowcase, type Showcase } from "@/lib/showcase";
import type { Level } from "@/lib/types";

// Reads the latest real run of the built-in example on every request.
export const dynamic = "force-dynamic";

// Illustrations for the three trap cards. Drop PNG/JPG/WebP files named
// direct, one-step and lookalike into public/brand/traps/ and they replace the
// pixel diagrams; until then the diagrams stay.
function publicImage(dir: string, key: string): string | undefined {
  for (const ext of ["webp", "png", "jpg", "jpeg"]) {
    const file = path.join(process.cwd(), "public", "brand", dir, `${key}.${ext}`);
    if (fs.existsSync(file)) return `/brand/${dir}/${key}.${ext}`;
  }
  return undefined;
}
const trapImage = (key: string) => publicImage("traps", key);

function Wordmark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return <FlipLogo height={30} tone={tone} />;
}

function SectionTag({ n, title, dark }: { n: string; title: string; dark?: boolean }) {
  return (
    <div
      className={`mb-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] ${dark ? "text-paper/50" : "text-muted"}`}
    >
      <span className="text-signal">[ {n} ]</span>
      <span>/ {title}</span>
      <span className={`h-px flex-1 ${dark ? "bg-paper/15" : "bg-line"}`} />
    </div>
  );
}

const TICKER = [
  "Backed your competitor",
  "Co-invests with their lead",
  "Owns a lookalike",
  "Teaser only",
  "Deck without customer names",
  "Full data room",
  "Every finding sourced",
];

const TRAPS = [
  {
    n: "01",
    key: "direct",
    tag: "Direct",
    title: "They backed your competitor",
    body: "FlipDD finds your competitors from your description, reads the rounds they raised, and matches every participant against your meeting list.",
    evidence: "direct" as const,
    graph: {
      cols: 40,
      rows: 15,
      nodes: [
        { x: 2, y: 4, w: 7, h: 5, tone: "ink" as const, label: "FUND" },
        { x: 31, y: 4, w: 7, h: 5, tone: "red" as const, label: "COMPETITOR" },
      ],
      edges: [{ from: [9, 6] as [number, number], to: [31, 6] as [number, number], tone: "red" as const }],
    },
  },
  {
    n: "02",
    key: "one-step",
    tag: "One step away",
    title: "They co-invest with your competitor's lead",
    body: "No stake of their own, but repeated shared rounds with a fund that backs your competitor. Decks and deal notes travel between co-investors.",
    evidence: "leak" as const,
    graph: {
      cols: 40,
      rows: 15,
      nodes: [
        { x: 1, y: 1, w: 7, h: 5, tone: "ink" as const, label: "FUND" },
        { x: 16, y: 8, w: 7, h: 5, tone: "amber" as const, label: "CO-INVESTOR" },
        { x: 32, y: 1, w: 7, h: 5, tone: "red" as const, label: "COMPETITOR" },
      ],
      edges: [
        { from: [8, 3] as [number, number], to: [16, 10] as [number, number], tone: "amber" as const },
        { from: [23, 10] as [number, number], to: [32, 3] as [number, number], tone: "red" as const },
      ],
    },
  },
  {
    n: "03",
    key: "lookalike",
    tag: "Lookalike",
    title: "They own a company like yours",
    body: "FlipDD reads each portfolio and flags companies whose description matches yours, and says how each match was judged.",
    evidence: "look" as const,
    graph: {
      cols: 40,
      rows: 15,
      nodes: [
        { x: 1, y: 4, w: 7, h: 5, tone: "ink" as const, label: "FUND" },
        { x: 16, y: 4, w: 7, h: 5, tone: "slate" as const, label: "PORTFOLIO CO" },
        { x: 32, y: 4, w: 7, h: 5, tone: "outline" as const, label: "YOU" },
      ],
      edges: [
        { from: [8, 6] as [number, number], to: [16, 6] as [number, number], tone: "slate" as const },
        { from: [23, 6] as [number, number], to: [32, 6] as [number, number], tone: "slate" as const, dashed: true },
      ],
    },
  },
];

const ROW_STYLE: Record<Level, { tone: string; bar: string }> = {
  direct_high: { tone: "bg-signal text-white ring-signal", bar: "bg-signal" },
  direct_moderate: { tone: "bg-signal/20 text-[#F08A76] ring-[#F08A76]/30", bar: "bg-signal/60" },
  indirect: { tone: "bg-caution/20 text-[#E3A04A] ring-[#E3A04A]/30", bar: "bg-caution" },
  possible: { tone: "bg-paper/10 text-paper/80 ring-paper/25", bar: "bg-paper/40" },
  thin: { tone: "bg-transparent text-paper/50 ring-paper/20", bar: "bg-paper/20" },
  unresolved: { tone: "bg-transparent text-paper/50 ring-paper/20", bar: "bg-paper/20" },
  clear: { tone: "bg-[#1D6A4B]/25 text-[#7CC4A4] ring-[#7CC4A4]/30", bar: "bg-[#7CC4A4]" },
};
const LIGHT_BAR: Record<Level, string> = {
  direct_high: "bg-signal",
  direct_moderate: "bg-signal/60",
  indirect: "bg-caution",
  possible: "bg-ink/40",
  thin: "bg-line",
  unresolved: "bg-line",
  clear: "bg-clear",
};

function steps(show: Showcase | null) {
  const run = show?.run;
  const investors = (run?.investors || []).slice(0, 4);
  return [
  {
    title: "Describe your startup",
    body: "A sentence on what you build. FlipDD finds your funded competitors in Cala's graph; keep the ones that matter.",
    screen: (
      <div className="space-y-1.5">
        <div className="rounded-md border border-line bg-white/70 px-2 py-1.5 text-[11px] font-semibold">
          {run?.startupName || "Your startup"}
        </div>
        <div className="line-clamp-2 rounded-md border border-line bg-white/70 px-2 py-1.5 text-[11px] leading-snug text-muted">
          {run?.description || "What you build, in a sentence"}
        </div>
        <div className="flex flex-wrap gap-1">
          {(run?.competitors || []).map((c) => (
            <span key={c} className="rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-semibold text-signal">
              {c}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Paste your meeting list",
    body: "One investor per line. FlipDD finds each one in Cala and merges duplicate records.",
    screen: (
      <ul className="space-y-1 font-mono text-[11px]">
        {investors.map((r) => [r.name, r.entities.length > 1 ? `${r.entities.length} merged` : "1 record"]).map(([n, r]) => (
          <li key={n} className="flex items-center justify-between rounded border border-line bg-white/60 px-2 py-1">
            <span>{n}</span>
            <span className="text-muted">{r}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "FlipDD walks the graph",
    body: "It reads each investor's rounds, opens your competitors' rounds, and follows the co-investors.",
    screen: (
      <PixelGraph
        label="Graph walk"
        cols={24}
        rows={11}
        nodes={[
          { x: 0, y: 1, w: 4, h: 3, tone: "ink" },
          { x: 0, y: 7, w: 4, h: 3, tone: "ink" },
          { x: 10, y: 4, w: 4, h: 3, tone: "amber" },
          { x: 20, y: 4, w: 4, h: 3, tone: "red" },
        ]}
        edges={[
          { from: [4, 2], to: [10, 5], tone: "amber" },
          { from: [4, 8], to: [20, 6], tone: "slate", dashed: true },
          { from: [14, 5], to: [20, 5], tone: "red" },
        ]}
      />
    ),
  },
  {
    title: "Decide before the meeting",
    body: "A ranked list with what to share and what to ask, every line linked to its source.",
    screen: (
      <ul className="space-y-1">
        {(show?.rows || []).slice(0, 4).map((r) => (
          <li key={r.fund} className="flex items-center gap-2 rounded border border-line bg-white/60 px-2 py-1.5">
            <span className={`h-3 w-1 shrink-0 rounded-full ${LIGHT_BAR[r.level]}`} />
            <span className="truncate text-[10.5px] font-semibold">{r.fund}</span>
            <span className="ml-auto shrink-0 font-mono text-[9.5px] text-muted">{r.share}</span>
          </li>
        ))}
      </ul>
    ),
  },
  ];
}

export default async function Landing() {
  const show = await loadShowcase();
  const STEPS = steps(show);
  const a = show?.rows || [];
  // One row per verdict for the "ranked list" card.
  const ranked = [
    a.find((r) => r.level === "direct_high" || r.level === "direct_moderate"),
    a.find((r) => r.level === "indirect"),
    a.find((r) => r.level === "clear"),
  ].filter((r): r is NonNullable<typeof r> => Boolean(r));
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[calc((100vw_+_89rem)/2)] items-center justify-between px-2.5">
          <Link href="/" aria-label="FlipDD home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#problem" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              The problem
            </a>
            <a href="#how" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              How it works
            </a>
            <a href="#run" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              A real run
            </a>
            <a href="#go" className="hidden rounded-full px-3 py-2 text-sm text-muted hover:text-ink md:block">
              On the go
            </a>
            <span className="mx-2 hidden h-5 w-px bg-line sm:block" />
            <span className="hidden sm:inline-flex">
              <CalaLogo label="Built on" height={18} className="text-xs text-muted" />
            </span>
            <MobileNav
              links={[
                { href: "#problem", label: "The problem" },
                { href: "#how", label: "How it works" },
                { href: "#run", label: "A real run" },
                { href: "#go", label: "On the go" },
              ]}
            />
          </nav>
        </div>
      </header>

      {/* Hero, over the drifting fund graph */}
      <section className="relative overflow-hidden border-b border-line">
        <FundGraph />
        {/* Soft fade behind the text so the graph never competes with it */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(42%_62%_at_22%_52%,rgba(244,241,232,0.92),rgba(244,241,232,0.55)_55%,transparent_80%)]" />
        <div className="relative mx-auto grid max-w-[85.5rem] items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1fr_1.05fr] lg:pb-20 lg:pt-12">
          <div>
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              <span className="text-signal">[ FlipDD ]</span> / Reverse due diligence for founders
            </p>
            <h1 className="font-serif text-[2.9rem] leading-[1.03] tracking-tight sm:text-6xl lg:text-[4.2rem]">
              Some investors on your list already backed your competitor.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              They take the meeting to hear your pitch. FlipDD checks your Slush meeting list against
              Cala&rsquo;s graph and tells you who&rsquo;s tied to your competitor, and what&rsquo;s safe to share.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/app" className="btn-primary !px-7 !py-3.5 !text-base">
                Launch app
              </Link>
              <a href="#run" className="btn-ghost !px-7 !py-3.5 !text-base">
                See a real run
              </a>
            </div>
            <p className="mt-5 text-sm text-muted">
              No sign-up. Every finding links to the article or filing behind it.
            </p>
            <div className="mt-6 flex items-center gap-3 text-sm text-muted">
              <CalaLogo label="Data from" height={22} />
              <span className="text-muted/80">knowledge graph · companies, rounds, investors, Slush 2026</span>
            </div>
          </div>
          <HeroVisual data={show?.hero} />
        </div>
      </section>

      {/* Ticker */}
      <div className="overflow-hidden border-b border-line bg-night py-3.5 text-paper" aria-hidden>
        <div className="flex w-max animate-marquee">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 items-center">
              {TICKER.map((t) => (
                <span key={`${k}${t}`} className="flex items-center font-pixel text-lg uppercase tracking-wide">
                  <span className="px-6">{t}</span>
                  <FlipGlyph size={18} className="text-signal" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Problem */}
      <section id="problem" className="mx-auto max-w-[85.5rem] scroll-mt-20 px-5 py-24">
        <SectionTag n="01" title="The problem" />
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <h2 className="font-serif text-5xl leading-[1.05] sm:text-6xl">Investors check you. Check them back.</h2>
            <p className="text-lg leading-relaxed text-muted">
              An investor tied to your competitor is a bad meeting twice over: they are unlikely to invest,
              and your deck ends up one conversation away from the company you are racing. The tie is rarely
              on their website. It sits in the graph, in three shapes.
            </p>
          </div>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {TRAPS.map((t, i) => (
            <Reveal key={t.n} delay={i * 120}>
              <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card transition hover:-translate-y-1 hover:border-ink/40">
                <div className="flex items-center justify-between border-b border-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span>
                    <span className="text-signal">{t.n}</span> / {t.tag}
                  </span>
                </div>
                {trapImage(t.key) ? (
                  <div className="aspect-[3/2] overflow-hidden border-b border-line bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={trapImage(t.key)}
                      alt={t.title}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : (
                  <div className="border-b border-line bg-paper/60 px-5 py-6">
                    <PixelGraph label={t.title} {...t.graph} />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-serif text-[1.75rem] leading-tight">{t.title}</h3>
                  <p className="mt-3 flex-1 leading-relaxed text-muted">{t.body}</p>
                  {show?.traps[t.evidence] && (
                    <p
                      className="mt-5 flex items-baseline gap-2 border-t border-line pt-3 font-mono text-[11px] tracking-wide"
                      title={`From a real run, ${show.date}`}
                    >
                      <span className="shrink-0 uppercase text-muted">Found</span>
                      <span className="min-w-0 truncate text-ink/85">
                        <span className="text-signal">!</span> {show.traps[t.evidence]}
                      </span>
                    </p>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What you walk in with */}
      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-[85.5rem] px-5 py-24">
          <SectionTag n="02" title="What you walk in with" />
          <Reveal>
            <h2 className="max-w-3xl font-serif text-5xl leading-[1.05] sm:text-6xl">
              A plan for every meeting, not a database to browse.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {/* Ranked list */}
            <Reveal className="lg:col-span-2">
              <div className="h-full rounded-3xl border border-line bg-paper p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span className="text-signal">[a]</span> One ranked list
                </p>
                <h3 className="mt-3 text-xl font-semibold">Sorted by how careful to be</h3>
                <p className="mt-2 max-w-xl text-muted">
                  Every investor you are meeting, in one table, with their last sourced round and how often
                  they led in the past year.
                </p>
                <ul className="mt-6 space-y-2">
                  {ranked.map((r) => (
                    <li key={r.fund} className="flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3">
                      <span className={`h-8 w-1 shrink-0 rounded-full ${LIGHT_BAR[r.level]}`} />
                      <span className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                        <span className="block truncate text-sm font-semibold">{r.fund}</span>
                        <span className="block truncate text-[11px] text-muted">{r.pill}</span>
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">{r.line}</span>
                      {/* Wraps on phones instead of pushing the page wider than the screen. */}
                      <span className="ml-auto max-w-[45%] text-right font-mono text-[11px] leading-snug text-ink/70 sm:max-w-none sm:shrink-0">{r.share}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            {/* Reasons */}
            <Reveal delay={120}>
              <div className="h-full rounded-3xl border border-line bg-paper p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span className="text-signal">[b]</span> Reasons, not a score
                </p>
                <h3 className="mt-3 text-xl font-semibold">Why, in plain words</h3>
                {show?.top && (
                  <p className="mt-2 text-xs text-muted">
                    {show.top.fund} and {show.top.competitor}, from the run on {show.date}
                  </p>
                )}
                <ul className="mt-4 space-y-3 text-sm">
                  {(show?.top?.reasons || []).map((r) => (
                    <li key={r.text} className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 ${r.tone === "bad" ? "bg-signal" : r.tone === "warn" ? "bg-caution" : r.tone === "good" ? "bg-clear" : "bg-ink/30"}`}
                      />
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
                {show?.top?.source?.url && (
                  <a
                    href={show.top.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-mono text-[11px] hover:border-ink"
                  >
                    {show.top.source.label}
                    {show.top.source.date ? ` · ${show.top.source.date}` : ""} <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </Reveal>
            {/* Share */}
            <Reveal>
              <div className="h-full rounded-3xl border border-line bg-paper p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span className="text-signal">[c]</span> What to share
                </p>
                <h3 className="mt-3 text-xl font-semibold">Three levels of disclosure</h3>
                <div className="mt-6 space-y-2">
                  {[
                    ["Teaser only", "bg-signal text-white"],
                    ["Deck without customer names", "bg-caution/15 text-caution"],
                    ["Full data room", "bg-clear/15 text-clear"],
                  ].map(([label, cls], i) => (
                    <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold ${cls}`}>
                      <span>{label}</span>
                      <DisclosureMeter level={(i + 1) as 1 | 2 | 3} />
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            {/* Ask */}
            <Reveal className="lg:col-span-2" delay={120}>
              <div className="flex h-full flex-col justify-between rounded-3xl bg-night p-6 text-paper sm:p-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/50">
                  <span className="text-signal">[d]</span> What to ask
                </p>
                <p className="mt-6 font-serif text-3xl leading-snug sm:text-4xl">
                  &ldquo;
                  {show?.top?.ask ||
                    "Which companies in your portfolio, announced or not, work on something close to what we do?"}
                  &rdquo;
                </p>
                <p className="mt-6 text-sm text-paper/55">
                  {show?.top
                    ? `What FlipDD told the founder to ask ${show.top.fund}, written from the sourced fact behind the finding.`
                    : "Written from the sourced fact behind each finding, so the question is specific and hard to dodge."}
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[85.5rem] scroll-mt-20 px-5 py-24">
        <SectionTag n="03" title="How it works" />
        <Reveal>
          <h2 className="max-w-3xl font-serif text-5xl leading-[1.05] sm:text-6xl">
            Four steps from a list of names to a plan.
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <li className="flex h-full flex-col rounded-3xl border border-line bg-card">
                <div className="flex items-center justify-between px-5 pt-5">
                  <span className="font-pixel text-4xl leading-none text-ink">{String(i + 1).padStart(2, "0")}</span>
                  {i < STEPS.length - 1 && <span className="hidden font-mono text-muted lg:block">→</span>}
                </div>
                <div className="mx-5 mt-5 h-[150px] overflow-hidden rounded-xl border border-line bg-paper p-3">
                  {s.screen}
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* A real run */}
      <section id="run" className="scroll-mt-16 bg-night text-paper">
        <div className="mx-auto max-w-[85.5rem] px-5 py-24">
          <SectionTag n="04" title="A real run" dark />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
              <h2 className="font-serif text-5xl leading-[1.05] sm:text-6xl">Real funds, real rounds, real sources.</h2>
              <p className="text-lg leading-relaxed text-paper/60">
                {show
                  ? `Recorded on ${show.date}: ${show.run.startupName} named ${show.run.competitors.join(", ")} as its competitor and was meeting ${show.run.investors.length} European funds. ${show.requests} Cala requests (${show.liveCalls} live), ${show.seconds} seconds. Run the same check yourself and you get today's answer.`
                  : "No run of the example has been saved on this server yet. Run it once in the app and it appears here."}
              </p>
            </div>
          </Reveal>
          {show ? (
            <div className="mt-14 grid gap-5 lg:grid-cols-[1fr_1.05fr]">
              <Reveal>
                <RunTerminal lines={show.terminal} label={`flipdd · ${show.date}`} />
              </Reveal>
              <Reveal delay={150}>
                <div className="overflow-hidden rounded-2xl border border-paper/15">
                  <div className="flex items-center justify-between border-b border-paper/10 px-5 py-3 text-sm font-semibold">
                    <span>Result</span>
                    <span className="font-mono text-[11px] font-normal text-paper/40">sorted by severity</span>
                  </div>
                  <ul className="divide-y divide-paper/10">
                    {show.rows.map((r, i) => (
                      <li key={r.fund} className="flex items-stretch">
                        <span className={`w-1 shrink-0 ${ROW_STYLE[r.level].bar}`} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                          <span className="w-4 font-mono text-xs text-paper/35">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{r.fund}</span>
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ROW_STYLE[r.level].tone}`}>
                                {r.pill}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-paper/60">
                              {r.line}
                              {r.source?.url && (
                                <a
                                  href={r.source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 inline-flex items-center gap-0.5 rounded border border-paper/20 px-1.5 py-0.5 font-mono text-[10.5px] text-paper/75 transition hover:border-paper hover:text-paper"
                                >
                                  {r.source.label}
                                  <ArrowUpRight className="h-3 w-3" />
                                </a>
                              )}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] text-paper/70 sm:w-44 sm:text-right">{r.share}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-paper/10 px-5 py-4 text-sm text-paper/70">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">
                      Your round · exposure {show.round.score}/100
                    </span>
                    <p className="mt-1.5">
                      {show.round.headline}
                      {show.round.hub ? ` ${show.round.hub}` : ""}
                    </p>
                  </div>
                  {show.slush && (
                    <div className="border-t border-paper/10 px-5 py-4 text-sm text-paper/70">
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal">{show.slush.event}</span>
                      <p className="mt-1.5">
                        Checked against {show.slush.attendees.toLocaleString("en-GB")} attending companies:{" "}
                        {show.slush.namedAttending.length
                          ? `${show.slush.namedAttending.join(", ")} will be there, `
                          : "no named competitor attending, "}
                        and {show.slush.portfolioAtSlush} portfolio companies of these funds are attending.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper/10 px-5 py-4">
                    <p className="text-sm text-paper/60">Same input, run against Cala now.</p>
                    <Link
                      href="/app?example=1"
                      className="rounded-full bg-paper px-5 py-2 text-sm font-semibold text-ink transition hover:bg-signal hover:text-paper"
                    >
                      Run this check live
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>
          ) : (
            <div className="mt-14">
              <Link
                href="/app?example=1"
                className="inline-flex rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink transition hover:bg-signal hover:text-paper"
              >
                Run the example
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* On the go: phone line, Telegram, spoken briefings */}
      <OnTheGo phone={PHONE_NUMBER || undefined} telegram={TELEGRAM_BOT} />

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-paper/10 bg-night text-paper">
        {publicImage("art", "before-slush") ? (
          // A founder at the door of a snowy Slush hall. The picture's left half is
          // night sky, so the headline sits there; phones get a darker veil.
          <div className="pointer-events-none absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicImage("art", "before-slush")}
              alt=""
              className="h-full w-full object-cover object-[72%_62%] opacity-45 lg:object-[center_62%] lg:opacity-95"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-night via-night/40 to-transparent lg:via-transparent" />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] opacity-90 lg:block">
            <div className="flex h-full items-center">
              <PixelField />
            </div>
          </div>
        )}
        <div className="relative mx-auto max-w-[85.5rem] px-5 py-24 lg:py-36">
          <SectionTag n="06" title="Before Slush" dark />
          <h2 className="max-w-2xl font-serif text-5xl leading-[1.05] sm:text-7xl">
            Check your meeting list before you walk in.
          </h2>
          <Link
            href="/app"
            className="mt-10 inline-flex items-center rounded-full bg-paper px-8 py-4 text-base font-semibold text-ink transition hover:bg-signal hover:text-paper"
          >
            Launch app
          </Link>
        </div>
        <div className="relative border-t border-paper/10 bg-night/85 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[85.5rem] flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-paper/50">
            <Wordmark tone="light" />
            <CalaLogo label="Data from" tone="light" height={20} className="font-mono text-[11px] uppercase tracking-[0.14em]" />
          </div>
        </div>
      </section>
      <ContactDock />
    </main>
  );
}
