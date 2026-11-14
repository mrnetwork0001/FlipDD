// "Ask Cala": a founder's follow-up question answered by an agent that walks
// Cala's knowledge graph through Cala's own MCP server. Gemini plans and
// writes; every fact comes from a Cala tool call, and the calls are returned
// so the founder can see how the answer was found.

import { callCalaMcp, calaMcpTools, type McpTool } from "./calaMcp";
import { geminiKey, geminiModel } from "./gemini";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_CALLS = 10;
const RESULT_CHARS = 14_000;
const STEP_TIMEOUT_MS = 60_000;

export interface AskStep {
  tool: string;
  args: Record<string, unknown>;
  ms: number;
  ok: boolean;
  /** First characters of what the tool returned. */
  preview: string;
  /** What the call did, in plain words: "Opening Accel: portfolio, funding rounds". */
  label: string;
  /** The entity it was about, when known. */
  entity?: string;
}

export type AskEvent = { type: "thinking"; round: number } | { type: "step"; step: AskStep };

const SLOW_TOOLS = new Set(["knowledge_search", "knowledge_query"]);
const MAX_SLOW = 1;

const REL_WORDS: Record<string, string> = {
  INVESTED_IN: "portfolio",
  PARTICIPATES_IN_FUNDING_ROUND: "funding rounds",
  IS_BOARD_MEMBER_OF: "board",
  FOUNDED: "founders",
  WORKS_AT: "team",
  IS_CEO_OF: "CEO",
  IS_CTO_OF: "CTO",
  IS_EXECUTIVE_OF: "executives",
  PARTICIPATES_IN_CORPORATE_EVENT: "deals",
  PARTICIPATES_IN_EVENT: "events",
  OPERATES_IN_INDUSTRY: "industry",
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Plain-words description of a tool call, and names learned from its result. */
function describe(tool: string, args: Record<string, unknown>, text: string, names: Map<string, string>): { label: string; entity?: string } {
  const data = parseJson(text) as Record<string, unknown> | undefined;
  const quote = (v: unknown) => `“${String(v).slice(0, 60)}${String(v).length > 60 ? "…" : ""}”`;
  if (tool === "entity_search") {
    const ents = (Array.isArray(data?.entities) ? data!.entities : Array.isArray(data) ? data : []) as { id?: string; name?: string }[];
    ents.forEach((e) => e?.id && e?.name && names.set(e.id, e.name));
    return { label: `Looking up ${quote(args.name)}`, entity: ents[0]?.name || String(args.name || "") };
  }
  const id = typeof args.entity_id === "string" ? args.entity_id : undefined;
  const ownName = typeof data?.name === "string" ? data.name : undefined;
  if (id && ownName) names.set(id, ownName);
  const name = ownName || (id ? names.get(id) : undefined);
  if (tool === "entity_introspection") return { label: `Checking what Cala holds on ${name || "a record"}`, entity: name };
  if (tool === "entity_retrieval") {
    const rels = args.relationships as { outgoing?: object; incoming?: object } | undefined;
    const words = [...Object.keys(rels?.outgoing || {}), ...Object.keys(rels?.incoming || {})].map((r) => REL_WORDS[r] || r.toLowerCase().replace(/_/g, " "));
    return { label: `Opening ${name || "a record"}${words.length ? `: ${[...new Set(words)].slice(0, 4).join(", ")}` : ""}`, entity: name };
  }
  if (tool === "entity_lookup") return { label: "Looking up a company by its registry number" };
  if (tool === "knowledge_search") return { label: `Asking Cala's research engine ${quote(args.input)}` };
  if (tool === "knowledge_query") return { label: `Running a structured query ${quote(args.input)}` };
  return { label: tool };
}

export interface AskAnswer {
  answer: string;
  steps: AskStep[];
  model: string;
}

export interface AskContext {
  startupName?: string;
  description?: string;
  competitors?: string[];
  investors?: string[];
}

const SYSTEM =
  "You help a startup founder prepare investor meetings. Answer the founder's question using ONLY facts returned by the " +
  "Cala tools (a knowledge graph of companies, investors, people, funding rounds and events). You have a budget of " +
  "about 8 tool calls, so plan: entity_search to find an entity's id, then entity_retrieval for exactly the properties " +
  "and relationships you need. Call entity_introspection only when you do not know which relationships an entity has. " +
  "Ask for several relationships in one retrieval, and call tools in parallel when they do not depend on each other. " +
  "Useful relationships: companies have incoming FOUNDED, IS_CEO_OF, IS_BOARD_MEMBER_OF, INVESTED_IN and outgoing " +
  "PARTICIPATES_IN_FUNDING_ROUND, PARTICIPATES_IN_CORPORATE_EVENT; investors have outgoing INVESTED_IN, " +
  "PARTICIPATES_IN_FUNDING_ROUND and incoming WORKS_AT; people have outgoing WORKS_AT, FOUNDED, IS_BOARD_MEMBER_OF (e.g. relationships.outgoing.INVESTED_IN, " +
  "relationships.outgoing.PARTICIPATES_IN_FUNDING_ROUND, relationships.incoming.IS_BOARD_MEMBER_OF). Funding rounds are " +
  "entities: retrieve one with relationships.incoming.PARTICIPATES_IN_FUNDING_ROUND to see who took part and who led " +
  "(is_lead). knowledge_query and knowledge_search are slow (20 to 40 seconds each): call at most one of them, and only when the graph cannot answer. Do not guess: if the tools do " +
  "not give the answer, say what is missing. Answer in short Markdown: a direct answer first, then the evidence as " +
  "bullets, naming dates and amounts where the tools gave them. No preamble.";

/** Gemini accepts JSON Schema for tool parameters; strip keys it does not know. */
function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (["$schema", "additionalProperties", "examples", "default", "title", "$defs", "definitions"].includes(k)) continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

function declarations(tools: McpTool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: (t.description || "").slice(0, 1500),
    parametersJsonSchema: cleanSchema(t.inputSchema || { type: "object", properties: {} }),
  }));
}

