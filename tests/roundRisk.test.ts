import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRoundRisk, meetingWeight, roundRiskText } from "../src/lib/roundRisk.ts";
import type { InvestorResult, LeakPath, Level, SlushReport } from "../src/lib/types.ts";

function inv(name: string, level: Level, extra: Partial<InvestorResult> = {}): InvestorResult {
  return {
    input: name,
    resolved: level !== "unresolved",
    name,
    entities: [],
    candidates: 1,
    activity: { roundsRecorded: 10, portfolioRecorded: 10, rounds12m: 4, leads12m: 1, leadsAll: 3, truncated: false },
    level,
    headline: "",
    direct: [],
    leaks: [],
    possible: [],
    share: { level: "Full data room", why: "" },
    ask: { question: "" },
    done: { direct: true, leaks: true, scan: true },
    ...extra,
  };
}

function leak(competitor: string, via: string, strength: number): LeakPath {
  return {
    competitor,
    via: { id: via.toLowerCase(), name: via },
    viaLed: true,
    sharedRoundCount: 2,
    sharedRounds: [],
    strength,
    strengthLabel: strength >= 65 ? "strong" : strength >= 40 ? "moderate" : "weak",
    reasons: [],
    sources: [],
  };
}

const direct = (competitor: string) => ({
  competitor,
  competitorStatus: "operating" as const,
  isLead: true,
  level: "direct_high" as const,
  reasons: [],
  sources: [],
});

// The Lovable example's shape: one direct stake, two funds tied through Accel,
// one lookalike, two clear funds (one of them leading rounds), one unknown.
const rows: InvestorResult[] = [
  inv("Creandum", "direct_high", { direct: [direct("Lovable")] }),
  inv("Northzone", "indirect", { leaks: [leak("Lovable", "Accel", 61)] }),
  inv("Index Ventures", "indirect", { leaks: [leak("Lovable", "Accel", 60)] }),
  inv("Maki.vc", "possible"),
  inv("EQT Ventures", "clear", { activity: { roundsRecorded: 17, portfolioRecorded: 11, rounds12m: 7, leads12m: 3, leadsAll: 9, truncated: false } }),
  inv("Atomico", "clear", { activity: { roundsRecorded: 0, portfolioRecorded: 17, rounds12m: 0, leads12m: 0, leadsAll: 0, truncated: false } }),
  inv("Tiny Fund", "thin"),
];

test("counts and headline", () => {
  const r = computeRoundRisk(rows);
  assert.deepEqual(r.counts, { direct: 1, one_step: 2, lookalike: 1, unknown: 1, clear: 2 });
  assert.equal(r.settled, 7);
  assert.equal(r.headline, "3 of your 7 meetings are within one step of Lovable. Meet the 2 clear funds first.");
});

test("a co-investor shared by two meetings is reported as a hub", () => {
  const r = computeRoundRisk(rows);
  assert.equal(r.hubs.length, 1);
  assert.equal(r.hubs[0].via, "Accel");
  assert.deepEqual(r.hubs[0].investors, ["Northzone", "Index Ventures"]);
  assert.equal(r.hubs[0].strongest, 61);
});

test("reach lists direct stakes and one-step paths per competitor, strongest first", () => {
  const [lovable] = computeRoundRisk(rows).reach;
  assert.equal(lovable.competitor, "Lovable");
  assert.deepEqual(lovable.direct, ["Creandum"]);
  assert.deepEqual(lovable.oneStep.map((x) => x.investor), ["Northzone", "Index Ventures"]);
});

test("weak co-investor paths do not count as reach or hubs", () => {
  const r = computeRoundRisk([inv("A", "clear", { leaks: [leak("Lovable", "Accel", 30)] }), inv("B", "clear", { leaks: [leak("Lovable", "Accel", 30)] })]);
  assert.equal(r.reach.length, 0);
  assert.equal(r.hubs.length, 0);
  assert.equal(r.counts.clear, 2);
});

test("lead candidates are untied funds that led rounds lately", () => {
  const r = computeRoundRisk(rows);
  assert.deepEqual(r.leadCandidates.map((c) => c.name), ["EQT Ventures", "Maki.vc"]);
});

test("meeting order: clear first (active leaders first), direct stakes last", () => {
  const r = computeRoundRisk(rows);
  assert.deepEqual(r.order.map((o) => o.title), ["Meet first", "Then, after one question", "Later, with less", "Last, teaser only"]);
  assert.deepEqual(r.order[0].investors, ["EQT Ventures", "Atomico"]);
  assert.deepEqual(r.order[2].investors, ["Index Ventures", "Northzone"], "weaker tie first");
  assert.deepEqual(r.order[3].investors, ["Creandum"]);
});

test("score is the average meeting weight", () => {
  const r = computeRoundRisk(rows);
  const expected = Math.round((100 * rows.reduce((s, x) => s + meetingWeight(x), 0)) / rows.length);
  assert.equal(r.score, expected);
  assert.equal(meetingWeight(rows[0]), 1);
  assert.equal(meetingWeight(rows[1]), 0.305);
  assert.equal(meetingWeight(rows[5]), 0);
});

test("investors still being checked are left out", () => {
  const pending = inv("Pending", "clear", { done: { direct: false, leaks: false, scan: false } });
  const r = computeRoundRisk([...rows, pending]);
  assert.equal(r.total, 8);
  assert.equal(r.settled, 7);
});

test("an all-clear round says so", () => {
  const r = computeRoundRisk([inv("A", "clear"), inv("B", "clear")]);
  assert.equal(r.score, 0);
  assert.equal(r.grade, "low");
  assert.match(r.headline, /None of your 2 meetings/);
});

test("Slush: funds backing a competing attendee are listed", () => {
  const slush = { event: { id: "x", name: "Slush 2026", attendees: 2988 }, namedAttending: [], competitors: [], judgedBy: "gemini", checkedAt: "" } as SlushReport;
  const r = computeRoundRisk(
    [inv("A", "possible", { slush: { portfolio: [{ id: "1", name: "P" }], competitors: ["Rival"] } }), inv("B", "clear", { slush: { portfolio: [{ id: "2", name: "Q" }, { id: "3", name: "R" }], competitors: [] } })],
    slush,
  );
  assert.deepEqual(r.slush, { event: "Slush 2026", backingRivals: ["A"], portfolioAttending: 3 });
});

test("text summary for the MCP tool", () => {
  const text = roundRiskText(computeRoundRisk(rows));
  assert.match(text, /Round exposure \d+\/100/);
  assert.match(text, /Accel ties Northzone and Index Ventures to Lovable/);
  assert.match(text, /1\. Meet first \(Full data room\): EQT Ventures, Atomico/);
});
