// The FlipDD logo: two overlapping squares and the wordmark. "light" is the
// version for dark backgrounds (cream lettering, the red square unchanged).

/* eslint-disable @next/next/no-img-element */
export default function FlipLogo({ height = 28, tone = "dark", className = "" }: { height?: number; tone?: "dark" | "light"; className?: string }) {
  const width = Math.round(height * (720 / 199));
  return (
    <img
      src={tone === "light" ? "/brand/flipdd-header-light.png" : "/brand/flipdd-header.png"}
      alt="FlipDD"
      width={width}
      height={height}
      style={{ height, width }}
      className={className}
    />
  );
}
