// freeLegSwingThroughMode (sim/solver.ts freeLegTorque): through a push-off
// the hip never brakes a leg swinging the way it is asked while the leg is
// inside its arc; past the arc it may (the joint's); nothing outside a push
// changes; the hip stays within its ceiling; the leg leaves the ice moving
// and the air takes it as it is.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step, checksum } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import { stackParams } from "./free-leg-timing.ts";
import { analyse, throughAt } from "./swing-through.ts";

const on = { ...stackParams([]), freeLegSwingThroughMode: 1 } as Params;
const off = { ...on, freeLegSwingThroughMode: 0 };

test("through the push the hip never brakes the asked swing inside the arc, and stays within its ceiling", () => {
  let checked = 0;
  for (const start of [0, 0.1, 0.2, 0.3]) {
    const r = attempt("held", on, Infinity, throughAt(start));
    for (const f of r.frames) {
      const tau = f.budget?.leg;
      if (tau === undefined) continue;
      assert.ok(Math.abs(tau) <= on.freeLegTorqueMax + 1e-9, "within the ceiling");
      // The asked direction is the way the leg has left rest (0) toward the takeoff pose.
      const pushing = f.timePhase >= 0 && f.phase !== JUMP_PHASE.Air && f.freeLegCmd !== 0.5;
      if (!pushing || Math.abs(f.freeSwing) >= on.freeLegArc) continue;
      const dir = Math.sign(f.freeSwing || f.freeSwingRate);
      if (f.freeSwingRate * dir > 0) { assert.ok(tau * dir >= -1e-9, `no braking at ${f.t.toFixed(3)}: ${tau}`); checked++; }
    }
  }
  assert.ok(checked > 20);
});

test("past the arc the joint still brakes, and the swing started early pays for it before blade-off", () => {
  const early = analyse(attempt("held", on, Infinity, throughAt(0)), on, 0);
  const timed = analyse(attempt("held", on, Infinity, throughAt(0.3)), on, 0.3);
  assert.ok(early.negImp < -1, `the joint braked the early swing: ${early.negImp}`);
  assert.ok(timed.Lnorm > early.Lnorm, "arriving at the arc at blade-off keeps more");
  assert.ok(timed.legRate > 5, "the leg leaves the ice still swinging");
});

test("swing-through keeps what braking gave back, with no slip and the launch unchanged", () => {
  for (const start of [0, 0.1, 0.2, 0.3]) {
    const through = analyse(attempt("held", on, Infinity, throughAt(start)), on, start);
    const braking = analyse(attempt("held", off, Infinity, throughAt(start)), off, start);
    assert.ok(through.Lnorm > braking.Lnorm, `start ${start}`);
    assert.equal(through.peakSlip, 0);
    assert.equal(through.vz, braking.vz, "the push is the push");
    assert.equal(through.rollRate, braking.rollRate, "the leg's yaw buys nothing on the roll");
  }
});

test("the air takes the leg as it left: no snap, no stop", () => {
  const r = attempt("held", on, Infinity, throughAt(0.3));
  const air = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
  for (const f of air) {
    assert.equal(f.freeSwing, air[0].freeSwing);
    assert.equal(f.freeSwingRate, air[0].freeSwingRate);
  }
  assert.ok(air[0].freeSwingRate !== 0);
});

test("outside a push-off the mode changes nothing", () => {
  const a = createState(on, -5), b = createState(off, -5);
  for (let i = 0; i < 360; i++) {
    const t = i * SIM_DT, input = { ...NEUTRAL_INPUT, lean: -0.5, weight: 1, freeLeg: t < 1 ? 0.5 : t < 2 ? 0 : 1 };
    step(a, input, on, SIM_DT, []);
    step(b, input, off, SIM_DT, []);
    assert.equal(checksum(a), checksum(b), `tick ${i}`);
  }
});

test("deterministic, and validated", () => {
  const A = attempt("held", on, Infinity, throughAt(0.3)), B = attempt("held", on, Infinity, throughAt(0.3));
  assert.deepEqual(A.result, B.result);
  assert.deepEqual(validate(on), []);
  assert.ok(validate({ ...on, freeLegSwingThroughMode: 2 }).some(e => e.startsWith("freeLegSwingThroughMode")));
});
