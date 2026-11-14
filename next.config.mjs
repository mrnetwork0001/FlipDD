/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build be checked next to a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Files read at runtime that serverless bundles (Vercel) would otherwise leave out:
    // the illustrations the pages look up, and ffmpeg for Telegram voice replies.
    outputFileTracingIncludes: {
      "/": ["./public/brand/**/*"],
      "/api/art": ["./public/brand/art/**/*"],
      "/api/telegram": ["./node_modules/ffmpeg-static/ffmpeg"],
      "/api/health": ["./node_modules/ffmpeg-static/ffmpeg"],
    },
  },
};

export default nextConfig;
