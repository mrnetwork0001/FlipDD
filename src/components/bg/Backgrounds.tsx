"use client";

// Continuous background effects in FlipDD's palette. Each fills its parent
// (position it absolutely behind the content). Canvas effects pause off screen
// and stay still under prefers-reduced-motion.

import { useMemo } from "react";
import { useCanvasLoop } from "./useCanvasLoop";

const INK = "22,19,14";
const RED = "214,60,34";
const OCHRE = "180,105,14";

// 1. Living paper: drifting risograph grain (SVG noise, moved with CSS).
export function PaperGrain({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <svg className="bg-grain absolute -inset-[50%] h-[200%] w-[200%] opacity-[0.22] mix-blend-multiply">
        <filter id="flipdd-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.09  0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0.55 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#flipdd-grain)" />
      </svg>
      <div className="bg-grain-light absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_30%,rgba(255,255,255,0.35),transparent_70%)]" />
    </div>
  );
}

// 2. Fund graph: drifting nodes that link when close; a red pulse runs along a link now and then.
export function FundGraph({ className = "" }: { className?: string }) {
  const nodes = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.012,
        vy: (Math.random() - 0.5) * 0.012,
        r: i % 9 === 0 ? 3.2 : 1.8,
        red: i % 13 === 0,
      })),
    [],
  );
  const pulse = useMemo(() => ({ a: 0, b: 1, t0: 0 }), []);
  const ref = useCanvasLoop((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const dt = 1 / 60;
    for (const n of nodes) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.x < 0 || n.x > 1) n.vx *= -1;
      if (n.y < 0 || n.y > 1) n.vy *= -1;
    }
    const max = Math.min(220, w * 0.22);
    const links: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[i].x - nodes[j].x) * w;
        const dy = (nodes[i].y - nodes[j].y) * h;
        const d = Math.hypot(dx, dy);
        if (d < max) {
          links.push([i, j]);
          ctx.strokeStyle = `rgba(${INK},${0.13 * (1 - d / max)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x * w, nodes[i].y * h);
          ctx.lineTo(nodes[j].x * w, nodes[j].y * h);
          ctx.stroke();
        }
      }
    }
    // a new pulse every 2.6 s along a random link
    if (t - pulse.t0 > 2.6 && links.length) {
      const [a, b] = links[Math.floor(Math.random() * links.length)];
      Object.assign(pulse, { a, b, t0: t });
    }
    const p = Math.min(1, (t - pulse.t0) / 1.4);
    const A = nodes[pulse.a];
    const B = nodes[pulse.b];
    if (A && B && p < 1) {
      ctx.strokeStyle = `rgba(${RED},${0.55 * (1 - p * 0.6)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(A.x * w, A.y * h);
      ctx.lineTo((A.x + (B.x - A.x) * p) * w, (A.y + (B.y - A.y) * p) * h);
      ctx.stroke();
      ctx.fillStyle = `rgba(${RED},0.85)`;
      ctx.beginPath();
      ctx.arc((A.x + (B.x - A.x) * p) * w, (A.y + (B.y - A.y) * p) * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of nodes) {
      ctx.fillStyle = n.red ? `rgba(${RED},0.55)` : `rgba(${INK},0.28)`;
      ctx.beginPath();
      ctx.arc(n.x * w, n.y * h, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}

// 3. Dot wave: the dotted grid, with a slow diagonal wave of darker, larger dots.
export function DotWave({ className = "" }: { className?: string }) {
  const ref = useCanvasLoop((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const gap = 22;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        const wave = Math.sin(x * 0.012 + y * 0.018 - t * 0.9) * 0.5 + 0.5;
        const k = Math.pow(wave, 6);
        const r = 0.9 + k * 1.9;
        const red = k > 0.92 && ((x * 7 + y * 13) | 0) % 11 === 0;
        ctx.fillStyle = red ? `rgba(${RED},${0.55 * k})` : `rgba(${INK},${0.1 + k * 0.32})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}

// 4. Contour lines: thin topographic lines that slowly shift, like a market map.
export function Contours({ className = "" }: { className?: string }) {
  const ref = useCanvasLoop((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);
    const lines = 26;
    for (let i = 0; i < lines; i++) {
      const base = (i / lines) * h * 1.2 - h * 0.1;
      const accent = i === 9;
      ctx.strokeStyle = accent ? `rgba(${RED},0.45)` : `rgba(${INK},${i % 4 === 0 ? 0.16 : 0.08})`;
      ctx.lineWidth = accent ? 1.4 : 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y =
          base +
          Math.sin(x * 0.006 + t * 0.25 + i * 0.35) * 26 +
          Math.sin(x * 0.013 - t * 0.18 + i * 0.6) * 12 +
          Math.cos(x * 0.0025 + t * 0.1) * 30;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}

// 5. Ink drift: very soft ochre and red washes moving slowly (CSS only).
export function InkDrift({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="bg-ink-a absolute -left-[10%] top-[-20%] h-[70%] w-[55%] rounded-full blur-3xl" style={{ background: `rgba(${OCHRE},0.16)` }} />
      <div className="bg-ink-b absolute right-[-10%] top-[10%] h-[60%] w-[45%] rounded-full blur-3xl" style={{ background: `rgba(${RED},0.10)` }} />
      <div className="bg-ink-c absolute bottom-[-25%] left-[25%] h-[60%] w-[50%] rounded-full blur-3xl" style={{ background: `rgba(${INK},0.06)` }} />
    </div>
  );
}

export const BACKGROUNDS = [
  { key: "paper", name: "Living paper", note: "Risograph grain that drifts slowly, like the paper in the illustrations.", C: PaperGrain },
  { key: "graph", name: "Fund graph", note: "Faint funds linking up as they drift; a red pulse traces a path every few seconds.", C: FundGraph },
  { key: "dots", name: "Dot wave", note: "FlipDD's dotted grid with a slow wave rolling across it.", C: DotWave },
  { key: "contours", name: "Contour lines", note: "Topographic lines shifting slowly, one in red: a map of the market.", C: Contours },
  { key: "ink", name: "Ink drift", note: "Soft ochre and red ink washes moving behind the page.", C: InkDrift },
] as const;
