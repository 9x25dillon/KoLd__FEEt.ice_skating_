// The free leg's raise (SkatingInput.freeLegRaise; issue #74, the owner,
// 2026-11-09: spirals, the standing split spin, the attitude "half raised and
// bent at the knee parallel to the waist"). The leg lifted at the hip against
// gravity, stopped at `flexibility`; holding it costs legs by the hip's torque.
// In an upright spin the raise makes the variation, and the variation's
// inertia (data/spin-positions.json) makes the speed.
//
// MEASURED 2026-11-09, Experimental, entering at 5 m/s, carriage 0.2, 200
// ticks in: plain upright 13.75 rad/s; attitude 11.1 (the leg out at the hip);
// the standing split 16.1 (the leg up by the axis), reached only with
// flexibility 0.9 — Finesse drilled.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { SIM_DT, validate, DEFAULT_PARAMS } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, SPIN_VARIATION, SPIN_VARIATION_DIFFICULT, SPIN_POSITION, MOVE } from "../sim/types.ts";
import { SpinLevelTracker, loadSpinFeatureThresholds, scoreSpinLevel } from "../sim/spinLevel.ts";
import { SPIN_VARIATION_SCALE } from "../sim/moves.ts";
import { IceGrid } from "../sim/ice.ts";
import { baselineParams } from "../jpse/baseline.ts";
import { spinPose, spiralRun } from "../jpse/styles.ts";

const base = baselineParams();

/** Glide on the right foot at 5 m/s asking the free (left) leg to `raise` with the free knee at `freeKnee`; the raise and legs after `seconds`. */
function hold(p: typeof base, raise: number | undefined, freeKnee: number, seconds: number) {
  const s = createState(p, 5), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const knee = (freeKnee + 0.15) / 2, kneeSplit = (0.15 - freeKnee) / 2;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++)
    step(s, { ...NEUTRAL_INPUT, weight: 1, knee, kneeSplit, ...(raise === undefined ? {} : { freeLegRaise: raise }) }, p, SIM_DT, [], ice);
  return s;
}

test("the levers: flexibility 0.6 and the hold's drain by default, both validated", () => {
  assert.equal(DEFAULT_PARAMS.flexibility, 0.6);
  assert.ok(validate({ ...DEFAULT_PARAMS, flexibility: 1.2 }).some((e) => /flexibility/.test(e)));
  assert.ok(validate({ ...DEFAULT_PARAMS, staminaLegsPerLegHold: -1 }).some((e) => /staminaLegsPerLegHold/.test(e)));
});

test("absent the input nothing about the raise exists; asked, the leg stops at the hip's range", () => {
  assert.equal(hold(base, undefined, 0, 1).freeRaise, undefined);
  assert.ok(Math.abs(hold(base, 1, 0, 2).freeRaise! - 0.6) < 1e-9, "flexibility 0.6 is as high as it goes");
  assert.ok(Math.abs(hold({ ...base, flexibility: 0.9 }, 1, 0, 2).freeRaise! - 0.9) < 1e-9);
  assert.ok(Math.abs(hold(base, 0.3, 0, 2).freeRaise! - 0.3) < 0.01, "asked lower, it goes where asked");
});

test("holding the leg up costs the legs, and a bent knee — a shorter lever — costs less", () => {
  const legs = (raise: number, knee: number) => 1 - hold(base, raise, knee, 4).legs;
  const down = legs(0, 0), straight = legs(0.5, 0), bent = legs(0.5, 0.9);
  assert.ok(straight > down + 0.02, `${straight} vs ${down}`);
  assert.ok(bent < straight, `${bent} vs ${straight}`);
});

