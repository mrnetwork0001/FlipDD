import React from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { T, scene, wordAt, lineStart } from "./timing";
import { C } from "./theme";
import { Captions } from "./ui/Captions";
import { Grain } from "./ui/Grain";
import { clamp } from "./ui/motion";
import { Check, Close, Go, Open, Prep, Problem, Real, Ties, Turn } from "./scenes";

const SCENES: Record<string, React.FC> = { open: Open, problem: Problem, turn: Turn, check: Check, ties: Ties, prep: Prep, go: Go, real: Real, close: Close };
const OVERLAP = 10; // frames each scene starts early, to dissolve over the last

/** Each scene eases in (a short rise, un-blur and settle) over the tail of the previous one, holding its first frame. */
const SceneIn: React.FC<{ S: React.FC; first: boolean }> = ({ S, first }) => {
  const f = useCurrentFrame();
  if (first) return <S />;
  const p = interpolate(f, [0, OVERLAP], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const body = f < OVERLAP ? <Freeze frame={0}><S /></Freeze> : <Sequence from={OVERLAP} layout="none"><S /></Sequence>;
  return <AbsoluteFill style={{ opacity: p, transform: `scale(${1.04 - 0.04 * p})`, filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined }}>{body}</AbsoluteFill>;
};

// Music, ducked under every spoken line.
const LINES = T.scenes.flatMap((s) => s.lines.map((l) => [l.startFrame, l.words[l.words.length - 1].end] as const));
const DUCK: number[] = (() => {
  const v = new Array<number>(T.totalFrames + 1).fill(0);
  for (let f = 0; f <= T.totalFrames; f++) {
    let d = 0;
    for (const [a, b] of LINES) d = Math.max(d, interpolate(f, [a - 10, a, b, b + 14], [0, 1, 1, 0], clamp));
    v[f] = d;
  }
  return v;
})();
const musicVolume = (f: number) => {
  const end = T.totalFrames;
  const fadeIn = interpolate(f, [0, 6], [0.5, 1], clamp);
  const fadeOut = interpolate(f, [end - 40, end], [1, 0], clamp);
  return (0.62 - 0.42 * DUCK[Math.min(end, Math.max(0, f))]) * fadeIn * fadeOut;
};

interface Fx { file: string; at: number; vol: number; dur?: number }
function effects(): Fx[] {
  const sc = (id: string) => scene(id).from;
  const w = (id: string, word: string, n = 0) => wordAt(id, word, n);
  const go = scene("go");
  const fx: Fx[] = [
    // the hook: the line snaps tight on "already", the verdict stamps on "competitor"
    { file: "alert", at: 2, vol: 0.25 },
    { file: "whoosh", at: w("open", "already") - 6, vol: 0.35 },
    { file: "pop", at: w("open", "competitor.") - 2, vol: 0.6 },
    { file: "thud", at: w("open", "That's") - 2, vol: 0.25 },
    { file: "whoosh", at: sc("problem") - 8, vol: 0.3 },
    ...["market", "rival's", "numbers."].map((x) => ({ file: "pop", at: w("problem", x) - 2, vol: 0.32 })),
    { file: "alert", at: w("problem", "name.") - 4, vol: 0.3 },
    { file: "riser", at: sc("turn") - 54, vol: 0.35 },
    { file: "flip", at: sc("turn") + 1, vol: 0.55 },
    { file: "impact", at: sc("turn") + 4, vol: 0.55 },
    { file: "whoosh", at: sc("check") - 8, vol: 0.3 },
    { file: "click", at: w("check", "FlipDD") - 4, vol: 0.5 },
    { file: "tick", at: w("check", "hundred") - 2, vol: 0.35 },
    { file: "pop", at: w("check", "seconds.") - 4, vol: 0.4 },
    { file: "whoosh", at: sc("ties") - 8, vol: 0.3 },
    { file: "alert", at: w("ties", "Creandum") - 2, vol: 0.35 },
    { file: "pop", at: w("ties", "Northzone") - 2, vol: 0.4 },
    { file: "pop", at: w("ties", "Others") - 2, vol: 0.4 },
    { file: "whoosh", at: sc("prep") - 8, vol: 0.3 },
    { file: "click", at: w("prep", "Prep.") - 4, vol: 0.5 },
    { file: "pop", at: w("prep", "Who's") - 2, vol: 0.35 },
    { file: "chime", at: w("prep", "seventeen") - 2, vol: 0.3 },
    { file: "pop", at: w("prep", "What", 2) - 2, vol: 0.35 },
    { file: "whoosh", at: sc("go") - 8, vol: 0.3 },
    { file: "pop", at: w("go", "Telegram") - 4, vol: 0.4 },
    { file: "chime", at: lineStart("go", 1) - 6, vol: 0.35 },
    { file: "ring", at: w("go", "Or") - 40, vol: 0.4, dur: 70 },
    { file: "whoosh", at: sc("real") - 8, vol: 0.3 },
    { file: "pop", at: w("real", "its") - 2, vol: 0.35 },
    { file: "flip", at: sc("close") + 1, vol: 0.5 },
    { file: "impact", at: sc("close") + 4, vol: 0.45 },
  ];

  void go;
  return fx.filter((x) => x.at >= 0 && x.at < T.totalFrames);
}

export const Film: React.FC = () => {
  // Captions sit out where big type already carries the words.
  const hideCaptions = (f: number) => {
    const s = T.scenes.find((x) => f >= x.from && f < x.from + x.durationInFrames);
    return !s || ["open", "problem", "turn", "real", "close"].includes(s.id) || (s.id === "go" && f < wordAt("go", "Telegram"));
  };
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {T.scenes.map((s, i) => {
        const S = SCENES[s.id];
        const from = i === 0 ? s.from : s.from - OVERLAP;
        const dur = s.durationInFrames + (i === 0 ? 0 : OVERLAP);
        return S ? (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id}>
            <SceneIn S={S} first={i === 0} />
          </Sequence>
        ) : null;
      })}
      <Grain opacity={0.05} />
      <Captions hidden={hideCaptions} bottom={40} />
      <Audio src={staticFile("audio/music.mp3")} volume={musicVolume} />
      {T.scenes.flatMap((s) => s.lines).map((l, i) => (
        <Sequence key={`vo${i}`} from={l.startFrame} durationInFrames={l.durationFrames} name={`vo ${l.text.slice(0, 18)}`}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      {effects().map((x, i) => (
        <Sequence key={`fx${i}`} from={x.at} durationInFrames={x.dur ?? 150} name={`fx ${x.file}`}>
          <Audio src={staticFile(`audio/sfx/${x.file}.mp3`)} volume={(f) => x.vol * (x.dur ? interpolate(f, [0, 8, x.dur - 20, x.dur], [0, 1, 1, 0], clamp) : 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
