// The phone line's work in progress. A call can't wait on one HTTP request
// for a minute, so the check (or question) runs in the background while the
// call holds, polling every few seconds. The job's state is kept in memory and
// in the shared store, so a poll that lands on another serverless instance
// still finds it.

import { waitUntil } from "@vercel/functions";
import { askCala, type AskContext } from "./askAgent";
import { cacheRead, cacheWrite } from "./store";
import { analyze } from "./engine";
import { computeRoundRisk } from "./roundRisk";
import type { InvestorResult, SlushReport } from "./types";
import type { SpokenRequest } from "./voice";
import { speakable, spokenRoundup } from "./voiceScript";

export interface PhoneJob {
  state: "running" | "done" | "failed";
  /** What to say when done (or why it failed). */
  speech: string;
  started: number;
  t: number;
  /** The last check on this call, so follow-up questions know the context. */
  context: AskContext;
}

const g = globalThis as unknown as { __flipddPhone?: Map<string, PhoneJob> };
const jobs = (g.__flipddPhone ??= new Map());

function prune() {
  const old = Date.now() - 60 * 60 * 1000;
  for (const [k, j] of jobs) if (j.started < old) jobs.delete(k);
}

const persist = (callSid: string, job: PhoneJob) => cacheWrite("phone", callSid.replace(/\W/g, ""), { ...job, t: Date.now() }, 3600);

export async function phoneJob(callSid: string): Promise<PhoneJob | undefined> {
  const local = jobs.get(callSid);
  if (local && local.state !== "running") return local;
  return (await cacheRead<PhoneJob>("phone", callSid.replace(/\W/g, ""))) || local;
}

export async function startPhoneJob(callSid: string, request: SpokenRequest): Promise<PhoneJob> {
  prune();
  const previous = await phoneJob(callSid);
  const apiKey = process.env.CALA_API_KEY || "";
  const context: AskContext =
    request.kind === "check"
      ? { investors: request.investors, competitors: request.competitors, description: request.description }
      : previous?.context || {};
  const job: PhoneJob = { state: "running", speech: "", started: Date.now(), t: Date.now(), context };
  jobs.set(callSid, job);
  await persist(callSid, job);
  const timeout = AbortSignal.timeout(4 * 60 * 1000);

  const work = (async () => {
    if (!apiKey) throw new Error("the server has no Cala key configured");
    if (request.kind === "check") {
      const latest = new Map<string, InvestorResult>();
      let slush: SlushReport | undefined;
      let failure = "";
      await analyze(
        { startupName: "", description: request.description, competitors: request.competitors, investors: request.investors },
        (e) => {
          if (e.type === "investor") latest.set(e.data.input, e.data);
          if (e.type === "slush") slush = e.data;
          if (e.type === "error") failure = e.message;
        },
        apiKey,
        timeout,
      );
      if (failure) throw new Error(failure);
      const rows = request.investors.map((n) => latest.get(n)).filter((r): r is InvestorResult => Boolean(r));
      if (!rows.length) throw new Error("none of those investors came back from Cala");
      job.speech = spokenRoundup(rows, computeRoundRisk(rows, slush));
    } else {
      const out = await askCala(request.question, context, apiKey, timeout);
      const spoken = speakable(out.answer);
      job.speech = spoken.length > 1400 ? `${spoken.slice(0, spoken.lastIndexOf(".", 1400) + 1)} The full answer is in the FlipDD app.` : spoken;
    }
    job.state = "done";
  })()
    .catch((err: Error) => {
      job.state = "failed";
      job.speech = `Sorry, that didn't work: ${err.message}.`;
    })
    .then(() => persist(callSid, job));
  waitUntil(work);
  return job;
}
