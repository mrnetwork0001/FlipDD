// Cited investor profile from Cala Knowledge Search: what the investor backs,
// recent deals and partners, with the documents Cala drew on. Responses are
// cached by the Cala client (one search per investor per day).

import type { Cala } from "./cala";
import type { InvestorDossier, SourceRef } from "./types";

const MAX_SOURCES = 8;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function investorDossier(cala: Cala, investor: string): Promise<InvestorDossier> {
  const name = investor.trim().slice(0, 120);
  const { content, context } = await cala.knowledgeSearch(
    `Profile the venture investor ${name}: what it invests in (sectors, stages, typical cheque size), ` +
      `the deals it led or joined in the past 12 months, and its partners. Be factual and concise.`,
  );
  // Prefer specific documents over bare home pages; one link per page.
  const seen = new Set<string>();
  const sources: SourceRef[] = [];
  for (const c of context) {
    for (const o of c.origins || []) {
      const url = o.document?.url || o.source?.url;
      if (!url || !/^https?:\/\//.test(url) || seen.has(url)) continue;
      seen.add(url);
      sources.push({ label: hostOf(url), title: o.document?.name || o.source?.name, url });
    }
  }
  const deep = (s: SourceRef) => (new URL(s.url!).pathname.length > 1 ? 0 : 1);
  sources.sort((a, b) => deep(a) - deep(b));
  return {
    investor: name,
    markdown: content.trim(),
    sources: sources.slice(0, MAX_SOURCES),
    fetchedAt: new Date().toISOString(),
  };
}
