// The arms and trunk in the fore-aft pendulum (pitchInternalMode, 2026-09-24).
// Counter-rotation turns the body over the blade without moving the contact
// and without any force from the ice (Hof 2007). The contact demand is split
// by speed — the ankle follows it over pitchAnkleTau, the arms take the fast
// rest (Horak & Nashner 1986) — so a changed lean no longer throws the
// contact the wrong way first. On in Simulation, Experimental and Dig Gate.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { setupParams, SETUPS } from "../game/setups.ts";
import { DIG_BASE, digJump } from "./pitch-gain-sweep.ts";

const SIM = setupParams("simulation"), ANKLE = { ...SIM, pitchInternalMode: 0 };

/** From a settled 5 m/s glide, the asked lean steps 0 -> 0.75: the contact's first excursion and when it is within 0.02 of the asked. */
function toeStep(p: Params) {
  const s = createState(p, 5);
  for (let i = 0; i < 120; i++) step(s, { ...NEUTRAL_INPUT, knee: 0.5 }, p, SIM_DT, []);
  let first = 1, arrived = -1;
  for (let i = 1; i <= 720 && arrived < 0; i++) {
    step(s, { ...NEUTRAL_INPUT, knee: 0.5, pitch: 0.75 }, p, SIM_DT, []);
    const c = s.blade[s.supportFoot].contactS;
    first = Math.min(first, c);
    if (i > 2 && Math.abs(c - 0.875) < 0.02) arrived = i * SIM_DT;
  }
  return { s, first, arrived };
}

test("pitchInternalMode is 0 by default, on with the pendulum's setups, and validates", () => {
  assert.equal(DEFAULT_PARAMS.pitchInternalMode, 0);
  assert.equal(DEFAULT_PARAMS.pitchAnkleTau, 0.16);
  for (const { id } of SETUPS) assert.equal(setupParams(id).pitchInternalMode, setupParams(id).pitchMode, id);
  assert.deepEqual(validate(SIM), []);
  assert.ok(validate({ ...SIM, pitchInternalMode: 2 }).some(e => /pitchInternalMode/.test(e)));
  assert.ok(validate({ ...SIM, pitchAnkleTau: -1 }).some(e => /pitchAnkleTau/.test(e)));
  assert.equal(createState(ANKLE).pitchAnkle, undefined, "no arms state without the arms");
});

test("a lean asked toward the toe: the arms take the counter-movement, the contact barely goes to the heel", () => {
  // MEASURED at 5 m/s: the ankle alone first runs the contact to 0.126 (10.4
  // cm toward the heel) and reaches the asked 0.875 at 1.08 s; with the arms
  // it goes no further than 0.379 (3.4 cm) and arrives at 1.30 s.
  const alone = toeStep(ANKLE), arms = toeStep(SIM);
  assert.ok(Math.abs(alone.first - 0.126) < 0.005 && Math.abs(alone.arrived - 1.08) < 0.02, `ankle ${alone.first.toFixed(3)} ${alone.arrived}`);
  assert.ok(Math.abs(arms.first - 0.379) < 0.005 && Math.abs(arms.arrived - 1.30) < 0.02, `arms ${arms.first.toFixed(3)} ${arms.arrived}`);
});

test("the arms do not hold a lean: held, it goes back to the ankle", () => {
  // Their share is the fast part: 2 s into a held lean they carry almost none of it.
  const r = toeStep(SIM);
  for (let i = 0; i < 240; i++) step(r.s, { ...NEUTRAL_INPUT, knee: 0.5, pitch: 0.75 }, SIM, SIM_DT, []);
  assert.ok(Math.abs(r.s.pitchIntAccel!) < 0.02, `arms ${r.s.pitchIntAccel}`);
});

test("letting go of a forward lean at speed: the ankle alone throws the contact onto the pick, with the arms it does not", () => {
  // MEASURED with the toe-pick trip forced on (off in every setup): a 0.6
  // lean held 1.5 s at 5 m/s and let go at once — the ankle alone trips on
  // the pick; with the arms the skater stays up.
  const release = (p: Params) => {
    const q = { ...p, toePickMode: 1 }, s = createState(q, 5);
    for (let i = 0; i < 480 && !s.fallen; i++) step(s, { ...NEUTRAL_INPUT, knee: 0.5, weight: 0.5, pitch: i < 180 ? 0.6 : 0 }, q, SIM_DT, []);
    return s.fallen;
  };
  assert.equal(release(ANKLE), true);
  assert.equal(release(SIM), false);
});

test("the dig with the arms: leaned early, a little more spin into the lutz", () => {
  // MEASURED (test/dig.test.ts's arrival, toe 0.75 leaned 1.5 s early): L
  // 5.30 with the arms, 5.09 the ankle alone; leaned late it still reverses.
  const arms = { ...DIG_BASE, pitchInternalMode: 1 };
  assert.ok(Math.abs(digJump(arms, 0.75, 1.5, true)!.angMomentum - 5.30) < 0.01);
  assert.equal(digJump(arms, 0.75)!.angMomentum, 0);
});
