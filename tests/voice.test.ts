import { test } from "node:test";
import assert from "node:assert/strict";
import { forSpeech, speakable, speechChunks, spokenBriefing } from "../src/lib/voiceScript.ts";
import type { InvestorResult } from "../src/lib/types.ts";

const creandum = {
  input: "Creandum",
  resolved: true,
  name: "Creandum",
  entities: [],
  candidates: 1,
  activity: { roundsRecorded: 12, portfolioRecorded: 47, rounds12m: 2, leads12m: 2, leadsAll: 4, truncated: false },
  level: "direct_high",
  headline: "Backed Lovable, Feb 2025",
  direct: [],
  leaks: [],
  possible: [],
  share: { level: "Teaser only", why: "" },
  ask: { question: "Who at the fund works with Lovable, and how do you keep what we share away from them?" },
  done: { direct: true, leaks: true, scan: true },
} as unknown as InvestorResult;

test("a briefing says who, the verdict, what to share and what to ask", () => {
  const s = spokenBriefing(creandum, { index: 1, total: 8 });
  assert.match(s, /^Meeting 1 of 8: Creandum\./);
  assert.match(s, /Direct conflict\. Backed Lovable, February 2025\./);
  assert.match(s, /Share a teaser only\./);
  assert.match(s, /Ask them: Who at the fund works with Lovable/);
});

test("clear funds get no question", () => {
  const s = spokenBriefing({ ...creandum, level: "clear", headline: "No link to your competitors", share: { level: "Full data room", why: "" } });
  assert.match(s, /You can share the full data room\./);
  assert.doesNotMatch(s, /Ask them/);
});

test("speech text expands symbols and scores", () => {
  assert.equal(forSpeech("Northzone → Accel → Lovable (61/100)"), "Northzone to Accel to Lovable (61 out of 100)");
  assert.equal(forSpeech("Raised $382.5M at a $13.3B valuation"), "Raised 382.5 million dollars at a 13.3 billion dollars valuation");
});

test("Markdown answers become plain sentences", () => {
  const s = speakable("## Board\n* **Matt Murphy** (Menlo) [source](https://x.y)\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.equal(s, "Board. Matt Murphy (Menlo) source. a, b. 1, 2.");
});

test("long text is split at sentence ends", () => {
  const chunks = speechChunks("One. Two two. Three three three.", 12);
  assert.deepEqual(chunks, ["One.", "Two two.", "Three three three."]);
});

import { parseSpokenCheck } from "../src/lib/voiceScript.ts";

test("spoken checks: meeting list, competitor and what we build", () => {
  assert.deepEqual(parseSpokenCheck("I'm meeting Creandum, Northzone and Index Ventures. My competitor is Lovable. We build an AI app builder for product teams."), {
    investors: ["Creandum", "Northzone", "Index Ventures"],
    competitors: ["Lovable"],
    description: "an AI app builder for product teams",
  });
  assert.deepEqual(parseSpokenCheck("Okay, check Creandum and Northzone against Lovable and Bolt."), {
    investors: ["Creandum", "Northzone"],
    competitors: ["Lovable", "Bolt"],
    description: "",
  });
  assert.deepEqual(parseSpokenCheck("Benchmark, General Catalyst versus Legora"), {
    investors: ["Benchmark", "General Catalyst"],
    competitors: ["Legora"],
    description: "",
  });
  assert.equal(parseSpokenCheck("Who sits on Lovable's board?"), null);
  assert.equal(parseSpokenCheck("Which funds led seed rounds in legal AI last year?"), null);
});

test("casual speech is left to Gemini, not split by rules", () => {
  assert.equal(parseSpokenCheck("so tomorrow I see Creandum and then Northzone, oh and Index too, and we're up against Lovable mostly"), null);
});

import { andList, isGoodbye } from "../src/lib/voiceScript.ts";

test("the phone line knows when the caller is done", () => {
  for (const t of ["No, that's all. Thanks.", "Goodbye", "nope I'm good thank you", "That will be all, cheers!"]) assert.ok(isGoodbye(t), t);
  for (const t of ["No, check Creandum against Lovable", "Who led Lovable's Series B?", ""]) assert.ok(!isGoodbye(t), t);
  assert.equal(andList(["Creandum", "Northzone", "Index"]), "Creandum, Northzone and Index");
});
