import type { Metadata } from "next";
import InvestorProfile from "@/components/InvestorProfile";
import { loadDoc, validId } from "@/lib/store";
import type { InvestorResult, RunDoc } from "@/lib/types";
import Missing from "./Missing";
import TopBar from "./TopBar";

// One investor from a saved check: /investor/<runId>/<encodeURIComponent(result.input)>.
// Read from the server's own copy of the run, never from what a browser sends.

export const dynamic = "force-dynamic";

type Params = { run: string; name: string };

/** The name segment as sent, and decoded once more in case it still carries escapes. */
function spellings(raw: string): string[] {
  const out = [raw];
  try {
    out.push(decodeURIComponent(raw));
  } catch {
    // A bare "%" is not an escape: keep the name as it came.
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

async function lookup(params: Params): Promise<{ run: RunDoc; result: InvestorResult } | null> {
  if (!validId(params.run)) return null;
  const run = await loadDoc<RunDoc>("runs", params.run);
  if (!run || !Array.isArray(run.investors)) return null;
  const names = spellings(params.name);
  const lower = names.map((n) => n.toLowerCase());
  const result =
    run.investors.find((r) => names.includes(r.input)) ||
    run.investors.find((r) => lower.includes(r.input.toLowerCase())) ||
    run.investors.find((r) => lower.includes(r.name.toLowerCase()));
  return result ? { run, result } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await lookup(params);
  return {
    title: found ? `${found.result.name} · Investor profile · FlipDD` : "Investor profile · FlipDD",
    // A check is private to whoever has its link.
    robots: { index: false, follow: false },
  };
}

export default async function InvestorProfilePage({ params }: { params: Params }) {
  const found = await lookup(params);
  if (!found) return <Missing />;
  const { run, result } = found;
  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <InvestorProfile
        run={{
          id: run.id,
          createdAt: run.createdAt,
          startupName: run.startupName,
          description: run.description,
          competitors: run.competitors || [],
          competitorSummaries: run.competitorSummaries || [],
          finished: run.finished,
          stats: run.stats,
          slushCompetitors: (run.slush?.competitors || []).filter((c) => result.slush?.competitors.includes(c.name)),
          slushEvent: run.slush?.event.name,
        }}
        result={result}
      />
    </div>
  );
}
