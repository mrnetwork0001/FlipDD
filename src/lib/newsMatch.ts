// Rules for reading news text, kept free of imports so they can be unit-tested
// on their own (see tests/).

/** Words that only appear when a round, or a fund's own raise, is the subject. */
export const FUNDING_STRONG =
  /\b(rais(?:es|ed|ing)\s+(?:[$€£]|\d|a\s|an\s|new|its|seed|series)|funding\s+round|financing\s+round|series\s+[a-h]\b|seed\s+round|pre-seed|led\s+by|co-led|valuation|valued\s+at|tender\s+offer|closes?\s+[$€£]?\d)/i;

export const FUNDING =
  /\b(rais(?:e|es|ed|ing)|funding|financing|series\s+[a-h]\b|seed\s+round|pre-seed|round|led\s+by|co-led|backed\s+by|invest(?:s|ed|ment|or|ors)?|valuation|valued\s+at|tender\s+offer|secondary|acquir(?:e|es|ed|es)|stake)\b/i;

// Words that are fine inside a fund's name but too common to match alone.
const FUND_WORDS =
  /\b(ventures?|capital|partners|vc|fund|funds|management|investments?|group|holdings?|advisors|equity|growth|labs?)\b|\.vc\b/gi;
const COMMON = new Set(
  "index general first point light north south east west spark union open true lead base play life one next new blue black red green gold silver bridge alpha beta prime frontier future summit".split(
    " ",
  ),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ways a name can appear in an article: "Balderton Capital" also matches "Balderton". */
export function matcher(name: string): (text: string) => boolean {
  const full = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}(?=$|[^\\p{L}\\p{N}])`, "iu");
  const core = name.replace(FUND_WORDS, " ").replace(/\s+/g, " ").trim();
  const useCore = core.length >= 4 && core.toLowerCase() !== name.toLowerCase() && !COMMON.has(core.toLowerCase());
  // A shortened name must keep its capital letters, so "Atomico" matches but common words do not.
  const short = useCore ? new RegExp(`(^|[^\\p{L}\\p{N}])${escape(core)}(?=$|[^\\p{L}\\p{N}])`, "u") : null;
  return (text) => full.test(text) || Boolean(short?.test(text));
}

