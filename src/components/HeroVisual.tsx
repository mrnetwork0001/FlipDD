"use client";

// Animated hero: walks the graph one fund at a time, traces the path to the
// competitor, then drops the verdict into the table below. With `data` it
// replays the findings of a real saved run; without it (no run saved yet) it
// shows a labelled illustration.

import { useEffect, useMemo, useState } from "react";
import type { HeroData } from "@/lib/showcase";
import { Check, Loader2 } from "lucide-react";

type Tone = "red" | "amber" | "slate" | "green";
type Variant = "idle" | "active" | Tone;
type Pt = [number, number, number, number];

const TONE_HEX: Record<Tone, string> = {
  red: "#D63C22",
  amber: "#B4690E",
  slate: "#6E675B",
  green: "#1D6A4B",
};
const NODE: Record<Variant, { fill: string; stroke: string; text: string }> = {
  idle: { fill: "#FBF9F3", stroke: "#DCD5C5", text: "#16130E" },
  active: { fill: "#16130E", stroke: "#16130E", text: "#F4F1E8" },
  red: { fill: "#FBE9E5", stroke: "#D63C22", text: "#D63C22" },
  amber: { fill: "#F7EEDF", stroke: "#B4690E", text: "#B4690E" },
  slate: { fill: "#EFEBE2", stroke: "#A39C8F", text: "#16130E" },
  green: { fill: "#E5EFEA", stroke: "#1D6A4B", text: "#1D6A4B" },
};
const PILL: Record<Tone, string> = {
  red: "bg-signal/10 text-signal ring-signal/25",
  amber: "bg-caution/10 text-caution ring-caution/25",
  slate: "bg-ink/5 text-ink/70 ring-ink/15",
  green: "bg-clear/10 text-clear ring-clear/25",
};

// The graph is laid out on a 284-high grid and drawn 20% shorter: every y
// goes through sy(), so spacing tightens while text and nodes keep their size.
const SQUEEZE = 0.8;
const sy = (y: number) => 30 + (y - 30) * SQUEEZE;
const VIEW_H = Math.round(sy(284)) + 4;

const curveRaw = ([x1, y1, x2, y2]: Pt) => {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};
const curve = ([x1, y1, x2, y2]: Pt) => curveRaw([x1, sy(y1), x2, sy(y2)]);
const mid = ([x1, y1, x2, y2]: Pt): [number, number] => [(x1 + x2) / 2, (sy(y1) + sy(y2)) / 2];

// Layout (viewBox 520 x 284)
const FX = 64; // fund column centre
const MX = 262; // middle column centre
const CX = 440; // competitor centre
const MID_NODES = {
  round: { y: 66, label: "Series A · 2026", w: 112 },
  coinv: { y: 158, label: "Fund E", w: 112 },
  look: { y: 250, label: "Lookalike Co.", w: 112 },
} as const;
const COMP_Y = 158;

interface Edge {
  p: Pt;
  label: string;
  tone: Tone;
  dashed?: boolean;
}
interface Fund {
  name: string;
  y: number;
  tone: Tone;
  pill: string;
  line: string;
  share: string;
  mid?: keyof typeof MID_NODES;
  hitsCompetitor: boolean;
  edges: Edge[];
  scan?: Pt[];
  log: [string, string, string, string];
}

