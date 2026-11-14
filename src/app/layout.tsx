import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const pixel = Pixelify_Sans({ subsets: ["latin"], variable: "--font-pixel", display: "swap" });

export const metadata: Metadata = {
  // Absolute base for the link-preview image; set FLIPDD_PUBLIC_URL when deployed.
  metadataBase: new URL(process.env.FLIPDD_PUBLIC_URL?.trim() || "http://localhost:3001"),
  title: "FlipDD — some investors on your list already backed your competitor",
  description:
    "Paste your Slush meeting list. FlipDD walks Cala's knowledge graph to find which investors backed your competitors, directly, through a co-investor or through a board seat, and tells you what is safe to share with each one.",
  openGraph: {
    title: "FlipDD — some investors on your list already backed your competitor",
    description: "Check your investors back before you send the deck. Built on Cala's knowledge graph.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
