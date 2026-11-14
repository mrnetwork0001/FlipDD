// Points the Telegram bot at a deployed FlipDD (webhook mode).
//   node scripts/telegram-webhook.mjs https://your-app.up.railway.app
import fs from "node:fs";
const env = (n) =>
  process.env[n] ||
  (() => {
    try {
      const l = fs.readFileSync(".env.local", "utf8").split("\n").find((x) => x.startsWith(`${n}=`));
      return l ? l.slice(n.length + 1).trim() : undefined;
    } catch {
      return undefined;
    }
  })();
const token = env("TELEGRAM_BOT_TOKEN");
const base = (process.argv[2] || env("FLIPDD_PUBLIC_URL") || "").replace(/\/$/, "");
if (!token || !base) {
  console.error("Usage: node scripts/telegram-webhook.mjs https://your-app (and TELEGRAM_BOT_TOKEN in .env.local)");
  process.exit(1);
}
const secret = env("TELEGRAM_WEBHOOK_SECRET");
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${base}/api/telegram`, allowed_updates: ["message"], ...(secret ? { secret_token: secret } : {}) }),
}).then((r) => r.json());
console.log(res.ok ? `Webhook set to ${base}/api/telegram` : `Failed: ${res.description}`);
