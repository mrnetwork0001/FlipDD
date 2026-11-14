import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

/** FlipDD's families (src/app/layout.tsx): Instrument Serif for display, Inter for text, JetBrains Mono for labels. */
export const sans = loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const display = sans;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const serifItalic = loadSerif("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;

/** FlipDD's palette, from tailwind.config.ts. */
export const C = {
  paper: "#F4F1E8",
  card: "#FBF9F3",
  ink: "#16130E",
  muted: "#6E675B",
  line: "#DCD5C5",
  signal: "#D63C22",
  caution: "#B4690E",
  clear: "#1D6A4B",
  night: "#15120E",
  // names the shared ui/ components use
  bg: "#15120E",
  faint: "#8f877a",
  teal: "#D63C22",
  paperInk: "#16130E",
};

export type Tone = "dark" | "light" | "brand";
export const TONE: Record<Tone, { bg: string; ink: string; muted: string; line: string; pill: string }> = {
  dark: { bg: C.night, ink: "#F4F1E8", muted: "rgba(244,241,232,0.55)", line: "rgba(244,241,232,0.14)", pill: "rgba(21,18,14,0.72)" },
  light: { bg: C.paper, ink: C.ink, muted: "rgba(22,19,14,0.55)", line: "rgba(22,19,14,0.12)", pill: "rgba(251,249,243,0.88)" },
  brand: { bg: C.signal, ink: "#FFFFFF", muted: "rgba(255,255,255,0.75)", line: "rgba(255,255,255,0.25)", pill: "rgba(120,25,10,0.45)" },
};

export const SCENE_TONE: Record<string, Tone> = {
  open: "dark", problem: "dark", turn: "brand", check: "light", ties: "light", round: "light",
  find: "light", go: "light", real: "dark", close: "brand",
};
// The ui/Chrome corner furniture is not used in this film (no corner labels or timecodes).
export const SCENE_LABEL: Record<string, string> = {};
