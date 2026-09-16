import { test } from "node:test";
import { strict as assert } from "node:assert";
import { IceRun, LIGHTS } from "../game/run.ts";
import { createState, step } from "../sim/solver.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { SCHEME, newSchemeState } from "../app/schemes.ts";
import { GAME_PARAMS, gameInput } from "../game/controls.ts";
import type { Controls } from "../app/pad.ts";

test("lights require order, award once, chain and wrap to another lap", () => {
  const run = new IceRun(), s = createState(PRESETS.assisted);
  s.pos = { ...LIGHTS[1] }; assert.equal(run.sample(s, 0.01), false);
  for (let i = 0; i < 12; i++) {
    s.pos = { ...run.target }; assert.equal(run.sample(s, 0.1), true);
    assert.equal(run.sample(s, 0.01), false);
  }
  assert.equal(run.collected, 12); assert.equal(run.score, 3000);
  assert.deepEqual(run.target, LIGHTS[0]); assert.equal(run.multiplier, 5);
});
test("falls and slow pickups break the chain; fallen skaters cannot collect", () => {
  const run = new IceRun(), s = createState(PRESETS.assisted);
  for (let i = 0; i < 4; i++) { s.pos = { ...run.target }; run.sample(s, 0.1); }
  s.fallen = true; s.pos = { ...run.target };
  assert.equal(run.sample(s, 0.1), false); run.sample(s, 0.1);
  assert.equal(run.falls, 1); assert.equal(run.combo, 0);
  s.fallen = false; run.sample(s, 0.1);
  s.pos = { x: 100, y: 100 }; run.sample(s, 8.1);
  assert.equal(run.combo, 0);
});
test("the deadline ends scoring and invalid time cannot corrupt a run", () => {
  const run = new IceRun(), s = createState(PRESETS.assisted);
  run.sample(s, NaN); run.sample(s, -1); assert.equal(run.seconds, 90);
  s.pos = { ...run.target }; run.sample(s, 90);
  assert.equal(run.done, true); assert.equal(run.score, 0);
  run.sample(s, 1); assert.equal(run.seconds, 0); assert.equal(run.collected, 0);
});

test("the actual assisted solver can complete a lap by steering toward the lights", () => {
  const run = new IceRun(), s = createState(GAME_PARAMS, 4.5), steering = newSchemeState();
  const controls: Controls = {
    lx: 0, ly: 0, rx: 0, ry: 0, lean: 0, pitch: 0, kx: 0, ky: 0, kPrimaryX: 0, kAltX: 0,
    knee: 0.35, weight: 0.5, push: false, brake: false, carriage: 0, windup: 0, toe: false,
    turn: false, bracket: false, twizzle: false, spin: false, inaBauer: false, reset: false, pause: false,
    cyclePreset: false, cycleScheme: false, cycleJump: false, cycleView: false, zoom: 0,
    dpadStep: 0, tilt: 0, toggleGame: false, cycleGhost: false, pickJump: -1,
    cycleProfile: false, cycleMoves: false, cycleRink: false,
  };
  for (let tick = 0; tick < 10800; tick++) {
    const dx = run.target.x - s.pos.x, dy = run.target.y - s.pos.y;
    const distance = Math.hypot(dx, dy);
    controls.lx = dx / distance; controls.ly = dy / distance;
    controls.push = tick % 90 === 0;
    step(s, gameInput(controls, s, SCHEME.B, steering).input, GAME_PARAMS, SIM_DT, []);
    run.sample(s, SIM_DT);
  }
  assert.ok(run.collected >= 12, `only collected ${run.collected} lights`);
  assert.equal(run.falls, 0);
});