type Part = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
};

export async function askCala(
  question: string,
  ctx: AskContext,
  calaKey: string,
  signal?: AbortSignal,
  onEvent?: (e: AskEvent) => void,
): Promise<AskAnswer> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not set: the agent needs Gemini to plan its Cala calls.");
  const model = (await geminiModel()) || "gemini-2.5-flash";
  const tools = await calaMcpTools(calaKey, signal);
  if (!tools.length) throw new Error("Cala's MCP server returned no tools.");

  const context = [
    ctx.startupName && `Founder's startup: ${ctx.startupName}`,
    ctx.description && `What it builds: ${ctx.description}`,
    ctx.competitors?.length && `Competitors: ${ctx.competitors.join(", ")}`,
    ctx.investors?.length && `Investors on the meeting list: ${ctx.investors.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const contents: { role: "user" | "model"; parts: Part[] }[] = [
    { role: "user", parts: [{ text: `${context ? `${context}\n\n` : ""}Question: ${question}` }] },
  ];
  const steps: AskStep[] = [];
  const names = new Map<string, string>();
  let slowUsed = 0;

  for (let turn = 0; turn <= MAX_CALLS; turn++) {
    onEvent?.({ type: "thinking", round: turn });
    const lastTurn = turn === MAX_CALLS || steps.length >= MAX_CALLS;
    if (lastTurn) {
      contents.push({
        role: "user",
        parts: [{ text: "Stop calling tools. Answer now, using only what the tools returned above, and say what is missing." }],
      });
    }
    const timeout = AbortSignal.timeout(STEP_TIMEOUT_MS);
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ functionDeclarations: declarations(tools) }],
        // On the last turn the model must answer with what it has.
        toolConfig: { functionCallingConfig: { mode: lastTurn ? "NONE" : "AUTO" } },
        generationConfig: { temperature: 0.2 },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
    const parts = body.candidates?.[0]?.content?.parts || [];
    const calls = lastTurn ? [] : parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const answer = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
      return { answer: answer || "Cala's tools did not return enough to answer this.", steps, model };
    }
    // Keep the model's turn as returned (Gemini 3 needs its thought signatures back).
    contents.push({ role: "model", parts });
    // Independent calls from one turn run in parallel.
    const responses: Part[] = await Promise.all(
      calls.map(async (p): Promise<Part> => {
        const { name, args = {} } = p.functionCall!;
        const started = Date.now();
        let text: string;
        let ok = true;
        if (SLOW_TOOLS.has(name) && slowUsed >= MAX_SLOW) {
          // The research endpoints take 20 to 40 seconds; one per question is enough.
          text = "Not run: the budget for slow research calls is used. Answer from the graph results you have.";
          ok = false;
        } else {
          if (SLOW_TOOLS.has(name)) slowUsed++;
          try {
            const out = await callCalaMcp(calaKey, name, args, signal);
            text = out.text;
            ok = !out.isError;
          } catch (err) {
            text = `Tool failed: ${(err as Error).message}`;
            ok = false;
          }
        }
        const step: AskStep = { tool: name, args, ms: Date.now() - started, ok, preview: text.slice(0, 160), ...describe(name, args, text, names) };
        steps.push(step);
        onEvent?.({ type: "step", step });
        return {
          functionResponse: { name, response: { result: text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}…(truncated)` : text } },
        };
      }),
    );
    contents.push({ role: "user", parts: responses });
  }
  return { answer: "Stopped after the maximum number of Cala calls.", steps, model };
}
