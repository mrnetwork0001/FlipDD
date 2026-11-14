// Pixel-grid diagrams drawn in code. Edges pulse cell by cell to show the walk.

export type PxTone = "ink" | "red" | "amber" | "slate" | "green" | "paper" | "outline";

const FILL: Record<PxTone, string> = {
  ink: "#16130E",
  red: "#D63C22",
  amber: "#B4690E",
  slate: "#A39C8F",
  green: "#1D6A4B",
  paper: "#F4F1E8",
  outline: "transparent",
};

export interface PxNode {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: PxTone;
  label?: string;
}
export interface PxEdge {
  from: [number, number];
  to: [number, number];
  tone: PxTone;
  dashed?: boolean;
}

const CELL = 8;
const STEP_MS = 55;

/** Cells along an orthogonal route: across, down or up, then across. */
function route([x1, y1]: [number, number], [x2, y2]: [number, number]): [number, number][] {
  const cells: [number, number][] = [];
  const midX = Math.round((x1 + x2) / 2);
  const dir = x2 >= x1 ? 1 : -1;
  for (let x = x1; x !== midX; x += dir) cells.push([x, y1]);
  const vdir = y2 >= y1 ? 1 : -1;
  for (let y = y1; y !== y2; y += vdir) cells.push([midX, y]);
  for (let x = midX; x !== x2; x += dir) cells.push([x, y2]);
  return cells;
}

export default function PixelGraph({
  cols,
  rows,
  nodes,
  edges,
  label = "Diagram",
  dark = false,
}: {
  cols: number;
  rows: number;
  nodes: PxNode[];
  edges: PxEdge[];
  label?: string;
  dark?: boolean;
}) {
  const textColor = dark ? "rgba(244,241,232,0.6)" : "#6E675B";
  return (
    <svg
      viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
      className="block h-auto w-full"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {/* background grid dots */}
      {Array.from({ length: rows }).flatMap((_, y) =>
        Array.from({ length: cols }).map((__, x) =>
          (x + y) % 2 === 0 ? (
            <rect
              key={`g${x}-${y}`}
              x={x * CELL + 3.5}
              y={y * CELL + 3.5}
              width={1}
              height={1}
              fill={dark ? "rgba(244,241,232,0.18)" : "rgba(22,19,14,0.16)"}
            />
          ) : null,
        ),
      )}

      {edges.map((e, ei) => {
        const cells = route(e.from, e.to);
        const duration = cells.length * STEP_MS + 1400;
        return cells.map(([x, y], i) =>
          e.dashed && i % 2 === 1 ? null : (
            <rect
              key={`e${ei}-${i}`}
              x={x * CELL + 1}
              y={y * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              fill={FILL[e.tone]}
              className="px-flow"
              style={{ animationDelay: `${ei * 300 + i * STEP_MS}ms`, animationDuration: `${duration}ms` }}
            />
          ),
        );
      })}

      {nodes.map((n, i) => (
        <g key={`n${i}`}>
          <rect
            x={n.x * CELL}
            y={n.y * CELL}
            width={n.w * CELL}
            height={n.h * CELL}
            fill={FILL[n.tone]}
            stroke={n.tone === "outline" || n.tone === "paper" ? (dark ? "#F4F1E8" : "#16130E") : "none"}
            strokeWidth={n.tone === "outline" || n.tone === "paper" ? 2 : 0}
            strokeDasharray={n.tone === "outline" ? "4 4" : undefined}
          />
          {/* inner pixel highlight */}
          {n.tone !== "outline" && n.tone !== "paper" && (
            <rect
              x={n.x * CELL + CELL}
              y={n.y * CELL + CELL}
              width={CELL}
              height={CELL}
              fill="rgba(255,255,255,0.35)"
            />
          )}
          {n.label && (
            <text
              x={(n.x + n.w / 2) * CELL}
              y={(n.y + n.h) * CELL + 13}
              textAnchor="middle"
              fontSize="9"
              letterSpacing="1"
              fill={textColor}
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              {n.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Decorative dithered field: density rises left to right. Deterministic. */
export function PixelField({ cols = 56, rows = 14 }: { cols?: number; rows?: number }) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cells: { x: number; y: number; o: number; red: boolean }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = Math.pow(x / cols, 1.6);
      const r = rand();
      if (r < p) cells.push({ x, y, o: 0.15 + rand() * 0.75, red: rand() < 0.05 });
    }
  }
  return (
    <svg viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * CELL}
          y={c.y * CELL}
          width={CELL - 1}
          height={CELL - 1}
          fill={c.red ? "#D63C22" : "#F4F1E8"}
          opacity={c.red ? 1 : c.o}
        />
      ))}
    </svg>
  );
}
