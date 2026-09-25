// pushMechanicsMode (sim/jump.ts, sim/solver.ts §1): the push-off drives the
// leg straight at a constant force over the push's whole ticks; the blade
// carries m (g + a) through the leg's own acceleration, and the takeoff leaves
// at the leg's speed as it straightens, plus the approach's vault. A deeper
// load is more travel and so more lift; a smaller body, less.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { cohortBody } from "./loop-calibration.ts";
import { postureBase } from "./air-posture.ts";

const on = { ...postureBase([]), pushMechanicsMode: 1 } as Params;

interface Tick { legLength: number; legRate: number; load: number; accel?: number; lift?: number; phase: number }

/** A held edge loaded `knee` deep for 0.5 s from 1 s, released: every tick from the release to blade-off, and the takeoff's vz. */
function push(p: Params, knee = 1) {
  const s: SkaterState = createState(p, -6), ticks: Tick[] = [];
  let released = false, vz = 0, vault = false;
  for (let i = 0; i < 240 && s.jump.phase !== JUMP_PHASE.Air; i++) {
    const t = i * SIM_DT, events: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: -0.8, weight: 1, knee: t >= 1 && t < 1.5 ? knee : 0.35 }, p, SIM_DT, events);
    if (s.jump.pushAccel !== undefined) released = true;
    if (released) ticks.push({ legLength: s.legLength, legRate: s.legRate, load: s.blade[1].normalLoad, accel: s.jump.pushAccel, lift: s.jump.pushLift, phase: s.jump.phase });
    if (events.some(e => e.type === EVENT.Takeoff)) { vz = s.jump.vz; vault = p.movesMode >= 1 && s.jump.kind >= 0; }
  }
  return { ticks, vz, vault, s };
}

test("the push drives the leg straight by blade-off at a constant acceleration, and that is the blade's load", () => {
  const { ticks } = push(on);
  // ticks[0] is the release (the knee's spring still had the leg); the push is the next n, the last of them blade-off.
  const [release] = ticks, n = Math.ceil(on.pushOffTime / SIM_DT - 1e-6), T = n * SIM_DT;
  const pushing = ticks.slice(1, n + 1), a = release.accel!, v0 = release.legRate, l0 = release.legLength;
  assert.equal(pushing.length, n);
  assert.equal(pushing.at(-1)!.phase, JUMP_PHASE.Air, "blade-off on the push's last tick");
  pushing.forEach((t, k) => {
    const tau = (k + 1) * SIM_DT;
    // On the last the blade has left, and its load is cleared with the contact.
    if (k < n - 1) assert.ok(Math.abs(t.load - on.mass * (on.gravity + a)) < 1e-9, `N = m (g + a), nothing added, tick ${k + 1}`);
    assert.ok(Math.abs(t.legLength - (l0 + v0 * tau + 0.5 * a * tau * tau)) < 1e-12, `the leg's path, tick ${k + 1}`);
  });
  assert.ok(Math.abs(pushing.at(-1)!.legLength - on.comHeight) < 1e-12, "straight at blade-off");
  assert.ok(Math.abs(release.lift! - (v0 + a * T)) < 1e-12, "the lift is the leg's speed as it straightens");
  // Work and energy agree: the push's net work over the travel is the kinetic energy it gives.
  assert.ok(Math.abs(release.lift! ** 2 - v0 * v0 - 2 * a * (on.comHeight - l0)) < 1e-9);
});

test("the takeoff leaves at the leg's lift plus the approach's vault, and the push state is gone in the air", () => {
  const { ticks, vz, s } = push(on);
  const lift = ticks.find(t => t.lift !== undefined)!.lift!;
  assert.ok(vz > lift, "the vault adds to it");
  assert.ok(vz - lift < 0.2 * on.jumpImpulse + 1e-9, "no more than the formula's vault share");
  assert.equal(s.jump.pushAccel, undefined);
  assert.equal(s.jump.pushLift, undefined);
  const noMoves = push({ ...on, movesMode: 0 });
  assert.equal(noMoves.vz, noMoves.ticks.find(t => t.lift !== undefined)!.lift, "without the moves, the leg's lift is all of it");
});

test("a deeper load is more travel and more lift; a smaller body, less", () => {
  const deep = push(on, 1), shallow = push(on, 0.7);
  assert.ok(deep.ticks[0].lift! > shallow.ticks[0].lift! + 0.3, `deep ${deep.ticks[0].lift} vs shallow ${shallow.ticks[0].lift}`);
  const small = push(cohortBody(on), 1);
  assert.ok(small.ticks[0].lift! < deep.ticks[0].lift!, "the cohort's shorter leg");
});

test("with the mode off the push-off is as it was: the lift given, m v / T added to the load", () => {
  const off = { ...on, pushMechanicsMode: 0 };
  const s = createState(off, -6);
  let sawLoad = false;
  for (let i = 0; i < 240 && s.jump.phase !== JUMP_PHASE.Air; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: -0.8, weight: 1, knee: i * SIM_DT >= 1 && i * SIM_DT < 1.5 ? 1 : 0.35 }, off, SIM_DT, []);
    assert.equal(s.jump.pushAccel, undefined);
    if (s.jump.pushLoad !== undefined) sawLoad = true;
  }
  assert.ok(sawLoad);
});

test("pushMechanicsMode is 0 or 1, and needs the push-off", () => {
  assert.deepEqual(validate(on), []);
  assert.ok(validate({ ...on, pushMechanicsMode: 2 }).some(e => e.startsWith("pushMechanicsMode")));
  assert.ok(validate({ ...on, pushOffMode: 0 }).some(e => e.includes("needs pushOffMode 1")));
});
