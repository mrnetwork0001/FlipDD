"use client";

// "Investor profile": a cited summary of the investor from Cala Knowledge
// Search, loaded on demand (the search takes 30 to 60 seconds the first time).

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Loader2 } from "lucide-react";
import Markdown from "./Markdown";
import WaitModal from "./WaitModal";
import type { InvestorDossier } from "@/lib/types";

export default function DossierPanel({ investor, autoLoad = false }: { investor: string; autoLoad?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [dossier, setDossier] = useState<InvestorDossier | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);
  const [modal, setModal] = useState(false);

  async function load(withModal = false) {
    setState("busy");
    setModal(withModal);
    setError("");
    try {
      const res = await fetch("/api/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setDossier(body as InvestorDossier);
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    } finally {
      setModal(false);
    }
  }
  useEffect(() => {
    if (!autoLoad || started.current) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  return (
    <div className="rounded-xl border border-line bg-white/60 p-4">
      <WaitModal
        open={modal}
        title={`Profiling ${investor}`}
        subtitle="Cala Knowledge Search is reading what's on record"
        centerLabel={investor}
        hints={["What it backs", "Recent deals", "Partners", "Cheque size", "Stage focus", "Sources"]}
        expected="30 to 60 seconds"
        onHide={() => setModal(false)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="label !mb-0 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> Investor profile
        </p>
        {state === "idle" || state === "error" ? (
          <button
            type="button"
            onClick={() => load(true)}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
          >
            {state === "error" ? "Try again" : "Load cited profile"}
          </button>
        ) : state === "busy" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking Cala (30 to 60 s)
          </span>
        ) : null}
      </div>
      {state === "idle" && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          What {investor} invests in, its recent deals and partners, written by Cala Knowledge Search with the documents
          it used.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-signal">{error}</p>}
      {dossier && (
        <>
          <Markdown text={dossier.markdown} className="mt-1 max-h-[420px] overflow-y-auto pr-1 text-ink/90 print:max-h-none" />
          {dossier.sources.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Sources Cala used</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {dossier.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.title}
                    className="inline-flex items-center gap-0.5 rounded border border-line bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-ink/75 hover:border-ink"
                  >
                    {s.label}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Written by Cala Knowledge Search from public sources. Check the facts that matter before the meeting.
          </p>
        </>
      )}
    </div>
  );
}
