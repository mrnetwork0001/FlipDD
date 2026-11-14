// Cala's logo, as published on cala.ai, linking back to cala.ai.
// `tone="light"` inverts it for dark backgrounds.

export default function CalaLogo({
  height = 16,
  tone = "dark",
  mark = false,
  label,
  className = "",
}: {
  height?: number;
  tone?: "dark" | "light";
  /** Only the brush-stroke mark, without the wordmark. */
  mark?: boolean;
  /** Text shown before the logo, e.g. "Data from". */
  label?: string;
  className?: string;
}) {
  const src = mark ? "/brand/cala-mark.png" : "/brand/cala-logo.png";
  const ratio = mark ? 301 / 300 : 1059 / 399;
  return (
    <a
      href="https://cala.ai"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 transition-opacity hover:opacity-75 ${className}`}
      aria-label={label ? `${label} Cala` : "Cala"}
    >
      {label && <span>{label}</span>}
      {/* A small static file: a plain img avoids next/image resizing it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Cala"
        width={Math.round(height * ratio)}
        height={height}
        className={tone === "light" ? "invert" : undefined}
        style={{ height, width: Math.round(height * ratio) }}
      />
    </a>
  );
}
