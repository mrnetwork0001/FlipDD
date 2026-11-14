import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { scene, wordAt } from "./timing";
import { C, mono, sans, serif, serifItalic } from "./theme";
import { clamp, expo, pop, soft } from "./ui/motion";
import { Browser, markOf } from "./ui/Footage";
import run from "../data/run.json";

// ---------------------------------------------------------------- shared pieces

/** Scene-local frame and word cues: rel("word", n) is when the nth "word" is spoken, scene-local. */
export function useCue(id: string) {
  const s = scene(id);
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt(id, w, n) - s.from;
  return { s, f, rel, dur: s.durationInFrames };
}

const Fill: React.FC<{ bg: string; color?: string; children: React.ReactNode }> = ({ bg, color = C.ink, children }) => (
  <AbsoluteFill style={{ background: bg, color, fontFamily: sans, overflow: "hidden" }}>{children}</AbsoluteFill>
);

/** Fade, rise and un-blur for any block. */
const In: React.FC<{ at: number; dur?: number; y?: number; x?: number; out?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, dur = 16, y = 26, x = 0, out, style, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: expo });
  const o = out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1;
  return <div style={{ opacity: p * o, transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px)`, filter: p < 1 ? `blur(${(1 - p) * 7}px)` : undefined, ...style }}>{children}</div>;
};

/**
 * A spoken line set as big kinetic type, each word arriving the frame it is spoken.
 * `range` picks words [a, b) of the line; `accent` sets words in the italic serif, in a colour.
 */
const Spoken: React.FC<{ id: string; line?: number; range?: [number, number]; accent?: Record<string, string>; out?: number; style?: React.CSSProperties }> = ({ id, line = 0, range, accent = {}, out, style }) => {
  const f = useCurrentFrame();
  const s = scene(id);
  const all = s.lines[line].words;
  const words = range ? all.slice(range[0], range[1]) : all;
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
  const acc = Object.fromEntries(Object.entries(accent).map(([k, v]) => [norm(k), v]));
  const fade = out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1;
  return (
    <div style={{ opacity: fade, ...style }}>
      {words.map((w, i) => {
        const t = w.start - s.from - 3;
        const p = interpolate(f, [t, t + 12], [0, 1], { ...clamp, easing: expo });
        const a = acc[norm(w.word)];
        return (
          <span key={i} style={{
            display: "inline-block", marginRight: "0.22em", opacity: p, transform: `translateY(${(1 - p) * 0.4}em)`,
            filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined,
            ...(a ? { fontFamily: serifItalic, fontStyle: "italic", color: a } : {}),
          }}>{w.word}</span>
        );
      })}
    </div>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; color?: string; dot?: string; style?: React.CSSProperties }> = ({ children, color = C.muted, dot = C.signal, style }) => (
  <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 12, ...style }}>
    <span style={{ width: 9, height: 9, borderRadius: 5, background: dot }} />{children}
  </div>
);

/**
 * The film's motif: the red line a deck travels down, from a meeting to a competitor.
 * Draws from (x1,y1) to (x2,y2) between frames a and b; a bead runs along it after.
 */
const LeakLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; a: number; b: number; color?: string; width?: number; bead?: boolean }> = ({ x1, y1, x2, y2, a, b, color = C.signal, width = 5, bead = true }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [a, b], [0, 1], { ...clamp, easing: expo });
  const mx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.25;
  const t = ((f - b) % 45) / 45;
  const bt = Math.max(0, t);
  // point on the cubic for the bead
  const q = (u: number) => {
    const c = (p0: number, p1: number, p2: number, p3: number) => (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3 * p3;
    return { x: c(x1, mx, mx, x2), y: c(y1, y1, y2, y2) };
  };
  const pt = q(bt);
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width={1920} height={1080}>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={width * 3.2} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      {bead && f > b ? <circle cx={pt.x} cy={pt.y} r={width * 1.6} fill="#fff" stroke={color} strokeWidth={3} /> : null}
    </svg>
  );
};

/** FlipDD's mark: two rounded squares, one turned over the other. */
const Mark: React.FC<{ size: number; flip?: number; light?: boolean }> = ({ size, flip = 1, light }) => {
  const s = size * 0.62;
  const r = size * 0.16;
  const w = Math.max(3, size * 0.075);
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `perspective(800px) rotateY(${(1 - flip) * 180}deg)` }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: s, height: s, borderRadius: r, border: `${w}px solid ${light ? "#fff" : C.signal}` }} />
      <div style={{ position: "absolute", right: 0, bottom: 0, width: s, height: s, borderRadius: r, border: `${w}px solid ${light ? "rgba(255,255,255,0.9)" : C.ink}`, background: light ? "rgba(255,255,255,0.08)" : "transparent" }} />
    </div>
  );
};

/** A slot for footage only the team can record, clearly marked as such in the draft. */
const Placeholder: React.FC<{ label: string; sub?: string; style?: React.CSSProperties }> = ({ label, sub, style }) => (
  <div style={{
    position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, padding: 28,
    background: "repeating-linear-gradient(-45deg, rgba(214,60,34,0.08) 0 16px, rgba(214,60,34,0.02) 16px 32px)", border: `3px dashed ${C.signal}`, borderRadius: 28,
    color: C.ink, ...style,
  }}>
    <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.16em", color: C.signal }}>YOUR RECORDING HERE</div>
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, lineHeight: 1.2 }}>{label}</div>
    {sub ? <div style={{ fontFamily: sans, fontSize: 20, color: C.muted, lineHeight: 1.35 }}>{sub}</div> : null}
  </div>
);

/** A phone outline holding a recording. */
const Phone: React.FC<{ left: number; top: number; at: number; children: React.ReactNode; out?: number }> = ({ left, top, at, children, out }) => {
  const f = useCurrentFrame();
  const p = pop(f, at);
  const o = interpolate(f, [at, at + 8], [0, 1], clamp) * (out != null ? interpolate(f, [out, out + 12], [1, 0], clamp) : 1);
  return (
    <div style={{ position: "absolute", left, top, width: 420, height: 860, borderRadius: 64, background: C.night, padding: 16, opacity: o, transform: `translateY(${(1 - p) * 60}px) scale(${0.94 + 0.06 * p})`, boxShadow: "0 60px 120px rgba(60,40,20,0.35)" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", background: C.card }}>
        {children}
        <div style={{ position: "absolute", top: 14, left: "50%", marginLeft: -60, width: 120, height: 34, borderRadius: 20, background: C.night }} />
      </div>
    </div>
  );
};

/** FlipDD's call mark: the handset in a red disc with rings going out (as on the landing page). */
const CallMark: React.FC<{ size: number }> = ({ size }) => {
  const f = useCurrentFrame();
  const ring = (delay: number) => {
    const t = ((f + delay) % 66) / 66;
    return <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${size * 0.025}px solid ${C.signal}`, opacity: 0.6 * (1 - t), transform: `scale(${0.72 + 0.55 * t})` }} />;
  };
  const shake = Math.sin(f * 1.4) * (f % 66 < 18 ? 9 : 0);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {ring(0)}{ring(33)}
      <div style={{ position: "absolute", inset: "14%", borderRadius: "50%", background: C.signal, boxShadow: "0 20px 50px rgba(214,60,34,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${shake}deg)` }}>
          <path d="M3.6 1.9h2l1.1 2.8-1.4 1a7.4 7.4 0 0 0 3.6 3.6l1-1.4 2.8 1.1v2a1.5 1.5 0 0 1-1.6 1.5A10.6 10.6 0 0 1 2.1 3.5a1.5 1.5 0 0 1 1.5-1.6Z" />
          <path d="M9.6 1.8a4.8 4.8 0 0 1 4.6 4.6" />
          <path d="M9.4 4.3a2.4 2.4 0 0 1 2.3 2.3" />
        </svg>
      </div>
    </div>
  );
};

