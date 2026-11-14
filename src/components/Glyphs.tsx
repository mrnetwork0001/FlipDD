// FlipDD's own glyphs, drawn for what the product does instead of generic
// "AI" sparkles and emoji. 16px grid, 1.5px strokes, currentColor, so they
// sit in text like the rest of the type.

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The flip: two half-turns, the founder checking the investor back. */
export function FlipGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 6.5a5 5 0 0 1 9.2-2.2" />
      <path d="M12.6 1.8v2.7H9.9" />
      <path d="M13 9.5a5 5 0 0 1-9.2 2.2" />
      <path d="M3.4 14.2v-2.7h2.7" />
    </Svg>
  );
}

/** Scout: a lens over three linked nodes, for searching the graph. */
export function ScoutGlyph(p: P) {
  return (
    <Svg {...p}>
      <circle cx="6.8" cy="6.8" r="4.6" />
      <path d="M10.3 10.3 14 14" />
      <circle cx="5.2" cy="5.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8.6" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="8.8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M5.2 5.6 8.6 6.2 6.6 8.8Z" strokeWidth={0.9} />
    </Svg>
  );
}

/** Watching: an investor who already backs your competitor. */
export function WatchGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Linked rings: a co-investor path. */
export function LinkGlyph(p: P) {
  return (
    <Svg {...p}>
      <circle cx="5.8" cy="8" r="3.4" />
      <circle cx="10.2" cy="8" r="3.4" />
    </Svg>
  );
}

/** Twin squares: a lookalike company in the portfolio. */
export function TwinGlyph(p: P) {
  return (
    <Svg {...p}>
      <rect x="2" y="2.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="6.5" y="6" width="7.5" height="7.5" rx="1.6" />
    </Svg>
  );
}

/** Seal: checked and clean. */
export function SealGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 1.6 13.2 3.5v4c0 3.2-2.2 5.6-5.2 6.9C5 13.1 2.8 10.7 2.8 7.5v-4Z" />
      <path d="m5.6 7.9 1.7 1.7 3.2-3.4" />
    </Svg>
  );
}

/** Ask: a speech bubble holding a node, for questions put to the graph. */
export function AskGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M2.5 4.2c0-1 .8-1.7 1.7-1.7h7.6c1 0 1.7.8 1.7 1.7v5.1c0 1-.8 1.7-1.7 1.7H7.2L4.4 13.4V11h-.2c-1 0-1.7-.8-1.7-1.7Z" />
      <circle cx="6" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M6.9 6.8h2.2" strokeWidth={1} />
    </Svg>
  );
}

/** Added: a fund just put on the list, not checked yet. */
export function AddedGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M8 1.8 14.2 8 8 14.2 1.8 8Z" />
      <path d="M8 5.6v4.8M5.6 8h4.8" />
    </Svg>
  );
}

/** How much to share, as three bars: 1 teaser, 2 deck without names, 3 data room. */
export function DisclosureMeter({ level, className = "" }: { level: 1 | 2 | 3; className?: string }) {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden className={className}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 8} y={8 - i * 4} width="5" height={6 + i * 4} rx="1.2" fill="currentColor" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}

/** A small live indicator: a dot with a soft pulse. */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-signal" />
    </span>
  );
}

/** Listen: a speaker cone with sound bars, for the spoken briefings. */
export function ListenGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M2 6.2h2.4L8 3.2v9.6L4.4 9.8H2Z" />
      <path d="M10.6 6.1v3.8" />
      <path d="M13 4.4v7.2" />
    </Svg>
  );
}

/** Voice in: a mic capsule on a stand. */
export function MicGlyph(p: P) {
  return (
    <Svg {...p}>
      <rect x="5.6" y="1.8" width="4.8" height="8" rx="2.4" />
      <path d="M3.2 7.8a4.8 4.8 0 0 0 9.6 0" />
      <path d="M8 12.6v1.8" />
    </Svg>
  );
}

/** The phone line: a handset with a live signal arc. */
export function PhoneGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.6 1.9h2l1.1 2.8-1.4 1a7.4 7.4 0 0 0 3.6 3.6l1-1.4 2.8 1.1v2a1.5 1.5 0 0 1-1.6 1.5A10.6 10.6 0 0 1 2.1 3.5a1.5 1.5 0 0 1 1.5-1.6Z" />
      <path d="M9.6 1.8a4.8 4.8 0 0 1 4.6 4.6" />
      <path d="M9.4 4.3a2.4 2.4 0 0 1 2.3 2.3" />
    </Svg>
  );
}

/** A message sent: a folded paper plane, for chat (Telegram). */
export function SendGlyph(p: P) {
  return (
    <Svg {...p}>
      <path d="M14.4 1.6 1.6 6.8l5.1 2.1 2.1 5.1Z" />
      <path d="M14.4 1.6 6.7 8.9" />
    </Svg>
  );
}

/**
 * FlipDD's call mark: the handset in a red disc with two rings going out, as
 * if the line is ringing. The rings stop for reduced motion.
 */
export function CallMark({ size = 104, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="call-ring absolute inset-0 rounded-full border-2 border-signal/50" />
      <span className="call-ring absolute inset-0 rounded-full border-2 border-signal/50" style={{ animationDelay: "1.1s" }} />
      <span className="absolute inset-[14%] rounded-full bg-signal shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]" />
      <span className="absolute inset-[14%] rounded-full ring-1 ring-inset ring-white/25" />
      <PhoneGlyph size={Math.round(size * 0.36)} className="call-shake relative text-white" strokeWidth={1.6} />
    </span>
  );
}
