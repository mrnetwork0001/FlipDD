// Landing section 05: FlipDD away from the laptop. A phone line, Telegram, and
// spoken briefings in the app. The call shown is the real output of the call
// flow for the built-in example (Creandum and Northzone against Lovable).
// The number and the bot link appear only once they exist (env), so the page
// never points at a line that isn't live.

import Link from "next/link";
import Reveal from "./Reveal";
import { CallMark, ListenGlyph, MicGlyph, PhoneGlyph, SendGlyph } from "./Glyphs";

function Bubble({ who, children, tone = "light" }: { who: string; children: React.ReactNode; tone?: "light" | "dark" | "self" | "selfOnDark" }) {
  const style = {
    light: "bg-white/70 text-ink ring-1 ring-inset ring-line",
    dark: "bg-paper/10 text-paper/90 ring-1 ring-inset ring-paper/15",
    self: "bg-ink text-paper",
    selfOnDark: "bg-paper text-ink",
  }[tone];
  const mine = tone === "self" || tone === "selfOnDark";
  return (
    <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${style} ${mine ? "ml-auto rounded-br-md" : "rounded-bl-md"}`}>
      <p className={`mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tone === "light" || tone === "selfOnDark" ? "text-muted" : "text-paper/45"}`}>{who}</p>
      {children}
    </div>
  );
}

function VoiceNote({ seconds }: { seconds: number }) {
  const bars = [3, 6, 9, 5, 11, 7, 4, 9, 12, 6, 8, 5, 10, 7, 3, 6, 9, 4];
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/15">
        <span className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current" />
      </span>
      <span className="flex h-4 items-center gap-[2px]">
        {bars.map((h, i) => (
          <span key={i} className="w-[2px] rounded-full bg-current opacity-80" style={{ height: h + 2 }} />
        ))}
      </span>
      <span className="font-mono text-[11px] opacity-60">0:{String(seconds).padStart(2, "0")}</span>
    </span>
  );
}

export default function OnTheGo({ phone, telegram }: { phone?: string; telegram?: string }) {
  const tel = phone?.replace(/[^\d+]/g, "");
  const bot = telegram?.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  return (
    <section id="go" className="mx-auto max-w-[85.5rem] scroll-mt-20 px-5 py-24">
      <div className="mb-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        <span className="text-signal">[ 05 ]</span>
        <span>/ On the go</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <Reveal>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <h2 className="font-serif text-5xl leading-[1.05] sm:text-6xl">Between meetings, just ask.</h2>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            Slush is a day of walking from one table to the next. FlipDD answers on a phone call, in Telegram, or out
            loud in the app, from the same live check on Cala&apos;s graph.
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* Call it */}
        <Reveal>
          <article className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-night p-6 text-paper sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/20 blur-3xl"
            />
            <div className="relative flex flex-wrap items-center gap-5">
              <CallMark size={104} />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/50">Phone line</p>
                <h3 className="mt-1 font-serif text-4xl leading-tight">Call it.</h3>
                <p className="mt-1 max-w-sm text-paper/65">
                  Say who you&apos;re meeting and who you compete with. Hear the result before you sit down.
                </p>
              </div>
            </div>

            <div className="relative mt-7 space-y-2.5 rounded-2xl border border-paper/10 bg-black/20 p-4">
              <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper/45">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-clear" /> On a call
                </span>
                <span>Real output of the call flow</span>
              </div>
              <Bubble who="You" tone="selfOnDark">
                I&apos;m meeting Creandum and Northzone. My competitor is Lovable.
              </Bubble>
              <Bubble who="FlipDD" tone="dark">
                Checking Creandum and Northzone against Lovable in Cala&apos;s graph.
              </Bubble>
              <Bubble who="FlipDD" tone="dark">
                2 of your 2 meetings are within one step of Lovable. Round exposure 65 out of 100.{" "}
                <span className="text-paper">Creandum: direct conflict. Backed Lovable, February 2025. Teaser only.</span>{" "}
                Northzone: co-invests with Accel, which led Lovable.
              </Bubble>
              <Bubble who="You" tone="selfOnDark">
                No, that&apos;s all. Thanks.
              </Bubble>
            </div>

            <div className="relative mt-6 flex flex-wrap items-center gap-3">
              {tel ? (
                <a
                  href={`tel:${tel}`}
                  className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3 font-semibold text-white transition hover:bg-paper hover:text-ink"
                >
                  <PhoneGlyph size={16} /> Call {phone}
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-paper/20 px-5 py-2.5 text-sm text-paper/70">
                  <PhoneGlyph size={15} /> Runs on any Twilio number
                </span>
              )}
              <span className="text-sm text-paper/45">Follow-up questions work on the same call.</span>
            </div>
          </article>
        </Reveal>

        <div className="grid gap-5">
          {/* Telegram */}
          <Reveal delay={100}>
            <article className="flex h-full flex-col rounded-3xl border border-line bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-paper">
                  <SendGlyph size={20} />
                </span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Telegram</p>
                  <h3 className="text-xl font-semibold">Text it, or send a voice note.</h3>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Bubble who="You" tone="self">
                  <code className="font-mono text-[12.5px]">/check Creandum, Northzone vs Lovable</code>
                </Bubble>
                <Bubble who="You" tone="self">
                  <VoiceNote seconds={6} />
                </Bubble>
                <Bubble who="FlipDD">
                  <b>Creandum</b> · Direct conflict. Backed Lovable, Feb 2025. Share: <i>Teaser only</i>. Plus a voice reply.
                </Bubble>
              </div>
              {bot && (
                <a href={`https://t.me/${bot}`} className="mt-4 text-sm font-semibold underline-offset-2 hover:underline">
                  Open @{bot} →
                </a>
              )}
            </article>
          </Reveal>

          {/* Listen */}
          <Reveal delay={200}>
            <article className="flex h-full flex-col rounded-3xl border border-line bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-paper">
                  <ListenGlyph size={20} />
                </span>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">In the app</p>
                  <h3 className="text-xl font-semibold">Play my day.</h3>
                </div>
              </div>
              <p className="mt-3 leading-relaxed text-muted">
                Every meeting read out in the suggested order: who&apos;s tied to your competitor, what to share, what to
                ask. Ask Cala takes questions by voice too.
              </p>
              <p className="mt-3 rounded-xl bg-paper px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-ink/75 ring-1 ring-inset ring-line">
                &ldquo;Meeting 8 of 8: Creandum. Direct conflict. Backed Lovable, February 2025. Share a teaser only.&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Link href="/app" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-semibold text-paper hover:bg-ink/85">
                  <ListenGlyph size={14} /> Try it in the app
                </Link>
                <span className="inline-flex items-center gap-1 text-muted">
                  <MicGlyph size={14} /> voice questions
                </span>
              </div>
            </article>
          </Reveal>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">
        Also works inside Claude or Cursor: add <code className="font-mono text-ink">/api/mcp</code> as an MCP server and
        ask it to check your meeting list.
      </p>
    </section>
  );
}
