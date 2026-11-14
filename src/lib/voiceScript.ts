// What FlipDD says out loud: a 20-second briefing per investor, a run-through
// of the day in meeting order, and Markdown answers turned into plain speech.
// Used by the Listen buttons, the Telegram voice replies and the phone line.
// Type-only imports, so it can be unit-tested on its own (tests/voice.test.ts).

import type { InvestorResult, Level, RoundRisk } from "./types";

// The same words as the app's labels (LEVEL_LABEL): describe the tie, don't alarm.
const SPOKEN_LEVEL: Record<Level, string> = {
  direct_high: "Backs your competitor",
  direct_moderate: "Smaller stake in a competitor",
  indirect: "One step away",
  possible: "Lookalike in their portfolio",
  thin: "Too little data",
  unresolved: "Not found in Cala",
  clear: "No tie found",
};

const MONTHS: Record<string, string> = {
  Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June",
  Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December",
};

/** Text tidied for a speech engine: arrows, scores, abbreviations, symbols. */
export function forSpeech(text: string): string {
  return text
    .replace(/→|->|⟶/g, " to ")
    .replace(/(\d+)\s*\/\s*100\b/g, "$1 out of 100")
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?=\s+\d{4})/g, (m) => MONTHS[m] || m)
    .replace(/[$]\s?(\d+(?:\.\d+)?)\s?B\b/g, "$1 billion dollars")
    .replace(/[$]\s?(\d+(?:\.\d+)?)\s?M\b/g, "$1 million dollars")
    .replace(/€\s?(\d+(?:\.\d+)?)\s?M\b/g, "$1 million euros")
    .replace(/\bvs\.?\b/gi, "versus")
    .replace(/&/g, " and ")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown (Cala's answers) to plain spoken text: no tables, links or symbols. */
export function speakable(md: string): string {
  return forSpeech(
    md
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
      .map((l) =>
        l
          .replace(/^#{1,4}\s+/, "")
          .replace(/^\s*[-*•]\s+/, "")
          .replace(/^\s*\d+\.\s+/, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/[*_`]/g, "")
          .replace(/^\s*\|(.*)\|\s*$/, (_m, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", ")),
      )
      .filter((l) => l.trim())
      .map((l) => (/[.!?:]$/.test(l.trim()) ? l.trim() : `${l.trim()}.`))
      .join(" "),
  );
}

/** About 20 seconds: who, the verdict and why, what to share, what to ask. */
export function spokenBriefing(r: InvestorResult, position?: { index: number; total: number }): string {
  const parts: string[] = [];
  parts.push(position ? `Meeting ${position.index} of ${position.total}: ${r.name}.` : `${r.name}.`);
  parts.push(`${SPOKEN_LEVEL[r.level]}. ${r.headline}.`);
  const person = r.people?.[0];
  if (person && !r.headline.includes(person.person)) parts.push(`${person.text}.`);
  const share = r.share.level === "Teaser only" ? "Share a teaser only" : r.share.level === "Full data room" ? "You can share the full data room" : "Share the deck, without customer names";
  parts.push(`${share}.`);
  if (r.level !== "clear" && r.level !== "unresolved" && r.ask.question) parts.push(`Ask them: ${r.ask.question}`);
  return forSpeech(parts.join(" ").replace(/\.\./g, "."));
}

/** The whole day: the round in one line, then every meeting in the suggested order. */
export function spokenDay(rows: InvestorResult[], risk: RoundRisk): string {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const ordered = risk.order.flatMap((o) => o.investors).map((n) => byName.get(n)).filter((r): r is InvestorResult => Boolean(r));
  const rest = rows.filter((r) => !ordered.includes(r));
  const all = [...ordered, ...rest];
  const intro = `Your round. ${risk.headline} Round exposure ${risk.score} out of 100.`;
  const hub = risk.hubs[0] ? ` Watch ${risk.hubs[0].via}: it ties ${risk.hubs[0].investors.join(" and ")} to ${risk.hubs[0].competitors.join(", ")}.` : "";
  const meetings = all.map((r, i) => spokenBriefing(r, { index: i + 1, total: all.length })).join(" ");
  return forSpeech(`${intro}${hub} Here are your meetings, safest first. ${meetings} That's everything. Good luck at Slush.`);
}

/** Splits text into sentence-sized pieces; long utterances get cut off by some speech engines. */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if ((cur + " " + s).trim().length > max && cur) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

export interface SpokenCheck {
  investors: string[];
  competitors: string[];
  description: string;
}

const LEAD_IN =
  /^(?:(?:ok(?:ay)?|hey|hi|so|um+|uh+|right|please|flip ?dd)[,.\s]+)*(?:(?:can you|could you|please|i want to|i'd like to|let's|go ahead and)\s+)*(?:check|run(?: a)? check(?: on)?|look up|i'?m meeting(?: with)?|i am meeting(?: with)?|i have meetings with|my meetings are(?: with)?|meetings? with|i'?m pitching(?: to)?|i am pitching(?: to)?)?\s*:?\s*/i;

/** Splits a spoken list: commas, "and", "plus", "&". */
function spokenList(s: string): string[] {
  return s
    .replace(/[.!?]+$/, "")
    .split(/\s*(?:,|;|\band also\b|\band\b|\bplus\b|&)\s*/i)
    .map((x) => x.replace(/^(?:the|also|with|and)\s+/i, "").replace(/[.!?,]+$/, "").trim())
    .filter((x) => x.length > 1 && !/^(?:them|it|that|please|thanks)$/i.test(x));
}

/**
 * A check said out loud, e.g. "I'm meeting Creandum, Northzone and Index
 * Ventures. My competitor is Lovable. We build an AI app builder." or
 * "Check Creandum and Northzone against Lovable". Null when it doesn't read
 * as a check (then it's treated as a question).
 */
export function parseSpokenCheck(raw: string): SpokenCheck | null {
  let text = raw.replace(/\s+/g, " ").trim();
  let description = "";
  const desc = text.match(/(?:^|[.!?]\s*|,\s*)(?:and\s+)?(?:we|i)(?:'re| are| am|'m)?\s+(?:build|building|make|making|do|doing)\s+([^.!?]+)[.!?]?/i);
  if (desc) {
    description = desc[1].trim();
    text = (text.slice(0, desc.index) + text.slice((desc.index || 0) + desc[0].length)).trim();
  }
  text = text.replace(LEAD_IN, "");
  let m = text.match(/^(.+?)\s+(?:vs\.?|versus|against|compared (?:to|with))\s+(?:my competitors?|competitors?)?\s*:?\s*(.+)$/i);
  if (!m) m = text.match(/^(.+?)[.,;:]?\s+(?:and\s+)?(?:my|our|the)\s+(?:main\s+|biggest\s+)?(?:competitors?|rivals?)\s+(?:is|are|would be|include)\s+(.+)$/i);
  if (!m) m = text.match(/^(.+?)[.,;:]\s*(?:competitors?|rivals?)\s*:?\s*(.+)$/i);
  if (!m) return null;
  const investors = spokenList(m[1]).slice(0, 12);
  const competitors = spokenList(m[2]).slice(0, 6);
  if (!investors.length || !competitors.length) return null;
  // Transcripts capitalise names. Anything else ("tomorrow I see Creandum") is
  // a sentence, not a list: leave it to Gemini.
  const nameLike = (x: string) => (/^[A-Z0-9]/.test(x) || /\d/.test(x)) && x.split(" ").length <= 5 && !/^(I|I'm|We|We're|So|Then|Oh|And)\b/.test(x);
  if (![...investors, ...competitors].every(nameLike)) return null;
  return { investors, competitors, description: description.slice(0, 400) };
}

/** The short version for a voice reply or a phone call: the round, then one line per meeting. */
export function spokenRoundup(rows: InvestorResult[], risk: RoundRisk): string {
  const order = risk.order.flatMap((o) => o.investors);
  const sorted = [...rows].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const lines = sorted.map((r) => {
    const share = r.share.level === "Teaser only" ? "teaser only" : r.share.level === "Full data room" ? "full data room is fine" : "deck without customer names";
    return `${r.name}: ${SPOKEN_LEVEL[r.level].toLowerCase()}. ${r.headline}. ${share[0].toUpperCase()}${share.slice(1)}.`;
  });
  const hub = risk.hubs[0] ? ` Watch ${risk.hubs[0].via}: it links ${risk.hubs[0].investors.join(" and ")} to ${risk.hubs[0].competitors.join(", ")}.` : "";
  return forSpeech(`${risk.headline} Round exposure ${risk.score} out of 100.${hub} In meeting order. ${lines.join(" ")}`.replace(/\.\./g, "."));
}

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const CLOSING = new Set(
  "no nope nah that's thats it all nothing else goodbye bye thanks thank you i'm im i am done good ok okay that will be cheers great perfect fine for now".split(" "),
);

/** "No, that's all. Thanks." and the like: the caller is finished. */
export function isGoodbye(text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 10 && words.every((w) => CLOSING.has(w));
}
