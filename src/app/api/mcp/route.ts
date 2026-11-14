// FlipDD as an MCP server (Streamable HTTP, JSON responses). Add
// https://<host>/api/mcp to Claude, Cursor or any MCP client and ask it to
// check a meeting list. Set FLIPDD_MCP_TOKEN to require a bearer token.

import { Cala } from "@/lib/cala";
import { contextDevKey } from "@/lib/contextdev";
import { discoverCompetitors } from "@/lib/discover";
import { analyze } from "@/lib/engine";
import {
  LEVEL_LABEL,
  LEVEL_RANK,
  type CompetitorSummary,
  type FinderReport,
  type InvestorResult,
  type SlushReport,
  type WatchDoc,
} from "@/lib/types";
import { investorDossier } from "@/lib/dossier";
import { checkWatch } from "@/lib/watch";
import { computeRoundRisk, roundRiskText } from "@/lib/roundRisk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the most Vercel allows on Hobby

const SERVER_INFO = { name: "flipdd", title: "FlipDD", version: "1.3.0" };
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "check_investors",
    title: "Check investors for conflicts",
    description:
      "Check a founder's investor meeting list against their competitors using Cala's knowledge graph. " +
      "For each investor returns: conflict level (direct stake, co-investor path, lookalike portfolio company, or clear), " +
      "the sourced reasons, how much to share (teaser, deck without customer names, full data room) and a question to ask; " +
      "plus a round-wide summary: exposure score, co-investors that tie several meetings to a competitor, likeliest leads and a meeting order. " +
      "If no competitors are given but a description is, competitors are discovered first. First runs can take a few minutes.",
    inputSchema: {
      type: "object",
      properties: {
        investors: { type: "array", items: { type: "string" }, maxItems: 12, description: "Investor or fund names" },
        competitors: { type: "array", items: { type: "string" }, maxItems: 6, description: "Competitor company names" },
        description: { type: "string", description: "What the founder's startup builds, one or two sentences" },
        startup_name: { type: "string" },
      },
      required: ["investors"],
    },
  },
  {
    name: "find_competitors",
    title: "Find competitors",
    description:
      "Find funded companies in Cala's knowledge graph that compete with a startup, from a description of what it builds. " +
      "Judged by Gemini when the server has it configured.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the startup builds" },
        startup_name: { type: "string", description: "Excluded from the results" },
      },
      required: ["description"],
    },
  },
  {
    name: "find_clean_investors",
    title: "Find investors with no tie to your competitors",
    description:
      "Find funds that back companies like the founder's (from lookalike companies, similar Slush attendees and Cala's query) " +
      "and pass FlipDD's conflict checks: no stake in a competitor, nobody on a competitor's board, no co-investor path. " +
      "Also lists the investors dropped and why.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the startup builds" },
        competitors: { type: "array", items: { type: "string" }, maxItems: 6 },
        investors: { type: "array", items: { type: "string" }, maxItems: 12, description: "Investors already on the list (seeds the lookalike search)" },
        startup_name: { type: "string" },
      },
      required: ["description", "competitors"],
    },
  },
  {
    name: "investor_profile",
    title: "Cited investor profile",
    description:
      "A short profile of an investor from Cala Knowledge Search: what it invests in, recent deals, partners, with the source documents.",
    inputSchema: {
      type: "object",
      properties: { investor: { type: "string" } },
      required: ["investor"],
    },
  },
  {
    name: "slush_check",
    title: "Check Slush 2026 attendees",
    description:
      "Match a startup against the Slush 2026 attendee list in Cala (about 3,000 companies): which named competitors are " +
      "attending, which attendees build something similar (checked against each company's own record), which investors " +
      "on the list back them, and which of each investor's portfolio companies are attending.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the startup builds, one or two sentences" },
        startup_name: { type: "string" },
        investors: { type: "array", items: { type: "string" }, maxItems: 12 },
        competitors: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["description"],
    },
  },
  {
    name: "watch_news",
    title: "Check live news",
    description:
      "Read the last 90 days of news (Context.dev) about competitors and investors, and flag articles that tie an investor " +
      "on the list to a competitor, such as a fund named in a competitor's new round.",
    inputSchema: {
      type: "object",
      properties: {
        investors: { type: "array", items: { type: "string" }, maxItems: 12 },
        competitors: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["investors", "competitors"],
    },
  },
];

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Json;
}

const strList = (v: unknown, max: number) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, max)
    : [];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

class ToolError extends Error {}

function calaKey(): string {
  const key = process.env.CALA_API_KEY;
  if (!key || key === "your_cala_api_key_here") throw new ToolError("The server has no CALA_API_KEY.");
  return key;
}

