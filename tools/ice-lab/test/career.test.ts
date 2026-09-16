import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CareerState, Choreography, CAREER_EVENTS } from "../game/career.ts";
import type { CareerEvent, ElementId } from "../game/career.ts";
import { createState } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { applyProfile } from "../sim/profile.ts";

const state = () => createState(GAME_PARAMS, 4.5);
const program = (...routine: ElementId[]) => new Choreography({ id: "test", title: "Test", venue: "Test", seconds: 30, routine });
function finish(event: CareerEvent, falls = 0) {
  const c = new Choreography(event); c.index = event.routine.length; c.falls = falls; return c;
}

test("choreography requires ordered sustained moves, movement and grounded poses", () => {
  const c = program("edge", "pose"), s = state();
  c.sample(s, true, 2); assert.equal(c.index, 0, "future pose cannot count early");
  s.lean = .2; c.sample(s, false, 1); s.lean = 0; c.sample(s, false, .1);
  s.lean = .2; c.sample(s, false, 1); assert.equal(c.index, 0, "hold resets on exit");
  c.sample(s, false, 1); assert.equal(c.index, 1);
  s.jump.phase = JUMP_PHASE.Air; c.sample(s, true, 2); assert.equal(c.index, 1);
  s.jump.phase = JUMP_PHASE.None; s.vel = { x: 0, y: 0 }; c.sample(s, true, 2); assert.equal(c.index, 1);
  s.vel = { x: 4, y: 0 }; c.sample(s, true, 2); assert.equal(c.medal, 3);
});

test("old landings and repeated frames cannot satisfy a later jump", () => {
  const c = program("glide", "jump", "jump"), s = state();
  s.landed.tick = 1; s.landed.height = .2;
  c.sample(s, false, 3); c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 2; s.landed.stepOut = true; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 3; s.landed.stepOut = false; c.sample(s, false, .1); assert.equal(c.index, 2);
  c.sample(s, false, .1); assert.equal(c.index, 2);
  s.landed.tick = 4; c.sample(s, false, .1); assert.equal(c.complete, true);
});

test("spin needs a new full rotation per element and resets when interrupted", () => {
  const c = program("spin", "spin"), s = state(); s.move = MOVE.Spin;
  s.spin.swept = Math.PI * 2; c.sample(s, false, .1); assert.equal(c.index, 1);
  c.sample(s, false, .1); assert.equal(c.index, 1);
  s.spin.swept += Math.PI; c.sample(s, false, .1);
  s.move = MOVE.None; c.sample(s, false, .1);
  s.move = MOVE.Spin; s.spin.swept = Math.PI; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.spin.swept = Math.PI * 2; c.sample(s, false, .1); assert.equal(c.complete, true);
});

test("falls count transitions, clear a hold, and downgrade medals without blocking completion", () => {
  const c = program("glide"), s = state(); c.sample(s, false, 2);
  s.fallen = true; c.sample(s, false, .1); c.sample(s, false, .1);
  assert.equal(c.falls, 1); assert.equal(c.held, 0);
  s.fallen = false; c.sample(s, false, 3); assert.equal(c.medal, 2);
  assert.equal(finish(CAREER_EVENTS[0], 3).medal, 1);
});

test("deadline and invalid time cannot earn moves or corrupt a routine", () => {
  const c = program("glide"), s = state();
  for (const dt of [NaN, Infinity, -1, 0]) c.sample(s, false, dt);
  assert.equal(c.elapsed, 0);
  c.sample(s, false, 30); c.sample(s, false, 3);
  assert.equal(c.done, true); assert.equal(c.medal, 0); assert.equal(c.index, 0);
});

test("career unlocks sequentially and pays only improved medals, once", () => {
  const c = new CareerState();
  assert.equal(c.award(finish(CAREER_EVENTS[1])), 0);
  assert.equal(c.award(new Choreography(CAREER_EVENTS[0])), 0);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 3)), 150); assert.equal(c.unlocked, 1);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 1)), 150);
  assert.equal(c.award(finish(CAREER_EVENTS[0])), 150);
  assert.equal(c.award(finish(CAREER_EVENTS[0])), 0);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 3)), 0); assert.equal(c.medals[0], 3);
  for (const event of CAREER_EVENTS.slice(1)) c.award(finish(event));
  assert.equal(c.unlocked, 4); assert.equal(c.profile.xp, 2250);
});

test("XP training persists, spends one point and changes the next career parameter bake", () => {
  const c = new CareerState(); c.award(finish(CAREER_EVENTS[0]));
  const before = applyProfile(GAME_PARAMS, c.profile);
  c.train("strength"); assert.equal(c.profile.xp, 340); assert.equal(c.profile.stats.strength, 51);
  assert.ok(applyProfile(GAME_PARAMS, c.profile).strokePower > before.strokePower);
  const loaded = CareerState.restore(c.serialize());
  assert.deepEqual(loaded.profile, c.profile); assert.deepEqual(loaded.medals, c.medals);
  const fresh = new CareerState(); fresh.train("balance"); assert.equal(fresh.profile.stats.balance, 50);
});

test("corrupt, incompatible and broken-chain saves fall back safely", () => {
  for (const json of [null, "bad json", "{}", '{"version":99}', JSON.stringify({version:1,medals:[0,3,0,0,0],xp:0,stats:new CareerState().profile.stats})]) {
    const c = CareerState.restore(json); assert.equal(c.unlocked, 0); assert.equal(c.profile.xp, 0);
  }
});