const BASE_FUNDS: Fund[] = [
  {
    name: "Fund A",
    y: 66,
    tone: "red",
    pill: "Backs your competitor",
    line: "Led your competitor's Series A, 9 months ago",
    share: "Teaser only",
    mid: "round",
    hitsCompetitor: true,
    edges: [
      { p: [106, 66, 206, 66], label: "led", tone: "red" },
      { p: [318, 66, 380, COMP_Y], label: "round of", tone: "red" },
    ],
    log: [
      "Resolving Fund A in Cala",
      "Reading 38 funding rounds",
      "Opening the Series A participants",
      "Fund A led your competitor's Series A",
    ],
  },
  {
    name: "Fund B",
    y: 128,
    tone: "amber",
    pill: "Indirect link",
    line: "Co-invests with Fund E, which led your competitor's seed",
    share: "Deck, no customer names",
    mid: "coinv",
    hitsCompetitor: true,
    edges: [
      { p: [106, 128, 206, COMP_Y], label: "3 shared rounds", tone: "amber" },
      { p: [318, COMP_Y, 380, COMP_Y], label: "led seed", tone: "red" },
    ],
    log: [
      "Resolving Fund B in Cala",
      "Reading 24 funding rounds",
      "Tracing co-investor Fund E",
      "Fund E led your competitor's seed",
    ],
  },
  {
    name: "Fund C",
    y: 190,
    tone: "slate",
    pill: "Possible overlap",
    line: "One portfolio company looks close to you",
    share: "Deck, no customer names",
    mid: "look",
    hitsCompetitor: false,
    edges: [
      { p: [106, 190, 206, 250], label: "portfolio", tone: "slate" },
      { p: [318, 250, 380, COMP_Y], label: "similar", tone: "slate", dashed: true },
    ],
    log: [
      "Resolving Fund C in Cala",
      "Scanning 31 portfolio companies",
      "Comparing descriptions with yours",
      "Lookalike Co. matches your description",
    ],
  },
  {
    name: "Fund D",
    y: 250,
    tone: "green",
    pill: "No conflict found",
    line: "No link in 38 rounds and 47 portfolio companies",
    share: "Full data room",
    hitsCompetitor: false,
    edges: [],
    scan: [
      [106, 250, 206, 158],
      [106, 250, 206, 66],
    ],
    log: [
      "Resolving Fund D in Cala",
      "Reading 47 funding rounds",
      "Checking co-investor paths",
      "No link to your competitors",
    ],
  },
];

// Faint background edges so the graph reads as a graph before anything lights up.
const DECOYS: Pt[] = [
  [106, 66, 206, COMP_Y],
  [106, 128, 206, 66],
  [106, 190, 206, COMP_Y],
  [106, 250, 206, COMP_Y],
  [106, 250, 206, 66],
  [318, 66, 380, COMP_Y],
  [318, COMP_Y, 380, COMP_Y],
  [318, 250, 380, COMP_Y],
];

const STAGES = 4;
const HOLD = 6;
const TOTAL = BASE_FUNDS.length * STAGES + HOLD;
const TICK_MS = 780;

function Node({
  x,
  y,
  w,
  label,
  variant,
  ping,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  variant: Variant;
  ping?: boolean;
}) {
  const s = NODE[variant];
  return (
    <g>
      {ping && (
        <rect
          x={x - w / 2}
          y={y - 15}
          width={w}
          height={30}
          rx={9}
          fill="none"
          stroke={s.stroke === "#16130E" ? "#D63C22" : s.stroke}
          strokeWidth={1.5}
          className="svg-ping"
        />
      )}
      <rect
        x={x - w / 2}
        y={y - 15}
        width={w}
        height={30}
        rx={9}
        strokeWidth={1.25}
        style={{ fill: s.fill, stroke: s.stroke, transition: "fill .45s ease, stroke .45s ease" }}
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize="11.5"
        fontWeight={600}
        style={{ fill: s.text, transition: "fill .45s ease" }}
      >
        {label}
      </text>
    </g>
  );
}

function EdgeLabel({ at, text, tone }: { at: [number, number]; text: string; tone: Tone }) {
  const w = text.length * 5.6 + 16;
  const color = TONE_HEX[tone];
  return (
    <g className="svg-pop">
      <rect x={at[0] - w / 2} y={at[1] - 9} width={w} height={18} rx={9} fill="#FBF9F3" stroke={color} />
      <text
        x={at[0]}
        y={at[1] + 3.5}
        textAnchor="middle"
        fontSize="9.5"
        fill={color}
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {text}
      </text>
    </g>
  );
}