test("the variations' inertia is data/spin-positions.json's", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/spin-positions.json", import.meta.url), "utf8"));
  const scale = (id: string) => data.positions.find((x: { id: string }) => x.id === id).inertia_scale;
  assert.equal(SPIN_VARIATION_SCALE[SPIN_VARIATION.None], scale("upright_basic"));
  assert.equal(SPIN_VARIATION_SCALE[SPIN_VARIATION.Attitude], scale("upright_attitude"));
  assert.equal(SPIN_VARIATION_SCALE[SPIN_VARIATION.Split], scale("upright_i_position"));
  assert.equal(data.positions.find((x: { id: string }) => x.id === "upright_i_position").requires_flexibility, 0.9);
});

test("in an upright spin the attitude slows it and the standing split, with the range for it, speeds it", () => {
  const plain = spinPose(base, 0, 0), attitude = spinPose(base, 0.5, 0.9);
  const tryUp = spinPose(base, 1, 0), split = spinPose({ ...base, flexibility: 0.9 }, 1, 0);
  assert.equal(attitude.variation, SPIN_VARIATION.Attitude);
  assert.ok(attitude.omega < plain.omega - 2, `${attitude.omega} vs ${plain.omega}`);
  assert.equal(tryUp.variation, SPIN_VARIATION.None, "0.6 of range cannot reach the split");
  assert.equal(split.variation, SPIN_VARIATION.Split);
  assert.ok(split.omega > plain.omega + 2, `${split.omega} vs ${plain.omega}`);
  assert.ok(Math.abs(plain.omega - 13.75) < 0.01 && Math.abs(attitude.omega - 11.1) < 0.05 && Math.abs(split.omega - 16.14) < 0.05);
});

test("a spiral is credited with the leg's height and the time it was at or above the hip", () => {
  const r = spiralRun(base), flexible = spiralRun({ ...base, flexibility: 0.9 });
  assert.ok(Math.abs(r.spiralPeak - 0.6) < 1e-6 && Math.abs(flexible.spiralPeak - 0.9) < 1e-6);
  assert.ok(r.spiralAboveHip > 5, `${r.spiralAboveHip} s`);
  assert.equal(r.spiralStood, true);
  // The leg nearer vertical is a shorter lever against gravity: holding it costs less.
  assert.ok(flexible.spiralLegs < r.spiralLegs, `${flexible.spiralLegs} vs ${r.spiralLegs}`);
});

test("each variation's difficult flag is data/spin-positions.json's", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/spin-positions.json", import.meta.url), "utf8"));
  const flag = (id: string) => data.positions.find((x: { id: string }) => x.id === id).difficult;
  assert.deepEqual([...SPIN_VARIATION_DIFFICULT], [flag("upright_basic"), flag("upright_attitude"), flag("upright_i_position")]);
});

test("a standing split held through a spin earns the spin's difficult variation, scored as the career scores it", () => {
  const p = { ...base, flexibility: 0.9 };
  const tracker = new SpinLevelTracker(), plainTracker = new SpinLevelTracker();
  const T = loadSpinFeatureThresholds(readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8"));
  const run = (raise: number, tr: SpinLevelTracker) => {
    const q = createState(p, 5), grid = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
    for (let i = 0; i < 30; i++) step(q, { ...NEUTRAL_INPUT, weight: 1, knee: 0.3, lean: -0.3 }, p, SIM_DT, [], grid);
    for (let i = 0; i < 300; i++) {
      step(q, { ...NEUTRAL_INPUT, weight: 1, knee: 0.075, kneeSplit: 0.075, spin: true, carriage: 0.2, freeLegRaise: i > 20 ? raise : 0 }, p, SIM_DT, [], grid);
      if (q.move === MOVE.Spin) tr.sample(q.spin);
    }
    return scoreSpinLevel(tr.finish(), T, tr.footChanges, tr.variations);
  };
  const withSplit = run(1, tracker), plain = run(0, plainTracker);
  assert.deepEqual(withSplit.difficultVariations, [SPIN_POSITION.Upright]);
  assert.equal(withSplit.level, plain.level + 1, `${withSplit.level} vs ${plain.level}`);
});
