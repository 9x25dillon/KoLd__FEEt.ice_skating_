// game/rivals.ts — the other skaters at each event. Invented names only (decision D6:
// no real athlete's name or record). They progress on their own through the season.
//
// They give a medal someone to beat, and nothing more: medals, XP and unlocks read
// only your own skating. Difficulty is how much physics is live, not a harsher field
// (the owner, 2026-11-01), so nothing here changes what the ice or the judges do.
//
import { CAREER_EVENTS, seasonOf } from "./career.ts";

// AUTHORED, TO BE RETUNED FROM PLAY. BASELINE is what a clean, plain program scores at each
// event, skated its full time with half-turn jumps (the rules of 2026-11-02): Simulation,
// through the native bridge, the median of the clean runs over a grid of scripted pilots,
// measured 2026-11-03 by games/ice-run-godot/tools/rival_baseline.mjs. A half turn scores no
// TES, so this is all PCS. Each rival's level is a share of it. It was [10.9, 11.2, 14.4,
// 11.8, 27.8]: a jumpless script whose programs ended with their last element (2026-11-01).
//
// Season two's (2026-11-11) were measured by the same tool on that day's engine, on its wider
// grid (`--from=5 --wide`: 45 runs an event). Clean runs: Sectionals 45, Autumn Trophy 3 (thin),
// Northern Cup 7, gala 35. Nationals had none: the pilot never lands three half turns clean in
// one program. Its 32.0 is BORROWED from the Northern Cup, the same 240 s free segment (a half
// turn scores no TES, so both are PCS). Season one's were not re-measured; on this engine the
// pilot no longer skates the Championship program clean, a jump straight out of a crossover.
// The gala is an exhibition: it places nobody, so its baseline only fills the field's view.
export const BASELINE = [16.5, 16.7, 17.5, 16.0, 30.9, 15.5, 12.8, 32.0, 32.0, 16.4] as const;
/** `season`: the first season a rival skates in. Their growth runs on through every event. */
export const RIVALS = [
  { name: "Ansa Merrow", level: 0.8, growth: 0.02, season: 1 },
  { name: "Lio Tarrant", level: 0.9, growth: 0.05, season: 1 },
  { name: "Katya Vell", level: 1.0, growth: 0.03, season: 1 },
  { name: "Noor Ashdown", level: 1.12, growth: 0.04, season: 1 },
  { name: "Remi Castellan", level: 1.3, growth: 0.06, season: 1 },
  // AUTHORED: the senior who has held the national title; she grows least, she is already there.
  { name: "Teodora Wynn", level: 1.7, growth: 0.01, season: 2 },
] as const;
/** Share of a rival's score their day can move it, each way. */
export const FORM_SWING = 0.06;
/** Points for each place in an event, best first. */
export const PLACE_POINTS = [12, 9, 7, 5, 4, 3, 2] as const;
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

/** The rivals skating event `event`, by index into RIVALS. */
function field(event: number): number[] {
  const season = seasonOf(event);
  return RIVALS.flatMap((r, i) => r.season <= season ? [i] : []);
}

export interface Standing { place: number; name: string; score: number; you: boolean }
/** One event's table; `you` is null until you have skated it. */
export function standings(event: number, you: number | null): Standing[] {
  const rows: { name: string; score: number; you: boolean }[] = field(event).map(i => ({ name: RIVALS[i].name, score: rivalScore(i, event), you: false }));
  if (you !== null) rows.push({ name: YOU, score: you, you: true });
  return rows.sort((a, b) => b.score - a.score).map((row, i) => ({ ...row, place: i + 1 }));
}

export interface SeasonRow { place: number; name: string; points: number; you: boolean }
/**
 * A season so far, over the events of it you have skated: rivals count only where you do.
 * An exhibition places nobody, so it adds no points.
 */
export function seasonTable(best: readonly (number | null)[], season = 1): SeasonRow[] {
  const points = new Map<string, number>([[YOU, 0], ...RIVALS.filter(r => r.season <= season).map(r => [r.name, 0] as [string, number])]);
  best.forEach((score, event) => {
    if (score === null || seasonOf(event) !== season || CAREER_EVENTS[event]?.exhibition) return;
    for (const row of standings(event, score)) points.set(row.name, points.get(row.name)! + PLACE_POINTS[row.place - 1]);
  });
  return [...points].map(([name, p]) => ({ name, points: p, you: name === YOU }))
    .sort((a, b) => b.points - a.points || Number(b.you) - Number(a.you))
    .map((row, i) => ({ ...row, place: i + 1 }));
}
