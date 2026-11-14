import { test } from "node:test";
import assert from "node:assert/strict";
import { isLateStage, leakStrength, monthsSince, strengthLabel } from "../src/lib/scoring.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const monthsAgo = (m: number) => new Date(NOW - m * 30.44 * 86_400_000).toISOString().slice(0, 10);

test("monthsSince counts whole months back from now", () => {
  assert.equal(monthsSince(monthsAgo(0), NOW), 0);
  assert.equal(monthsSince(monthsAgo(13), NOW), 13);
  assert.equal(monthsSince("2030-01-01", NOW), 0, "future dates clamp to 0");
});

test("frequency dominates: one shared round with a big fund is not strong", () => {
  // One recent shared round, co-investor led a recent round: 10 + 25 + 15 + 10 = 60.
  const one = leakStrength(1, monthsAgo(1), true, monthsAgo(11), NOW);
  assert.equal(one.score, 60);
  assert.equal(one.label, "moderate");
});

test("a habit of co-investing, recently, through a lead is strong", () => {
  const s = leakStrength(5, monthsAgo(3), true, monthsAgo(6), NOW);
  assert.equal(s.score, 40 + 25 + 15 + 10);
  assert.equal(s.label, "strong");
});

test("old, minor ties are weak", () => {
  const s = leakStrength(1, monthsAgo(60), false, monthsAgo(50), NOW);
  assert.equal(s.score, 10 + 0 + 5 + 0);
  assert.equal(s.label, "weak");
});

test("undated rounds get small fixed credit, not zero and not full", () => {
  const s = leakStrength(2, undefined, false, undefined, NOW);
  assert.equal(s.score, 22 + 3 + 5 + 2);
  assert.ok(s.parts.includes("shared rounds undated"));
});

test("score is capped at 100 and shared rounds above 5 add nothing", () => {
  assert.equal(leakStrength(50, monthsAgo(0), true, monthsAgo(0), NOW).score, 90);
});

test("strength thresholds", () => {
  assert.equal(strengthLabel(65), "strong");
  assert.equal(strengthLabel(64), "moderate");
  assert.equal(strengthLabel(40), "moderate");
  assert.equal(strengthLabel(39), "weak");
});

test("late-stage rounds by label or size", () => {
  for (const label of ["Series C", "Series D", "Growth round", "Pre-IPO", "Secondary", "late stage"]) {
    assert.ok(isLateStage(label), label);
  }
  for (const label of ["Seed", "Series A", "Series B", "Pre-Seed"]) {
    assert.ok(!isLateStage(label), label);
  }
  assert.ok(isLateStage("Series B", 150e6), "a $150M Series B is late-stage money");
  assert.ok(!isLateStage(undefined, 20e6));
});
