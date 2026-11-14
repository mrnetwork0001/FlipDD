import { test } from "node:test";
import assert from "node:assert/strict";
import { coreKey, exactKey, sameCompany } from "../src/lib/names.ts";

test("legal suffixes are ignored", () => {
  assert.equal(coreKey("Finadeck Oy"), "finadeck");
  assert.equal(coreKey("MULTICOIN CAPITAL MANAGEMENT, LLC"), "multicoincapitalmanagement");
  assert.equal(coreKey("Lifesum AB"), "lifesum");
  assert.equal(exactKey("Maki.vc"), "makivc");
});

test("accents and punctuation do not split a name", () => {
  assert.equal(coreKey("GREÏ"), "grei");
  assert.equal(sameCompany("Bolt.new", "Bolt new"), "exact");
});

test("prefix matches need enough of a name", () => {
  assert.equal(sameCompany("Lovable", "Lovable Labs Inc"), "prefix");
  assert.equal(sameCompany("AB", "AB Volvo"), null, "too short to be a prefix match");
  assert.equal(sameCompany("Creandum", "Northzone"), null);
});
