"use client";

// A waiting room for slow answers. With live steps (Ask Cala), every real
// Cala call becomes a node on a growing graph around the question; without
// them (cited profile, competitor discovery), it walks through the kinds of
// records Cala is reading. A rotating line keeps it light. The user can hide
// it and keep working: the answer still lands where it belongs.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minimize2, X } from "lucide-react";

export interface WaitStep {
  label: string;
  tool: string;
  entity?: string;
  ok: boolean;
  ms: number;
}

export const QUIPS = [
  "Following the money, one funding round at a time.",
  "Separating lead investors from people who just showed up.",
  "Checking who sits on whose board. Awkward.",
  "Reading cap tables so you don't have to.",
  "Asking the graph who has coffee with whom.",
  "Counting term sheets. Politely.",
  "Some funds have 300 portfolio companies. Patience.",
  "Cross-checking press releases against filings.",
  "Untangling co-investors. It's a small world.",
  "No VCs were pitched in the making of this answer.",
  "Finding out who knew about the round before you did.",
];

const W = 560;
const H = 300;
const CX = W / 2;
const CY = H / 2;
const GOLDEN = 2.39996;

const TOOL_COLOR: Record<string, string> = {
  entity_search: "#16130E",
  entity_lookup: "#16130E",
  entity_introspection: "#6E675B",
  entity_retrieval: "#B4690E",
  knowledge_search: "#D63C22",
  knowledge_query: "#D63C22",
};

