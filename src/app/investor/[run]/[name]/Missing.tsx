import Link from "next/link";
import TopBar from "./TopBar";

/**
 * Shown when the run id is unknown or the investor is not in that run. Rendered by
 * the page itself, so the server sends the whole message (Next's notFound() would
 * send an empty shell and paint it only once JavaScript runs).
 */
export default function Missing() {
  return (
    <div className="min-h-screen bg-paper">
      <TopBar copy={false} />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Investor profile</p>
        <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
          This check has expired or the investor is not in it.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Profiles open from a finished check. Run the check again, then open the profile from the investor&apos;s row.
        </p>
        <Link href="/app" className="btn-primary mt-8">
          Go to FlipDD
        </Link>
      </main>
    </div>
  );
}
