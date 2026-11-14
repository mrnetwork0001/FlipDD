// The round as a whole: how many of the founder's meetings sit within one step
// of a competitor, which co-investors tie several of them together, which
// funds are the likeliest leads, and in what order to take the meetings.
//
// Pure function with type-only imports: it runs on the server (saved with the
// run, used by the MCP tool) and in the browser (live, as results stream in),
// and is unit-tested in tests/roundRisk.test.ts.

import type {
  Exposure,
  InvestorResult,
  Level,
  RoundRisk,
  RoundRiskInvestor,
  SlushReport,
} from "./types";

const EXPOSURE: Record<Level, Exposure> = {
  direct_high: "direct",
  direct_moderate: "direct",
  indirect: "one_step",
  possible: "lookalike",
  thin: "unknown",
  unresolved: "unknown",
  clear: "clear",
};

/**
 * How much one meeting adds to the round's exposure, 0 to 1. A live stake in
 * a competitor counts fully; a weaker or late-stage stake 0.7; a co-investor
 * path scales with its link strength (a 60/100 path counts 0.3); a lookalike
 * 0.25; an investor Cala knows too little about 0.15, because unknown is not
 * the same as clear.
 */
export function meetingWeight(r: InvestorResult): number {
  switch (r.level) {
    case "direct_high":
      return 1;
    case "direct_moderate":
      return 0.7;
    case "indirect": {
      const top = Math.max(0, ...r.leaks.filter((l) => l.strengthLabel !== "weak").map((l) => l.strength));
      return Math.min(0.6, Math.max(0.2, top / 200));
    }
    case "possible":
      return 0.25;
    case "thin":
    case "unresolved":
      return 0.15;
    default:
      return 0;
  }
}

