import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Playground, SNOWFLAKES, TARGETS } from "../game/playground.ts";
import { IceEffects } from "../game/effects.ts";
import { createState } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { SIM_DT } from "../sim/params.ts";

test("snowflake reward is emitted once per collection and matches awarded points", () => {
  const game = new Playground(), state = createState(GAME_PARAMS, 0);
  state.pos = { ...SNOWFLAKES[0] };
  game.sample(state, SIM_DT);
  assert.equal(game.score, 100);
  assert.deepEqual(game.rewards, [{ ...SNOWFLAKES[0], kind: "snowflake", points: 100 }]);
  game.sample(state, SIM_DT);
  assert.equal(game.score, 100); assert.deepEqual(game.rewards, []);
});

test("simultaneous goals keep separate rewards; an out-of-bounds puck earns none", () => {
  const game = new Playground(), state = createState(GAME_PARAMS, 0);
  Object.assign(game.pucks[0], TARGETS[0]);
  Object.assign(game.pucks[1], TARGETS[1]);
  Object.assign(game.pucks[2], { x: 28, y: 30 });
  game.sample(state, SIM_DT);
  assert.equal(game.score, 1000);
  assert.deepEqual(game.rewards, [
    { ...TARGETS[0], kind: "goal", points: 500 },
    { ...TARGETS[1], kind: "goal", points: 500 },
  ]);
  game.sample(state, SIM_DT); assert.deepEqual(game.rewards, []);
});

test("reward effects copy events, freeze while paused, expire, and clear on reset", () => {
  const effects = new IceEffects(), state = createState(GAME_PARAMS, 0);
  const event = { x: 1, y: 2, kind: "light" as const, points: 400 };
  effects.reward(event); event.points = 100;
  assert.equal(effects.rewards[0].points, 400);
  effects.update(state, 0); assert.equal(effects.rewards[0].age, 0);
  for (let i = 0; i < 180; i++) effects.update(state, SIM_DT);
  assert.equal(effects.rewards.length, 0);
  for (let i = 0; i < 100; i++) effects.reward(event);
  assert.equal(effects.rewards.length, 12);
  effects.reset(state); assert.equal(effects.rewards.length, 0);
});
