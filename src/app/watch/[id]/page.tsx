"use client";

import Link from "next/link";
import FlipLogo from "@/components/FlipLogo";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Bell, Check, Link2, Loader2, RefreshCw } from "lucide-react";
import type { WatchAlert, WatchReport } from "@/lib/types";

const AUTO_REFRESH_MS = 10 * 60 * 1000;

const SEVERITY: Record<WatchAlert["severity"], { bar: string; label: string; pill: string }> = {
  high: { bar: "border-l-signal", label: "Act on this", pill: "bg-signal text-white" },
  medium: { bar: "border-l-caution", label: "Worth a look", pill: "bg-caution/10 text-caution ring-1 ring-inset ring-caution/30" },
  low: { bar: "border-l-ink/25", label: "Context", pill: "text-muted ring-1 ring-inset ring-line" },
};

function fmtWhen(iso?: string): string {
  if (!iso) return "undated";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function WatchPage({ params }: { params: { id: string } }) {
  const [report, setReport] = useState<WatchReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const check = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/watch/${params.id}${force ? "?force=1" : ""}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Check failed (${res.status})`);
        setReport(body as WatchReport);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [params.id],
  );

  useEffect(() => {
    check(false);
    const timer = setInterval(() => check(false), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [check]);

  const w = report?.watch;
  const fresh = report?.alerts.filter((a) => a.isNew).length ?? 0;
  const counts = {
    high: report?.alerts.filter((a) => a.severity === "high").length ?? 0,
    medium: report?.alerts.filter((a) => a.severity === "medium").length ?? 0,
    low: report?.alerts.filter((a) => a.severity === "low").length ?? 0,
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-16 max-w-[89rem] items-center justify-between px-5">
          <Link href="/app" className="flex items-center transition hover:opacity-75" aria-label="FlipDD">
            <FlipLogo height={26} />
          </Link>
          <span className="font-mono text-[11px] text-muted">live news via Context.dev</span>
        </div>
      </header>

      <main className="mx-auto max-w-[85.5rem] px-5 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Watchlist{w?.startupName ? ` · ${w.startupName}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="max-w-2xl font-serif text-5xl leading-none">
            {report ? (counts.high ? `${counts.high} thing${counts.high === 1 ? "" : "s"} to act on` : "Nothing urgent in the news") : "Checking the news…"}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(window.location.href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => check(true)} disabled={loading} className="btn-primary !py-2 !text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Check now
            </button>
          </div>
        </div>

        {report && (
          <p className="mt-3 text-sm text-muted">
            Read {report.articlesRead} articles from the last {report.windowDays} days about your {w?.competitors.length}{" "}
            competitor{w?.competitors.length === 1 ? "" : "s"} and {w?.investors.length} investor
            {w?.investors.length === 1 ? "" : "s"}. Checked {new Date(report.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            {fresh > 0 ? ` · ${fresh} new since your last check` : ""}. This page re-checks every 10 minutes while open.
          </p>
        )}

        {w && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="label">Competitors watched</p>
              <p className="text-sm">{w.competitors.join(", ")}</p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="label">Investors watched</p>
              <p className="text-sm">{w.investors.join(", ")}</p>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-6 flex items-center gap-2 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}
        {report && report.errors.length > 0 && (
          <p className="mt-4 text-xs text-muted">Some lookups failed: {report.errors.slice(0, 3).join("; ")}</p>
        )}

        <ol className="mt-8 space-y-3">
          {report?.alerts.map((a) => {
            const s = SEVERITY[a.severity];
            return (
              <li key={a.key} className={`animate-rise rounded-xl border border-line border-l-4 bg-card p-4 ${s.bar}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.pill}`}>{s.label}</span>
                  {a.isNew && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper">
                      <Bell className="h-3 w-3" /> New
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-muted">
                    {a.article.source} · {fmtWhen(a.article.publishedAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed">{a.text}</p>
                <a
                  href={a.article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-start gap-1 font-serif text-lg leading-snug text-ink/90 underline-offset-4 hover:underline"
                >
                  {a.article.title}
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                </a>
                {a.article.description && (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{a.article.description}</p>
                )}
              </li>
            );
          })}
        </ol>
        {report && !report.alerts.length && (
          <p className="mt-8 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            No article in the last {report.windowDays} days ties an investor on your list to a competitor, and no
            competitor funding news. FlipDD keeps checking while this page is open.
          </p>
        )}
        <p className="mt-10 text-xs leading-relaxed text-muted">
          The first check sets the baseline; anything that appears after it is marked New. Matches are by name in the
          headline and summary, so open the article before acting on it. The Cala check covers recorded rounds; this
          page covers what happened since.
        </p>
      </main>
    </div>
  );
}
