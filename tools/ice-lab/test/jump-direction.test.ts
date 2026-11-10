// jumpDirMode: a jump turns the way its entry turns it (issue #74, the owner,
// 2026-11-09: "something you can choose by using the skates, like how you
// enter the jump"). The mirror of a counter-clockwise jump is a clockwise one,
// read off the mirrored table, landed on LBO, and linked only with jumps that
// turn the same way.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, validate } from "../sim/params.ts";
import { JUMP, JUMP_NONE, JUMP_PHASE, noResult } from "../sim/jump.ts";
import { MOVE } from "../sim/types.ts";
import type { JumpResult, SkaterState } from "../sim/types.ts";
import { ComboTracker } from "../sim/combo.ts";
import { setupParams, SETUPS } from "../game/setups.ts";
import { BASELINE, baselineParams, loopBaselineProgram } from "../jpse/baseline.ts";
import { pinPushFeet, runCandidate } from "../jpse/engine.ts";

test("jumpDirMode is 0 by default and 1 in every setup", () => {
  assert.equal(DEFAULT_PARAMS.jumpDirMode, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, jumpDirMode: 2 }).some((e) => /jumpDirMode/.test(e)));
  for (const s of SETUPS) assert.equal(setupParams(s.id).jumpDirMode, 1, s.id);
});

test("the mirrored double loop turns clockwise, is called a loop, and lands on LBO", () => {
  const p = baselineParams(), prog = pinPushFeet(loopBaselineProgram(), p);
  const ccw = runCandidate("c", prog, { mirror: false, reverse: false }, p, JUMP.Loop, BASELINE.runOut);
  const cw = runCandidate("m", prog, { mirror: true, reverse: false }, p, JUMP.Loop, BASELINE.runOut);
  const a = ccw.report, b = cw.report;
  assert.equal(b.takeoff!.code, "LBO");
  assert.ok(b.takeoff!.angMomentum < 0 && a.takeoff!.angMomentum > 0);
  assert.equal(b.landing!.simCalls, "Lo"); assert.equal(b.landing!.direction, "cw"); assert.equal(b.landing!.fall, false);
  // The body's heading turned clockwise in the air: the frames' rotation runs negative.
  const air = cw.frames.filter((f) => f.jumpPhase === "air");
  assert.ok(air[air.length - 1].rotation < -2 * Math.PI * 1.5, `${air[air.length - 1].rotation}`);
  // The tick after touchdown the left blade carries a back outside edge.
  const after = cw.track.find((f) => f.tick === b.landing!.tick + 1)!;
  assert.equal(after.code, "LBO");
  assert.equal(a.landing!.simCalls, "Lo"); assert.equal(a.landing!.direction, "ccw");
  assert.equal(ccw.track.find((f) => f.tick === a.landing!.tick + 1)!.code, "RBO");
});

/** Just the fields ComboTracker.sample reads. */
function comboState(phase: number, landed: JumpResult): SkaterState {
  return {
    jump: { phase }, fallen: false, supportFoot: 1, move: MOVE.None, strokeTime: 0,
    blade: [{ longSpeed: -3 }, { longSpeed: -3 }], landed,
  } as unknown as SkaterState;
}

function landing(tick: number, kind: number, revolutions: number, direction?: number): JumpResult {
  return { ...noResult(), tick, kind, revolutions, turned: revolutions, ...(direction !== undefined ? { direction } : {}) };
}

function combo(first: number | undefined, second: number | undefined): string {
  const c = new ComboTracker(), none = noResult();
  c.sample(comboState(JUMP_PHASE.Air, none));
  const l1 = landing(10, JUMP.Lutz, 3, first);
  c.sample(comboState(JUMP_PHASE.None, l1));
  c.sample(comboState(JUMP_PHASE.Air, l1));
  return c.sample(comboState(JUMP_PHASE.None, landing(20, JUMP.Toeloop, 3, second)));
}

test("a combination links only jumps that turn the same way", () => {
  assert.equal(combo(undefined, undefined), "3Lz+3T", "jumpDirMode 0, as before");
  assert.equal(combo(1, 1), "3Lz+3T");
  assert.equal(combo(-1, -1), "3Lz+3T", "clockwise into clockwise: the mirrored table links the same pairs");
  assert.equal(combo(-1, 1), "", "a clockwise landing is LBO; a counter-clockwise toe loop leaves RBO");
  assert.equal(combo(1, -1), "");
  assert.notEqual(JUMP_NONE, JUMP.Toeloop);
});