const Bubble: React.FC<{ at: number; who: string; self?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, who, self, children, style }) => {
  const f = useCurrentFrame();
  const p = pop(f, at);
  return (
    <div style={{
      opacity: interpolate(f, [at, at + 6], [0, 1], clamp), transform: `translateY(${(1 - p) * 24}px) scale(${0.95 + 0.05 * p})`, transformOrigin: self ? "100% 100%" : "0 100%",
      alignSelf: self ? "flex-end" : "flex-start", maxWidth: 640, padding: "18px 24px", borderRadius: 26, borderBottomRightRadius: self ? 8 : 26, borderBottomLeftRadius: self ? 26 : 8,
      background: self ? C.ink : C.card, color: self ? C.paper : C.ink, boxShadow: self ? "none" : `0 0 0 1px ${C.line}`, fontSize: 30, lineHeight: 1.35, ...style,
    }}>
      <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.14em", opacity: 0.55, marginBottom: 4 }}>{who}</div>
      {children}
    </div>
  );
};

const Chip: React.FC<{ at: number; color: string; children: React.ReactNode; style?: React.CSSProperties; out?: number }> = ({ at, color, children, style, out }) => {
  const f = useCurrentFrame();
  const p = pop(f, at);
  const o = interpolate(f, [at, at + 6], [0, 1], clamp) * (out != null ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1);
  return (
    <div style={{ position: "absolute", opacity: o, transform: `scale(${0.8 + 0.2 * p})`, transformOrigin: "0 50%", background: color, color: "#fff", fontFamily: mono, fontSize: 22, letterSpacing: "0.1em", padding: "12px 20px", borderRadius: 999, boxShadow: "0 16px 40px rgba(0,0,0,0.18)", ...style }}>
      {children}
    </div>
  );
};

