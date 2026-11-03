// game/rivals.ts — the other skaters at each event. Invented names only (decision D6:
// no real athlete's name or record). They progress on their own through the season.
//
// They give a medal someone to beat, and nothing more: medals, XP and unlocks read
// only your own skating. Difficulty is how much physics is live, not a harsher field
// (the owner, 2026-11-01), so nothing here changes what the ice or the judges do.
//
// AUTHORED, TO BE RETUNED FROM PLAY. BASELINE is what a clean, plain program scores at each
// event, skated its full time with half-turn jumps (the rules of 2026-11-02): Simulation,
// through the native bridge, the median of the clean runs over a grid of scripted pilots,
// measured 2026-11-03 by games/ice-run-godot/tools/rival_baseline.mjs. A half turn scores no
// TES, so this is all PCS. Each rival's level is a share of it. It was [10.9, 11.2, 14.4,
// 11.8, 27.8]: a jumpless script whose programs ended with their last element (2026-11-01).

export const BASELINE = [16.5, 16.7, 17.5, 16.0, 30.9] as const;
export const RIVALS = [
  { name: "Ansa Merrow", level: 0.8, growth: 0.02 },
  { name: "Lio Tarrant", level: 0.9, growth: 0.05 },
  { name: "Katya Vell", level: 1.0, growth: 0.03 },
  { name: "Noor Ashdown", level: 1.12, growth: 0.04 },
  { name: "Remi Castellan", level: 1.3, growth: 0.06 },
] as const;
/** Share of a rival's score their day can move it, each way. */
export const FORM_SWING = 0.06;
/** Points for each place in an event, best first. */
export const PLACE_POINTS = [12, 9, 7, 5, 4, 3] as const;
export const YOU = "You";

/** A rival's day, -1..1: fixed for that rival and event, so a retry faces the same score. */
function form(rival: number, event: number): number {
  let x = (rival + 1) * 2654435761 + (event + 1) * 40503;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (((x ^ (x >>> 16)) >>> 0) / 0xffffffff) * 2 - 1;
}
export function rivalScore(rival: number, event: number): number {
  const r = RIVALS[rival];
  const score = BASELINE[event] * r.level * (1 + r.growth * event) * (1 + FORM_SWING * form(rival, event));
  return Math.round(score * 100) / 100;
}

export interface Standing { place: number; name: string; score: number; you: boolean }
/** One event's table; `you` is null until you have skated it. */
export function standings(event: number, you: number | null): Standing[] {
  const rows: { name: string; score: number; you: boolean }[] = RIVALS.map((r, i) => ({ name: r.name, score: rivalScore(i, event), you: false }));
  if (you !== null) rows.push({ name: YOU, score: you, you: true });
  return rows.sort((a, b) => b.score - a.score).map((row, i) => ({ ...row, place: i + 1 }));
}

export interface SeasonRow { place: number; name: string; points: number; you: boolean }
/** The season so far, over the events you have skated: rivals count only where you do. */
export function seasonTable(best: readonly (number | null)[]): SeasonRow[] {
  const points = new Map<string, number>([[YOU, 0], ...RIVALS.map(r => [r.name, 0] as [string, number])]);
  best.forEach((score, event) => {
    if (score === null) return;
    for (const row of standings(event, score)) points.set(row.name, points.get(row.name)! + PLACE_POINTS[row.place - 1]);
  });
  return [...points].map(([name, p]) => ({ name, points: p, you: name === YOU }))
    .sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you))
    .map((row, i) => ({ ...row, place: i + 1 }));
}
