"use client";

// Shared canvas loop for the background effects: sizes the canvas to its box
// at device pixel ratio, runs only while on screen, and draws a single still
// frame for people who ask for reduced motion.

import { useEffect, useRef } from "react";

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export function useCanvasLoop(draw: Draw) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    const start = performance.now();
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawRef.current(ctx, w, h, 0);
    };
    const loop = (now: number) => {
      if (visible) drawRef.current(ctx, w, h, (now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    resize();
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return ref;
}
