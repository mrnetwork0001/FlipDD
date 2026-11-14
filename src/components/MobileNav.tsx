"use client";

// Landing page navigation on phones: burger → left drawer with the section
// links and the primary call to action pinned at the bottom. Closes on the
// backdrop, Esc, the close button, and after any link is followed.

import Link from "next/link";
import { useEffect, useState } from "react";
import CalaLogo from "./CalaLogo";
import FlipLogo from "./FlipLogo";

export default function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        className="burger"
        data-open={open ? "true" : "false"}
        aria-expanded={open}
        aria-controls="landing-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-night/45 backdrop-blur-[2px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <nav
        id="landing-menu"
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(88vw,320px)] flex-col bg-paper shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <FlipLogo height={28} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted"
            aria-label="Close menu"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-base font-medium text-ink transition hover:bg-ink/5"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-4 px-3">
            <CalaLogo label="Built on" height={18} className="text-xs text-muted" />
          </div>
        </div>
        <div className="border-t border-line p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <Link href="/app" onClick={() => setOpen(false)} className="btn-primary w-full !py-3.5 !text-base">
            Launch app
          </Link>
        </div>
      </nav>
    </div>
  );
}
