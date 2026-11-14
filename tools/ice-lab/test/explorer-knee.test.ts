import { test } from "node:test";
import { strict as assert } from "node:assert";
import { setupParams, setupInput, explorerPushKnee, EXPLORER_PUSH_KNEE } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls } from "../app/pad.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT, SIM_HZ } from "../sim/params.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { elementHow, howContext } from "../game/padcourse.ts";
import { STEPS } from "../game/tutorial.ts";

const profile = defaultControllerProfile();
const pad = (a: number, rt: number) => {
  const buttons = Array(17).fill(0); buttons[0] = a; buttons[7] = rt;
  return { hardware: { connected: true, axes: [0, 0, 0, 0], buttons, keys: [] } } as unknown as Controls;
};

/** One tick of a setup from rest: the knee its mapping hands the solver. */
function kneeAsked(setup: Setup, a: number, rt: number): number {
  const p = setupParams(setup), s = createState(p, 0), st: GameControlState = newSchemeState();
  return setupInput(pad(a, rt), s, setup, st, p, profile).input.knee;
}

/**
 * Explorer from a standstill, RT held at `rt`, A tapped (3 ticks) every `gap`
 * ticks: the owner's median gap in their First ice replay (2026-11-11 17:55) was 50.
 */
function standingStart(rt = 0, gap = 50, seconds = 8) {
  const p = setupParams("explorer"), s = createState(p, 0), st: GameControlState = newSchemeState();
  let reach = -1, falls = 0, was = false, loaded = false;
  for (let t = 0; t < seconds * SIM_HZ; t++) {
    const mapped = setupInput(pad(t % gap < 3 ? 1 : 0, rt), s, "explorer", st, p, profile);
    step(s, mapped.input, p, SIM_DT, []);
    if (s.jump.phase !== JUMP_PHASE.None) loaded = true;
    if (reach < 0 && Math.hypot(s.vel.x, s.vel.y) > 3) reach = t / SIM_HZ;
    if (s.fallen && !was) falls++; was = s.fallen;
  }
  return { reach, falls, loaded, v: Math.hypot(s.vel.x, s.vel.y) };
}

test("Explorer bends the knee under a push when RT asks for less", () => {
  assert.equal(kneeAsked("explorer", 1, 0), EXPLORER_PUSH_KNEE);
  assert.equal(kneeAsked("explorer", 1, 0.3), EXPLORER_PUSH_KNEE);
  // Deeper RT is still the player's, and still stronger.
  assert.ok(Math.abs(kneeAsked("explorer", 1, 0.9) - 0.9) < 0.02);
  // No push, no bend: a glide stands as RT says.
  assert.equal(kneeAsked("explorer", 0, 0), 0);
});

test("only Explorer: every other setup's knee is what it was", () => {
  for (const setup of ["simulation", "experimental", "diggate", "repertoire"] as const)
    assert.ok(kneeAsked(setup, 1, 0) < EXPLORER_PUSH_KNEE, setup);
});

test("never in a jump, a move or a fall, and never as deep as a jump's load", () => {
  const p = setupParams("explorer"), push = { push: true, knee: 0 } as Parameters<typeof explorerPushKnee>[0];
  const s = createState(p, 3);
  assert.equal(explorerPushKnee({ ...push }, s, p).knee, EXPLORER_PUSH_KNEE);
  for (const phase of [JUMP_PHASE.Load, JUMP_PHASE.Air]) {
    const j = createState(p, 3); j.jump.phase = phase;
    assert.equal(explorerPushKnee({ ...push }, j, p).knee, 0);
  }
  const down = createState(p, 3); down.fallen = true;
  assert.equal(explorerPushKnee({ ...push }, down, p).knee, 0);
  assert.ok(EXPLORER_PUSH_KNEE < p.jumpLoadKnee);
  // Were the load ever made shallower, the bend stays clear of it.
  assert.ok(explorerPushKnee({ ...push }, s, { ...p, jumpLoadKnee: 0.5 }).knee < 0.5);
});

// MEASURED 2026-11-14 (EXPLORER_PUSH_KNEE's comment): the owner's tapping, RT released.
test("from a standstill, tapping A with RT released now reaches First ice's 3 m/s, without a hop or a fall", () => {
  const r = standingStart();
  assert.ok(r.reach > 0 && r.reach < 5, `reached 3 m/s at ${r.reach} s`);
  assert.equal(r.falls, 0);
  assert.equal(r.loaded, false, "a push never loads a jump");
});

test("RT deeper than the default still pays", () => {
  const plain = standingStart(), deep = standingStart(1);
  assert.ok(deep.reach > 0 && deep.reach < plain.reach - 1, `${deep.reach} s against ${plain.reach} s`);
  assert.equal(deep.falls, 0);
});

test("Explorer's words say RT is the push", () => {
  const explorer = howContext("explorer", profile), sim = howContext("simulation", profile);
  assert.match(elementHow("glide", explorer), /RT bends the knee/);
  assert.match(elementHow("crossover", explorer), /RT bends the knee/);
  assert.doesNotMatch(elementHow("glide", sim), /RT bends the knee/);
  const push = STEPS.find(x => x.id === "push")!;
  assert.match(push.how(explorer), /squeeze RT as you push/);
  assert.doesNotMatch(push.how(howContext("repertoire", profile)), /squeeze RT as you push/);
});
