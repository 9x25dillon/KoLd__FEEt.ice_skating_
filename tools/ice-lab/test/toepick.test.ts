// The toe pick (toePickMode): a loaded blade whose contact reaches the pick's
// root while it travels toward its toe faster than toePickTripSpeed catches
// the pick — a trip (big_reffg.txt §3.5, EDGE-005). The fore-aft pendulum's
// to throw, so it needs pitchMode 1. On in Simulation and Experimental for the
// morning of 2026-09-24; off in every setup since, on the operator's word
// after play ("not working at all", "makes pumping completely useless"). The
// mode and its measurements stay, for whenever the ankle can stop throwing
// the contact onto the pick (see the counter-movement below).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FALL, EVENT, FOOT } from "../sim/types.ts";
import type { SkatingInput, EdgeEvent } from "../sim/types.ts";
import { setupParams, SETUPS } from "../game/setups.ts";

// The Simulation athlete with stages B/C off (test/pitch.test.ts's base), the pendulum on, the pick off.
const SIM = { ...setupParams("simulation"), slipMode: 0, torqueMode: 0, armsWhipMode: 0, footMode: 0, pitchMode: 1, toePickMode: 0, pitchInternalMode: 0 };
const FEET = { ...SIM, slipMode: 1, footMode: 1 };
const on = (p: Params): Params => ({ ...p, toePickMode: 1 });

/** Skate from `speed` (negative: backward) for up to `T` s or until down. */
function skate(p: Params, input: Partial<SkatingInput>, speed: number, T = 3) {
  const s = createState(p, speed), events: EdgeEvent[] = [];
  let t = 0;
  while (t < T && !s.fallen) {
    step(s, { ...NEUTRAL_INPUT, ...input }, p, SIM_DT, events);
    t += SIM_DT;
  }
  return { s, t, catches: events.filter(e => e.type === EVENT.ToePickCatch) };
}

test("toePickMode is 0 by default and in every setup, and validates", () => {
  assert.equal(DEFAULT_PARAMS.toePickMode, 0);
  assert.equal(DEFAULT_PARAMS.toePickEngage, 0.11);
  assert.equal(DEFAULT_PARAMS.toePickTripSpeed, 1.5);
  for (const { id } of SETUPS)
    assert.equal(setupParams(id).toePickMode, 0, id);
  assert.deepEqual(validate(on(FEET)), []);
  assert.ok(validate({ ...FEET, toePickMode: 2 }).some(e => /toePickMode/.test(e)));
  assert.ok(validate({ ...FEET, toePickEngage: 0.14 }).some(e => /toePickEngage/.test(e)), "at the blade's end the pick is out of reach");
  assert.ok(validate({ ...FEET, toePickTripSpeed: 0 }).some(e => /toePickTripSpeed/.test(e)));
});

test("leaning over the toe going forward catches the pick at speed, not slowly, and never backward", () => {
  // MEASURED, full forward lean (pitch 1, the contact asked to 0.14 m): the
  // body settles forward and the contact crosses 0.11 m at 0.725 s from any
  // speed above the trip speed; slower, or backward, the skater stays up.
  for (const v of [1.6, 3, 6]) {
    const r = skate(on(SIM), { knee: 0.5, pitch: 1 }, v);
    assert.equal(r.s.fallReason, FALL.ToePickTrip, `${v} m/s`);
    assert.ok(Math.abs(r.t - 0.725) < 0.01, `${v} m/s: tripped at ${r.t.toFixed(3)} s`);
    assert.equal(r.catches.length, 1);
    assert.ok(r.catches[0].value > DEFAULT_PARAMS.toePickTripSpeed, "going toward the toe");
  }
  for (const v of [0.5, 1.4, -3]) assert.equal(skate(on(SIM), { knee: 0.5, pitch: 1 }, v).s.fallen, false, `${v} m/s`);
  // Short of the pick's root, the front of the rocker is skated freely.
  assert.equal(skate(on(SIM), { knee: 0.5, pitch: 0.75 }, 3).s.fallen, false, "pitch 0.75 (0.105 m)");
});

test("without the pendulum, or with the mode off, nothing trips on the pick", () => {
  // pitchMode 0 places the contact from the input and the body has no
  // fore-aft lean: the turns and carves skated on the front of the rocker there are unchanged.
  assert.equal(skate(on({ ...SIM, pitchMode: 0 }), { knee: 0.5, pitch: 1 }, 5).s.fallen, false);
  assert.equal(skate(SIM, { knee: 0.5, pitch: 1 }, 5).s.fallen, false);
});

test("both outside edges caught: the ankle drives the contact onto the pick, and above the trip speed it catches at once", () => {
  // MEASURED: the catch brakes at ~5.6 m/s^2; the capture point runs off the
  // toe and the contact reaches 0.14 m in two ticks. From 2-5 m/s the pick
  // catches at 0.025 s; at 1-1.5 m/s the blade is below the trip speed by then
  // and the skater still pitches down at 0.39 s (test/pitch.test.ts).
  const caught = { knee: 0.5, toeOut: -1, leanSplit: -0.6 };
  for (const v of [2, 3, 4, 5]) {
    const r = skate(on(FEET), caught, v);
    assert.equal(r.s.fallReason, FALL.ToePickTrip, `${v} m/s`);
    assert.ok(Math.abs(r.t - 0.025) < 0.005, `${v} m/s: at ${r.t.toFixed(3)} s`);
  }
  for (const v of [1, 1.5]) {
    const r = skate(on(FEET), caught, v);
    assert.equal(r.s.fallReason, FALL.Pitched, `${v} m/s`);
    assert.ok(Math.abs(r.t - 0.39) < 0.01, `${v} m/s: at ${r.t.toFixed(3)} s`);
  }
});

test("a stick yanked to one heel throws the other blade onto its pick", () => {
  // MEASURED (Experimental's thumb stroke pulled to the stick's end, 3 m/s):
  // the right stick full back asks pitch -0.5, pitchSplit -0.5. To lean the
  // body back the ankle first moves the shared contact 7.9 cm toward the toe,
  // in one tick; the split around it puts the unasked left blade at contactS 1
  // — on the pick. The pendulum's own counter-movement; Experimental's stroke
  // is forgiving so it need not go there (test/setups.test.ts).
  const p = on({ ...setupParams("experimental"), pitchInternalMode: 0 });
  const r = skate(p, { knee: 0.38, pitch: -0.5, pitchSplit: -0.5 }, 3, 0.1);
  assert.equal(r.s.fallReason, FALL.ToePickTrip);
  assert.equal(r.catches[0].foot, FOOT.Left);
  assert.ok(r.t < 0.03, `at ${r.t.toFixed(3)} s`);
});
