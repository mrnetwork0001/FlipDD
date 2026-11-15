"use client";

// Small pieces of one investor's result, shared by the app's result rows and the
// investor profile page: verdict colours, source links, findings and Copy.

import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import type { InvestorKind, Level, Reason, SourceRef, Tone } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-02-25" → "25 Feb 2025", "2025-02" → "Feb 2025". Read from the string, so no time zone shifts it. */
export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] || m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/** Where an investor's profile page lives (it opens in a new tab). */
export const profileHref = (runId: string, input: string) => `/investor/${runId}/${encodeURIComponent(input)}`;

export const LEVEL_STYLE: Record<Level, { pill: string; bar: string }> = {
  direct_high: { pill: "bg-signal text-white ring-signal", bar: "bg-signal" },
  direct_moderate: { pill: "bg-signal/10 text-signal ring-signal/30", bar: "bg-signal/60" },
  indirect: { pill: "bg-caution/10 text-caution ring-caution/30", bar: "bg-caution" },
  possible: { pill: "bg-ink/5 text-ink/75 ring-ink/20", bar: "bg-ink/40" },
  thin: { pill: "bg-transparent text-muted ring-line", bar: "bg-line" },
  unresolved: { pill: "bg-transparent text-muted ring-line", bar: "bg-line" },
  clear: { pill: "bg-clear/10 text-clear ring-clear/30", bar: "bg-clear" },
};
export const KIND_LABEL: Record<InvestorKind, string> = {
  fund: "VC fund",
  angel: "Angel",
  lender: "Lender",
  grant: "Grant programme",
  corporate: "Corporate investor",
};
export const TONE_DOT: Record<Tone, string> = {
  bad: "bg-signal",
  warn: "bg-caution",
  good: "bg-clear",
  neutral: "bg-ink/25",
};

export function SourceLink({ source, compact }: { source: SourceRef; compact?: boolean }) {
  const text = compact ? source.label : `${source.label}${source.date ? ` · ${fmtDate(source.date)}` : ""}`;
  if (!source.url) return <span className="text-xs text-muted">{text}</span>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title || source.url}
      className="inline-flex items-center gap-0.5 rounded-md border border-line bg-white/60 px-1.5 py-0.5 font-mono text-[11px] text-ink/80 transition hover:border-ink hover:text-ink"
    >
      {text}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

export function Sources({ sources, max = 4 }: { sources: SourceRef[]; max?: number }) {
  const linked = sources.filter((s) => s.url).slice(0, max);
  if (!linked.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sources</span>
      {linked.map((s) => (
        <SourceLink key={s.url} source={s} />
      ))}
    </div>
  );
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[r.tone]}`} />
          <span className="leading-relaxed">
            {r.text}
            {r.source?.url && (
              <span className="ml-1.5 inline-block align-middle">
                <SourceLink source={r.source} compact />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PathNode({ tone, children }: { tone: "ink" | "amber" | "red"; children: React.ReactNode }) {
  const cls =
    tone === "ink"
      ? "border-ink bg-ink text-paper"
      : tone === "amber"
        ? "border-caution/40 bg-caution/10 text-caution"
        : "border-signal/40 bg-signal/10 text-signal";
  return <span className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function Finding({
  tone,
  tag,
  title,
  children,
}: {
  tone: "red" | "amber" | "slate";
  tag: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const border = tone === "red" ? "border-l-signal" : tone === "amber" ? "border-l-caution" : "border-l-ink/30";
  return (
    <div className={`rounded-xl border border-line border-l-4 bg-white/50 p-4 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tag}</span>
        <span className="font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-muted transition hover:border-ink hover:text-ink"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
