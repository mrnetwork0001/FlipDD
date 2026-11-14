// TwiML for FlipDD's phone line, and Twilio's request signature check.
// Pure (node:crypto only), so it is unit-tested in tests/phone.test.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

export const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Amazon Polly neural voice through Twilio: natural, and no extra account. */
export const PHONE_VOICE = () => process.env.TWILIO_VOICE || "Polly.Amy-Neural";

export function say(chunks: string[]): string {
  return chunks.map((c) => `<Say voice="${xmlEscape(PHONE_VOICE())}">${xmlEscape(c)}</Say>`).join("");
}

export function gather(action: string, prompt: string[], hints: string[] = []): string {
  const h = hints.length ? ` hints="${xmlEscape(hints.join(", ").slice(0, 900))}"` : "";
  return (
    `<Gather input="speech" action="${xmlEscape(action)}" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US" actionOnEmptyResult="true"${h}>` +
    say(prompt) +
    `</Gather>`
  );
}

export function response(...parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`;
}

export const pause = (seconds: number) => `<Pause length="${Math.max(1, Math.min(30, Math.round(seconds)))}"/>`;
export const redirect = (url: string) => `<Redirect method="POST">${xmlEscape(url)}</Redirect>`;
export const hangup = () => `<Hangup/>`;

/**
 * Twilio signs each webhook: base64 HMAC-SHA1 of the full URL followed by the
 * POST parameters sorted by name, each as name + value, keyed with the auth token.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, header: string | null): boolean {
  if (!header) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
