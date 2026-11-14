"use client";

// Draws the real findings as a graph: your list → rounds / co-investors /
// lookalikes → your competitors. Grows as results stream in.

import { useMemo, useState } from "react";
import type { CompetitorSummary, InvestorResult, Level } from "@/lib/types";

type Tone = "red" | "redSoft" | "amber" | "slate" | "green" | "idle" | "outline";

const HEX = {
  red: "#D63C22",
  amber: "#B4690E",
  slate: "#8E877A",
  green: "#1D6A4B",
};
const NODE: Record<Tone, { fill: string; stroke: string; text: string; dash?: string }> = {
  red: { fill: "#D63C22", stroke: "#D63C22", text: "#FFFFFF" },
  redSoft: { fill: "#FBE9E5", stroke: "#D63C22", text: "#B0301A" },
  amber: { fill: "#F7EEDF", stroke: "#B4690E", text: "#8A4F08" },
  slate: { fill: "#EFEBE2", stroke: "#A39C8F", text: "#16130E" },
  green: { fill: "#E5EFEA", stroke: "#1D6A4B", text: "#1D6A4B" },
  idle: { fill: "#FBF9F3", stroke: "#DCD5C5", text: "#6E675B" },
  outline: { fill: "#FBF9F3", stroke: "#16130E", text: "#16130E", dash: "4 3" },
};
const LEVEL_TONE: Record<Level, Tone> = {
  direct_high: "red",
  direct_moderate: "redSoft",
  indirect: "amber",
  possible: "slate",
  clear: "green",
  thin: "idle",
  unresolved: "idle",
};

const W = 920;
const COLS = [
  { x: 16, w: 200 },
  { x: 356, w: 216 },
  { x: 712, w: 192 },
];
const ROW = 46;
const TOP = 44;
const NODE_H = 30;

