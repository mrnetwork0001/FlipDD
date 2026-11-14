// FlipDD on Telegram: the same check and the same Ask Cala agent, answered in
// chat. Messages arrive through /api/telegram, either from Telegram's webhook
// (when deployed) or from scripts/telegram.mjs (long polling, for local use).

import { askCala } from "./askAgent";
import { analyze } from "./engine";
import { computeRoundRisk } from "./roundRisk";
import { LEVEL_LABEL, LEVEL_RANK, type InvestorResult, type SlushReport } from "./types";
import { esc, mdToTelegram, parseCheck } from "./telegramText";
import fs from "fs/promises";
import path from "path";
import { DATA_ROOT } from "./store";
import { interpretSpoken, synthesize, toOggOpus, transcribe, wavSeconds } from "./voice";
import { speakable, spokenRoundup } from "./voiceScript";

export { mdToTelegram, parseCheck } from "./telegramText";

const API = "https://api.telegram.org";
const MAX_MESSAGE = 3900; // Telegram allows 4096; leave room for tags

/** TELEGRAM_DRY_RUN=1: replies are written to <data dir>/telegram-dry.log instead of being sent. */
const dryRun = () => process.env.TELEGRAM_DRY_RUN === "1";
export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || (dryRun() ? "dry-run" : undefined);

export async function tg(method: string, body: Record<string, unknown>): Promise<unknown> {
  if (dryRun()) {
    if (method !== "sendChatAction") {
      await fs.appendFile(
        path.join(DATA_ROOT, "telegram-dry.log"),
        `--- ${new Date().toISOString()} ${method} chat=${body.chat_id}\n${String(body.text || "")}\n\n`,
      );
    }
    return {};
  }
  const token = telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown } | null;
  if (!out?.ok) throw new Error(`Telegram ${method}: ${out?.description || res.status}`);
  return out.result;
}

/** Multipart upload (sendVoice). In dry-run mode the file is saved next to the log instead. */
async function tgUpload(method: string, fields: Record<string, string>, file: { field: string; name: string; type: string; data: Buffer }) {
  if (dryRun()) {
    const out = path.join(DATA_ROOT, `telegram-dry-${Date.now()}-${file.name}`);
    await fs.writeFile(out, file.data);
    await fs.appendFile(path.join(DATA_ROOT, "telegram-dry.log"), `--- ${new Date().toISOString()} ${method} chat=${fields.chat_id}\n[${file.data.length} bytes → ${out}]\n\n`);
    return {};
  }
  const token = telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(file.field, new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", body: form });
  const out = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: unknown } | null;
  if (!out?.ok) throw new Error(`Telegram ${method}: ${out?.description || res.status}`);
  return out.result;
}