const list = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function computeRoundRisk(rows: InvestorResult[], slush?: SlushReport): RoundRisk {
  const settledRows = rows.filter((r) => r.done.direct);
  const counts: Record<Exposure, number> = { direct: 0, one_step: 0, lookalike: 0, unknown: 0, clear: 0 };

  const investors: RoundRiskInvestor[] = settledRows.map((r) => {
    const exposure = EXPOSURE[r.level];
    counts[exposure]++;
    const reaches = [
      ...r.direct.map((d) => d.competitor),
      ...r.leaks.filter((l) => l.strengthLabel !== "weak").map((l) => l.competitor),
    ];
    return {
      input: r.input,
      name: r.name,
      level: r.level,
      exposure,
      reaches: [...new Set(reaches)],
      weight: meetingWeight(r),
    };
  });

  // Who reaches each competitor.
  const reachMap = new Map<string, RoundRisk["reach"][number]>();
  const reachOf = (c: string) => {
    if (!reachMap.has(c)) reachMap.set(c, { competitor: c, direct: [], oneStep: [] });
    return reachMap.get(c)!;
  };
  for (const r of settledRows) {
    for (const d of r.direct) {
      const entry = reachOf(d.competitor);
      if (!entry.direct.includes(r.name)) entry.direct.push(r.name);
    }
    for (const l of r.leaks) {
      if (l.strengthLabel === "weak" || r.direct.some((d) => d.competitor === l.competitor)) continue;
      const entry = reachOf(l.competitor);
      const existing = entry.oneStep.find((x) => x.investor === r.name);
      if (!existing) entry.oneStep.push({ investor: r.name, via: l.via.name, strength: l.strength });
      else if (l.strength > existing.strength) Object.assign(existing, { via: l.via.name, strength: l.strength });
    }
  }
  const reach = [...reachMap.values()]
    .map((e) => ({ ...e, oneStep: e.oneStep.sort((a, b) => b.strength - a.strength) }))
    .sort((a, b) => b.direct.length + b.oneStep.length - (a.direct.length + a.oneStep.length));

  // Co-investors that tie two or more of the founder's meetings to a competitor.
  const hubMap = new Map<string, { via: string; investors: Set<string>; competitors: Set<string>; strongest: number }>();
  for (const r of settledRows) {
    for (const l of r.leaks) {
      if (l.strengthLabel === "weak") continue;
      const key = l.via.id || l.via.name;
      const hub = hubMap.get(key) || { via: l.via.name, investors: new Set(), competitors: new Set(), strongest: 0 };
      hub.investors.add(r.name);
      hub.competitors.add(l.competitor);
      hub.strongest = Math.max(hub.strongest, l.strength);
      hubMap.set(key, hub);
    }
  }
  const hubs = [...hubMap.values()]
    .filter((h) => h.investors.size >= 2)
    .map((h) => ({ via: h.via, investors: [...h.investors], competitors: [...h.competitors], strongest: h.strongest }))
    .sort((a, b) => b.investors.length - a.investors.length || b.strongest - a.strongest);

  // Likeliest leads: no tie to a competitor, and leading rounds lately.
  const leadCandidates = settledRows
    .filter((r) => (r.level === "clear" || r.level === "possible") && r.activity.leads12m > 0)
    .map((r) => ({ input: r.input, name: r.name, leads12m: r.activity.leads12m, rounds12m: r.activity.rounds12m }))
    .sort((a, b) => b.leads12m - a.leads12m || b.rounds12m - a.rounds12m)
    .slice(0, 3);

  // Meeting order, safest first. Within a group, active leaders first, then the weakest ties.
  const byName = (r: InvestorResult) => r.name;
  const activeFirst = (a: InvestorResult, b: InvestorResult) =>
    b.activity.leads12m - a.activity.leads12m || b.activity.rounds12m - a.activity.rounds12m;
  const group = (levels: Level[]) => settledRows.filter((r) => levels.includes(r.level));
  const order: RoundRisk["order"] = [];
  const clear = group(["clear"]).sort(activeFirst);
  if (clear.length) {
    order.push({
      title: "Meet first",
      share: "Full data room",
      why: "No tie to your competitors on record. Use these meetings to set terms and momentum.",
      investors: clear.map(byName),
    });
  }
  const check = group(["possible", "thin", "unresolved"]).sort(activeFirst);
  if (check.length) {
    order.push({
      title: "Then, after one question",
      share: "Deck without customer names",
      why: "A lookalike in the portfolio or too little on record. Ask about the overlap before you share more.",
      investors: check.map(byName),
    });
  }
  const oneStep = group(["indirect"]).sort(
    (a, b) => meetingWeight(a) - meetingWeight(b) || activeFirst(a, b),
  );
  if (oneStep.length) {
    order.push({
      title: "Later, with less",
      share: "Deck without customer names",
      why: "One co-investor away from a competitor. Ask how they handle what co-investors see.",
      investors: oneStep.map(byName),
    });
  }
  const direct = group(["direct_high", "direct_moderate"]).sort((a, b) => meetingWeight(a) - meetingWeight(b));
  if (direct.length) {
    order.push({
      title: "Last, teaser only",
      share: "Teaser only",
      why: "They hold a stake in a competitor. Hold the deck until they explain how they keep the two apart.",
      investors: direct.map(byName),
    });
  }

  const n = investors.length;
  const score = n ? Math.round((100 * investors.reduce((s, i) => s + i.weight, 0)) / n) : 0;
  const grade: RoundRisk["grade"] = score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  const near = counts.direct + counts.one_step;
  const top = reach[0];
  let headline: string;
  if (!n) headline = "Checking your meetings…";
  else if (!near) {
    headline = counts.lookalike
      ? `None of your ${n} meetings has a stake in a competitor or a co-investor path to one; ${counts.lookalike} own a lookalike.`
      : `None of your ${n} meetings is within one step of a competitor on record.`;
  } else {
    const target = reach.length === 1 && top ? top.competitor : "a competitor";
    headline = `${near} of your ${n} meetings ${near === 1 ? "is" : "are"} within one step of ${target}.`;
    if (counts.clear) headline += ` Meet the ${counts.clear} clear fund${counts.clear === 1 ? "" : "s"} first.`;
  }

  const backingRivals = slush
    ? settledRows.filter((r) => (r.slush?.competitors.length || 0) > 0).map((r) => r.name)
    : [];

  return {
    total: rows.length,
    settled: n,
    counts,
    score,
    grade,
    headline,
    investors,
    reach,
    hubs,
    leadCandidates,
    order,
    slush: slush
      ? {
          event: slush.event.name,
          backingRivals,
          portfolioAttending: settledRows.reduce((s, r) => s + (r.slush?.portfolio.length || 0), 0),
        }
      : undefined,
  };
}

/** Plain-text version for the MCP tool and other non-visual uses. */
export function roundRiskText(risk: RoundRisk): string {
  const lines = [`**Round exposure ${risk.score}/100 (${risk.grade}).** ${risk.headline}`];
  for (const h of risk.hubs.slice(0, 3)) {
    lines.push(`- ${h.via} ties ${list(h.investors)} to ${list(h.competitors)}.`);
  }
  if (risk.leadCandidates.length) {
    lines.push(
      `- Likeliest leads (no stake or co-investor path to a competitor): ${risk.leadCandidates.map((c) => `${c.name} (led ${c.leads12m} of ${c.rounds12m} rounds in the past year)`).join(", ")}.`,
    );
  }
  risk.order.forEach((o, i) => lines.push(`${i + 1}. ${o.title} (${o.share}): ${o.investors.join(", ")}`));
  return lines.join("\n");
}
