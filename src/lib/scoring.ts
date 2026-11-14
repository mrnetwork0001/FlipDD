// Scoring rules, kept free of imports so they can be unit-tested on their own
// (see tests/). `now` is a parameter so tests do not depend on today's date.

const DAY = 86_400_000;

export const monthsSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(iso)) / (30.44 * DAY)));

export function fmtAgo(months: number): string {
  if (months < 1) return "this month";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} years ago`;
}

/** Series C or later, growth, pre-IPO, or $100M+: stakes here are usually financial, not strategic. */
export function isLateStage(label?: string, amount?: number): boolean {
  if (label && /(series\s*[c-z]\b|growth|late[\s-]?stage|pre[\s-]?ipo|\bipo\b|secondary|mezzanine|crossover)/i.test(label)) {
    return true;
  }
  return typeof amount === "number" && amount >= 100e6;
}

export type StrengthLabel = "strong" | "moderate" | "weak";

/** Points for the number of shared rounds: a habit of co-investing says more than one deal. */
export const FREQUENCY_POINTS = [0, 10, 22, 30, 36, 40] as const;

/**
 * How much a co-investor path matters, 0 to 100:
 *   frequency  up to 40  (shared rounds: 1 → 10, 2 → 22, 3 → 30, 4 → 36, 5+ → 40)
 *   recency    up to 25  (last shared round ≤12 months 25, ≤24 15, ≤48 6, older 0, undated 3)
 *   lead       15 or 5   (the co-investor led the competitor's round, or only joined it)
 *   via age    up to 10  (that round ≤18 months 10, ≤36 5, older 0, undated 2)
 * Strong at 65+, moderate at 40+, weak below.
 */
export function leakStrength(
  shared: number,
  lastShared: string | undefined,
  viaLed: boolean,
  viaRoundDate: string | undefined,
  now = Date.now(),
): { score: number; label: StrengthLabel; parts: string[] } {
  const parts: string[] = [];
  const freq = FREQUENCY_POINTS[Math.max(0, Math.min(shared, 5))];
  parts.push(`${shared} shared round${shared === 1 ? "" : "s"}`);
  let rec = 3;
  if (lastShared) {
    const m = monthsSince(lastShared, now);
    rec = m <= 12 ? 25 : m <= 24 ? 15 : m <= 48 ? 6 : 0;
    parts.push(`last one ${fmtAgo(m)}`);
  } else {
    parts.push("shared rounds undated");
  }
  const lead = viaLed ? 15 : 5;
  let viaRec = 2;
  if (viaRoundDate) {
    const m = monthsSince(viaRoundDate, now);
    viaRec = m <= 18 ? 10 : m <= 36 ? 5 : 0;
  }
  parts.push(viaLed ? "the co-investor led the competitor's round" : "the co-investor did not lead");
  const score = Math.min(100, freq + rec + lead + viaRec);
  return { score, label: strengthLabel(score), parts };
}

export const strengthLabel = (score: number): StrengthLabel =>
  score >= 65 ? "strong" : score >= 40 ? "moderate" : "weak";