/** Downloads a file the user sent (a voice note). */
async function tgDownload(fileId: string): Promise<Buffer> {
  const file = (await tg("getFile", { file_id: fileId })) as { file_path?: string; file_size?: number };
  if (!file.file_path) throw new Error("Telegram didn't return the voice note.");
  if ((file.file_size || 0) > 18 * 1024 * 1024) throw new Error("That voice note is too long. Keep it under a minute.");
  const res = await fetch(`${API}/file/bot${telegramToken()}/${file.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Couldn't download the voice note (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Reads `text` out as a Telegram voice message. Quietly skipped if TTS or ffmpeg is unavailable. */
async function sendSpoken(chatId: number, text: string): Promise<void> {
  try {
    await tg("sendChatAction", { chat_id: chatId, action: "record_voice" }).catch(() => undefined);
    const wav = await synthesize(text);
    if (!wav) return;
    const ogg = await toOggOpus(wav);
    if (!ogg) {
      console.warn("[telegram] ffmpeg not available: voice reply skipped");
      return;
    }
    await tgUpload("sendVoice", { chat_id: String(chatId), duration: String(wavSeconds(wav)) }, { field: "voice", name: "flipdd.ogg", type: "audio/ogg", data: ogg });
  } catch (err) {
    console.warn(`[telegram] voice reply failed: ${(err as Error).message}`);
  }
}

/** Sends a long message in parts that fit Telegram's limit, breaking at blank lines. */
export async function sendLong(chatId: number | string, html: string): Promise<void> {
  const parts: string[] = [];
  let current = "";
  for (const block of html.split("\n\n")) {
    if ((current + "\n\n" + block).length > MAX_MESSAGE && current) {
      parts.push(current);
      current = block;
    } else current = current ? `${current}\n\n${block}` : block;
  }
  if (current) parts.push(current);
  for (const p of parts) {
    await tg("sendMessage", { chat_id: chatId, text: p.slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
}

const HELP =
  "<b>FlipDD</b> checks the investors you are meeting against your competitors, using Cala's knowledge graph.\n\n" +
  "<b>Check a meeting list</b>\n<code>/check Creandum, Northzone, Index Ventures vs Lovable</code>\n" +
  "Add what you build after a | to also search Slush 2026 and find clean investors:\n" +
  "<code>/check Creandum, Northzone vs Lovable | AI app builder for product teams</code>\n\n" +
  "<b>Ask anything about a fund or company</b>\n<code>/ask Who sits on Lovable's board?</code>\n" +
  "or just type the question.\n\n" +
  "<b>Or send a voice note</b>\n“I'm meeting Creandum, Northzone and Index. My competitor is Lovable.”\n" +
  "You get the answer in text and as a voice message.\n\n" +
  "Every answer comes from Cala's records, with sources in the web app.";

function formatCheck(rows: InvestorResult[], competitors: string[], slush?: SlushReport): string {
  const risk = computeRoundRisk(rows, slush);
  const out: string[] = [
    `<b>FlipDD · ${rows.length} investor${rows.length === 1 ? "" : "s"} vs ${esc(competitors.join(", "))}</b>`,
    `Round exposure <b>${risk.score}/100</b> (${risk.grade}). ${esc(risk.headline)}`,
  ];
  if (risk.hubs[0]) out[out.length - 1] += `\n${esc(risk.hubs[0].via)} ties ${esc(risk.hubs[0].investors.join(" and "))} to ${esc(risk.hubs[0].competitors.join(", "))}.`;
  const sorted = [...rows].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  for (const r of sorted) {
    const lines = [`<b>${esc(r.name)}</b> · ${esc(LEVEL_LABEL[r.level])}`, esc(r.headline)];
    for (const t of r.people || []) lines.push(`Person: ${esc(t.text)}`);
    lines.push(`Share: <i>${esc(r.share.level)}</i>`);
    if (r.level !== "clear" && r.level !== "unresolved") lines.push(`Ask: “${esc(r.ask.question)}”`);
    out.push(lines.join("\n"));
  }
  if (risk.order.length) {
    out.push(`<b>Meeting order</b>\n${risk.order.map((o, i) => `${i + 1}. ${esc(o.title)}: ${esc(o.investors.join(", "))}`).join("\n")}`);
  }
  if (slush?.namedAttending.length) {
    out.push(`<b>${esc(slush.event.name)}</b>: ${esc(slush.namedAttending.map((a) => a.name).join(", "))} will be there.`);
  }
  const url = process.env.FLIPDD_PUBLIC_URL?.trim();
  if (url) out.push(`Full report with sources: ${esc(url.replace(/\/$/, ""))}/app`);
  return out.join("\n\n");
}

interface CheckRequest {
  investors: string[];
  competitors: string[];
  description: string;
}

async function runCheck(chatId: number, text: string | CheckRequest, voice = false): Promise<void> {
  const parsed = typeof text === "string" ? parseCheck(text) : text;
  if (!parsed) {
    await sendLong(chatId, "Write it as:\n<code>/check Creandum, Northzone vs Lovable</code>");
    return;
  }
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey) throw new Error("CALA_API_KEY is not set");
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `Checking <b>${parsed.investors.length}</b> investor${parsed.investors.length === 1 ? "" : "s"} against <b>${esc(parsed.competitors.join(", "))}</b> in Cala's graph. First checks take a minute or two; repeats are quick.`,
  });
  const typing = setInterval(() => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined), 4500);
  const latest = new Map<string, InvestorResult>();
  let slush: SlushReport | undefined;
  let failure = "";
  try {
    await analyze(
      { startupName: "", description: parsed.description, competitors: parsed.competitors, investors: parsed.investors },
      (e) => {
        if (e.type === "investor") latest.set(e.data.input, e.data);
        if (e.type === "slush") slush = e.data;
        if (e.type === "error") failure = e.message;
      },
      apiKey,
    );
  } finally {
    clearInterval(typing);
  }
  if (failure) {
    await sendLong(chatId, `The check stopped: ${esc(failure)}`);
    return;
  }
  const rows = parsed.investors.map((n) => latest.get(n)).filter((r): r is InvestorResult => Boolean(r));
  await sendLong(chatId, formatCheck(rows, parsed.competitors, slush));
  if (voice && rows.length) await sendSpoken(chatId, spokenRoundup(rows, computeRoundRisk(rows, slush)));
}