export default function HeroVisual({ data }: { data?: HeroData }) {
  const FUNDS = useMemo<Fund[]>(
    () =>
      data
        ? BASE_FUNDS.map((f, i) => {
            const d = data.funds[i];
            return {
              ...f,
              name: d.name,
              pill: d.pill,
              line: d.line,
              share: d.share,
              log: d.log,
              edges: f.edges.map((e, j) => ({ ...e, label: d.edges[j] || e.label })),
            };
          })
        : BASE_FUNDS,
    [data],
  );
  const midLabel = (k: keyof typeof MID_NODES) => (data ? data.mid[k] : MID_NODES[k].label);
  const totalCalls = data?.requests ?? 31;
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      setT(BASE_FUNDS.length * STAGES);
      return;
    }
    const id = setInterval(() => setT((x) => (x + 1) % TOTAL), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const hold = t >= FUNDS.length * STAGES;
  const cur = hold ? FUNDS.length : Math.floor(t / STAGES);
  const stage = hold ? STAGES - 1 : t % STAGES;
  const isDone = (i: number) => i < cur || (i === cur && stage === STAGES - 1);
  const current = hold ? undefined : FUNDS[cur];

  const fundVariant = (i: number): Variant =>
    isDone(i) ? FUNDS[i].tone : i === cur ? "active" : "idle";
  const midVariant = (key: keyof typeof MID_NODES): Variant => {
    const i = FUNDS.findIndex((f) => f.mid === key);
    if (isDone(i)) return FUNDS[i].tone;
    if (i === cur && stage >= 1) return "active";
    return "idle";
  };
  const compHit = FUNDS.some((f, i) => f.hitsCompetitor && isDone(i));
  const compVariant: Variant = compHit
    ? "red"
    : current?.hitsCompetitor && stage >= 2
      ? "active"
      : "idle";

  const log = hold
    ? data
      ? `Checked against ${data.competitor}. Every finding links to its source.`
      : "Checked 4 investors. Every finding links to its source."
    : current!.log[stage];
  const calls = hold
    ? totalCalls
    : Math.min(totalCalls, Math.round(((cur * STAGES + stage + 1) / (FUNDS.length * STAGES)) * totalCalls));

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-[0_24px_60px_-40px_rgba(22,19,14,0.45)]">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-semibold">
            Meeting list check
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {calls} Cala {data ? "requests" : "calls"} · 1 competitor
          </span>
        </div>

        {/* Graph */}
        <div className="dots relative border-b border-line bg-paper/40">
          <svg viewBox={`0 0 520 ${VIEW_H}`} className="block h-auto w-full" role="img" aria-label={data ? "Replay of a real FlipDD run tracing investors to a competitor" : "Illustration of FlipDD tracing investors to a competitor"}>
            {[
              [FX, "YOUR LIST"],
              [MX, "ROUNDS & CO-INVESTORS"],
              [CX, "COMPETITOR"],
            ].map(([x, label]) => (
              <text
                key={label as string}
                x={x as number}
                y={24}
                textAnchor="middle"
                fontSize="9"
                letterSpacing="1.2"
                fill="#6E675B"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {label}
              </text>
            ))}

            {/* faint graph */}
            {DECOYS.map((p, i) => (
              <path key={`d${i}`} d={curve(p)} fill="none" stroke="#16130E" strokeOpacity={0.08} strokeWidth={1.25} />
            ))}

            {/* scanning (no-conflict fund) */}
            {FUNDS.map((f, i) =>
              f.scan && i === cur && stage >= 1 && stage < 3
                ? f.scan.map((p, j) => (
                    <path key={`s${i}${j}`} d={curve(p)} fill="none" stroke="#16130E" strokeOpacity={0.45} strokeWidth={1.5} className="edge-scan" />
                  ))
                : null,
            )}

            {/* traced paths */}
            {FUNDS.map((f, i) =>
              f.edges.map((e, j) => {
                const done = isDone(i);
                const active = !done && i === cur && stage >= j + 1;
                if (!done && !active) return null;
                return (
                  <path
                    key={`e${i}${j}${done ? "d" : "a"}`}
                    d={curve(e.p)}
                    fill="none"
                    stroke={TONE_HEX[e.tone]}
                    strokeWidth={done ? 1.75 : 2.25}
                    strokeOpacity={done ? 0.7 : 1}
                    strokeDasharray={done && e.dashed ? "4 4" : undefined}
                    pathLength={done ? undefined : 1}
                    className={done ? undefined : "edge-draw"}
                  />
                );
              }),
            )}

            {/* travelling pulse */}
            {!reduced && current && current.edges.length > 0 && stage === 2 && (
              <circle key={`pulse${cur}`} r={4} fill={TONE_HEX[current.tone]}>
                <animateMotion dur="1.1s" repeatCount="indefinite" path={current.edges.map((e) => curve(e.p)).join(" ")} />
              </circle>
            )}

            {/* nodes */}
            {FUNDS.map((f, i) => (
              <Node
                key={f.name}
                x={FX}
                y={sy(f.y)}
                w={84}
                label={f.name}
                variant={fundVariant(i)}
                ping={!reduced && i === cur && !isDone(i)}
              />
            ))}
            {(Object.keys(MID_NODES) as (keyof typeof MID_NODES)[]).map((k) => (
              <Node key={k} x={MX} y={sy(MID_NODES[k].y)} w={MID_NODES[k].w} label={midLabel(k)} variant={midVariant(k)} />
            ))}
            <Node x={CX} y={sy(COMP_Y)} w={124} label={data?.competitor || "Your competitor"} variant={compVariant} ping={!reduced && compHit} />

            {/* edge labels */}
            {FUNDS.map((f, i) =>
              f.edges.map((e, j) => {
                const show = i === cur && stage >= j + 1;
                return show ? <EdgeLabel key={`l${i}${j}`} at={mid(e.p)} text={e.label} tone={e.tone} /> : null;
              }),
            )}
            {(() => {
              const di = FUNDS.length - 1;
              return isDone(di) && (cur === di || hold) ? (
                <EdgeLabel at={[156, sy(250)]} text="no link found" tone="green" />
              ) : null;
            })()}
          </svg>
        </div>

        {/* Step log */}
        <div className="flex items-center gap-2.5 border-b border-line bg-night px-5 py-2.5 font-mono text-[11.5px] text-paper/85">
          <span className="text-signal">›</span>
          <span key={t} className="animate-type truncate">
            {log}
          </span>
          <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-blink bg-paper/70" />
        </div>

        {/* Results */}
        <ul className="divide-y divide-line">
          {FUNDS.map((f, i) => {
            const done = isDone(i);
            const active = !done && i === cur;
            return (
              <li key={f.name} className="flex items-center gap-3 px-5 py-2">
                <span className="w-4 font-mono text-xs text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${done || active ? "" : "text-ink/40"}`}>{f.name}</span>
                    {done && (
                      <span className={`animate-pop inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${PILL[f.tone]}`}>
                        {f.pill}
                      </span>
                    )}
                    {active && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                        <Loader2 className="h-3 w-3 animate-spin" /> checking
                      </span>
                    )}
                  </div>
                  {done ? (
                    <p className="mt-0.5 animate-rise truncate text-xs text-muted">{f.line}</p>
                  ) : (
                    <span className={`mt-1.5 block h-2 rounded ${active ? "skeleton w-3/4" : "w-1/2 bg-line/60"}`} />
                  )}
                </div>
                <span className="hidden w-36 shrink-0 text-right text-[11px] font-medium sm:block">
                  {done ? (
                    <span className="inline-flex animate-rise items-center gap-1 text-ink/75">
                      {f.tone === "green" && <Check className="h-3 w-3 text-clear" />}
                      {f.share}
                    </span>
                  ) : (
                    <span className="text-ink/25">—</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {data ? data.caption : "Illustration. Run the example in the app to replace it with a real run."}
      </p>
    </div>
  );
}
