"use client";

// "Use your own Cala key": for when FlipDD's credits run out, or a founder
// wants to run many checks. The key stays in this browser.

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { KEY_RE, getOwnKey, onOwnKey, setOwnKey } from "@/lib/client/calaKey";

export function useOwnKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    setKey(getOwnKey());
    return onOwnKey(setKey);
  }, []);
  return key;
}

export default function OwnCalaKey({ open: openProp = false }: { open?: boolean }) {
  const key = useOwnKey();
  const [open, setOpen] = useState(openProp);
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (openProp) setOpen(true);
  }, [openProp]);

  if (key) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <KeyRound className="h-3.5 w-3.5 text-clear" />
        <span>
          Running on your Cala key <span className="font-mono text-ink/80">····{key.slice(-4)}</span>
        </span>
        <button type="button" onClick={() => setOwnKey("")} className="font-semibold text-ink underline-offset-2 hover:underline">
          Remove
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" id="own-cala-key" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
        <KeyRound className="h-3.5 w-3.5" /> Use your own Cala key
      </button>
    );
  }
  return (
    <div id="own-cala-key" className="mt-3 rounded-xl border border-line bg-white/60 p-3">
      <label htmlFor="own-key-input" className="text-xs font-semibold">Your Cala API key</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="own-key-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="clsk_…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.trim());
            setBad(false);
          }}
          className="field flex-1 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => (KEY_RE.test(draft) ? (setOwnKey(draft), setDraft(""), setOpen(false)) : setBad(true))}
          className="btn-primary shrink-0 !px-4"
        >
          Use key
        </button>
      </div>
      {bad && <p className="mt-1.5 text-xs text-signal">That doesn&apos;t look like a Cala key (it starts with clsk_).</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Stays in this browser and is sent only with your own checks; FlipDD never stores it. Get one free at{" "}
        <a href="https://console.cala.ai" target="_blank" rel="noopener noreferrer" className="underline">console.cala.ai</a>{" "}
        (100 queries a month; a new check uses up to about 90, and anything already looked up costs nothing).
      </p>
    </div>
  );
}
