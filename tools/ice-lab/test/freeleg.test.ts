// The free leg (freeLegMode, with torqueMode): the unweighted leg as a third
// body, swung round the body by the hip. Its weight is Dempster's (via
// Winter): thigh + shank + foot, 16.1% of body mass. Its reaction lands on the
// body, so it makes net spin only while the edge holds the foot — and when
// the foot pivots, the braced torso turns with the hips. A right free leg
// swinging forward turns counter-clockwise (with every jump here), a left one
// clockwise. Snapped, or over a shallow edge, it twists the blade loose.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import { setupParams } from "../game/setups.ts";

/** 7 m/s backward on `foot` at lean `lean`, leg at rest; load 0.3 s; swing 0.5 -> 1 eased over `swing` s ending at the release. */
function takeoff(foot: number, lean: number, swing: number | null) {
  const p = { ...setupParams("experimental"), jumpMode: 2 }, s = createState(p, -7, lean * p.maxLean);
  const ease = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
  for (let i = 0; i < 220 && !s.fallen; i++) {
    const t = i * SIM_DT;
    const freeLeg = swing === null ? 0.5 : 0.5 + 0.5 * ease((t - (1.5 - swing)) / swing);
    const events: Parameters<typeof step>[4] = [];
    step(s, { ...NEUTRAL_INPUT, lean, weight: foot, knee: i < 144 ? 0.5 : i < 180 ? 0.95 : 0.2, freeLeg }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) return { L: s.jump.angMomentum, fell: false };
  }
  return { L: NaN, fell: s.fallen };
}

test("freeLegMode is 0 by default, needs torqueMode, and is on in Experimental only", () => {
  assert.equal(DEFAULT_PARAMS.freeLegMode, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, freeLegMode: 1 }).some(e => /torqueMode/.test(e)));
  assert.equal(setupParams("experimental").freeLegMode, 1);
  for (const id of ["simulation", "explorer", "repertoire"] as const) assert.equal(setupParams(id).freeLegMode, 0, id);
});

test("swung smoothly over a deep edge, the free leg adds spin its own way round", () => {
  // MEASURED (7 m/s, lean 0.9, eased 0.5 s swing; the fore-aft pendulum on
  // in Experimental): salchow LBI, right leg free, 10.51 -> 12.01; loop RBO,
  // left leg free (clockwise), 10.51 -> 9.01. (Without it: 10.58 -> 12.08, -> 9.08.)
  const near = (x: number, y: number) => Math.abs(x - y) < 0.02;
  const salchow = [takeoff(0, -0.9, null), takeoff(0, -0.9, 0.5)], loop = [takeoff(1, -0.9, null), takeoff(1, -0.9, 0.5)];
  assert.ok(near(salchow[0].L, 10.51) && near(salchow[1].L, 12.01), `salchow ${salchow.map(r => r.L.toFixed(2)).join(" -> ")}`);
  assert.ok(near(loop[0].L, 10.51) && near(loop[1].L, 9.01), `loop ${loop.map(r => r.L.toFixed(2)).join(" -> ")}`);
});

test("snapped, the free leg twists the blade loose: a fall", () => {
  // MEASURED: the salchow's swing over 0.3 s instead of 0.5 — the edge lets go.
  assert.equal(takeoff(0, -0.9, 0.3).fell, true);
});
