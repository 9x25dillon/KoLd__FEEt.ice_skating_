// The fore-aft pendulum (pitchMode): the body leans toward toe or heel over
// the support blade, and the ankle's one authority is where along the blade
// the ice pushes back. Braking pitches the body forward; a braking that builds
// is ridden by leaning back, a sudden one past what half a blade can catch
// puts the skater down. On in Simulation and Experimental (the operator's
// choice, 2026-09-23), off in Blade Explorer and Full Repertoire.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FALL } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { len } from "../sim/math.ts";
import { setupParams, SETUPS } from "../game/setups.ts";

// The Simulation athlete with stages B/C, the pendulum and the toe pick off, as test/feet.test.ts has it; the feet on for the stops.
const SIM = { ...setupParams("simulation"), slipMode: 0, torqueMode: 0, footMode: 0, pitchMode: 0, toePickMode: 0 };
const FEET = { ...SIM, slipMode: 1, footMode: 1 };
const on = (p: Params): Params => ({ ...p, pitchMode: 1 });

/** Skate from `speed` for up to `T` s or until down; the pendulum's extremes along the way. */
function skate(p: Params, at: (t: number) => Partial<SkatingInput>, speed = 5, T = 6) {
  const s = createState(p, speed);
  let t = 0, pitchMin = 0, pitchMax = 0, cMin = 0, cMax = 0;
  while (t < T && !s.fallen) {
    step(s, { ...NEUTRAL_INPUT, ...at(t) }, p, SIM_DT, []);
    t += SIM_DT;
    pitchMin = Math.min(pitchMin, s.pitch ?? 0); pitchMax = Math.max(pitchMax, s.pitch ?? 0);
    cMin = Math.min(cMin, s.pitchContact ?? 0); cMax = Math.max(cMax, s.pitchContact ?? 0);
  }
  return { s, t, pitchMin, pitchMax, cMin, cMax };
}

test("pitchMode is 0 by default, on in Simulation and Experimental only, and validates", () => {
  assert.equal(DEFAULT_PARAMS.pitchMode, 0);
  assert.equal(DEFAULT_PARAMS.pitchGain, 1);
  for (const { id } of SETUPS)
    assert.equal(setupParams(id).pitchMode, id === "simulation" || id === "experimental" || id === "diggate" ? 1 : 0, id);
  assert.deepEqual(validate(on(FEET)), []);
  assert.ok(validate({ ...FEET, pitchMode: 2 }).some(e => /pitchMode/.test(e)));
  assert.ok(validate({ ...on(FEET), pitchGain: 0 }).some(e => /pitchGain/.test(e)));
  assert.equal(createState(FEET).pitch, undefined, "no pendulum state without the pendulum");
});

test("gliding and stroking, the body stays over the blade; the asked lean settles where pitchMode 0 put the contact", () => {
  // MEASURED: a glide's friction holds the contact 1 cm toward the toe; a
  // stroke's push goes up the leg into the hips and barely moves it.
  for (const p of [on(SIM), on(FEET)]) {
    const glide = skate(p, () => ({ knee: 0.5 }));
    const stroke = skate(p, (t) => ({ knee: 0.5, push: (t % 1) < 0.5 }), 0.5);
    for (const r of [glide, stroke]) {
      assert.equal(r.s.fallen, false);
      assert.ok(r.cMax < 0.015 && r.cMin > -0.005, `contact ${r.cMin.toFixed(3)}..${r.cMax.toFixed(3)} m`);
    }
    const asked = skate(p, () => ({ knee: 0.5, pitch: 0.5 }));
    assert.equal(asked.s.fallen, false);
    const contactS = asked.s.blade[asked.s.supportFoot].contactS;
    assert.ok(Math.abs(contactS - 0.75) < 0.01, `pitch 0.5 settles at contactS ${contactS.toFixed(3)}`);
  }
});

test("a snowplow that builds is ridden: the body leans back into it and stands", () => {
  // MEASURED from 5 m/s, toes in on inside edges 0.6 (test/feet.test.ts's
  // full snowplow): stopped, upright, the body leaning back 0.069 rad at the
  // hardest of it, the contact at the toe as the stop runs out.
  const r = skate(on(FEET), () => ({ knee: 0.5, toeOut: -1, leanSplit: 0.6 }));
  assert.equal(r.s.fallen, false);
  assert.ok(len(r.s.vel) < 0.05, `stopped (${len(r.s.vel).toFixed(2)})`);
  assert.ok(Math.abs(r.pitchMin + 0.069) < 0.005, `leaned back ${r.pitchMin.toFixed(3)}`);
});

test("both outside edges caught: the stop is sudden, the capture point runs off the toe, and the skater pitches forward", () => {
  // MEASURED: from 2 to 5 m/s the catch brakes at ~5.6 m/s^2 at once; down
  // at 0.39 s every time. Without the pendulum the same catch stops the
  // skater dead and upright.
  const caught = () => ({ knee: 0.5, toeOut: -1, leanSplit: -0.6 });
  for (const v of [2, 3, 4, 5]) {
    const r = skate(on(FEET), caught, v);
    assert.equal(r.s.fallReason, FALL.Pitched, `${v} m/s`);
    assert.ok(Math.abs(r.t - 0.39) < 0.01, `${v} m/s: down at ${r.t.toFixed(2)} s`);
    assert.ok(r.pitchMax > 0.1, "forward, toward the toe");
  }
  const off = skate(FEET, caught);
  assert.equal(off.s.fallen, false);
  assert.ok(len(off.s.vel) < 0.3);
});

test("standing up after a pitched fall resets the pendulum", () => {
  const p = on(FEET), s = createState(p, 5);
  const caught = { ...NEUTRAL_INPUT, knee: 0.5, toeOut: -1, leanSplit: -0.6 };
  while (!s.fallen) step(s, caught, p, SIM_DT, []);
  step(s, { ...NEUTRAL_INPUT, push: true }, p, SIM_DT, []);
  assert.equal(s.fallen, false);
  assert.deepEqual([s.pitch, s.pitchRate, s.pitchContact, s.pitchOffTime], [0, 0, 0, 0]);
  for (let i = 0; i < 240; i++) step(s, { ...NEUTRAL_INPUT, knee: 0.5 }, p, SIM_DT, []);
  assert.equal(s.fallen, false, "and stays up");
});
