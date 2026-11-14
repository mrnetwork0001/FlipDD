// The built-in example. The landing page shows the latest real run of exactly
// this input, never a run someone typed in themselves.

export const EXAMPLE_INPUT = {
  startupName: "Veloce AI",
  description:
    "AI software engineer that turns a prompt into a working web app, writing and reviewing the code for product teams.",
  competitors: ["Lovable"],
  investors: [
    "Creandum",
    "Northzone",
    "Atomico",
    "Balderton Capital",
    "Index Ventures",
    "EQT Ventures",
    "Lifeline Ventures",
    "Maki.vc",
  ],
};

/** Is this the built-in example (same startup, competitors and investors)? */
export function isExampleRun(run: { startupName: string; competitors: string[]; investorInputs?: string[] }): boolean {
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase());
  return (
    run.startupName === EXAMPLE_INPUT.startupName &&
    same(run.competitors, EXAMPLE_INPUT.competitors) &&
    same(run.investorInputs || [], EXAMPLE_INPUT.investors)
  );
}
