// Where founders can reach FlipDD away from the web app. Baked in at build
// time (NEXT_PUBLIC_*), so the landing page and the app read the same values.
export const TELEGRAM_BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT || "tryflipdd_bot").replace(/^@/, "");
/** The Twilio number, e.g. "+1 415 555 0100". Empty until the phone line has one: then no call button shows. */
export const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER?.trim() || "";
export const telegramUrl = (start?: string) => `https://t.me/${TELEGRAM_BOT}${start ? `?start=${encodeURIComponent(start)}` : ""}`;
