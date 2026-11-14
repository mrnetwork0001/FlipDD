"use client";

// Ask Cala: a follow-up question answered by an agent that walks Cala's
// knowledge graph through Cala's own MCP server. The tool calls it made are
// shown under the answer.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { AskGlyph } from "./Glyphs";
import Markdown from "./Markdown";
import CalaLogo from "./CalaLogo";
import WaitModal from "./WaitModal";
import Art from "./Art";
import MicButton from "./MicButton";
import SpeakButton from "./SpeakButton";
import { speak } from "@/lib/client/speech";
import { speakable } from "@/lib/voiceScript";

interface Step {
  tool: string;
  args: Record<string, unknown>;
  ms: number;
  ok: boolean;
  preview: string;
  label: string;
  entity?: string;
}
interface Answer {
  answer: string;
  steps: Step[];
  model: string;
}

function argsLabel(args: Record<string, unknown>): string {
  if (typeof args.name === "string") return `"${args.name}"`;
  if (typeof args.input === "string") return `"${args.input.slice(0, 70)}${args.input.length > 70 ? "…" : ""}"`;
  const rels = args.relationships as { outgoing?: object; incoming?: object } | undefined;
  const parts = [
    ...Object.keys(rels?.outgoing || {}).map((r) => `→${r}`),
    ...Object.keys(rels?.incoming || {}).map((r) => `←${r}`),
  ];
  if (parts.length) return parts.slice(0, 4).join(" ");
  if (typeof args.entity_id === "string") return args.entity_id.slice(0, 8);
  return "";
}

export default function AskCalaPanel({
  startupName,
  description,
  competitors,
  investors,
  onStatus,
}: {
  startupName: string;
  description: string;
  competitors: string[];
  investors: string[];
  /** Tells the page when a question is running or an answer is ready, for the tab badge. */
  onStatus?: (status: "idle" | "busy" | "ready") => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [liveSteps, setLiveSteps] = useState<Step[]>([]);
  const [thinking, setThinking] = useState(false);
  const [modal, setModal] = useState(false);
  const [asked, setAsked] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // A question asked by voice gets its answer read back.
  const byVoice = useRef(false);
  const [voiceNote, setVoiceNote] = useState("");

  useEffect(() => {
    onStatus?.(busy ? "busy" : result ? "ready" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, result]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  const rival = competitors[0];
  const fund = investors[0];
  const suggestions = [
    rival && `Who sits on ${rival}'s board, and which funds are they from?`,
    rival && `Who led ${rival}'s funding rounds, and when?`,
    fund && rival && `Has ${fund} backed any other company that competes with ${rival}?`,
    description && `Which funds led seed or Series A rounds in companies like this in the past year: ${description.slice(0, 80)}`,
  ].filter((s): s is string => Boolean(s));

  async function ask(q: string) {
    if (busy || q.trim().length < 5) return;
    setQuestion(q);
    setAsked(q);
    setBusy(true);
    setModal(true);
    setElapsed(0);
    setError("");
    setResult(null);
    setLiveSteps([]);
    setThinking(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, context: { startupName, description, competitors, investors } }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      // NDJSON: a line per event, so each Cala call shows up as it finishes.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "thinking") setThinking(true);
          else if (e.type === "step") {
            setThinking(false);
            setLiveSteps((list) => [...list, e.step as Step]);
          } else if (e.type === "answer") {
            setResult({ answer: e.answer, steps: e.steps, model: e.model });
            if (byVoice.current) speak("ask-answer", speakable(e.answer));
          }
          else if (e.type === "error") throw new Error(e.message);
        }
      }
    } catch (err) {
      setError(controller.signal.aborted ? "Question cancelled." : (err as Error).message);
    } finally {
      setBusy(false);
      setThinking(false);
      setModal(false);
      byVoice.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <AskGlyph size={14} /> Ask Cala
            </p>
            <h2 className="mt-1.5 font-serif text-3xl leading-tight">Ask a follow-up question about any fund or company</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              An agent answers by walking Cala&apos;s knowledge graph through Cala&apos;s own MCP server: searching entities,
              reading their relationships, opening funding rounds. Every call it makes is listed under the answer.
            </p>
          </div>
          <CalaLogo label="MCP by" height={16} className="text-xs text-muted" />
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <input
            className="field flex-1"
            placeholder="e.g. Which other AI coding startups has Accel backed?"
            value={question}
            onChange={(e) => {
              const value = e.target.value;
              setQuestion(value);
              // Clearing the question clears the last answer with it.
              if (!value.trim() && !busy) {
                setResult(null);
                setError("");
                setLiveSteps([]);
                setAsked("");
              }
            }}
            disabled={busy}
          />
          <MicButton
            disabled={busy}
            onPartial={(t) => {
              setVoiceNote("");
              setQuestion(t);
            }}
            onFinal={(t) => {
              setVoiceNote("");
              byVoice.current = true;
              ask(t);
            }}
            onError={setVoiceNote}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy || question.trim().length < 5}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask
          </button>
        </form>
        {voiceNote && <p className="mt-2 text-xs text-signal">{voiceNote}</p>}
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                disabled={busy}
                className="rounded-full border border-line bg-white/60 px-3 py-1 text-left text-xs text-ink/80 transition hover:border-ink disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <WaitModal
        open={modal}
        title="Asking Cala's graph"
        subtitle={asked}
        centerLabel="Your question"
        steps={liveSteps}
        thinking={thinking}
        expected="20 to 60 seconds"
        onHide={() => setModal(false)}
        onCancel={() => abortRef.current?.abort()}
      />

      {busy && !modal && (
        <div className="rounded-xl border border-dashed border-line p-4">
          <div className="flex items-center gap-2.5 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working in the background… {elapsed}s, {liveSteps.length} Cala call{liveSteps.length === 1 ? "" : "s"} so far.
            <button type="button" onClick={() => setModal(true)} className="ml-auto text-xs font-semibold text-ink underline-offset-2 hover:underline">
              Watch
            </button>
          </div>
          {liveSteps.length > 0 && <p className="mt-1.5 truncate pl-6 text-xs text-ink/70">{liveSteps[liveSteps.length - 1].label}</p>}
        </div>
      )}
      {error && <p className="rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal">{error}</p>}

      {!result && !busy && !error && (
        <Art name="empty-ask" alt="" className="mx-auto w-full max-w-xl rounded-2xl border border-line" />
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="label !mb-0">Answer</p>
              <SpeakButton id="ask-answer" text={() => speakable(result.answer)} label="Listen" />
            </div>
            <Markdown text={result.answer} className="mt-3 text-ink/90" />
            <p className="mt-3 text-[11px] text-muted">
              Facts from Cala&apos;s tools; written by {result.model}. Check anything you act on.
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border border-line bg-card p-5">
            <p className="label">
              {result.steps.length} Cala MCP call{result.steps.length === 1 ? "" : "s"}
            </p>
            <ol className="space-y-2">
              {result.steps.map((s, i) => (
                <li key={i} className="text-xs">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    {s.ok ? <Check className="h-3 w-3 shrink-0 text-clear" /> : <X className="h-3 w-3 shrink-0 text-signal" />}
                    <span className="min-w-0 flex-1 truncate" title={`${s.tool} ${argsLabel(s.args)}`}>
                      {s.label || s.tool}
                      <span className="ml-1.5 font-mono text-[10.5px] text-muted">{s.tool}</span>
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-muted">{(s.ms / 1000).toFixed(1)}s</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
