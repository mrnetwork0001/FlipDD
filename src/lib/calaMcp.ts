// Minimal client for Cala's own MCP server (https://api.cala.ai/mcp/),
// JSON-RPC over Streamable HTTP. Used by the "Ask Cala" agent, so an LLM can
// walk Cala's graph with Cala's tools directly.

import { REFUSED_MESSAGE } from "./cala";

const ENDPOINT = "https://api.cala.ai/mcp/";
const TIMEOUT_MS = 90_000;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

let seq = 0;
const memo = globalThis as unknown as { __calaMcpTools?: { at: number; tools: McpTool[] } };

async function rpc<T>(apiKey: string, method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error(REFUSED_MESSAGE);
  if (!res.ok) throw new Error(`Cala MCP ${res.status}: ${text.slice(0, 200)}`);
  // The server answers as an event stream: "event: message\ndata: {...}".
  const payload = text.trim().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
  const body = JSON.parse(payload) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`Cala MCP: ${body.error.message || "error"}`);
  return body.result as T;
}

/** Cala's MCP tools (cached for 10 minutes). */
export async function calaMcpTools(apiKey: string, signal?: AbortSignal): Promise<McpTool[]> {
  const hit = memo.__calaMcpTools;
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.tools;
  const out = await rpc<{ tools: McpTool[] }>(apiKey, "tools/list", undefined, signal);
  memo.__calaMcpTools = { at: Date.now(), tools: out.tools || [] };
  return memo.__calaMcpTools.tools;
}

/** Calls one Cala MCP tool and returns its text content. */
export async function callCalaMcp(
  apiKey: string,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ text: string; isError: boolean }> {
  const out = await rpc<{ content?: { type: string; text?: string }[]; isError?: boolean; structuredContent?: unknown }>(
    apiKey,
    "tools/call",
    { name, arguments: args },
    signal,
  );
  const text =
    (out.content || [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n") || (out.structuredContent ? JSON.stringify(out.structuredContent) : "");
  return { text, isError: Boolean(out.isError) };
}
