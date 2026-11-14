// Company-name helpers shared by the engine and the Slush check.

export const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
export const tokens = (s: string) => strip(s).split(/[^a-z0-9]+/).filter(Boolean);
export const exactKey = (s: string) => tokens(s).join("");

const LEGAL = new Set([
  "oy", "oyj", "ab", "ltd", "limited", "inc", "gmbh", "sl", "ky", "llc", "llp", "plc", "sa", "as",
  "aps", "bv", "ag", "corp", "corporation", "co", "holding", "holdings", "sarl", "scsp", "sas",
  "kommanditbolag", "aktiebolag", "sociedad", "unipersonal", "publ", "ou", "se", "nv", "kg", "ug",
]);

export const coreTokens = (s: string) => {
  const all = tokens(s);
  const core = all.filter((t) => !LEGAL.has(t));
  return core.length ? core : all;
};

/** Name without legal suffixes, as one key: "Finadeck Oy" -> "finadeck". */
export const coreKey = (s: string) => coreTokens(s).join("");

/** Do two company names refer to the same company? */
export function sameCompany(a: string, b: string): "exact" | "prefix" | null {
  const ta = coreTokens(a);
  const tb = coreTokens(b);
  if (!ta.length || !tb.length) return null;
  if (ta.join("") === tb.join("")) return "exact";
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const isPrefix = short.every((t, i) => long[i] === t);
  if (isPrefix && short.join("").length >= 3 && long.length - short.length <= 3) return "prefix";
  return null;
}
