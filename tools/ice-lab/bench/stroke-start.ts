// bench/stroke-start.ts — what would the stroke model need for a measured standing start? (2026-11-27)
//
// MEASUREMENT ONLY: no solver or Params default changes. The owner chose this before any sprint
// mechanic: the push angle alone cannot reach the one readable measurement (β = 90°, full effort:
// 6.1 m in 2.86 s; measured 1.53 ± 0.19 s), so the force or the rhythm of the stroke is the gap.
//
// Target: Rice MS et al. (2024) Front. Sports Act. Living 6:1418713, Table 3, on-ice 54 m test,
// 6.1 m split from a standstill: 1.53 ± 0.19 s (range 1.32–1.89), n = 11 male youth hockey players
// (about 10 years old), maximal effort. Not figure skaters, not adults: a reference, not a gate.
//
// Rows (each from rest, then separately cruising):
//   baseline              today's Params.
//   A  power × k          strokePower scaled everywhere (every push in the game).
//   B  low-speed gain     strokePower × g(v), g = 1 + (G0 − 1)·max(0, 1 − v/v1): a leg pushes harder
//                         at low speed (the shape of muscle force–velocity). EMULATED here by setting
//                         strokePower per tick from the current speed; G0 is solved so a full-effort
//                         start reaches 6.1 m in 1.53 s. A solver version would read it inside step().
//   C  quicker strokes    strokeDuration shortened (the running strides of a start are short).
// Metrics: 6.1 m time (tap / full effort), speed at 2 s, cruise speed at 10 s and 20 s under steady
// full-effort pushing from 3 m/s, the speed one push adds at 6 m/s (Composer's table assumes 0.75,
// data/motion-primitives.json, a design value), and any fall.
//
//   node bench/stroke-start.ts [--json ../../docs/stroke-start-2026-11-27.json]
import { writeFileSync } from "node:fs";
import { setupParams } from "../game/setups.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { IceGrid } from "../sim/ice.ts";

export const TARGET_S = 1.53, TARGET_SD = 0.19, TARGET_M = 6.1;
type Tune = (p: Params, s: SkaterState) => Params;
const speed = (s: SkaterState) => Math.hypot(s.vel.x, s.vel.y);

/** Strokes back to back; full effort names the leg, full power and full bend. */
function effortInput(k: number, p: Params, full: boolean, foot: { f: number }): SkatingInput {
  const cadence = Math.round(p.strokeDuration / SIM_DT) + 1;
  const fresh = k % cadence === 0;
  if (fresh) foot.f = 1 - foot.f;
  return { ...NEUTRAL_INPUT, push: fresh, ...(fresh && full ? { pushPower: 1, pushKnee: 1, pushFoot: foot.f } : {}) };
}

function run(base: Params, tune: Tune, full: boolean, v0: number, seconds: number, until?: (s: SkaterState, d: number) => boolean) {
  const s = createState(base, v0), ice = new IceGrid(base.rinkHalfLength, base.rinkHalfWidth), x0 = { ...s.pos }, foot = { f: 0 };
  let fell = false, t = -1, v2s = 0;
  for (let k = 0; k < seconds / SIM_DT; k++) {
    const p = tune(base, s);
    step(s, effortInput(k, p, full, foot), p, SIM_DT, [], ice);
    fell ||= s.fallen;
    if (k + 1 === Math.round(2 / SIM_DT)) v2s = speed(s);
    if (until && until(s, Math.hypot(s.pos.x - x0.x, s.pos.y - x0.y))) { t = (k + 1) * SIM_DT; break; }
  }
  return { s, fell, t, v2s };
}

/** The speed one full push adds at 6 m/s: 0.6 s after it starts, against the same glide unpushed. */
function gainAt6(base: Params, tune: Tune): number {
  const one = (push: boolean) => {
    const s = createState(base, 6), ice = new IceGrid(base.rinkHalfLength, base.rinkHalfWidth);
    for (let k = 0; k < 0.6 / SIM_DT; k++) {
      const p = tune(base, s);
      step(s, { ...NEUTRAL_INPUT, push: push && k === 0, ...(push && k === 0 ? { pushPower: 1, pushKnee: 1, pushFoot: 1 } : {}) }, p, SIM_DT, [], ice);
    }
    return speed(s);
  };
  return one(true) - one(false);
}

