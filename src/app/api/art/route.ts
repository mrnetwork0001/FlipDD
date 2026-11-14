import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which illustrations exist in public/brand/art, so the app only loads files that are there. */
export async function GET() {
  try {
    const files = await fs.readdir(path.join(process.cwd(), "public", "brand", "art"));
    const art: Record<string, string> = {};
    for (const f of files) {
      const m = f.match(/^([a-z0-9-]+)\.(jpg|jpeg|png|webp)$/i);
      if (m && !art[m[1]]) art[m[1]] = `/brand/art/${f}`;
    }
    return Response.json(art, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({});
  }
}
