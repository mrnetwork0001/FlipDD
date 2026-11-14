"use client";

// An editorial illustration from public/brand/art/<name>.(jpg|png|webp). The
// app asks once which files exist (/api/art), so a missing illustration shows
// the fallback quietly instead of a broken image or a 404.

import { useEffect, useState } from "react";

let catalogue: Promise<Record<string, string>> | null = null;
const loadCatalogue = (): Promise<Record<string, string>> =>
  (catalogue ??= fetch("/api/art")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({})));

export default function Art({
  name,
  alt,
  className = "",
  fallback = null,
}: {
  name: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadCatalogue().then((c) => live && setSrc(c[name] || null));
    return () => {
      live = false;
    };
  }, [name]);
  if (src === undefined) return null;
  if (!src) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
