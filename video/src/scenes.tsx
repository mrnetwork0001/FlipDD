import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
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

/**
 * Real people (stock B-roll, see data/stock.json) as a full-bleed cutaway: a slow
 * push-in, a light warm grade to sit with the film, and a fade at both ends.
 */
const Stock: React.FC<{ id: number; from?: number; dur: number; at?: number; shade?: number; position?: string }> = ({ id, from = 0, dur, at = 0, shade = 0.25, position = "50% 50%" }) => {
  const f = useCurrentFrame() - at;
  if (f < -1 || f > dur + 1) return null;
  const o = interpolate(f, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  const z = interpolate(f, [0, dur], [1.04, 1.12], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Sequence from={at} layout="none">
        <AbsoluteFill style={{ transform: `scale(${z})` }}>
          <OffthreadVideo src={staticFile(`footage/stock/${id}.mp4`)} startFrom={from} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position, filter: "sepia(0.18) saturate(0.85) contrast(1.06) brightness(0.96)" }} />
        </AbsoluteFill>
      </Sequence>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(21,18,14,${0.55 + shade}) 0%, rgba(21,18,14,${shade}) 55%, rgba(21,18,14,0.05) 100%)` }} />
    </AbsoluteFill>
  );
};

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

const URL = "tryflipdd.vercel.app/app";
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
        <Spoken id="open" range={[0, 7]} accent={{ "competitor.": C.signal }} />
        <Spoken id="open" range={[7, 13]} accent={{ "blind": C.signal }} style={{ fontSize: 58, marginTop: 22, color: "rgba(244,241,232,0.78)" }} />
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
  const z = interpolate(f, [0, dur], [1.04, 1.12], clamp);
  const item = (text: string, at: number, tone: "dark" | "red" = "dark") => (
    <In at={at} y={12} style={{ marginTop: 12 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 20px", borderRadius: 999, background: tone === "red" ? C.signal : "rgba(244,241,232,0.94)", color: tone === "red" ? "#fff" : C.ink, fontSize: 28, fontWeight: 600 }}>{text}</div>
    </In>
  );
  return (
    <Fill bg={C.night} color={C.paper}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: "65% 60%" }}>
        <Img src={staticFile("brand/before-slush.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 55%" }} />
      </AbsoluteFill>
      {/* real people: investors across the table, then the event floor */}
      <Stock id={42644} from={30} at={0} dur={rel("Most") - 4} shade={0.3} />
      <Stock id={13192} from={60} at={rel("Most") - 6} dur={dur - rel("Most") + 8} shade={0.3} />
      <div style={{ position: "absolute", left: 120, top: 150, width: 880, fontFamily: serif, fontSize: 82, lineHeight: 1.05 }}>
        <Spoken id="problem" range={[0, 8]} accent={{ "numbers.": C.signal }} />
        <Spoken id="problem" range={[8, 15]} style={{ marginTop: 26, fontSize: 64, color: "rgba(244,241,232,0.8)" }} accent={{ "name.": C.signal }} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 640, display: "flex", gap: 90 }}>
        <div>
          <In at={rel("They") - 2} y={8}><Kicker color="rgba(244,241,232,0.6)">The investor knows</Kicker></In>
          {item("Your market", rel("market"))}
          <br />
          {item("Lovable's growth", rel("rival's"))}
          <br />
          {item("What to ask you", rel("numbers."))}
        </div>
        <div>
          <In at={rel("Most") - 2} y={8}><Kicker color="rgba(244,241,232,0.6)">You know</Kicker></In>
          {item("A name", rel("name.") - 4, "red")}
        </div>
      </div>
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
        <Spoken id="turn" range={[9, 12]} />
      </div>
    </Fill>
  );
};

// ---------------------------------------------------------------- 4. check (real footage)

export const Check: React.FC = () => {
  const { rel } = useCue("check");
  const press = rel("FlipDD") - 4;
  const S = Math.max(0, markOf("check", "check.press") - press);
  const hundred = rel("hundred");
  const handoff = press - 10;
  return (
    <Fill bg={C.paper}>
      <Sequence from={handoff - 4} layout="none">
      <Browser name="check" url={URL} width={W} left={BX} top={48} light startFrom={S + handoff - 4}
        cams={[{ f: 0, z: 1 }, { f: hundred - 20 - (handoff - 4), z: 1 }, { f: hundred + 10 - (handoff - 4), rect: { x: 1150, y: 0, w: 450, h: 120 }, z: 1.0 }]} enter={-30} />
      </Sequence>
      {/* a real person typing the list, then the real app */}
      <Stock id={4827} from={45} at={0} dur={handoff + 6} shade={0.05} />
      <Chip at={hundred} color={C.ink} style={{ left: 1260, top: 150 }}>
        {run.stats.records} CALA RECORDS
      </Chip>
      <Chip at={rel("seconds.") - 4} color={C.signal} style={{ left: 1260, top: 222 }}>
        {run.stats.seconds.toFixed(1)} SECONDS
      </Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 5. ties (real footage, three cuts)

export const Ties: React.FC = () => {
  const { rel } = useCue("ties");
  const cutB = rel("Northzone") - 14;
  const cutC = rel("Others") - 8;
  const atB = rel("Northzone");
  const atC = rel("lookalike.");
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
      <Chip at={rel("Creandum") - 2} out={cutB - 4} color={C.signal} style={label}>BACKS YOUR COMPETITOR</Chip>
      <Chip at={atB - 2} out={cutC - 4} color={C.caution} style={label}>ONE STEP AWAY · VIA {String(run.northzone.via).toUpperCase()}</Chip>
      <Chip at={rel("Others") - 2} color={C.muted} style={label}>LOOKALIKE IN THE PORTFOLIO</Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 6. prep (real footage, four cuts)

export const Prep: React.FC = () => {
  const { rel } = useCue("prep");
  const open = rel("Prep.");
  const tWho = rel("Who's");
  const tTeam = rel("and", 0) - 4;
  // "what" also occurs in "and what they did before": the sentences start at the 2nd and 3rd.
  const tKnow = rel("What", 1) - 6;
  const tAsk = rel("What", 2) - 6;
  const S1 = Math.max(0, markOf("prep", "prep.open") - open);
  // Inside a cut, the clip starts at startFrom: show the moment just after each click.
  const S2 = markOf("prep", "prep.team") + 30;
  const S3 = markOf("prep", "prep.rival") + 40;
  const S4 = markOf("prep", "prep.summary") + 30;
  const dialog = { x: 880, y: 0, w: 720, h: 900 };
  const label = { position: "absolute" as const, left: BX - 20, top: 26 };
  const cams = [{ f: 0, z: 1 }, { f: open + 14, rect: dialog, z: 1.25 }];
  return (
    <Fill bg={C.paper}>
      <Sequence from={0} durationInFrames={tTeam + 8} layout="none">
        <Browser name="prep" url={URL} width={W} left={BX} top={48} light startFrom={S1} cams={cams} />
      </Sequence>
      <Sequence from={tTeam} durationInFrames={tKnow - tTeam + 8} layout="none">
        <Browser name="prep" url={URL} width={W} left={BX} top={48} light startFrom={S2} enter={-30} cams={[{ f: 0, rect: dialog, z: 1.25 }]} />
      </Sequence>
      <Sequence from={tKnow} durationInFrames={tAsk - tKnow + 8} layout="none">
        <Browser name="prep" url={URL} width={W} left={BX} top={48} light startFrom={S3} enter={-30} cams={[{ f: 0, rect: dialog, z: 1.25 }]} />
      </Sequence>
      <Sequence from={tAsk} layout="none">
        <Browser name="prep" url={URL} width={W} left={BX} top={48} light startFrom={S4} enter={-30} cams={[{ f: 0, rect: dialog, z: 1.25 }]} stopAt={S4 + 40} />
      </Sequence>
      <Chip at={open} out={tWho - 4} color={C.ink} style={label}>MEETING PREP · CREANDUM</Chip>
      <Chip at={tWho} out={tKnow - 4} color={C.ink} style={label}>LIKELY ACROSS THE TABLE · {run.prep.lead.toUpperCase()}</Chip>
      <Chip at={tKnow} out={tAsk - 4} color={C.signal} style={label}>WHAT THEY KNOW · LOVABLE ARR $17M → $75M</Chip>
      <Chip at={tAsk} color={C.clear} style={label}>WHAT TO ASK · WHAT TO HOLD BACK</Chip>
    </Fill>
  );
};

// ---------------------------------------------------------------- 8. go: phone, Telegram, Play my day

export const Go: React.FC = () => {
  const { f, s, rel } = useCue("go");
  const L = (i: number) => s.lines[i].startFrame - s.from;
  const callAt = rel("call.") - 16;
  return (
    <Fill bg={C.paper}>
      <Stock id={4915} from={90} at={0} dur={rel("Telegram") + 4} shade={0.35} />
      <div style={{ position: "absolute", left: 120, top: 120, width: 760, fontFamily: serif, fontSize: 76, lineHeight: 1.05, color: f < rel("Telegram") ? C.paper : C.ink, opacity: interpolate(f, [callAt - 10, callAt], [1, 0], clamp) }}>
        <Spoken id="go" line={0} range={[0, 6]} accent={{ "phone.": C.signal }} />
      </div>
      {/* Telegram: the owner's real screen recording goes in the phone */}
      <Phone left={1300} top={110} at={rel("Telegram") - 10} out={callAt - 8}>
        <Placeholder label="Telegram: /prep Creandum, the note and its voice reply" sub="Screen recording of your phone" style={{ inset: 0, borderRadius: 50, border: "none" }} />
      </Phone>
      <div style={{ position: "absolute", left: 120, top: 470, width: 1080, display: "flex", flexDirection: "column", gap: 20, opacity: interpolate(f, [callAt - 10, callAt], [1, 0], clamp) }}>
        <Bubble at={rel("Telegram") - 4} who="YOU, IN TELEGRAM" self><span style={{ fontFamily: mono }}>/prep Creandum</span></Bubble>
        <Bubble at={L(1) - 4} who="FLIPDD · VOICE NOTE">
          <b>Creandum.</b> Expect the comparison. Likely across the table: <b>Sabina Wizander</b>, Partner.
        </Bubble>
      </div>
      {/* the phone line */}
      <Sequence from={callAt} layout="none">
        {/* a real person on a call, walking */}
        <Stock id={32043} from={60} at={0} dur={s.durationInFrames - callAt + 12} shade={0.35} position="60% 40%" />
        <div style={{ position: "absolute", left: 120, top: 300 }}><CallMark size={300} /></div>
      </Sequence>
      {/* scene-timed, so it sits outside the cut */}
      {f >= callAt && (
        <div style={{ position: "absolute", left: 120, top: 660, fontFamily: serif, fontSize: 104, color: C.paper }}>
          <Spoken id="go" line={2} accent={{ "call.": C.signal }} />
        </div>
      )}
    </Fill>
  );
};

// ---------------------------------------------------------------- 9. real: every fact from Cala

export const Real: React.FC = () => {
  const { rel } = useCue("real");
  const hosts = [...new Set(run.creandum.sources.map((u) => new globalThis.URL(u).hostname.replace(/^www\./, "")))];
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
          <div style={{ padding: "14px 22px", borderRadius: 999, background: C.signal, color: "#fff", fontFamily: mono, fontSize: 22 }}>CREANDUM → {run.creandum.headline.toUpperCase()}</div>
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
        <span style={{ padding: "12px 22px", borderRadius: 12, background: "rgba(255,255,255,0.14)" }}>tryflipdd.vercel.app</span>
        <span style={{ opacity: 0.9 }}>@tryflipdd_bot</span>
        <span style={{ opacity: 0.8 }}>BUILT ON</span>
        <Img src={staticFile("brand/cala-logo.png")} style={{ height: 40, filter: "brightness(0) invert(1)" }} />
        <span style={{ opacity: 0.8 }}>· JUNCTION 2026</span>
      </In>
    </Fill>
  );
};