function slushText(report: SlushReport | undefined, rows: InvestorResult[]): string {
  if (!report) return "";
  const lines = [`**${report.event.name}** (${report.event.attendees} companies on Cala's attendee list)`];
  if (report.namedAttending.length) lines.push(`- Competitors attending: ${report.namedAttending.map((a) => a.name).join(", ")}`);
  for (const c of report.competitors) {
    const backers = c.backedBy.map((i) => rows.find((r) => r.input === i)?.name || i);
    lines.push(
      `- ${c.name}${c.verdict ? ` (${c.verdict})` : ""}: ${(c.what || "").slice(0, 160)}` +
        (backers.length ? ` **Backed by ${backers.join(", ")}.**` : ""),
    );
  }
  if (!report.competitors.length) lines.push(`- ${report.note || "No attendee matched the description."}`);
  for (const r of rows) {
    if (r.slush?.portfolio.length) {
      lines.push(`- ${r.name} portfolio attending: ${r.slush.portfolio.map((p) => p.name).join(", ")}`);
    }
  }
  return lines.join("\n");
}

function finderText(f: FinderReport | undefined): string {
  if (!f) return "";
  const lines = [`**Clean investors** (${f.considered} considered, ${f.excluded.length} dropped for ties to competitors)`];
  for (const c of f.candidates) lines.push(`- ${c.name} (${c.kind}): ${c.why}`);
  if (!f.candidates.length) lines.push(`- ${f.note || "None found."}`);
  for (const x of f.excluded.slice(0, 6)) lines.push(`- dropped ${x.name}: ${x.reason}`);
  return lines.join("\n");
}

function radarText(comps: CompetitorSummary[]): string {
  const lines: string[] = [];
  for (const c of comps) {
    const r = c.radar;
    if (!r) continue;
    lines.push(`**${c.name}** rounds:`);
    for (const x of r.rounds.slice(0, 4)) {
      const amt = x.amount ? ` ${(x.amount / 1e6).toFixed(1)}M ${x.currency || ""}`.trimEnd() : "";
      const val = x.valuation ? ` at ${(x.valuation / 1e9).toFixed(1)}B valuation` : "";
      lines.push(`- ${x.label} ${x.date || "undated"}${amt}${val}${x.leads.length ? `, led by ${x.leads.join(", ")}` : ""}${x.onList.length ? ` (on your list: ${x.onList.join(", ")})` : ""}`);
    }
    for (const e of r.events) lines.push(`- ${e.kind === "was_acquired" ? "acquired by" : "acquired"} ${e.counterparty || "?"} ${e.date || ""}`);
  }
  return lines.join("\n");
}

