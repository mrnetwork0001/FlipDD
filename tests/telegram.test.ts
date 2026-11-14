import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, mdToTelegram, parseCheck } from "../src/lib/telegramText.ts";

test("parseCheck reads 'investors vs competitors | description'", () => {
  assert.deepEqual(parseCheck("Creandum, Northzone, Index Ventures vs Lovable"), {
    investors: ["Creandum", "Northzone", "Index Ventures"],
    competitors: ["Lovable"],
    description: "",
  });
  assert.deepEqual(parseCheck("Creandum vs. Lovable, Bolt.new | AI app builder"), {
    investors: ["Creandum"],
    competitors: ["Lovable", "Bolt.new"],
    description: "AI app builder",
  });
  assert.equal(parseCheck("Who sits on Lovable's board?"), null, "a question is not a check");
  assert.equal(parseCheck("vs Lovable"), null);
});

test("mdToTelegram keeps Telegram's HTML subset and escapes the rest", () => {
  const html = mdToTelegram("## Board\n* **Matt Murphy** (Menlo) <partner>\n[Source](https://lovable.dev/x)\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.match(html, /^<b>Board<\/b>/);
  assert.match(html, /• <b>Matt Murphy<\/b> \(Menlo\) &lt;partner&gt;/);
  assert.match(html, /<a href="https:\/\/lovable\.dev\/x">Source<\/a>/);
  assert.match(html, /1 · 2/);
  assert.doesNotMatch(html, /---/);
});

test("esc escapes the three characters Telegram HTML needs", () => {
  assert.equal(esc("a < b & c > d"), "a &lt; b &amp; c &gt; d");
});
