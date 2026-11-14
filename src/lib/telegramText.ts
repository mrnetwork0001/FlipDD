// Telegram text helpers, free of imports so they can be unit-tested (tests/telegram.test.ts).

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Cala's Markdown answers → the small HTML subset Telegram accepts. */
export function mdToTelegram(md: string): string {
  return md
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) return ""; // table divider rows
      let l = esc(line);
      l = l.replace(/^#{1,4}\s+(.*)$/, "<b>$1</b>");
      l = l.replace(/^\s*[-*]\s+/, "• ");
      l = l.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      l = l.replace(/`([^`]+)`/g, "<code>$1</code>");
      l = l.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
      l = l.replace(/^\s*\|(.*)\|\s*$/, (_m, row: string) => row.split("|").map((c) => c.trim()).join(" · "));
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseCheck(text: string): { investors: string[]; competitors: string[]; description: string } | null {
  const [main, description = ""] = text.split("|");
  const m = main.match(/^(.*?)\s+(?:vs\.?|versus|against)\s+(.*)$/i);
  if (!m) return null;
  const list = (s: string) =>
    s
      .split(/[,\n;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const investors = list(m[1]).slice(0, 12);
  const competitors = list(m[2]).slice(0, 6);
  if (!investors.length || !competitors.length) return null;
  return { investors, competitors, description: description.trim().slice(0, 400) };
}

