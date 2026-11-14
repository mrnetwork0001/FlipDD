// Points your Twilio number's incoming calls at FlipDD's phone line.
//   node scripts/twilio-number.mjs            → lists your numbers
//   node scripts/twilio-number.mjs +1234567890 → sets that number's voice webhook
// Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and FLIPDD_PUBLIC_URL from .env.local or the environment.

import fs from "node:fs";

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const base = process.env.FLIPDD_PUBLIC_URL?.replace(/\/$/, "");
if (!sid || !token) {
  console.error("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (Twilio console → Account info).");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const api = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;

const list = await (await fetch(`${api}/IncomingPhoneNumbers.json`, { headers: { Authorization: auth } })).json();
if (!list.incoming_phone_numbers) {
  console.error("Twilio:", list.message || list);
  process.exit(1);
}
const wanted = process.argv[2];
if (!wanted) {
  for (const n of list.incoming_phone_numbers) console.log(`${n.phone_number}  voice → ${n.voice_url || "(not set)"}`);
  console.log("\nRun again with the number to point it at FlipDD.");
  process.exit(0);
}
if (!base || !base.startsWith("https://")) {
  console.error("Set FLIPDD_PUBLIC_URL to the deployed https address first.");
  process.exit(1);
}
const number = list.incoming_phone_numbers.find((n) => n.phone_number === wanted);
if (!number) {
  console.error(`${wanted} is not on this account.`);
  process.exit(1);
}
const res = await fetch(`${api}/IncomingPhoneNumbers/${number.sid}.json`, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ VoiceUrl: `${base}/api/voice/twilio`, VoiceMethod: "POST" }),
});
const out = await res.json();
console.log(res.ok ? `${out.phone_number} now answers with ${out.voice_url}` : `Twilio: ${out.message}`);
