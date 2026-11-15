import { test } from "node:test";
import assert from "node:assert/strict";
import { CALA_KEY_RE, chatSlot, keySecret, maskKey, openKey, sealKey } from "../src/lib/tgKey.ts";

const KEY = "clsk_" + "a1B2c3D4e5F6g7H8i9J0kLmN";

test("a sealed Cala key opens with the same secret only", () => {
  const secret = keySecret({ TELEGRAM_KEY_SECRET: "one" })!;
  const other = keySecret({ TELEGRAM_KEY_SECRET: "two" })!;
  const box = sealKey(KEY, secret);
  assert.ok(!box.includes(KEY), "the box never holds the key in clear");
  assert.equal(openKey(box, secret), KEY);
  assert.equal(openKey(box, other), null);
  assert.equal(openKey(box.slice(0, -2) + "xx", secret), null);
  assert.notEqual(sealKey(KEY, secret), box, "a fresh IV every time");
});

test("the secret falls back to the bot's own secrets, and is absent without them", () => {
  assert.ok(keySecret({ TELEGRAM_WEBHOOK_SECRET: "w", TELEGRAM_BOT_TOKEN: "t" }));
  assert.equal(keySecret({}), null);
});

test("chat slots are hashes, and keys are masked", () => {
  assert.match(chatSlot(123456789), /^[0-9a-f]{32}$/);
  assert.notEqual(chatSlot(1), chatSlot(2));
  assert.ok(!chatSlot(123456789).includes("123456789"));
  assert.equal(maskKey(KEY), "clsk_a1…kLmN");
  assert.ok(CALA_KEY_RE.test(KEY));
  assert.ok(!CALA_KEY_RE.test("sk_live_123"));
});
