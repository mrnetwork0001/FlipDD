"use client";

import { useState } from "react";
import { Check, Link2, Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
    >
      <Printer className="h-3.5 w-3.5" /> Print or save as PDF
    </button>
  );
}

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink hover:text-ink"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
