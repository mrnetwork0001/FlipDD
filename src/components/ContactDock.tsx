"use client";

// Bottom-left: FlipDD on Telegram, and the phone line once it has a number.
// Sits under dialogs (z-40) and away from the meeting list button (bottom-right).

import { PHONE_NUMBER, TELEGRAM_BOT, telegramUrl } from "@/lib/contact";
import { PhoneGlyph } from "./Glyphs";

/** Telegram's mark: the paper plane in its blue disc. */
function TelegramMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden>
      <circle cx="120" cy="120" r="120" fill="#27A6E5" />
      <path
        fill="#fff"
        d="M54.3 118.8c35-15.2 58.3-25.3 70-30.2 33.3-13.9 40.3-16.3 44.8-16.4 1 0 3.2.2 4.7 1.4 1.2 1 1.5 2.3 1.7 3.3.2 1 .4 3.1.2 4.7-1.8 19-9.6 65.1-13.6 86.3-1.7 9-5 12-8.2 12.3-7 .6-12.3-4.6-19-9-10.6-6.9-16.5-11.2-26.8-18-11.9-7.8-4.2-12.1 2.6-19.1 1.8-1.8 32.5-29.8 33.1-32.3.1-.3.1-1.5-.6-2.1-.7-.6-1.7-.4-2.5-.2-1.1.2-17.9 11.4-50.6 33.5-4.8 3.3-9.1 4.9-13 4.8-4.3-.1-12.5-2.4-18.6-4.4-7.5-2.4-13.5-3.7-13-7.9.3-2.2 3.3-4.4 8.9-6.6z"
      />
    </svg>
  );
}

export default function ContactDock({ desktopLeft }: { /** Desktop offset, so the dock clears a left column (the app's form). */ desktopLeft?: string }) {
  return (
    <div className={`pointer-events-none fixed bottom-4 left-4 z-40 flex flex-col gap-2.5 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:left-6 ${desktopLeft || ""}`}>
      {/* The phone line: a real call once NEXT_PUBLIC_PHONE_NUMBER is set; until then it explains the line. */}
      <a
        href={PHONE_NUMBER ? `tel:${PHONE_NUMBER.replace(/[^\d+]/g, "")}` : "/#go"}
        className="group pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-signal text-white shadow-[0_10px_30px_-8px_rgba(214,60,34,0.6)] transition hover:scale-105"
        aria-label={PHONE_NUMBER ? `Call FlipDD on ${PHONE_NUMBER}` : "FlipDD phone line (number coming soon)"}
      >
        {PHONE_NUMBER && <span className="call-ring absolute inset-0 rounded-full border-2 border-signal/50" aria-hidden />}
        <PhoneGlyph size={20} strokeWidth={1.7} />
        <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper opacity-0 shadow-lg transition group-hover:opacity-100">
          {PHONE_NUMBER ? `Call FlipDD · ${PHONE_NUMBER}` : "Phone line · number coming soon"}
        </span>
      </a>
      <a
        href={telegramUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="group pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_-8px_rgba(39,166,229,0.6)] ring-1 ring-black/5 transition hover:scale-105"
        aria-label={`Open FlipDD on Telegram (@${TELEGRAM_BOT})`}
      >
        <TelegramMark size={48} />
        <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper opacity-0 shadow-lg transition group-hover:opacity-100">
          FlipDD on Telegram · @{TELEGRAM_BOT}
        </span>
      </a>
    </div>
  );
}
