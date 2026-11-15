// A founder's own Cala key in Telegram. Telegram has no browser to keep it in,
// so the key is stored server-side, encrypted (AES-256-GCM) under a hash of the
// chat id, and expires after 30 days. It is never logged or echoed back.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const CALA_KEY_RE = /^clsk_[A-Za-z0-9_-]{20,120}$/;
export const KEY_TTL_DAYS = 30;

/** 32-byte encryption key from TELEGRAM_KEY_SECRET, else from the bot's own secrets. */
export function keySecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const base = env.TELEGRAM_KEY_SECRET?.trim() || [env.TELEGRAM_WEBHOOK_SECRET, env.TELEGRAM_BOT_TOKEN].filter(Boolean).join(":");
  return base ? createHash("sha256").update(`flipdd-tg-key:${base}`).digest() : null;
}

/** Where a chat's key is stored: a hash, so the store never holds the chat id itself. */
export const chatSlot = (chatId: number | string) => createHash("sha256").update(`flipdd-chat:${chatId}`).digest("hex").slice(0, 32);

export function sealKey(plain: string, secret: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** The key, or null if the box is damaged or was sealed with another secret. */
export function openKey(sealed: string, secret: Buffer): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", secret, iv);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(body), d.final()]).toString("utf8");
    return CALA_KEY_RE.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Shows only the start and end, e.g. clsk_ab…xyz9. */
export const maskKey = (k: string) => `${k.slice(0, 7)}…${k.slice(-4)}`;
