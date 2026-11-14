import { phoneJob, startPhoneJob } from "@/lib/phoneCall";
import { gather, hangup, pause, redirect, response, say, validTwilioSignature } from "@/lib/twiml";
import { interpretSpoken } from "@/lib/voice";
import { andList, isGoodbye, speechChunks } from "@/lib/voiceScript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long enough for the background check (waitUntil) to finish on serverless hosts.
export const maxDuration = 300;

// FlipDD's phone line. Point a Twilio number's "A call comes in" webhook at
// POST {FLIPDD_PUBLIC_URL}/api/voice/twilio. The caller says who they're
// meeting and against whom (or asks a question); the call holds while the
// check runs, then reads the result and listens for the next question.
//   ?step=heard  Twilio's speech result arrives here
//   ?step=wait   polled while the job runs

const SELF = "/api/voice/twilio";
const HINTS = [
  "Creandum", "Northzone", "Index Ventures", "Accel", "Atomico", "Balderton", "EQT Ventures", "Lakestar", "Earlybird",
  "Cherry Ventures", "Point Nine", "Speedinvest", "Maki", "Inventure", "Sequoia", "Benchmark", "General Catalyst",
  "a16z", "Andreessen Horowitz", "Lightspeed", "Kinnevik", "Lovable", "Legora", "Personio", "versus", "competitor",
];
const WAITING = ["Still checking.", "Cala is reading the portfolios.", "Nearly there.", "Still working on it.", "Checking co-investors."];

const twiml = (xml: string) => new Response(xml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });

const listen = (lead: string[], hints: string[] = []) =>
  gather(`${SELF}?step=heard`, lead, [...new Set([...hints, ...HINTS])]);

/** The URLs Twilio may have signed: the public URL, or the host the proxy forwarded. */
function signedUrls(req: Request): string[] {
  const u = new URL(req.url);
  const tail = `${u.pathname}${u.search}`;
  const out: string[] = [];
  const pub = process.env.FLIPDD_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (pub) out.push(`${pub}${tail}`);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) out.push(`${req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${host}${tail}`);
  out.push(req.url);
  return out;
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  form?.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });

  // Only Twilio may drive the line (when TWILIO_AUTH_TOKEN is set), and only
  // listed callers may use it (when TWILIO_ALLOWED_CALLERS is set): each call runs real Cala queries.
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (token && !signedUrls(req).some((url) => validTwilioSignature(token, url, params, req.headers.get("x-twilio-signature")))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const allowed = process.env.TWILIO_ALLOWED_CALLERS?.split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed?.length && !allowed.includes(params.From || "")) {
    return twiml(response(say(["This FlipDD line is private. Goodbye."]), hangup()));
  }

  const step = new URL(req.url).searchParams.get("step");
  const callSid = params.CallSid || "local";

  if (step === "heard") {
    const heard = (params.SpeechResult || "").trim();
    const retry = Number(new URL(req.url).searchParams.get("retry") || 0);
    if (!heard) {
      if (retry >= 1) return twiml(response(say(["I didn't hear anything. Call back any time. Goodbye."]), hangup()));
      return twiml(
        response(
          gather(`${SELF}?step=heard&retry=1`, ["Sorry, I didn't catch that. Who are you meeting, and who is your competitor?"], HINTS),
          redirect(`${SELF}?step=heard&retry=1`),
        ),
      );
    }
    if (isGoodbye(heard)) return twiml(response(say(["Good luck at Slush. Goodbye."]), hangup()));
    const request = await interpretSpoken(heard);
    if (request.kind === "ask" && request.question.length < 5) {
      return twiml(response(listen(["Sorry, say that again?"])));
    }
    await startPhoneJob(callSid, request);
    const ack =
      request.kind === "check"
        ? `Checking ${andList(request.investors)} against ${andList(request.competitors)} in Cala's graph. A first check takes about a minute; stay on the line.`
        : `Asking Cala's graph: ${request.question.replace(/[.!?\s]+$/, "")}. This takes up to a minute.`;
    return twiml(response(say([ack]), pause(4), redirect(`${SELF}?step=wait&n=1`)));
  }

  if (step === "wait") {
    const n = Number(new URL(req.url).searchParams.get("n") || 1);
    const job = await phoneJob(callSid);
    if (!job) return twiml(response(listen(["I lost track of that. Who are you meeting, and who is your competitor?"])));
    if (job.state === "running") {
      if (n > 40) return twiml(response(say(["This is taking too long. Try again in a few minutes, or use the FlipDD app. Goodbye."]), hangup()));
      // A short line every other poll, so the caller knows the line is alive.
      const line = n % 2 === 0 ? say([WAITING[(n / 2) % WAITING.length]]) : "";
      return twiml(response(line, pause(5), redirect(`${SELF}?step=wait&n=${n + 1}`)));
    }
    const hints = [...(job.context.investors || []), ...(job.context.competitors || [])];
    return twiml(
      response(
        say(speechChunks(job.speech, 600)),
        pause(1),
        listen(["Anything else? Ask about any fund or company, check another list, or say goodbye."], hints),
        say(["Goodbye."]),
        hangup(),
      ),
    );
  }

  // Incoming call
  return twiml(
    response(
      listen([
        "Hi, this is FlipDD. Tell me who you're meeting and who your competitor is. For example: I'm meeting Creandum and Northzone, my competitor is Lovable. Or ask anything about a fund.",
      ]),
      say(["I didn't hear anything. Call back any time. Goodbye."]),
      hangup(),
    ),
  );
}

/** Lets you open the URL in a browser to see the greeting TwiML. */
export async function GET(req: Request) {
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body: new URLSearchParams() }));
}
