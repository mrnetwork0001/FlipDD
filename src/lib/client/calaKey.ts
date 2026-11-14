"use client";

// A visitor's own Cala key, kept in this browser only. When set, FlipDD's own
// API calls carry it (x-cala-key) so checks run on the visitor's credits.

const STORE = "flipdd.calaKey";
export const KEY_RE = /^clsk_[A-Za-z0-9_-]{20,120}$/;
type Listener = (key: string) => void;
const listeners = new Set<Listener>();

export function getOwnKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORE) || "";
  } catch {
    return "";
  }
}

export function setOwnKey(key: string) {
  try {
    if (key) localStorage.setItem(STORE, key);
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode: the key lasts for this page only */
  }
  for (const l of listeners) l(key);
}

export function onOwnKey(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Adds the visitor's key to same-site /api/ requests. Installed once per page. */
export function installOwnKeyFetch() {
  const w = window as Window & { __flipddFetch?: boolean };
  if (w.__flipddFetch) return;
  w.__flipddFetch = true;
  const base = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const key = getOwnKey();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const local = url.startsWith("/api/") || url.startsWith(`${location.origin}/api/`);
    if (!key || !local) return base(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("x-cala-key", key);
    return base(input, { ...init, headers });
  };
}
