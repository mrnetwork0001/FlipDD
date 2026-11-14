import { waitUntil } from "@vercel/functions";
import { handleUpdate, telegramToken, type TelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Telegram updates, from the webhook (deployed) or scripts/telegram.mjs
 * (local polling). Answers 200 at once and works in the background, so
 * Telegram does not retry while a check runs.
 */
export async function POST(req: Request) {
  if (!telegramToken()) return Response.json({ error: "TELEGRAM_BOT_TOKEN is not set." }, { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") return Response.json({ ok: true });
  // waitUntil keeps a serverless function alive after the reply (Vercel); elsewhere the work just runs on.
  waitUntil(handleUpdate(update).catch((err) => console.warn(`[telegram] ${(err as Error).message}`)));
  return Response.json({ ok: true });
}
