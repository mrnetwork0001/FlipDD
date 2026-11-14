"use client";

// The meeting list as a cart: every investor the founder plans to meet, with
// its verdict from the last check, the ones added since (not checked yet),
// a remove button for each, and one button to check the updated list.

import { useEffect } from "react";
import { ClipboardList, Loader2, Play, X } from "lucide-react";
import { AddedGlyph } from "./Glyphs";
import { LEVEL_LABEL, type InvestorResult, type Level } from "@/lib/types";

const PILL: Record<Level, string> = {
  direct_high: "bg-signal text-white",
  direct_moderate: "bg-signal/10 text-signal ring-1 ring-inset ring-signal/30",
  indirect: "bg-caution/10 text-caution ring-1 ring-inset ring-caution/30",
  possible: "bg-ink/5 text-ink/75 ring-1 ring-inset ring-ink/20",
  thin: "text-muted ring-1 ring-inset ring-line",
  unresolved: "text-muted ring-1 ring-inset ring-line",
  clear: "bg-clear/10 text-clear ring-1 ring-inset ring-clear/30",
};

export const MAX_INVESTORS = 12;

export function MeetingListButton({ count, added, onOpen }: { count: number; added: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex sm:bottom-6 sm:right-6 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-[0_18px_40px_-18px_rgba(22,19,14,0.7)] transition hover:bg-signal animate-pop"
    >
      <ClipboardList className="h-4 w-4" />
      Meeting list · {count}
      {added > 0 && <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-bold text-white">+{added} new</span>}
    </button>
  );
}

export default function MeetingListDrawer({
  open,
  onClose,
  investors,
  results,
  added,
  running,
  onRemove,
  onCheck,
}: {
  open: boolean;
  onClose: () => void;
  /** Names on the list, in order. */
  investors: string[];
  /** Verdicts from the last check, by investor name as typed. */
  results: Record<string, InvestorResult>;
  /** Names added since the last check. */
  added: string[];
  running: boolean;
  onRemove: (name: string) => void;
  onCheck: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;
  const isNew = (n: string) => added.some((a) => a.toLowerCase() === n.toLowerCase());
  const unchecked = investors.filter((n) => !results[n] || isNew(n)).length;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your meeting list">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-night/40 backdrop-blur-[2px]" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-card shadow-2xl animate-rise">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <span className="text-signal">[ your meeting list ]</span>
            </p>
            <p className="mt-1 font-serif text-3xl leading-none">
              {investors.length} investor{investors.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Up to {MAX_INVESTORS}.{" "}
              {unchecked > 0 ? `${unchecked} not checked yet.` : "All checked."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {investors.map((name) => {
            const r = results[name];
            const fresh = isNew(name);
            return (
              <li key={name} className={`flex items-center gap-3 px-6 py-3 ${fresh ? "bg-signal/[0.04]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r?.name || name}</p>
                  {fresh || !r ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-signal">
                      <AddedGlyph size={12} /> {fresh ? "Added from Find investors · not checked yet" : "Not checked yet"}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-muted">{r.headline}</p>
                  )}
                </div>
                {r && !fresh && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${PILL[r.level]}`}>{LEVEL_LABEL[r.level]}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(name)}
                  disabled={running}
                  className="shrink-0 rounded-full p-1 text-muted transition hover:bg-signal/10 hover:text-signal disabled:opacity-40"
                  aria-label={`Remove ${name}`}
                  title="Remove from the list"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
          {!investors.length && <li className="px-6 py-8 text-center text-sm text-muted">Your list is empty.</li>}
        </ul>

        <div className="border-t border-line p-5">
          <button
            type="button"
            onClick={onCheck}
            disabled={running || !investors.length}
            className="btn-primary w-full"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Checking…" : `Check the updated list (${investors.length})`}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Funds already checked come back from the cache in seconds; new ones take longer.
          </p>
        </div>
      </aside>
    </div>
  );
}
