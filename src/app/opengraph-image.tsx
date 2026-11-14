// The link preview shown when FlipDD is shared (Slack, X, LinkedIn, Discord,
// Devpost): the cover illustration with the logo and headline set in real type.
import fs from "fs";
import path from "path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "FlipDD: some investors on your list already backed your competitor.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const dataUri = (file: string, mime: string) =>
  `data:${mime};base64,${fs.readFileSync(path.join(process.cwd(), file)).toString("base64")}`;

export default function Image() {
  const cover = dataUri("public/brand/art/cover-2.jpg", "image/jpeg");
  const logo = dataUri("public/brand/flipdd-header.png", "image/png");
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#F4F1E8", position: "relative" }}>
        {/* 1600x900 cover, scaled to the card's width and nudged down so the people stay in frame */}
        <img src={cover} width={1200} height={675} style={{ position: "absolute", left: 0, top: -30 }} />
        <div style={{ position: "absolute", left: 64, top: 58, display: "flex", flexDirection: "column", width: 520 }}>
          <img src={logo} width={196} height={54} />
          <div
            style={{
              marginTop: 44,
              fontSize: 54,
              lineHeight: 1.06,
              letterSpacing: -1.6,
              fontWeight: 700,
              color: "#16130E",
            }}
          >
            Some investors on your list already backed your competitor.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
