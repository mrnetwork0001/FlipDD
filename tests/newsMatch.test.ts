import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNDING, FUNDING_STRONG, matcher } from "../src/lib/newsMatch.ts";

test("fund names match in full, and by their core name only with capitals", () => {
  const cases: [string, string, boolean][] = [
    ["Balderton Capital", "Lovable raises $330M Series D led by Balderton", true],
    ["Index Ventures", "An index of AI startups shows growth", false],
    ["Index Ventures", "Index Ventures joins Lovable round", true],
    ["Maki.vc", "Maki co-leads seed in Helsinki startup", true],
    ["EQT Ventures", "EQT buys stake in software group", false],
    ["Atomico", "atomico-backed startup raises", true], // the full name matches in any case
    ["Balderton Capital", "the balderton effect", false], // a shortened name must keep its capitals
    ["Balderton Capital", "Balderton-backed startup raises", true],
    ["Lovable", "Swedish AI startup Lovable hits $10B valuation", true],
    ["Northzone", "Northzones of the city", false],
  ];
  for (const [name, text, want] of cases) assert.equal(matcher(name)(text), want, `${name} | ${text}`);
});

test("strong funding words: rounds and fund raises, not general business news", () => {
  const yes = [
    "Lovable raises $330M Series D",
    "Spotify, Lovable Investor Creandum Raises $750 Million Fund",
    "Lovable and Black Forest Labs backer Creandum closes $750M fund",
    "Seed round led by Northzone",
    "Startup valued at $2B",
  ];
  const no = [
    "AI boom: 5 youngest billionaires who built their fortunes on Artificial Intelligence",
    "Replit switches from Anthropic to OpenAI, highlighting AI market flexibility",
    "From DeepL to ElevenLabs: Northzone taps Europe's tech talent",
    "The question this raises for founders",
  ];
  for (const t of yes) assert.ok(FUNDING_STRONG.test(t), t);
  for (const t of no) assert.ok(!FUNDING_STRONG.test(t), t);
});

test("the weak funding test is broader than the strong one", () => {
  assert.ok(FUNDING.test("The fund invests in AI"));
  assert.ok(!FUNDING_STRONG.test("The fund invests in AI"));
});
