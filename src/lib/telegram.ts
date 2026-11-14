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
import { elevenKey, elevenOpus } from "./elevenlabs";
import { meetingPrep, type MeetingPrep } from "./prep";
import { cacheRead, cacheWrite } from "./store";
import { coreKey } from "./names";
import type { CompetitorSummary } from "./types";

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
    if (elevenKey()) {
      try {
        const ogg = await elevenOpus(text);
        // 64 kbps Opus: about 8 KB a second.
        await tgUpload("sendVoice", { chat_id: String(chatId), duration: String(Math.max(1, Math.round(ogg.length / 8000))) }, { field: "voice", name: "flipdd.ogg", type: "audio/ogg", data: ogg });
        return;
      } catch (err) {
        console.warn(`[telegram] ElevenLabs voice failed, trying Gemini: ${(err as Error).message}`);
      }
    }
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
  "<b>Get a meeting note for one investor</b>\n<code>/prep Creandum</code>\nWho you'll likely meet, what they know about your competitor, what to ask and what to hold back. Text and voice.\n\n" +
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
  // Finish before the host's 300 s limit; the cache keeps what was fetched.
  const budget = AbortSignal.timeout(Number(process.env.CHECK_BUDGET_MS || 250_000));
  const latest = new Map<string, InvestorResult>();
  const comps = new Map<string, CompetitorSummary>();
  let slush: SlushReport | undefined;
  let failure = "";
  try {
    await analyze(
      { startupName: "", description: parsed.description, competitors: parsed.competitors, investors: parsed.investors },
      (e) => {
        if (e.type === "investor") latest.set(e.data.input, e.data);
        if (e.type === "competitor") comps.set(e.data.input, e.data);
        if (e.type === "slush") slush = e.data;
        if (e.type === "error") failure = e.message;
      },
      apiKey,
      budget,
    );
  } finally {
    clearInterval(typing);
  }
  if (!failure && budget.aborted) failure = "Cala's rate limit slowed this check down, so it stopped before giving answers. What was fetched is saved: send the same /check again to finish it.";
  if (failure) {
    await sendLong(chatId, `The check stopped: ${esc(failure)}`);
    return;
  }
  const rows = parsed.investors.map((n) => latest.get(n)).filter((r): r is InvestorResult => Boolean(r));
  await cacheWrite("tgctx", String(chatId), { t: Date.now(), rows, competitors: [...comps.values()], description: parsed.description }, 7 * 86400);
  const firstResolved = rows.find((r) => r.resolved);
  await sendLong(chatId, formatCheck(rows, parsed.competitors, slush) + (firstResolved ? `\n\nMeeting note for one of them: <code>/prep ${esc(firstResolved.name)}</code>` : ""));
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

interface ChatContext { t: number; rows: InvestorResult[]; competitors: CompetitorSummary[]; description: string }

const HOLD_BACK: Record<string, string[]> = {
  "Teaser only": ["customer names", "revenue figures", "roadmap", "data room"],
  "Deck without customer names": ["customer names", "detailed roadmap"],
  "Full data room": [],
};
const money = (v: number, units = "USD") => {
  const sym = units === "USD" ? "$" : units === "EUR" ? "€" : units === "GBP" ? "£" : `${units} `;
  return v >= 1e9 ? `${sym}${(v / 1e9).toFixed(2).replace(/\.?0+$/, "")}B` : v >= 1e6 ? `${sym}${Math.round(v / 1e6)}M` : `${sym}${Math.round(v / 1e3)}K`;
};
const mon = (d: string) => new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const SIGNAL = { several: "Not a blocker", one: "Expect the comparison", none: "First bet in your space" } as const;

