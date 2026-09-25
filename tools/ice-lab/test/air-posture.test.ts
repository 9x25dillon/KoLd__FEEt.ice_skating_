// airPostureMode (sim/jump.ts): torque-free flight and a fresh landing. The
// air turns the roll and pitch at the rates blade-off left them and holds the
// yaw's angular momentum while its rate follows the tuck; blade-off ends the
// ground's balance state; the landing never reads the takeoff's balance error;
// the jump's call is frozen at the touchdown. With the mode off, as before.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import { postureBase, TAKEOFFS } from "./air-posture.ts";

const [, commitOver, toeHook] = TAKEOFFS[2];
// The calibration's takeoff, landed with the knee bent to absorb (the air's 0.35 scores the landing to 0 whatever else it does).
const calibration = { ...TAKEOFFS[0][2], landKnee: 0.8 };
const on = { ...postureBase([]), ...commitOver } as Params;
const off = { ...on, airPostureMode: 0 };

test("torque-free: the roll and the pitch turn at blade-off's rates, the yaw keeps its L while omega follows the tuck", () => {
  const r = attempt("held", on, 0.35, toeHook);
  const air = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
  assert.ok(air.length > 50, "a flight");
  const [first] = air;
  assert.ok(Math.abs(first.leanRate) > 0.5 && Math.abs(first.pitchRate) > 0.1, "this takeoff launches roll and pitch");
  for (let i = 1; i < air.length; i++) {
    const a = air[i - 1], b = air[i];
    assert.equal(b.leanRate, first.leanRate, `roll rate at ${b.t.toFixed(3)}`);
    assert.equal(b.pitchRate, first.pitchRate, `pitch rate at ${b.t.toFixed(3)}`);
    assert.ok(Math.abs(b.lean - a.lean - first.leanRate * SIM_DT) < 1e-12, `no righting, no snap at ${b.t.toFixed(3)}`);
    assert.ok(Math.abs(b.pitch - a.pitch - first.pitchRate * SIM_DT) < 1e-12, `pitch at ${b.t.toFixed(3)}`);
    assert.equal(b.L, first.L, "the yaw's angular momentum");
    assert.ok(Math.abs(b.omega - b.L / b.inertia) < 1e-12, "omega is L / I");
  }
  assert.ok(Math.max(...air.map(f => f.omega)) > 1.5 * air[0].omega, "the tuck spun it up");
});

test("blade-off ends the ground's balance state; the takeoff's error is kept for diagnostics only", () => {
  let seen: Partial<SkaterState> & { takeoffBalanceError?: number } = {};
  const r = attempt("held", on, 0.35, { ...toeHook, atTakeoff: s => {
    seen = { balanceErrorTime: s.balanceErrorTime, intHeld: s.intHeld, latAccel: s.latAccel, intAccel: s.intAccel,
      leanEq: s.leanEq, balanceError: s.balanceError, pitchOffTime: s.pitchOffTime, takeoffBalanceError: s.jump.takeoffBalanceError };
  } });
  const ground = r.frames.filter(f => f.phase !== JUMP_PHASE.Air && f.t < r.takeoff).at(-1)!;
  assert.deepEqual({ ...seen, takeoffBalanceError: undefined },
    { balanceErrorTime: 0, intHeld: 0, latAccel: 0, intAccel: 0, leanEq: 0, balanceError: 0, pitchOffTime: 0, takeoffBalanceError: undefined });
  assert.ok(Math.abs(ground.balanceError) > 0.1, "the takeoff edge had an error to leak");
  assert.equal(typeof seen.takeoffBalanceError, "number");
});

test("the landing never reads the takeoff's balance error (and with the mode off it did)", () => {
  const poke = (s: SkaterState) => { s.balanceError = 5; s.leanEq = -1; };
  for (const [p, reads] of [[on, false], [off, true]] as const) {
    const clean = attempt("held", p, 0.375, calibration), poked = attempt("held", p, 0.375, { ...calibration, atTakeoff: poke });
    assert.ok(clean.landed && poked.landed);
    if (reads) assert.notDeepEqual(poked.result, clean.result, "mode off: the stale error is scored");
    else assert.deepEqual(poked.result, clean.result, "mode on: nothing left on the ground reaches the landing");
  }
});

test("the call is frozen at the first touchdown: riding it out credits nothing", () => {
  // Checked at 0.425 s: the touchdown that stays up (test/air-posture.ts's best check).
  const at = attempt("held", on, 0.425, calibration), after = attempt("held", on, 0.425, { ...calibration, rideOut: 0.3 });
  assert.ok(after.frames.at(-1)!.t > after.landedAt + 0.1, "it skated on past the touchdown");
  for (const k of ["turned", "airborne", "revolutions", "rotationCall", "shortBy", "takeoffEdge"] as const)
    assert.equal(after.result[k], at.result[k], k);
});

test("with the mode off the lean stops at blade-off and the air freezes it, as before", () => {
  const r = attempt("held", off, 0.35, toeHook);
  const air = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
  for (const f of air) {
    assert.equal(f.leanRate, 0);
    assert.equal(f.lean, air[0].lean);
    assert.equal(f.pitch, air[0].pitch);
  }
});

test("airPostureMode is 0 or 1", () => {
  assert.deepEqual(validate(on), []);
  assert.ok(validate({ ...on, airPostureMode: 2 }).some(e => e.startsWith("airPostureMode")));
});
