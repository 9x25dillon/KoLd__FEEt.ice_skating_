import { test } from "node:test";
import { strict as assert } from "node:assert";
import { IceEffects, MAX_ICE_PARTICLES } from "../game/effects.ts";
import { performancePose, skinById } from "../game/appearance.ts";
import { bodyPoints } from "../app/draw.ts";
import { createState } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { REGIME } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { SIM_DT } from "../sim/params.ts";

function braking(speed = 6) {
  const state = createState(GAME_PARAMS, speed);
  for (const blade of state.blade) { blade.regime = REGIME.Brake; blade.inContact = true; }
  return state;
}
test("spray responds to speed and contact, remains bounded, and expires", () => {
  const high = new IceEffects(), low = new IceEffects();
  const fast = braking(), slow = braking(1);
  for (let i = 0; i < 30; i++) { high.update(fast, SIM_DT); low.update(slow, SIM_DT); }
  assert.ok(high.particles.length > low.particles.length);
  assert.ok(low.particles.length > 0);
  for (let i = 0; i < 1000; i++) high.update(fast, SIM_DT);
  assert.ok(high.particles.length <= MAX_ICE_PARTICLES);
  fast.jump.phase = JUMP_PHASE.Air;
  for (let i = 0; i < 120; i++) high.update(fast, SIM_DT);
  assert.equal(high.particles.length, 0);
  fast.jump.phase = JUMP_PHASE.None; fast.fallen = true;
  high.update(fast, 1); assert.equal(high.particles.length, 0);
  fast.fallen = false; fast.blade.forEach(b => b.inContact = false);
  high.update(fast, 1); assert.equal(high.particles.length, 0);
});
test("carving emits a lighter spray; flat glides emit none", () => {
  const state = braking(), effects = new IceEffects();
  for (const blade of state.blade) blade.regime = REGIME.Glide;
  effects.update(state, .2); assert.equal(effects.particles.length, 0);
  for (const blade of state.blade) { blade.regime = REGIME.Carve; blade.tilt = .3; }
  effects.update(state, .2); assert.ok(effects.particles.length > 0);
});
test("each landing fires once, reports its result, freezes without a tick, and clears on reset", () => {
  const state = createState(GAME_PARAMS, 4), effects = new IceEffects();
  effects.reset(state); effects.update(state, SIM_DT); assert.equal(effects.landing === null, true);
  state.landed.tick = 20; state.landed.height = .5; state.landed.turned = 1;
  effects.update(state, SIM_DT); assert.equal(effects.landing?.label, "Landed");
  const count = effects.particles.length;
  effects.update(state, 0); assert.equal(effects.landing?.age, 0);
  effects.update(state, SIM_DT); assert.equal(effects.particles.length, count);
  state.landed.tick = 40; state.landed.stepOut = true;
  effects.update(state, SIM_DT); assert.equal(effects.landing?.label, "Step-out");
  assert.equal(effects.landing?.clean, false);
  state.landed.tick = 60; state.landed.fall = true;
  effects.update(state, SIM_DT); assert.equal(effects.landing?.label, "Fall");
  effects.reset(state); effects.update(state, SIM_DT);
  assert.equal(effects.landing === null, true); assert.equal(effects.particles.length, 0);
});
test("cosmetic effects and poses do not mutate replay state or move blade contacts", () => {
  const state = braking(); state.strokeTime = .15; state.tick = 12;
  const before = structuredClone(state), effects = new IceEffects();
  effects.update(state, SIM_DT);
  const pose = performancePose(state, GAME_PARAMS);
  assert.deepEqual(state, before);
  assert.deepEqual(pose.body.feet, bodyPoints(state, GAME_PARAMS).feet);
  assert.notDeepEqual(pose.body.hands, bodyPoints(state, GAME_PARAMS).hands);
  assert.equal(pose.elbows.length, 2);
});
test("reduced motion cuts particles and unknown saved skins fall back safely", () => {
  const state = braking(), full = new IceEffects(), reduced = new IceEffects();
  reduced.reducedMotion = true;
  for (let i = 0; i < 30; i++) { full.update(state, SIM_DT); reduced.update(state, SIM_DT); }
  assert.ok(reduced.particles.length < full.particles.length);
  assert.equal(skinById("aurora").bun, true);
  assert.equal(skinById("unknown").id, "violet");
  assert.equal(skinById(null).id, "violet");
});