function prepSummary(r: InvestorResult, p: MeetingPrep): { html: string; spoken: string } {
  const lead = p.team.current[0];
  const past = lead?.past.find((x) => x.role);
  const hold = HOLD_BACK[r.share.level] || [];
  const stake = `${SIGNAL[p.space.signal]}. ${p.space.text.split(/(?<=\.)\s/)[0]}`;
  const lines = [`<b>Meeting prep · ${esc(p.investor)}</b>`, `<b>In 30 seconds</b>`, `• Their stake: ${esc(stake)}`];
  if (lead) lines.push(`• Likely across the table: <b>${esc(lead.name)}</b>${lead.role ? `, ${esc(lead.role)}` : ""}${past ? `. Was ${esc(past.role || "")} at ${esc(past.org)}.` : ""}`);
  if (r.ask.question) lines.push(`• Ask: “${esc(r.ask.question)}”`);
  if (hold.length) lines.push(`• Hold back: ${esc(hold.join(", "))}`);
  const out = [lines.join("\n")];
  for (const rv of p.rivals.filter((x) => x.arr.length || x.headcount.length || x.totalFunding)) {
    const bits = [rv.stage, rv.totalFunding ? `${money(rv.totalFunding.value, rv.totalFunding.units)} raised` : ""].filter(Boolean);
    if (rv.arr.length) bits.push(`ARR ${rv.arr.map((x) => `${money(x.value, rv.arrUnits || "USD")} (${mon(x.date)})`).join(" → ")}`);
    if (rv.headcount.length) bits.push(`people ${rv.headcount.map((x) => Math.round(x.value)).join(" → ")}`);
    out.push(`<b>What they know about ${esc(rv.name)}</b>\n${esc(bits.join(" · "))}`);
  }
  if (p.style) out.push(`<b>How they invest</b>\n${esc(p.style.stages.map((s) => `${s.label} ×${s.count}`).join(", "))}. Led ${p.style.led} of their last ${p.style.roundsSeen}.${p.style.medianRound ? ` Typical round ${money(p.style.medianRound.value, p.style.medianRound.units)}.` : ""}`);
  const others = p.team.current.slice(1, 3).map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}`);
  if (others.length) out.push(`<b>Also on the team</b>\n${esc(others.join(", "))}`);
  const url = process.env.FLIPDD_PUBLIC_URL?.trim();
  if (url) out.push(`Full note, with sources and your own notes: ${esc(url.replace(/\/$/, ""))}/app`);
  const spoken = [
    `${p.investor}. ${stake}`,
    lead ? `Likely across the table: ${lead.name}${lead.role ? `, ${lead.role}` : ""}${past ? `, who was ${past.role} at ${past.org}` : ""}.` : "",
    r.ask.question ? `Ask them: ${r.ask.question}` : "",
    hold.length ? `Hold back ${hold.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  return { html: out.join("\n\n"), spoken };
}

/** /prep <investor>: the meeting note for one investor from the chat's last check. */
async function runPrep(chatId: number, name: string): Promise<void> {
  const ctx = await cacheRead<ChatContext>("tgctx", String(chatId));
  if (!ctx?.rows?.length) {
    await sendLong(chatId, "Run a check first, then ask for a note:\n<code>/check Creandum, Northzone vs Lovable</code>\n<code>/prep Creandum</code>");
    return;
  }
  const key = coreKey(name);
  const r = ctx.rows.find((x) => coreKey(x.name) === key || coreKey(x.input) === key) || ctx.rows.find((x) => coreKey(x.name).includes(key) || key.includes(coreKey(x.name)));
  if (!r || !r.resolved) {
    await sendLong(chatId, `No ${esc(name)} in your last check. Your list: ${esc(ctx.rows.map((x) => x.name).join(", "))}.`);
    return;
  }
  const apiKey = process.env.CALA_API_KEY;
  if (!apiKey) throw new Error("CALA_API_KEY is not set");
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const prep = await meetingPrep({ investor: r, competitors: ctx.competitors || [], startupName: "" }, apiKey);
  const { html, spoken } = prepSummary(r, prep);
  await sendLong(chatId, html);
  await sendSpoken(chatId, spoken);
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
    else if (/^\/prep(@\w+)?$/i.test(cmd)) {
      if (!arg) await sendLong(chatId, "Which investor? e.g. <code>/prep Creandum</code>");
      else await runPrep(chatId, arg);
    }
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