function summarise(rows: InvestorResult[]): string {
  return rows
    .map((r, i) => {
      const lines = [`${i + 1}. **${r.name}**${r.kind && r.kind !== "fund" ? ` (${r.kind})` : ""}: ${LEVEL_LABEL[r.level]}. ${r.headline}`];
      for (const t of r.people || []) lines.push(`   Person: ${t.text}`);
      lines.push(`   Share: ${r.share.level}. ${r.share.why}`);
      lines.push(`   Ask: "${r.ask.question}"${r.ask.source?.url ? ` (source: ${r.ask.source.url})` : ""}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

async function callTool(name: string, args: Json, signal: AbortSignal): Promise<{ text: string; data: unknown }> {
  if (name === "find_competitors") {
    const description = str(args.description, 600);
    if (description.length < 15) throw new ToolError("Describe what the startup builds in a sentence.");
    const cala = new Cala(calaKey(), {}, signal);
    try {
      const out = await discoverCompetitors(cala, str(args.startup_name, 100), description, signal);
      const text = out.competitors.length
        ? out.competitors
            .map(
              (c, i) =>
                `${i + 1}. **${c.name}**${c.verdict ? ` (${c.verdict})` : ""}: ${c.why || c.what || ""}${c.funding ? ` · ${c.funding}` : ""}`,
            )
            .join("\n")
        : "No competitors found in Cala for this description.";
      return { text, data: out };
    } finally {
      cala.dispose();
    }
  }

  if (name === "check_investors") {
    const investors = strList(args.investors, 12);
    if (!investors.length) throw new ToolError("Give at least one investor name.");
    const description = str(args.description, 600);
    const startupName = str(args.startup_name, 100);
    let competitors = strList(args.competitors, 6);
    const competitorIds: Record<string, string> = {};
    let note = "";
    if (!competitors.length && description.length >= 15) {
      const cala = new Cala(calaKey(), {}, signal);
      try {
        const found = await discoverCompetitors(cala, startupName, description, signal);
        for (const c of found.competitors.slice(0, 4)) {
          competitors.push(c.name);
          if (c.entityId) competitorIds[c.name] = c.entityId;
        }
        note = competitors.length ? `Competitors found from the description: ${competitors.join(", ")}.\n\n` : "";
      } finally {
        cala.dispose();
      }
    }
    competitors = competitors.slice(0, 6);
    const latest = new Map<string, InvestorResult>();
    let failure = "";
    let slush: SlushReport | undefined;
    let finder: FinderReport | undefined;
    const comps = new Map<string, CompetitorSummary>();
    await analyze(
      { startupName, description, competitors, investors, competitorIds },
      (e) => {
        if (e.type === "investor") latest.set(e.data.input, e.data);
        if (e.type === "slush") slush = e.data;
        if (e.type === "finder") finder = e.data;
        if (e.type === "competitor") comps.set(e.data.input, e.data);
        if (e.type === "error") failure = e.message;
      },
      calaKey(),
      signal,
    );
    if (failure) throw new ToolError(failure);
    const rows = investors
      .map((n) => latest.get(n))
      .filter((r): r is InvestorResult => Boolean(r))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    const slushPart = slushText(slush, rows);
    const round = computeRoundRisk(rows, slush);
    return {
      text: [note + roundRiskText(round), summarise(rows), radarText([...comps.values()]), finderText(finder), slushPart]
        .filter(Boolean)
        .join("\n\n"),
      data: { competitors, round, investors: rows, radar: [...comps.values()].map((c) => ({ name: c.name, ...c.radar })), finder, slush },
    };
  }

  if (name === "find_clean_investors") {
    const description = str(args.description, 600);
    const competitors = strList(args.competitors, 6);
    if (description.length < 15 || !competitors.length) throw new ToolError("Give a description and at least one competitor.");
    let finder: FinderReport | undefined;
    let failure = "";
    await analyze(
      { startupName: str(args.startup_name, 100), description, competitors, investors: strList(args.investors, 12) },
      (e) => {
        if (e.type === "finder") finder = e.data;
        if (e.type === "error") failure = e.message;
      },
      calaKey(),
      signal,
    );
    if (failure) throw new ToolError(failure);
    if (!finder) throw new ToolError("The finder did not finish.");
    return { text: finderText(finder), data: finder };
  }

  if (name === "investor_profile") {
    const investor = str(args.investor, 120);
    if (investor.length < 2) throw new ToolError("Give an investor name.");
    const cala = new Cala(calaKey(), {}, signal);
    try {
      const d = await investorDossier(cala, investor);
      const src = d.sources.map((s) => `- ${s.label}: ${s.url}`).join("\n");
      return { text: `${d.markdown}${src ? `\n\nSources:\n${src}` : ""}`, data: d };
    } finally {
      cala.dispose();
    }
  }

  if (name === "slush_check") {
    const description = str(args.description, 600);
    if (description.length < 15) throw new ToolError("Describe what the startup builds in a sentence.");
    const investors = strList(args.investors, 12);
    const competitors = strList(args.competitors, 6);
    const latest = new Map<string, InvestorResult>();
    let slush: SlushReport | undefined;
    let failure = "";
    await analyze(
      { startupName: str(args.startup_name, 100), description, competitors, investors },
      (e) => {
        if (e.type === "investor") latest.set(e.data.input, e.data);
        if (e.type === "slush") slush = e.data;
        if (e.type === "error") failure = e.message;
      },
      calaKey(),
      signal,
    );
    if (failure) throw new ToolError(failure);
    if (!slush) throw new ToolError("The Slush check did not finish.");
    const rows = investors.map((n) => latest.get(n)).filter((r): r is InvestorResult => Boolean(r));
    return { text: slushText(slush, rows), data: slush };
  }

  if (name === "watch_news") {
    if (!contextDevKey()) throw new ToolError("The server has no CONTEXT_DEV_API_KEY.");
    const doc: WatchDoc = {
      id: "mcp",
      createdAt: new Date().toISOString(),
      startupName: "",
      investors: strList(args.investors, 12),
      competitors: strList(args.competitors, 6),
      seen: [],
    };
    if (!doc.investors.length || !doc.competitors.length) throw new ToolError("Give investors and competitors.");
    const { report } = await checkWatch(doc, { signal });
    const text = report.alerts.length
      ? report.alerts
          .slice(0, 20)
          .map((a) => `- [${a.severity}] ${a.text} "${a.article.title}" ${a.article.url}`)
          .join("\n")
      : `No article in the last ${report.windowDays} days ties these investors to these competitors.`;
    return { text, data: report };
  }

  throw new ToolError(`Unknown tool: ${name}`);
}

async function handle(msg: RpcRequest, signal: AbortSignal): Promise<Json | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  // Notifications get no response.
  if (msg.id === undefined || msg.id === null) return null;

  switch (msg.method) {
    case "initialize": {
      const asked = str(msg.params?.protocolVersion, 20);
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "FlipDD checks a founder's investor meeting list for conflicts with their competitors, using Cala's knowledge graph. " +
          "Call find_competitors first if the founder has not named competitors, then check_investors.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = str(msg.params?.name, 60);
      const args = (msg.params?.arguments as Json) || {};
      try {
        const { text, data } = await callTool(name, args, signal);
        return reply({ content: [{ type: "text", text }], structuredContent: { result: data }, isError: false });
      } catch (err) {
        if (err instanceof ToolError) return reply({ content: [{ type: "text", text: err.message }], isError: true });
        return reply({ content: [{ type: "text", text: `FlipDD failed: ${(err as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

function authorised(req: Request): boolean {
  const token = process.env.FLIPDD_MCP_TOKEN?.trim();
  if (!token) return true;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => undefined);
  if (body === undefined) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as RpcRequest[];
  const replies = (await Promise.all(messages.map((m) => handle(m, req.signal)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0]);
}

export async function GET() {
  // No server-initiated stream; clients fall back to plain POST.
  return new Response("FlipDD MCP endpoint. POST JSON-RPC here.", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
