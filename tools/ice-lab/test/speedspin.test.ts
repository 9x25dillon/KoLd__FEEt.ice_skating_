// Speed into spin (speedSpinMode), measured and left OFF in every setup.
//
// The takeoff's block is an impulse where the blade meets the ice, and the
// lean holds the blade leg length x sin(lean) to the side of the centre of
// mass, so the block also turns the body: dL = r x dp. On a curve the body is
// inside and the blade outside; the blade stops and the body swings round it —
// AGAINST the curve. So it eats the curve's rotation for every jump that
// rotates with its takeoff curve, and feeds only the counter-rotated lutz.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { setupParams } from "../game/setups.ts";

/** Take off at `v` m/s (negative backward) on `foot` at `lean`, no arms; the takeoff's kind and L. */
function takeoff(speedSpinMode: number, v: number, foot: number, lean: number, toe: boolean) {
  const p = { ...setupParams("experimental"), speedSpinMode, jumpMode: 2 }, s = createState(p, v, lean * p.maxLean);
  for (let i = 0; i < 200 && !s.fallen; i++) {
    const events: Parameters<typeof step>[4] = [];
    step(s, { ...NEUTRAL_INPUT, lean, weight: foot, knee: i < 60 ? 0.5 : i < 96 ? 0.95 : 0.2, toe: toe && i === 92 }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) return { kind: s.jump.kind, L: s.jump.angMomentum };
  }
  throw new Error("no takeoff");
}

test("speedSpinMode is 0 by default and in every setup", () => {
  assert.equal(DEFAULT_PARAMS.speedSpinMode, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, speedSpinMode: 2 }).some(e => /speedSpinMode/.test(e)));
  for (const id of ["simulation", "explorer", "experimental", "repertoire"] as const) assert.equal(setupParams(id).speedSpinMode, 0, id);
});

test("the block turns the body against its curve: it eats a loop's rotation and feeds a lutz's", () => {
  // MEASURED, no arms: loop off RBO at 5 m/s, L 3.01 -> 0.00 with the rule;
  // lutz off LBO with the pick at 8 m/s, 0.00 -> 1.20 (the pendulum with the
  // arms in Experimental; the ankle alone 1.08; without the pendulum, since /34, 2.26).
  const loopOff = takeoff(0, -5, 1, -0.3, false), loopOn = takeoff(1, -5, 1, -0.3, false);
  assert.equal(loopOn.kind, JUMP.Loop);
  assert.ok(Math.abs(loopOff.L - 3.01) < 0.01 && loopOn.L === 0, `loop ${loopOff.L.toFixed(2)} -> ${loopOn.L.toFixed(2)}`);
  const lutzOff = takeoff(0, -8, 0, 0.3, true), lutzOn = takeoff(1, -8, 0, 0.3, true);
  assert.equal(lutzOn.kind, JUMP.Lutz);
  assert.ok(lutzOff.L === 0 && Math.abs(lutzOn.L - 1.196) < 0.01, `lutz ${lutzOff.L.toFixed(2)} -> ${lutzOn.L.toFixed(2)}`);
});