async function runAsk(chatId: number, question: string, voice = false): Promise<void> {
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey) throw new Error("CALA_API_KEY is not set");
  await tg("sendMessage", { chat_id: chatId, text: "Asking Cala's graph. This takes 20 to 60 seconds." });
  const typing = setInterval(() => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined), 4500);
  let calls = 0;
  try {
    const out = await askCala(question, {}, apiKey, undefined, (e) => {
      if (e.type === "step") calls++;
    });
    await sendLong(chatId, `${mdToTelegram(out.answer)}\n\n<i>${calls} Cala call${calls === 1 ? "" : "s"} via Cala's MCP server.</i>`);
    if (voice) {
      clearInterval(typing);
      await sendSpoken(chatId, speakable(out.answer));
    }
  } finally {
    clearInterval(typing);
  }
}

/** A voice note: transcribe it, say what was heard, then check or ask, and answer in text and voice. */
async function runVoice(chatId: number, fileId: string, mime: string): Promise<void> {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const audio = await tgDownload(fileId);
  const heard = await transcribe(audio, mime);
  if (!heard) {
    await tg("sendMessage", { chat_id: chatId, text: "I couldn't make out that voice note. Try again, or type it." });
    return;
  }
  const request = await interpretSpoken(heard);
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `Heard: <i>“${esc(heard)}”</i>${
      request.kind === "check"
        ? `\nChecking <b>${esc(request.investors.join(", "))}</b> against <b>${esc(request.competitors.join(", "))}</b>.`
        : ""
    }`,
  });
  if (request.kind === "check") await runCheck(chatId, request, true);
  else if (request.question.length >= 5) await runAsk(chatId, request.question, true);
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string };
    voice?: { file_id: string; duration?: number; mime_type?: string };
    audio?: { file_id: string; duration?: number; mime_type?: string };
  };
}

/** Handles one incoming message. Errors are reported back to the chat. */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat.id;
  const text = msg?.text?.trim();
  const note = msg?.voice || msg?.audio;
  if (!chatId || (!text && !note)) return;
  const allowed = process.env.TELEGRAM_ALLOWED_CHATS?.split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed?.length && !allowed.includes(String(chatId))) {
    await tg("sendMessage", { chat_id: chatId, text: "This FlipDD bot is private." });
    return;
  }
  if (note) {
    try {
      if ((note.duration || 0) > 120) await tg("sendMessage", { chat_id: chatId, text: "Keep voice notes under two minutes." });
      else await runVoice(chatId, note.file_id, note.mime_type || "audio/ogg");
    } catch (err) {
      await tg("sendMessage", { chat_id: chatId, text: `Sorry, that failed: ${(err as Error).message}`.slice(0, 4000) }).catch(() => undefined);
    }
    return;
  }
  if (!text) return;
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  try {
    if (/^\/(start|help)(@\w+)?$/i.test(cmd)) await sendLong(chatId, HELP);
    else if (/^\/check(@\w+)?$/i.test(cmd)) await runCheck(chatId, arg);
    else if (/^\/ask(@\w+)?$/i.test(cmd)) {
      if (arg.length < 5) await sendLong(chatId, "Ask a question, e.g. <code>/ask Who led Lovable's Series B?</code>");
      else await runAsk(chatId, arg);
    } else if (text.startsWith("/")) await sendLong(chatId, HELP);
    else if (parseCheck(text)) await runCheck(chatId, text);
    else await runAsk(chatId, text);
  } catch (err) {
    await tg("sendMessage", { chat_id: chatId, text: `Sorry, that failed: ${(err as Error).message}`.slice(0, 4000) }).catch(() => undefined);
  }
}
