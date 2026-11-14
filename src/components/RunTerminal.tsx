"use client";

// Replays the progress log of a real saved run, at its recorded pace sped up
// to fit about ten seconds. The lines are the run's own step messages.

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ShowLine } from "@/lib/showcase";

const COLOR: Record<ShowLine["kind"], string> = {
  cmd: "text-paper",
  arg: "text-paper/60",
  step: "text-paper/75",
  wait: "text-caution",
  warn: "text-signal",
  ok: "text-[#7CC4A4]",
};
const PREFIX: Record<ShowLine["kind"], string> = {
  cmd: "$",
  arg: " ",
  step: "›",
  wait: "…",
  warn: "!",
  ok: "=",
};

const TARGET_MS = 10_000;

export default function RunTerminal({ lines, label }: { lines: ShowLine[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  // Delay before each line: the recorded gap, scaled so the replay takes about TARGET_MS.
  const { delays, speed } = useMemo(() => {
    const total = Math.max(1, lines[lines.length - 1]?.t || 1);
    const speed = Math.max(1, total / TARGET_MS);
    const delays = lines.map((l, i) => {
      if (i === 0) return 300;
      const gap = (l.t - lines[i - 1].t) / speed;
      return Math.min(1200, Math.max(l.kind === "arg" ? 120 : 220, gap));
    });
    return { delays, speed };
  }, [lines]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(lines.length);
      return;
    }
    if (count >= lines.length) return;
    const id = setTimeout(() => setCount((c) => c + 1), delays[count]);
    return () => clearTimeout(id);
  }, [started, count, lines.length, delays]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-paper/15 bg-[#0E0C09]">
      <div className="flex items-center justify-between border-b border-paper/10 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
        </div>
        <span className="font-mono text-[11px] text-paper/40">
          {label}
          {speed > 1.5 ? ` · replayed ${Math.round(speed)}× faster` : ""}
        </span>
        <button
          type="button"
          onClick={() => setCount(0)}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-paper/40 transition hover:text-paper"
          aria-label="Replay"
        >
          <RotateCcw className="h-3 w-3" /> replay
        </button>
      </div>
      <div ref={body} className="max-h-[520px] min-h-[420px] space-y-1 overflow-y-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed">
        {lines.slice(0, count).map((l, i) => (
          <div key={i} className={`flex gap-2.5 animate-rise ${COLOR[l.kind]}`}>
            <span className="w-3 shrink-0 text-paper/35">{PREFIX[l.kind]}</span>
            <span className="min-w-0 break-words">{l.text}</span>
          </div>
        ))}
        {count < lines.length && (
          <div className="flex gap-2.5">
            <span className="w-3" />
            <span className="inline-block h-4 w-2 animate-blink bg-paper/70" />
          </div>
        )}
      </div>
    </div>
  );
}
