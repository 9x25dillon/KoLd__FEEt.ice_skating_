import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gameInput, GAME_PARAMS } from "../game/controls.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT, PRESETS } from "../sim/params.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { MOVE, SPIN_POSITION } from "../sim/types.ts";
import { SCHEME, newSchemeState } from "../app/schemes.ts";
import type { Controls } from "../app/pad.ts";

const neutral: Controls = {
  lx: 0, ly: 0, rx: 0, ry: 0, lean: 0, pitch: 0, kx: 0, ky: 0, kPrimaryX: 0, kAltX: 0,
  knee: 0.35, weight: 0.5, push: false, brake: false, carriage: 0, windup: 0, toe: false,
  turn: false, bracket: false, twizzle: false, spin: false, inaBauer: false, reset: false, pause: false,
  cyclePreset: false, cycleScheme: false, cycleJump: false, cycleView: false, zoom: 0,
  dpadStep: 0, tilt: 0, toggleGame: false, cycleGhost: false, pickJump: -1,
  cycleProfile: false, cycleMoves: false, cycleRink: false,
};
function rig(speed = 5) {
  const s = createState(GAME_PARAMS, speed), steering = newSchemeState();
  const tick = (c: Partial<Controls> = {}, low = false) => {
    const result = gameInput({ ...neutral, ...c }, s, SCHEME.B, steering, low);
    step(s, result.input, GAME_PARAMS, SIM_DT, []);
    return result;
  };
  const skate = (ticks: number, c: Partial<Controls> = {}) => { for (let i = 0; i < ticks; i++) tick(c); };
  skate(30);
  return { s, tick, skate };
}

test("moves are enabled in the game without mutating the lab preset", () => {
  assert.equal(GAME_PARAMS.jumpMode, 2); assert.equal(GAME_PARAMS.movesMode, 1);
  assert.equal(PRESETS.assisted.jumpMode, 0); assert.equal(PRESETS.assisted.movesMode, 0);
});
test("load and release reaches the jump solver, including the toe pick", () => {
  const r = rig(); r.skate(36, { knee: 0.95 });
  assert.equal(r.s.jump.phase, JUMP_PHASE.Load);
  r.tick({ knee: 0.95, toe: true }); r.tick({ knee: 0 });
  assert.equal(r.s.jump.phase, JUMP_PHASE.Air); assert.equal(r.s.jump.toeInLoad, true);
  r.skate(8); assert.ok(r.s.jump.z > 0);
});
test("spin, sit, camel and twizzle controls perform actual solver moves", () => {
  const r = rig(); r.tick({ spin: true }); assert.equal(r.s.move, MOVE.Spin);
  r.skate(30, { spin: true, knee: 0.95 }); assert.equal(r.s.spin.position, SPIN_POSITION.Sit);
  r.skate(45, { spin: true, ry: 1, knee: 0 }); assert.equal(r.s.spin.position, SPIN_POSITION.Camel);
  r.tick(); assert.equal(r.s.move, MOVE.None);
  const t = rig(); t.tick({ twizzle: true }); assert.equal(t.s.move, MOVE.Twizzle);
});
test("Ina Bauer and cantilever pose have distinct inputs; low pose does not charge a jump", () => {
  const r = rig(); r.tick({ inaBauer: true }); assert.equal(r.s.move, MOVE.InaBauer);
  const low = rig();
  for (let i = 0; i < 120; i++) {
    const result = low.tick({windup: 1}, true);
    assert.equal(result.input.windup, 0, "a low pose must not arm a later jump");
    assert.equal(result.cantilever, true); assert.equal(result.input.weight, 0.5);
    assert.equal(low.s.jump.phase, JUMP_PHASE.None);
  }
  assert.equal(low.tick().cantilever, false); assert.equal(low.s.jump.phase, JUMP_PHASE.None);
  low.s.fallen = true; assert.equal(low.tick({}, true).cantilever, false);
});
test("a three-turn reverses skating and pushes produce crossovers in either direction", () => {
  const r = rig(6); r.skate(180, { kx: -1, weight: 1 });
  r.tick({ kx: -1, weight: 1, turn: true }); assert.equal(r.s.move, MOVE.Turn);
  r.skate(120, { kx: -1, weight: 1 });
  assert.ok(r.s.flips > 0);
  assert.ok(r.s.vel.x * r.s.heading.x + r.s.vel.y * r.s.heading.y < 0);
  for (const speed of [6, -6]) {
    const x = rig(speed); x.skate(240, { kx: -1 }); x.tick({ kx: -1, push: true });
    assert.equal(x.s.crossover, true, `crossover at ${speed} m/s`);
  }
});
test("backward assisted steering follows travel direction instead of demanding a reversal", () => {
  const r = rig(-5);
  const { input } = gameInput({ ...neutral, lx: -1 }, r.s, SCHEME.B, newSchemeState());
  assert.ok(Math.abs(input.lean) < 1e-6);
});