function short(s: string, n = 18) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function WaitModal({
  open,
  title,
  subtitle,
  centerLabel,
  steps,
  thinking,
  hints = ["Funding rounds", "Lead investors", "Board seats", "Portfolio", "Filings", "Press"],
  expected = "20 to 80 seconds",
  slowAfter = 90,
  onHide,
  onCancel,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Text in the centre node. */
  centerLabel: string;
  /** Live steps, when the work reports them. */
  steps?: WaitStep[];
  /** True while the agent decides its next call. */
  thinking?: boolean;
  /** Labels to cycle through when there are no live steps. */
  hints?: string[];
  expected?: string;
  /** Seconds after which the modal says the wait is longer than usual. */
  slowAfter?: number;
  onHide: () => void;
  /** Stops the work; shown as a Cancel button when given. */
  onCancel?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);
  // Kept in a ref so a parent re-render does not restart the timers.
  const hideRef = useRef(onHide);
  hideRef.current = onHide;

  useEffect(() => {
    if (!open) return;
    const started = Date.now();
    setElapsed(0);
    const a = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    const b = setInterval(() => setTick((t) => t + 1), 1400);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hideRef.current();
    window.addEventListener("keydown", esc);
    return () => {
      clearInterval(a);
      clearInterval(b);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const live = Boolean(steps);
  const nodes = useMemo(() => {
    // One node per entity: searching for Accel and then opening Accel light up the same node.
    const items: { label: string; color: string; ok: boolean }[] = [];
    if (live) {
      for (const s of steps || []) {
        const label = short(s.entity || (s.tool.startsWith("knowledge") ? "Research" : s.tool.replace(/_/g, " ")));
        const found = items.find((x) => x.label === label);
        const node = { label, color: TOOL_COLOR[s.tool] || "#16130E", ok: s.ok };
        if (found) {
          items.splice(items.indexOf(found), 1);
          items.push({ ...node, ok: found.ok && s.ok });
        } else items.push(node);
      }
    } else hints.forEach((h) => items.push({ label: h, color: "#16130E", ok: true }));
    return items.slice(-12).map((n, i, arr) => {
      const angle = -Math.PI / 2 + i * (live ? GOLDEN : (2 * Math.PI) / arr.length);
      const r = live ? (i % 2 ? 128 : 100) : 112;
      return { ...n, x: CX + Math.cos(angle) * r * 1.65, y: CY + Math.sin(angle) * r * 0.95 };
    });
  }, [steps, hints, live]);

  // Next slot, where the agent's upcoming call will appear.
  const ghost = useMemo(() => {
    const i = nodes.length;
    const angle = -Math.PI / 2 + i * GOLDEN;
    const r = i % 2 ? 128 : 100;
    return { x: CX + Math.cos(angle) * r * 1.65, y: CY + Math.sin(angle) * r * 0.95 };
  }, [nodes.length]);

  if (!open) return null;
  const lit = live ? nodes.length - 1 : tick % Math.max(1, nodes.length);
  const latest = live ? steps![steps!.length - 1] : undefined;
  const status = live
    ? thinking || !latest
      ? "Deciding what to look up next…"
      : latest.label
    : `Reading ${hints[tick % hints.length].toLowerCase()}…`;
  const quip = QUIPS[Math.floor(tick / 3) % QUIPS.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-line bg-card shadow-[0_30px_80px_-30px_rgba(22,19,14,0.6)] animate-pop">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <p className="font-serif text-2xl leading-tight">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-sm tabular-nums text-muted">{elapsed}s</span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-signal hover:text-signal"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={onHide}
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
              title="Keep working; the answer will appear on the page"
            >
              <Minimize2 className="h-3.5 w-3.5" /> Keep working
            </button>
          </div>
        </div>

        <div className="dots relative bg-paper/40">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
            {/* edges */}
            {nodes.map((n, i) => (
              <path
                key={`e${i}-${n.label}`}
                d={`M${CX} ${CY} Q${(CX + n.x) / 2} ${(CY + n.y) / 2 - 18} ${n.x} ${n.y}`}
                fill="none"
                stroke={n.color}
                strokeOpacity={i === lit ? 0.9 : 0.22}
                strokeWidth={i === lit ? 2 : 1.25}
                pathLength={1}
                className="edge-draw"
                style={{ transition: "stroke-opacity .5s" }}
              />
            ))}
            {/* a pulse travelling to the newest (or highlighted) node */}
            {nodes[lit] && (
              <circle key={`pulse-${lit}-${nodes.length}`} r={4} fill={nodes[lit].color}>
                <animateMotion
                  dur="1.2s"
                  repeatCount="indefinite"
                  path={`M${CX} ${CY} Q${(CX + nodes[lit].x) / 2} ${(CY + nodes[lit].y) / 2 - 18} ${nodes[lit].x} ${nodes[lit].y}`}
                />
              </circle>
            )}
            {/* the next call, while the agent thinks */}
            {live && thinking && (
              <g className="svg-pop">
                <circle cx={ghost.x} cy={ghost.y} r={15} fill="none" stroke="#16130E" strokeOpacity={0.35} strokeDasharray="3 4" className="edge-scan" />
                <text x={ghost.x} y={ghost.y + 4} textAnchor="middle" fontSize="12" fill="#6E675B">
                  ?
                </text>
              </g>
            )}
            {/* nodes */}
            {nodes.map((n, i) => {
              const w = Math.max(64, n.label.length * 6.6 + 22);
              const on = i === lit;
              return (
                <g key={`n${i}-${n.label}`} className="svg-pop">
                  {on && <rect x={n.x - w / 2} y={n.y - 13} width={w} height={26} rx={8} fill="none" stroke={n.color} className="svg-ping" />}
                  <rect
                    x={n.x - w / 2}
                    y={n.y - 13}
                    width={w}
                    height={26}
                    rx={8}
                    fill={on ? n.color : "#FBF9F3"}
                    stroke={n.ok ? n.color : "#D63C22"}
                    strokeOpacity={on ? 1 : 0.45}
                    style={{ transition: "fill .4s" }}
                  />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill={on ? "#F4F1E8" : "#16130E"}>
                    {n.label}
                  </text>
                </g>
              );
            })}
            {/* centre */}
            <g>
              <circle cx={CX} cy={CY} r={44} fill="#16130E" />
              <circle cx={CX} cy={CY} r={44} fill="none" stroke="#D63C22" strokeWidth={1.5} className="svg-ping" />
              <text x={CX} y={CY + 4} textAnchor="middle" fontSize="10.5" fontWeight={700} fill="#F4F1E8">
                {short(centerLabel, 13)}
              </text>
            </g>
          </svg>
        </div>

        <div className="border-t border-line bg-night px-6 py-3 font-mono text-[12px] text-paper/85">
          <span className="text-signal">›</span> <span key={status} className="animate-type inline-block align-bottom">{status}</span>
          <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-blink bg-paper/70 align-middle" />
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <p key={quip} className="animate-rise text-sm italic text-ink/70">{quip}</p>
          <p className={`shrink-0 text-xs ${elapsed >= slowAfter ? "font-medium text-caution" : "text-muted"}`}>
            {elapsed >= slowAfter
              ? "Taking longer than usual: Cala's query endpoint is busy. Keep working or cancel."
              : `Usually ${expected}`}
          </p>
        </div>

        {live && steps!.length > 0 && (
          <ol className="max-h-32 space-y-1 overflow-y-auto border-t border-line px-6 py-3">
            {steps!.slice(-5).map((s, i) => (
              <li key={`${i}-${s.label}`} className="flex items-baseline gap-2 text-xs animate-rise">
                {s.ok ? <Check className="h-3 w-3 shrink-0 text-clear" /> : <X className="h-3 w-3 shrink-0 text-signal" />}
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="shrink-0 font-mono text-muted">{(s.ms / 1000).toFixed(1)}s</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
