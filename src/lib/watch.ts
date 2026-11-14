// Watchlist check: reads live news (Context.dev) about each competitor and
// each investor on the list, and flags articles that tie the two together,
// such as a fund on the meeting list named in a competitor's new round.

import { companyNews, type CompanyNews } from "./contextdev";
import { FUNDING, FUNDING_STRONG, matcher } from "./newsMatch";
import type { WatchAlert, WatchDoc, WatchReport } from "./types";

export const WATCH_WINDOW_DAYS = 90;
const CONCURRENCY = 4;

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(items[i]) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

const fmtDay = (iso?: string) => (iso ? iso.slice(0, 10) : "undated");

export async function checkWatch(
  doc: WatchDoc,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<{ report: WatchReport; seen: string[] }> {
  const errors: string[] = [];
  const investorMatch = doc.investors.map((n) => ({ name: n, test: matcher(n) }));
  const competitorMatch = doc.competitors.map((n) => ({ name: n, test: matcher(n) }));

  const targets = [
    ...doc.competitors.map((name) => ({ name, role: "competitor" as const })),
    ...doc.investors.map((name) => ({ name, role: "investor" as const })),
  ];
  const settled = await pool(targets, (t) => companyNews(t.name, WATCH_WINDOW_DAYS, opts));

  // The first check sets the baseline; later checks flag what appeared since.
  const baselineDone = Boolean(doc.lastCheckedAt);
  const alerts = new Map<string, WatchAlert>();
  let articlesRead = 0;
  const add = (a: Omit<WatchAlert, "isNew">) => {
    const prev = alerts.get(a.key);
    const rank = { high: 3, medium: 2, low: 1 };
    if (!prev || rank[a.severity] > rank[prev.severity]) alerts.set(a.key, { ...a, isNew: baselineDone && !doc.seen.includes(a.key) });
  };

  settled.forEach((s, i) => {
    const t = targets[i];
    if (s.status === "rejected") {
      errors.push(`${t.name}: ${(s.reason as Error).message}`);
      return;
    }
    const articles: CompanyNews[] = s.value;
    articlesRead += articles.length;
    for (const art of articles) {
      const text = `${art.title}\n${art.description || ""}`;
      const funding = FUNDING.test(text);
      const strong = FUNDING_STRONG.test(text);
      const about = art.matchLevel !== "secondary"; // the article is mainly about the company searched for
      const story = art.storyId || art.id;
      const article = {
        id: art.id,
        url: art.url,
        title: art.title,
        description: art.description?.slice(0, 400),
        publishedAt: art.publishedAt,
        source: art.source,
        type: art.type,
      };
      if (t.role === "competitor") {
        const named = investorMatch.filter((m) => m.test(text));
        for (const inv of named) {
          add({
            key: `inv:${inv.name}|comp:${t.name}|${story}`,
            kind: "listed_investor_in_competitor_news",
            investor: inv.name,
            competitor: t.name,
            article,
            text:
              about && strong
                ? `${inv.name} is named in an article about ${t.name}'s funding (${fmtDay(art.publishedAt)}). Check whether they joined the round before you share more.`
                : `${inv.name} and ${t.name} are both named in this article (${fmtDay(art.publishedAt)}). Read it to see how they are connected.`,
            severity: about && strong ? "high" : funding ? "medium" : "low",
          });
        }
        if (!named.length && about && FUNDING_STRONG.test(art.title)) {
          add({
            key: `comp:${t.name}|${story}`,
            kind: "competitor_raised",
            competitor: t.name,
            article,
            text: `Funding news for ${t.name} (${fmtDay(art.publishedAt)}). None of your investors is named, but new backers can join later; re-run the check after the round closes.`,
            severity: "low",
          });
        }
      } else {
        for (const comp of competitorMatch.filter((m) => m.test(text))) {
          add({
            key: `inv:${t.name}|comp:${comp.name}|${story}`,
            kind: "investor_news_mentions_competitor",
            investor: t.name,
            competitor: comp.name,
            article,
            text:
              about && strong
                ? `An article about ${t.name}'s funding names ${comp.name} (${fmtDay(art.publishedAt)}). It may describe ${t.name} as a backer of ${comp.name}.`
                : `${t.name} and ${comp.name} are both named in this article (${fmtDay(art.publishedAt)}).`,
            severity: about && strong ? "medium" : "low",
          });
        }
      }
    }
  });

  const rank = { high: 0, medium: 1, low: 2 };
  const list = [...alerts.values()].sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (b.article.publishedAt || "").localeCompare(a.article.publishedAt || ""),
  );
  const checkedAt = new Date().toISOString();
  const { seen: _seen, ...watch } = doc;
  return {
    report: {
      watch: { ...watch, lastCheckedAt: checkedAt },
      checkedAt,
      windowDays: WATCH_WINDOW_DAYS,
      alerts: list.slice(0, 60),
      articlesRead,
      errors,
    },
    seen: [...new Set([...doc.seen, ...list.map((a) => a.key)])].slice(-2000),
  };
}
