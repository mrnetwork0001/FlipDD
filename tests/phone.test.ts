import { test } from "node:test";
import assert from "node:assert/strict";
import { gather, response, say, twilioSignature, validTwilioSignature, xmlEscape } from "../src/lib/twiml.ts";

test("TwiML escapes what callers and Cala say", () => {
  assert.equal(xmlEscape(`Bolt & "Lovable" <x>`), "Bolt &amp; &quot;Lovable&quot; &lt;x&gt;");
  const xml = response(gather("/api/voice/twilio/heard", ["Who are you meeting?"], ["Creandum", "Northzone"]), say(["Bye & thanks."]));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><Response><Gather input="speech" action="\/api\/voice\/twilio\/heard"/);
  assert.match(xml, /hints="Creandum, Northzone"/);
  assert.match(xml, /<Say voice="[^"]+">Bye &amp; thanks\.<\/Say><\/Response>$/);
});

test("Twilio signature: matches the official library", () => {
  // Expected value computed with the official twilio npm package (getExpectedTwilioSignature).
  const url = "https://example.com/myapp.php?foo=1&bar=2";
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
  assert.equal(twilioSignature("12345", url, params), "vNe7KK2kJwCsxc9K3OLkkKB3qqI=");
  assert.ok(validTwilioSignature("12345", url, params, "vNe7KK2kJwCsxc9K3OLkkKB3qqI="));
  assert.ok(!validTwilioSignature("12345", url, { ...params, Digits: "9" }, "vNe7KK2kJwCsxc9K3OLkkKB3qqI="));
  assert.ok(!validTwilioSignature("12345", url, params, null));
});
