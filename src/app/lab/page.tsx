"use client";

// Background lab: each continuous effect behind a copy of the landing hero, to
// pick one before it goes on the real pages. Not linked from the site.

import Link from "next/link";
import { BACKGROUNDS } from "@/components/bg/Backgrounds";
import FlipLogo from "@/components/FlipLogo";

export default function Lab() {
  return (
    <main className="min-h-screen bg-paper">
      <header className="flex h-16 items-center justify-between border-b border-line px-5">
        <FlipLogo height={28} />
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Background lab · pick one</span>
      </header>
      <div className="space-y-10 px-3 py-8 lg:px-8">
        {BACKGROUNDS.map(({ key, name, note, C }, i) => (
          <section key={key}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <span className="font-mono text-sm text-signal">0{i + 1}</span>
              <h2 className="font-serif text-3xl leading-none">{name}</h2>
              <p className="text-sm text-muted">{note}</p>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-paper">
              <C />
              <div className="relative grid min-h-[440px] items-center gap-10 px-8 py-14 lg:grid-cols-[1fr_0.9fr] lg:px-14">
                <div>
                  <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                    <span className="text-signal">[ FlipDD ]</span> / Reverse due diligence for founders
                  </p>
                  <h1 className="max-w-xl font-serif text-5xl leading-[1.03] tracking-tight lg:text-6xl">
                    Some investors on your list already backed your competitor.
                  </h1>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link href="/app" className="btn-primary !px-7 !py-3.5 !text-base">
                      Launch app
                    </Link>
                    <span className="btn-ghost !px-7 !py-3.5 !text-base">See a real run</span>
                  </div>
                </div>
                <div className="hidden h-64 rounded-3xl border border-line bg-card/80 shadow-[0_24px_60px_-40px_rgba(22,19,14,0.45)] backdrop-blur-[1px] lg:block" />
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
