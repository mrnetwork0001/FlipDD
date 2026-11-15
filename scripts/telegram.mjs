// Runs the FlipDD Telegram bot from your laptop, no public URL needed:
// polls Telegram for messages and hands each one to the local FlipDD server.
//   1. Create a bot with @BotFather and put TELEGRAM_BOT_TOKEN in .env.local
//   2. Start FlipDD (npm run dev), then: npm run telegram
// When FlipDD is deployed, use the webhook instead (see scripts/telegram-webhook.mjs).
import fs from "node:fs";

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs.readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const token = env("TELEGRAM_BOT_TOKEN");
const secret = env("TELEGRAM_WEBHOOK_SECRET");
const app = (process.argv[2] || env("FLIPDD_LOCAL_URL") || "http://localhost:3001").replace(/\/$/, "");
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env.local (create a bot with @BotFather on Telegram).");
  process.exit(1);
}
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());

const me = await api("getMe");
if (!me.ok) {
  console.error(`Telegram rejected the token: ${me.description}`);
  process.exit(1);
}
// Polling and a webhook cannot run at the same time.
await api("deleteWebhook", { drop_pending_updates: false });
await api("setMyCommands", {
  commands: [
    { command: "check", description: "Check investors against competitors: Creandum, Northzone vs Lovable" },
    { command: "ask", description: "Ask Cala's graph about any fund or company" },
    { command: "key", description: "Use your own Cala key in this chat: /key clsk_…" },
    { command: "forgetkey", description: "Remove your Cala key" },
    { command: "help", description: "How to use FlipDD" },
  ],
});
console.log(`FlipDD bot @${me.result.username} is listening. Messages go to ${app}/api/telegram. Ctrl+C to stop.`);

let offset = 0;
for (;;) {
  try {
    const res = await api("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
    for (const update of res.result || []) {
      offset = update.update_id + 1;
      const text = update.message?.text || (update.message?.voice || update.message?.audio ? "[voice note]" : "");
      console.log(`  ${update.message?.chat?.id}: ${text.slice(0, 80)}`);
      await fetch(`${app}/api/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
        body: JSON.stringify(update),
      }).catch((err) => console.error(`  could not reach ${app}: ${err.message}`));
    }
  } catch (err) {
    console.error(`  polling failed: ${err.message}; retrying in 3 s`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
