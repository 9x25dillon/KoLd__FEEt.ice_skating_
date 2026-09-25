// The free leg timed by the push (test/takeoff-budget.ts SwingPhase,
// test/free-leg-timing.ts): the swing's profile, the two clocks, the fallback
// said out loud, and choreography only — asking the leg to stay where it is
// changes nothing.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt, swingProgress } from "./takeoff-budget.ts";
import type { SwingPhase } from "./takeoff-budget.ts";
import { stackParams, swingAt } from "./free-leg-timing.ts";

test("the swing's progress: 0 to 1, monotonic, its rate continuous with one peak where asked", () => {
  for (const peak of [0.5, 0.6, 0.7]) {
    const sw: SwingPhase = { start: 0.2, peak, end: 0.9 };
    assert.equal(swingProgress(0.1, sw), 0);
    assert.equal(swingProgress(0.95, sw), 1);
    const h = 1e-4, xs: number[] = [], rates: number[] = [];
    for (let x = 0.2; x <= 0.9 + 1e-12; x += h) { xs.push(x); rates.push((swingProgress(x + h / 2, sw) - swingProgress(x - h / 2, sw)) / h); }
    for (let i = 1; i < xs.length; i++) {
      assert.ok(swingProgress(xs[i], sw) >= swingProgress(xs[i - 1], sw), "monotonic");
      assert.ok(Math.abs(rates[i] - rates[i - 1]) < 0.01, `rate continuous at ${xs[i].toFixed(4)}`);
    }
    const at = xs[rates.indexOf(Math.max(...rates))];
    assert.ok(Math.abs(at - peak) < 2 * h, `peak at ${at} for ${peak}`);
    assert.ok(rates[0] < 0.01 && rates.at(-1)! < 0.01, "no rate at either end");
  }
});

test("the leg rests until the push, is swung by the push's phase, and the clock in use is said", () => {
  const p = stackParams([]);
  const r = attempt("held", p, Infinity, swingAt(0.6));
  assert.equal(r.phaseFallback, false, "pushMechanicsMode: the extension clock");
  const ground = r.frames.filter(f => f.phase !== JUMP_PHASE.Air), bladeOff = r.frames.find(f => f.phase === JUMP_PHASE.Air)!;
  for (const f of ground) if (f.swingPhase < 0) assert.equal(f.freeLegCmd, 0.5, "at rest before the push");
  for (const f of [...ground, bladeOff]) if (f.swingPhase >= 0.9) assert.equal(f.freeLegCmd, 0, "swung back from 90%");
  assert.ok(bladeOff.swingPhase >= 0.9, "the push's last tick is asked past 90%");
  const noMechanics = attempt("held", { ...p, pushMechanicsMode: 0 }, Infinity, swingAt(0.6));
  assert.equal(noMechanics.phaseFallback, true, "no extension to read: the time clock, flagged");
  assert.equal(attempt("held", { ...p, pushMechanicsMode: 0 }, Infinity, swingAt(0.6, "time")).phaseFallback, false, "the time clock asked for is no fallback");
});

test("choreography only: a swing asked to stay at rest is the run with no swing at all", () => {
  const p = stackParams([]);
  const still = attempt("held", p, Infinity, { swing: { start: 0.2, peak: 0.6, end: 0.9, to: 0.5 } }), none = attempt("held", p, Infinity, {});
  assert.deepEqual(still.result, none.result);
  assert.equal(still.L, none.L);
});

// The ASKED phases only: the hip is torque-limited in wall-clock time, so the
// leg's own motion does not keep them (test/free-leg-timing.ts, its last table).
test("on the time clock the swing is asked at the same phases of the push whatever pushOffTime is", () => {
  for (const T of [0.2, 0.25, 0.3]) {
    const p = { ...stackParams([]), pushOffTime: T };
    const asked = attempt("held", p, Infinity, swingAt(0.6, "time")).frames.filter(f => f.swingPhase >= 0), tick = (1 / 120) / T;
    const first = asked.find(f => f.freeLegCmd < 0.5)!, done = asked.find(f => f.freeLegCmd === 0)!;
    assert.ok(first.swingPhase > 0.2 && first.swingPhase <= 0.2 + tick + 1e-9, `starts at 20% of ${T}: ${first.swingPhase}`);
    assert.ok(done.swingPhase >= 0.9 - 1e-9 && done.swingPhase <= 0.9 + tick + 1e-9, `done at 90% of ${T}: ${done.swingPhase}`);
  }
});
