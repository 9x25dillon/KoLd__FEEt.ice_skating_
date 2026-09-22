import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SETUPS, setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT, validate } from "../sim/params.ts";
import { MOVE, TURN_KIND } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { IceGrid } from "../sim/ice.ts";

function rig(setup: Setup, speed = 6.8, assist = 0.75) {
  const p = setupParams(setup, assist), s = createState(p, speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  h.buttons[7] = 0.38;
  const rec = new ReplayRecorder(p, speed);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const map = (autoPush = false) => setupInput({ hardware: h, autoPush } as Controls, s, setup, st, p, profile, assist);
  const tick = () => { const result = map(); const events: Parameters<typeof step>[4] = []; step(s, result.input, p, SIM_DT, events, ice); rec.capture(result.input, p, s, events, "D"); return result; };
  const skate = (ticks: number) => { for (let i = 0; i < ticks; i++) tick(); };
  return { p, s, h, st, profile, map, tick, skate, rec };
}

test("setup assistance remains bounded and preserves the blade and jump mechanics", () => {
  for (const { id } of SETUPS) for (const assist of [0.5, 0.75, 1]) assert.deepEqual(validate(setupParams(id, assist)), []);
  const sim = setupParams("simulation"), mid = setupParams("explorer", 0.5), high = setupParams("explorer", 1);
  assert.ok(sim.internalMax < mid.internalMax && mid.internalMax < high.internalMax);
  assert.ok(sim.controlLatency > mid.controlLatency && mid.controlLatency > high.controlLatency);
  assert.equal(sim.jumpAssist, 0); assert.equal(mid.jumpAssist, 0); assert.equal(sim.hypeMode, 0);
  for (const key of ["rocker", "muGlide", "sharpness", "jumpImpulse", "landingShock"] as const) assert.equal(sim[key], high[key], key);
  for (const bad of [0, 1.1, NaN]) assert.throws(() => setupParams("explorer", bad));
});

test("simulation independently controls blades and reaches arms without disturbing the held blade", () => {
  const r = rig("simulation"); r.h.axes = [-0.7, 0, 0.5, 0];
  const before = r.map().input;
  assert.ok(before.leanSplit > 0); assert.equal(before.carriage, 0); assert.equal(before.windup, 0);
  r.h.buttons[10] = 1; r.h.axes[2] = 1;
  const arms = r.map().input;
  assert.equal(arms.lean, before.lean); assert.equal(arms.leanSplit, before.leanSplit);
  assert.equal(arms.carriage, 1); assert.equal(arms.windup, 1);
  r.h.buttons[10] = 0; const after = r.map().input;
  assert.notEqual(after.leanSplit, before.leanSplit); assert.equal(after.carriage, 0);
});

test("simulation needs a fresh push and never accepts Cruise pulses", () => {
  const r = rig("simulation"); r.h.buttons[0] = 1;
  assert.equal(r.map().input.push, true);
  r.s.tick = 90; assert.equal(r.map(true).input.push, false);
  r.h.buttons[0] = 0; assert.equal(r.map(true).input.push, false);
  r.h.buttons[0] = 1; assert.equal(r.map().input.push, true);
});

test("Explorer assistance reduces deep lean demand at low speed without choosing the foot or pressure", () => {
  const mid = rig("explorer", 2, 0.5), high = rig("explorer", 2, 1);
  for (const r of [mid, high]) { r.h.axes = [0.9, -0.7, 0, 0]; r.h.buttons[4] = 1; }
  const a = mid.map().input, b = high.map().input;
  assert.ok(b.lean > 0 && b.lean < a.lean); assert.equal(b.weight, 0); assert.equal(b.pitch, a.pitch); assert.ok(b.pitch > 0);
  high.h.axes[0] *= -1; assert.ok(high.map().input.lean < 0);
  const stopped = rig("explorer", 0, 1); stopped.h.axes[0] = 1; assert.equal(stopped.map().input.lean, 0);
});

for (const { id } of SETUPS) test(`${id}: load/release and replay use the actual solver`, () => {
  const r = rig(id); r.skate(30); r.h.buttons[7] = 0.95; r.skate(36);
  assert.equal(r.s.jump.phase, JUMP_PHASE.Load);
  r.h.buttons[7] = 0; r.tick(); assert.equal(r.s.jump.phase, JUMP_PHASE.Air);
  r.skate(15); assert.ok(r.s.jump.z > 0);
  assert.equal(verifyReplay(parseReplay(r.rec.toJson())).divergence, null);
});

for (const id of ["simulation", "explorer"] as const) test(`${id}: manual turn release chooses three-turn, holding chooses loop`, () => {
  for (const held of [false, true]) {
    const r = rig(id); r.h.axes[0] = -0.5; if (id === "simulation") r.h.axes[2] = -0.5;
    r.skate(240); r.h.buttons[1] = 1; r.tick(); assert.equal(r.s.move, MOVE.Turn);
    if (!held) r.h.buttons[1] = 0;
    r.skate(100); assert.equal(r.s.moveDone.detail, held ? TURN_KIND.Loop : TURN_KIND.ThreeTurn);
    assert.equal(r.s.fallen, false);
  }
});
