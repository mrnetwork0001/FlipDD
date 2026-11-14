// Which Cala key a request runs on: the visitor's own (sent as x-cala-key from
// the app, kept only in their browser) or FlipDD's. A visitor's key is never
// stored or logged on the server, and answers already in the shared cache cost
// it nothing: it is only spent on records nobody has fetched yet.

export const USER_KEY_HEADER = "x-cala-key";
const KEY_RE = /^clsk_[A-Za-z0-9_-]{20,120}$/;

export function calaKeyFor(req: Request): string | undefined {
  const own = req.headers.get(USER_KEY_HEADER)?.trim();
  if (own && KEY_RE.test(own)) return own;
  const k = process.env.CALA_API_KEY?.trim();
  return k && k !== "your_cala_api_key_here" ? k : undefined;
}