const URL = "localhost:3001/app";
const W = 1360; // browser width on screen
const BX = (1920 - W) / 2;

// ---------------------------------------------------------------- 1. open: the hook

export const Open: React.FC = () => {
  const { f, rel } = useCue("open");
  const snap = rel("already");
  const stamp = rel("competitor.");
  const sp = pop(f, stamp);
  const shake = f >= stamp && f < stamp + 10 ? Math.sin((f - stamp) * 2.6) * (10 - (f - stamp)) * 0.9 : 0;
  return (
    <Fill bg={C.night} color={C.paper}>
      <AbsoluteFill style={{ background: "radial-gradient(1200px 700px at 70% 70%, rgba(214,60,34,0.16), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 120, top: 112, right: 120, fontFamily: serif, fontSize: 96, lineHeight: 1.02, letterSpacing: "-0.01em" }}>
        <Spoken id="open" range={[0, 8]} accent={{ "competitor.": C.signal }} />
        <Spoken id="open" range={[8, 15]} accent={{ "pitch.": C.signal }} style={{ fontSize: 58, marginTop: 22, color: "rgba(244,241,232,0.78)" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)` }}>
        {/* the meeting, there from frame 0 */}
        <div style={{ position: "absolute", left: 150, top: 560, width: 560, padding: "34px 40px", borderRadius: 30, background: C.card, color: C.ink, boxShadow: "0 40px 90px rgba(0,0,0,0.5)" }}>
          <Kicker>Next meeting</Kicker>
          <div style={{ fontFamily: serif, fontSize: 92, lineHeight: 1, marginTop: 14 }}>Creandum</div>
          <div style={{ marginTop: 14, fontSize: 24, color: C.muted }}>On your Slush meeting list</div>
        </div>
        {/* the competitor */}
        <In at={snap - 6} y={0} x={30} style={{ position: "absolute", left: 1330, top: 610, width: 440 }}>
          <div style={{ padding: "28px 34px", borderRadius: 26, background: "rgba(244,241,232,0.06)", border: `2px solid ${C.signal}` }}>
            <Kicker color="rgba(244,241,232,0.6)">Your competitor</Kicker>
            <div style={{ fontFamily: serif, fontSize: 76, marginTop: 8 }}>Lovable</div>
          </div>
        </In>
        <LeakLine x1={710} y1={700} x2={1330} y2={700} a={snap} b={snap + 16} width={6} />
        {/* the verdict, from the run */}
        <div style={{
          position: "absolute", left: 470, top: 812, opacity: f >= stamp ? 1 : 0, transform: `rotate(-6deg) scale(${1.5 - 0.5 * sp})`,
          border: `5px solid ${C.signal}`, color: C.signal, background: "rgba(21,18,14,0.92)", padding: "12px 26px", borderRadius: 12,
          fontFamily: mono, fontSize: 34, letterSpacing: "0.08em", fontWeight: 500,
        }}>
          {run.creandum.headline.toUpperCase()}
        </div>
      </div>
    </Fill>
  );
};

// ---------------------------------------------------------------- 2. problem

export const Problem: React.FC = () => {
  const { f, dur, rel } = useCue("problem");
  const z = interpolate(f, [0, dur], [1.04, 1.13], clamp);
  const deckAt = rel("walk");
  const t = interpolate(f, [deckAt - 6, rel("rival.") + 6], [0, 1], { ...clamp, easing: soft });
  return (
    <Fill bg={C.night} color={C.paper}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "65% 60%" }}>
        <Img src={staticFile("brand/before-slush.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 55%" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(21,18,14,0.96) 0%, rgba(21,18,14,0.7) 38%, rgba(21,18,14,0) 70%)" }} />
      <div style={{ position: "absolute", left: 120, top: 180, width: 860, fontFamily: serif, fontSize: 84, lineHeight: 1.05 }}>
        <Spoken id="problem" range={[0, 7]} out={rel("Nobody") - 12} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 180, width: 860, fontFamily: serif, fontSize: 84, lineHeight: 1.05 }}>
        <Spoken id="problem" range={[7, 13]} accent={{ "table.": C.signal }} out={rel("Your") - 12} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 180, width: 860, fontFamily: serif, fontSize: 84, lineHeight: 1.05 }}>
        <Spoken id="problem" range={[13, 21]} accent={{ "rival.": C.signal }} />
      </div>
      {/* the deck travels down the red line, out of the room */}
      <LeakLine x1={1060} y1={760} x2={1760} y2={420} a={deckAt - 10} b={deckAt + 10} bead={false} />
      <div style={{
        position: "absolute", left: 1060 + 700 * t - 90, top: 760 - 340 * (t * t * (3 - 2 * t)) - 60, opacity: interpolate(f, [deckAt - 8, deckAt], [0, 1], clamp),
        width: 180, height: 120, borderRadius: 14, background: C.card, color: C.ink, boxShadow: "0 24px 50px rgba(0,0,0,0.5)", padding: 16, transform: `rotate(${-8 + 10 * t}deg)`,
      }}>
        <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.12em", color: C.signal }}>PITCH DECK</div>
        {[0, 1, 2].map((i) => <div key={i} style={{ height: 8, borderRadius: 4, background: C.line, marginTop: 12, width: `${90 - i * 18}%` }} />)}
      </div>
      <In at={rel("rival.") - 4} style={{ position: "absolute", left: 1690, top: 360 }}>
        <div style={{ padding: "12px 20px", borderRadius: 999, background: C.signal, color: "#fff", fontFamily: mono, fontSize: 20, letterSpacing: "0.12em" }}>A RIVAL</div>
      </In>
    </Fill>
  );
};

// ---------------------------------------------------------------- 3. turn

export const Turn: React.FC = () => {
  const { f, rel } = useCue("turn");
  const flip = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: expo });
  return (
    <Fill bg={C.signal} color="#fff">
      <AbsoluteFill style={{ background: "radial-gradient(900px 600px at 30% 30%, rgba(255,255,255,0.14), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 140, top: 150, display: "flex", alignItems: "center", gap: 36 }}>
        <Mark size={150} flip={flip} light />
        <In at={rel("FlipDD") - 2} x={-20} y={0}>
          <div style={{ fontFamily: serif, fontSize: 150, lineHeight: 1 }}>FlipDD</div>
        </In>
      </div>
      <div style={{ position: "absolute", left: 140, top: 360, fontFamily: sans, fontWeight: 600, fontSize: 44, color: "rgba(255,255,255,0.85)" }}>
        <Spoken id="turn" range={[1, 5]} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 520, right: 140, fontFamily: serif, fontSize: 132, lineHeight: 1 }}>
        <Spoken id="turn" range={[5, 9]} accent={{ "back,": "#fff" }} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 700, fontFamily: sans, fontWeight: 600, fontSize: 52, color: "rgba(255,255,255,0.9)" }}>
        <Spoken id="turn" range={[9, 14]} />
      </div>
    </Fill>
  );
};

// ---------------------------------------------------------------- 4. check (real footage)

export const Check: React.FC = () => {
  const { rel } = useCue("check");
  const press = rel("FlipDD") - 4;
  const S = Math.max(0, markOf("check", "check.press") - press);
  const ninety = rel("Ninety");
  return (
    <Fill bg={C.paper}>
      <Browser name="check" url={URL} width={W} left={BX} top={48} light startFrom={S}
        cams={[{ f: 0, z: 1 }, { f: ninety - 20, z: 1 }, { f: ninety + 10, rect: { x: 1150, y: 0, w: 450, h: 120 }, z: 1.0 }]} />
      <Chip at={ninety} color={C.ink} style={{ left: 1290, top: 150 }}>
        <span style={{ color: "#fff" }}>{run.stats.liveCalls}</span> LIVE CALA CALLS
      </Chip>
      <Chip at={rel("seconds.") - 4} color={C.signal} style={{ left: 1290, top: 222 }}>
        {run.stats.seconds.toFixed(1)} S · CACHE OFF
      </Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 5. ties (real footage, three cuts)

export const Ties: React.FC = () => {
  const { rel } = useCue("ties");
  const cutB = rel("One") - 6;
  const cutC = rel("A", 1) - 6;
  const atB = rel("Northzone");
  const atC = rel("lookalike.");
  const board = rel("And");
  const sB = markOf("ties", "ties.northzone") - atB + cutB;
  const sC = markOf("ties", "ties.atomico") - atC + cutC;
  const label = { position: "absolute" as const, left: BX - 20, top: 26 };
  return (
    <Fill bg={C.paper}>
      <Sequence from={0} durationInFrames={cutB + 8} layout="none">
        <Browser name="ties" url={URL} width={W} left={BX} top={48} light startFrom={Math.max(0, markOf("ties", "ties.creandum") - rel("Creandum"))}
          cams={[{ f: 0, z: 1 }, { f: rel("Creandum") + 6, rect: "creandum", z: 1.3, dy: 140 }]} />
      </Sequence>
      <Sequence from={cutB} durationInFrames={cutC - cutB + 8} layout="none">
        <Browser name="ties" url={URL} width={W} left={BX} top={48} light startFrom={sB} enter={-30}
          cams={[{ f: 0, z: 1 }, { f: atB - cutB + 8, rect: "northzone", z: 1.3, dy: 160 }]} />
      </Sequence>
      <Sequence from={cutC} layout="none">
        <Browser name="ties" url={URL} width={W} left={BX} top={48} light startFrom={sC} enter={-30}
          cams={[{ f: 0, z: 1 }, { f: atC - cutC + 8, rect: "atomico", z: 1.3, dy: 160 }]} />
      </Sequence>
      <Chip at={rel("direct")} out={cutB - 4} color={C.signal} style={label}>DIRECT STAKE</Chip>
      <Chip at={rel("One")} out={cutC - 4} color={C.caution} style={label}>ONE STEP AWAY · VIA {String(run.northzone.via).toUpperCase()}</Chip>
      <Chip at={atC - 4} out={board - 4} color={C.muted} style={label}>LOOKALIKE IN THE PORTFOLIO</Chip>
      {/* the fourth tie, explained on a card: people matched on the same person record */}
      <Sequence from={board - 4} layout="none">
        <div style={{ position: "absolute", left: 1080, top: 560, width: 640, padding: "30px 34px", borderRadius: 26, background: C.night, color: C.paper, boxShadow: "0 40px 90px rgba(0,0,0,0.35)", borderTop: `4px solid ${C.signal}` }}>
          <Kicker color="rgba(244,241,232,0.6)">People</Kicker>
          <div style={{ fontFamily: serif, fontSize: 52, lineHeight: 1.05, marginTop: 12 }}>A partner on a rival&apos;s board</div>
          <div style={{ fontSize: 24, lineHeight: 1.4, marginTop: 12, color: "rgba(244,241,232,0.7)" }}>Matched on the same person record in Cala, not just the same name.</div>
        </div>
      </Sequence>
    </Fill>
  );
};

// ---------------------------------------------------------------- 6. round (real footage)

export const Round: React.FC = () => {
  const { rel } = useCue("round");
  const four = rel("Four");
  const S = Math.max(0, markOf("round", "round.panel") - four);
  return (
    <Fill bg={C.paper}>
      <Browser name="round" url={URL} width={W} left={BX} top={48} light startFrom={S}
        cams={[{ f: 0, z: 1 }, { f: four + 4, rect: "headline", z: 1.45, dx: 230 }, { f: rel("safest") - 4, rect: "headline", z: 1.45, dx: 230 }, { f: rel("safest") + 18, z: 1.1, dy: 120 }]} />
      <Chip at={four + 2} out={rel("Meet") - 6} color={C.signal} style={{ left: BX - 20, top: 26 }}>
        {run.investors.filter((r) => r.level !== "possible" && r.level !== "clear").length} OF {run.investors.length} MEETINGS · ONE STEP FROM LOVABLE
      </Chip>
      <Chip at={rel("Meet")} color={C.clear} style={{ left: BX - 20, top: 26 }}>SAFEST FIRST</Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 7. find (real footage)

export const Find: React.FC = () => {
  const { rel } = useCue("find");
  const S = Math.max(0, markOf("find", "find.tab") - rel("clean"));
  return (
    <Fill bg={C.paper}>
      <Browser name="find" url={URL} width={W} left={BX} top={48} light startFrom={S}
        cams={[{ f: 0, z: 1 }, { f: rel("Six"), z: 1.15, dx: 200, dy: -60 }]} />
      <Chip at={rel("Six") - 2} color={C.clear} style={{ left: BX - 20, top: 26 }}>
        {run.finder.clean} CLEAN · {run.finder.considered} CONSIDERED · {run.finder.dropped} DROPPED
      </Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 8. go: phone, Telegram, Play my day

export const Go: React.FC = () => {
  const { f, s } = useCue("go");
  const L = (i: number) => s.lines[i].startFrame - s.from;
  const tg = L(3);
  const playAt = wordAt("go", "Play") - s.from;
  const markP = interpolate(f, [L(1) - 20, L(1)], [0, 1], { ...clamp, easing: soft });
  return (
    <Fill bg={C.paper}>
      {/* the call mark, centre stage, then off to the side */}
      <div style={{ position: "absolute", left: interpolate(markP, [0, 1], [760, 120]), top: interpolate(markP, [0, 1], [250, 110]), transform: `scale(${1 - 0.45 * markP})`, transformOrigin: "0 0", opacity: interpolate(f, [tg - 12, tg], [1, 0], clamp) }}>
        <CallMark size={400} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 720, textAlign: "center", fontFamily: serif, fontSize: 96, opacity: 1 - markP }}>
        <Spoken id="go" line={0} accent={{ "call.": C.signal }} />
      </div>
      {/* the real call: the team's own screen recording goes in the phone */}
      <Phone left={1360} top={110} at={L(1) - 14} out={tg - 10}>
        <Placeholder label="A real call to the FlipDD line" sub="Screen recording of your phone during the call" style={{ inset: 0, borderRadius: 50, border: "none" }} />
      </Phone>
      <div style={{ position: "absolute", left: 140, top: 380, width: 1120, display: "flex", flexDirection: "column", gap: 22, opacity: interpolate(f, [tg - 10, tg], [1, 0], clamp) }}>
        <Bubble at={L(1) - 2} who="YOU" self>I&apos;m meeting Creandum and Northzone. My competitor is Lovable.</Bubble>
        <Bubble at={L(2) - 2} who="FLIPDD">
          <b>Creandum:</b> direct conflict. Backed Lovable, February 2025. <span style={{ color: C.signal, fontWeight: 600 }}>Teaser only.</span>
        </Bubble>
      </div>
      {/* Telegram, then Play my day */}
      <Phone left={260} top={110} at={tg + 4}>
        <Placeholder label="A Telegram voice note, and the bot's voice reply" sub="Screen recording of your phone" style={{ inset: 0, borderRadius: 50, border: "none" }} />
      </Phone>
      <Sequence from={playAt - 30} layout="none">
        <Browser name="play" url={URL} width={1080} left={760} top={170} light startFrom={Math.max(0, markOf("play", "play.press") - 30)}
          cams={[{ f: 0, rect: "button", z: 1.6, dx: -260, dy: 60 }]} />
      </Sequence>
    </Fill>
  );
};

// ---------------------------------------------------------------- 9. real: every fact from Cala

export const Real: React.FC = () => {
  const { rel } = useCue("real");
  const hosts = run.creandum.sources.map((u) => new globalThis.URL(u).hostname.replace(/^www\./, ""));
  return (
    <Fill bg={C.night} color={C.paper}>
      <In at={0} y={0} style={{ position: "absolute", left: 140, top: 150 }}>
        <Img src={staticFile("brand/cala-logo.png")} style={{ height: 70, filter: "invert(1) brightness(1.4)" }} />
      </In>
      <div style={{ position: "absolute", left: 140, top: 300, right: 140, fontFamily: serif, fontSize: 112, lineHeight: 1.02 }}>
        <Spoken id="real" accent={{ "source.": C.signal }} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 640, display: "flex", gap: 18, flexWrap: "wrap", width: 1600 }}>
        <In at={rel("with") - 6} y={14}>
          <div style={{ padding: "14px 22px", borderRadius: 999, background: C.signal, color: "#fff", fontFamily: mono, fontSize: 22 }}>CREANDUM → LOVABLE · FEB 2025</div>
        </In>
        {hosts.map((h, i) => (
          <In key={h} at={rel("its") + i * 5} y={14}>
            <div style={{ padding: "14px 22px", borderRadius: 999, border: "2px solid rgba(244,241,232,0.25)", fontFamily: mono, fontSize: 22, color: "rgba(244,241,232,0.85)" }}>{h} ↗</div>
          </In>
        ))}
      </div>
    </Fill>
  );
};

// ---------------------------------------------------------------- 10. close

export const Close: React.FC = () => {
  const { f, rel } = useCue("close");
  const flip = interpolate(f, [0, 20], [0, 1], { ...clamp, easing: expo });
  return (
    <Fill bg={C.signal} color="#fff">
      <AbsoluteFill style={{ background: "radial-gradient(900px 600px at 50% 40%, rgba(255,255,255,0.16), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <Mark size={170} flip={flip} light />
        <In at={rel("FlipDD.") - 2} x={-20} y={0}><div style={{ fontFamily: serif, fontSize: 180, lineHeight: 1 }}>FlipDD</div></In>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", fontFamily: serif, fontSize: 84 }}>
        <Spoken id="close" range={[1, 7]} accent={{ "table.": "#fff" }} />
      </div>
      <In at={rel("table.") + 4} y={10} style={{ position: "absolute", left: 0, right: 0, top: 720, display: "flex", justifyContent: "center", gap: 26, alignItems: "center", fontFamily: mono, fontSize: 26, letterSpacing: "0.08em" }}>
        <span style={{ padding: "12px 22px", borderRadius: 12, border: "2px dashed rgba(255,255,255,0.7)" }}>[ LIVE URL ]</span>
        <span style={{ opacity: 0.8 }}>BUILT ON</span>
        <Img src={staticFile("brand/cala-logo.png")} style={{ height: 40, filter: "brightness(0) invert(1)" }} />
        <span style={{ opacity: 0.8 }}>· JUNCTION 2026</span>
      </In>
    </Fill>
  );
};