export function measure(base: Params, tune: Tune) {
  const split = (full: boolean) => run(base, tune, full, 0, 8, (_s, d) => d >= TARGET_M);
  const tap = split(false), full = split(true);
  const cruise10 = run(base, tune, true, 3, 10), cruise20 = run(base, tune, true, 3, 20);
  return {
    tapSplit: tap.t, fullSplit: full.t, v2sFull: +full.v2s.toFixed(3), fellStart: tap.fell || full.fell,
    cruise10: +speed(cruise10.s).toFixed(2), cruise20: +speed(cruise20.s).toFixed(2), fellCruise: cruise20.fell,
    gainAt6: +gainAt6(base, tune).toFixed(3),
  };
}

const same: Tune = p => p;
const power = (k: number): Tune => p => ({ ...p, strokePower: p.strokePower * k });
const lowSpeed = (g0: number, v1: number): Tune => (p, s) =>
  ({ ...p, strokePower: p.strokePower * (1 + (g0 - 1) * Math.max(0, 1 - speed(s) / v1)) });
const duration = (d: number): Tune => p => ({ ...p, strokeDuration: d });

/** G0 for which a full-effort start reaches 6.1 m in TARGET_S (bisection; null if none in [1, 20]). */
export function solveG0(base: Params, v1: number): number | null {
  const t = (g: number) => run(base, lowSpeed(g, v1), true, 0, 8, (_s, d) => d >= TARGET_M).t;
  let lo = 1, hi = 20;
  if (t(hi) > TARGET_S || t(hi) < 0) return null;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (t(mid) > TARGET_S || t(mid) < 0) lo = mid; else hi = mid; }
  return +hi.toFixed(3);
}

if (import.meta.main) {
  const rows: Record<string, unknown>[] = [];
  for (const setup of ["simulation", "explorer", "experimental"] as const) {
    const base = setupParams(setup);
    const add = (row: string, tune: Tune, extra: Record<string, unknown> = {}) => rows.push({ setup, row, ...extra, ...measure(base, tune) });
    add("baseline", same);
    for (const k of [1.5, 2, 3, 4]) add(`A power x${k}`, power(k), { k });
    for (const v1 of [2, 3, 4]) {
      const g0 = solveG0(base, v1);
      if (g0 === null) rows.push({ setup, row: `B low-speed v1=${v1}`, v1, g0: null });
      else add(`B low-speed v1=${v1}`, lowSpeed(g0, v1), { v1, g0 });
    }
    for (const d of [0.2, 0.15]) add(`C duration ${d}s`, duration(d), { duration: d });
  }
  const f = (x: unknown) => typeof x === "number" ? (x < 0 ? "  -  " : x.toFixed(2)) : String(x ?? "-");
  console.log("setup        row                     G0      tap 6.1m  full 6.1m  v@2s   cruise10 cruise20  gain@6  falls");
  for (const r of rows) console.log(String(r.setup).padEnd(12), String(r.row).padEnd(23), f(r.g0).padEnd(7), f(r.tapSplit).padEnd(9), f(r.fullSplit).padEnd(10),
    f(r.v2sFull).padEnd(6), f(r.cruise10).padEnd(8), f(r.cruise20).padEnd(9), f(r.gainAt6).padEnd(7), r.fellStart || r.fellCruise ? `start:${!!r.fellStart} cruise:${!!r.fellCruise}` : "");
  const at = process.argv.indexOf("--json");
  if (at > 0) writeFileSync(process.argv[at + 1], JSON.stringify({ target: { seconds: TARGET_S, sd: TARGET_SD, metres: TARGET_M, source: "Rice et al. 2024, Front. Sports Act. Living 6:1418713, Table 3" }, rows }, null, 1) + "\n");
}