interface MapNode {
  id: string;
  col: 0 | 1 | 2;
  label: string;
  sub?: string;
  tone: Tone;
  owner?: string; // investor input for column-0 nodes
}
interface MapEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  dashed?: boolean;
  label?: string;
  /** Investors whose paths use this edge; a co-investor shared by two funds has one edge for both. */
  investors: string[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

export default function ConflictMap({
  rows,
  competitors,
  startupName,
  onSelect,
}: {
  rows: InvestorResult[];
  competitors: CompetitorSummary[];
  startupName: string;
  onSelect?: (input: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, edges, height, pos } = useMemo(() => {
    const nodes = new Map<string, MapNode>();
    const edgeById = new Map<string, MapEdge>();
    const edgeSink = {
      // Same edge from two investors (e.g. a shared co-investor): keep one, owned by both.
      push(...list: MapEdge[]) {
        for (const e of list) {
          const prev = edgeById.get(e.id);
          if (prev) {
            if (!prev.investors.includes(e.investors[0])) prev.investors.push(...e.investors);
          } else edgeById.set(e.id, e);
        }
      },
    };
    const add = (n: MapNode) => {
      if (!nodes.has(n.id)) nodes.set(n.id, n);
      return n.id;
    };

    for (const c of competitors) {
      add({ id: `c:${c.name}`, col: 2, label: c.name, sub: c.resolved ? "competitor" : "not in Cala", tone: c.resolved ? "redSoft" : "idle" });
    }

    for (const r of rows) {
      const inv = add({
        id: `i:${r.input}`,
        col: 0,
        label: r.name,
        sub: r.done.direct ? undefined : "looking up",
        tone: r.done.direct ? LEVEL_TONE[r.level] : "idle",
        owner: r.input,
      });
      for (const d of r.direct) {
        const comp = add({ id: `c:${d.competitor}`, col: 2, label: d.competitor, sub: "competitor", tone: "redSoft" });
        if (d.round) {
          const mid = add({
            id: `r:${d.round.id}`,
            col: 1,
            label: `${d.round.label} round`,
            sub: d.date ? d.date.slice(0, 7) : d.competitor,
            tone: "redSoft",
          });
          edgeSink.push({ id: `${inv}>${mid}`, from: inv, to: mid, color: HEX.red, label: d.isLead ? "led" : "joined", investors: [r.input] });
          edgeSink.push({ id: `${mid}>${comp}`, from: mid, to: comp, color: HEX.red, label: "raised by", investors: [r.input] });
        } else {
          edgeSink.push({ id: `${inv}>${comp}`, from: inv, to: comp, color: HEX.red, label: "backed", investors: [r.input] });
        }
      }
      for (const l of r.leaks) {
        const comp = add({ id: `c:${l.competitor}`, col: 2, label: l.competitor, sub: "competitor", tone: "redSoft" });
        // Weak paths (few, old shared rounds) are drawn faint so strong ones stand out.
        const weak = l.strengthLabel === "weak";
        const mid = add({
          id: `v:${l.via.id}`,
          col: 1,
          label: l.via.name,
          sub: weak ? "co-investor · weak" : "co-investor",
          tone: weak ? "slate" : "amber",
        });
        edgeSink.push({
          id: `${inv}>${mid}`,
          from: inv,
          to: mid,
          color: weak ? HEX.slate : HEX.amber,
          dashed: weak,
          label: `${l.sharedRoundCount} shared · ${l.strength}`,
          investors: [r.input],
        });
        edgeSink.push({
          id: `${mid}>${comp}`,
          from: mid,
          to: comp,
          color: weak ? HEX.slate : HEX.red,
          dashed: weak,
          label: l.viaLed ? "led" : "in",
          investors: [r.input],
        });
      }
      if (r.possible.length) {
        const you = add({ id: "you", col: 2, label: startupName || "Your startup", sub: "you", tone: "outline" });
        for (const p of r.possible.slice(0, 2)) {
          const mid = add({ id: `p:${p.company}`, col: 1, label: p.company, sub: "lookalike", tone: "slate" });
          edgeSink.push({ id: `${inv}>${mid}`, from: inv, to: mid, color: HEX.slate, label: "portfolio", investors: [r.input] });
          edgeSink.push({ id: `${mid}>you`, from: mid, to: you, color: HEX.slate, dashed: true, label: "similar", investors: [r.input] });
        }
      }
    }

    const edges = [...edgeById.values()];

    // Layout: investors in list order; middle and right ordered by the
    // average position of what links to them, to keep lines from crossing.
    const byCol = (c: number) => [...nodes.values()].filter((n) => n.col === c);
    const col0 = byCol(0);
    const order = new Map<string, number>();
    col0.forEach((n, i) => order.set(n.id, i));
    const avg = (id: string, side: "from" | "to") => {
      const linked = edges.filter((e) => e[side === "from" ? "to" : "from"] === id).map((e) => e[side]);
      const vals = linked.map((l) => order.get(l)).filter((v): v is number => v !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 999;
    };
    const col1 = byCol(1).sort((a, b) => avg(a.id, "from") - avg(b.id, "from"));
    col1.forEach((n, i) => order.set(n.id, (i / Math.max(1, col1.length)) * col0.length));
    const col2 = byCol(2).sort((a, b) => {
      if (a.id === "you") return 1;
      if (b.id === "you") return -1;
      return avg(a.id, "from") - avg(b.id, "from");
    });

    const count = Math.max(col0.length, col1.length, col2.length, 3);
    const height = TOP + count * ROW + 12;
    const pos = new Map<string, { x: number; y: number; w: number }>();
    [col0, col1, col2].forEach((list, c) => {
      const span = count * ROW;
      list.forEach((n, i) => {
        pos.set(n.id, { x: COLS[c].x, w: COLS[c].w, y: TOP + (span * (i + 0.5)) / Math.max(list.length, 1) });
      });
    });
    return { nodes: [...nodes.values()], edges, height, pos };
  }, [rows, competitors, startupName]);

  const active = (investors?: string[]) => !hover || Boolean(investors?.includes(hover));
  const nodeActive = (n: MapNode) => {
    if (!hover) return true;
    if (n.owner) return n.owner === hover;
    return edges.some((e) => e.investors.includes(hover) && (e.from === n.id || e.to === n.id));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm font-semibold">Conflict map</p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-signal" />direct</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-caution" />via co-investor</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-ink/50" />lookalike</span>
        </div>
      </div>
      <div className="dots overflow-x-auto bg-paper/40">
        <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full min-w-[640px]" role="img" aria-label="Map of links between your investors and your competitors">
          {["YOUR LIST", "ROUNDS · CO-INVESTORS · LOOKALIKES", "COMPETITORS"].map((t, i) => (
            <text
              key={t}
              x={COLS[i].x + COLS[i].w / 2}
              y={22}
              textAnchor="middle"
              fontSize="9.5"
              letterSpacing="1.2"
              fill="#6E675B"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {t}
            </text>
          ))}

          {edges.map((e) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <path
                key={e.id}
                d={curve(a.x + a.w, a.y, b.x, b.y)}
                fill="none"
                stroke={e.color}
                strokeWidth={active(e.investors) ? 2 : 1.25}
                strokeOpacity={active(e.investors) ? 0.9 : 0.12}
                strokeDasharray={e.dashed ? "5 4" : undefined}
                className="map-edge"
                style={{ transition: "stroke-opacity .2s, stroke-width .2s" }}
              />
            );
          })}

          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const s = NODE[n.tone];
            const on = nodeActive(n);
            return (
              <g
                key={n.id}
                className="map-node"
                style={{ opacity: on ? 1 : 0.3, transition: "opacity .2s", cursor: n.owner ? "pointer" : "default" }}
                onMouseEnter={() => n.owner && setHover(n.owner)}
                onMouseLeave={() => n.owner && setHover(null)}
                onClick={() => n.owner && onSelect?.(n.owner)}
              >
                <rect
                  x={p.x}
                  y={p.y - NODE_H / 2}
                  width={p.w}
                  height={NODE_H}
                  rx={8}
                  strokeWidth={1.25}
                  strokeDasharray={s.dash}
                  style={{ fill: s.fill, stroke: s.stroke, transition: "fill .4s, stroke .4s" }}
                />
                <text x={p.x + 12} y={p.y + 4} fontSize="12" fontWeight={600} style={{ fill: s.text }}>
                  {clip(n.label, n.sub ? 18 : 26)}
                </text>
                {n.sub && (
                  <text
                    x={p.x + p.w - 10}
                    y={p.y + 3.5}
                    textAnchor="end"
                    fontSize="9"
                    style={{ fill: n.tone === "red" ? "rgba(255,255,255,.8)" : "#6E675B", fontFamily: "var(--font-mono), monospace" }}
                  >
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}

          {edges.map((e) => {
            if (!e.label || !active(e.investors) || !hover) return null;
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const x = (a.x + a.w + b.x) / 2;
            const y = (a.y + b.y) / 2;
            const w = e.label.length * 5.8 + 14;
            return (
              <g key={`l${e.id}`} className="svg-pop">
                <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={9} fill="#FBF9F3" stroke={e.color} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9.5" fill={e.color} style={{ fontFamily: "var(--font-mono), monospace" }}>
                  {e.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
        Hover an investor to trace its paths. Click to open its findings.
      </p>
    </div>
  );
}
