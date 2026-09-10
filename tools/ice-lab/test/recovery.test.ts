// Falling is latched; getting up is a decision.
//
// The bible's §3.4 machine goes Fall -> grounded -> GetUp -> locomotion. In the
// rig GetUp is a fresh press of the push button, and the seconds between the
// fall and that press are what pre-production-plan.md §6 calls time-to-retry —
// so the thing to protect is that a fallen skater stays down until the tester
// actually does something, and then gets up where they fell rather than being
// teleported back to the start.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState, SkatingInput } from "../sim/types.ts";
import { len } from "../sim/math.ts";

const p = PRESETS.responsive;

/** A full lean at 2 m/s is unsupportable: down in about 1.5 s, deterministically. */
function fall(): { s: SkaterState; ev: EdgeEvent[] } {
  const s = createState(p, 2.0, 0);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < 600 && !s.fallen; i++) {
    step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.45, lean: 1 }, p, SIM_DT, ev);
  }
  assert.ok(s.fallen, "the fixture must actually fall");
  return { s, ev };
}

function tick(s: SkaterState, inp: Partial<SkatingInput>): EdgeEvent[] {
  const ev: EdgeEvent[] = [];
  step(s, { ...NEUTRAL_INPUT, ...inp }, p, SIM_DT, ev);
  return ev;
}

test("a fallen skater stays down until the tester does something", () => {
  const { s } = fall();
  for (let i = 0; i < 600; i++) tick(s, { lean: 0.3, knee: 0.9, weight: 1 });
  assert.ok(s.fallen, "five seconds of lean and knee do not stand anyone up");
});

test("a fresh push stands the skater up where they fell, at rest, and is not a stroke", () => {
  const { s } = fall();
  for (let i = 0; i < 120; i++) tick(s, {});
  const pos = { ...s.pos }, heading = { ...s.heading }, tickNo = s.tick;

  const ev = tick(s, { push: true });
  assert.ok(!s.fallen, "back up");
  assert.deepEqual(s.pos, pos, "where they fell");
  assert.deepEqual(s.heading, heading, "facing the way they were facing");
  assert.equal(len(s.vel), 0, "at rest: nothing to push against yet");
  assert.equal(s.lean, 0);
  assert.equal(s.tick, tickNo + 1, "and the clock kept running");
  assert.equal(s.strokeTime, 0, "the press stood them up; it did not also push");
  assert.equal(ev.filter((e) => e.type === EVENT.Recovered).length, 1, "and said so, once");
});

test("a push held through the fall is not a decision to get up", () => {
  // Push is level-triggered for strokes: hold it and you keep stroking. If it
  // stood the skater up on the same terms, anyone who fell mid-stroke with the
  // button down would be up the next tick and never see the fall.
  const s = createState(p, 2.0, 0);
  for (let i = 0; i < 600 && !s.fallen; i++) tick(s, { weight: 1, knee: 0.45, lean: 1, push: true });
  assert.ok(s.fallen, "fell with the button down");
  for (let i = 0; i < 60; i++) tick(s, { push: true });
  assert.ok(s.fallen, "half a second of held push, still down");
  tick(s, { push: false });
  tick(s, { push: true });
  assert.ok(!s.fallen, "release and press again: that is the decision");
});

test("after standing up the skater can skate again", () => {
  const { s } = fall();
  tick(s, { push: true });
  for (let i = 0; i < 600; i++) tick(s, { weight: 0.5, knee: 0.9, push: i % 60 === 0 });
  assert.ok(!s.fallen, "stroking off from the spot does not put them straight back down");
  assert.ok(len(s.vel) > 3, `and builds speed: ${len(s.vel).toFixed(2)} m/s`);
});

test("a stroke bends the knee even when the trigger does not", () => {
  // A pad with RT released reads knee 0: a straight leg, which cannot push, so
  // before the floor such a pad could not get moving at all — the push force is
  // strokePower * knee. The floor is the neutral stance the keyboard rests at.
  // Measured: 1.88 m/s after ten strokes against 2.15 with the stance held,
  // the gap being the leg bending from straight at the start of every push.
  const straight = createState(p, 0.5, 0);
  const neutral = createState(p, 0.5, 0);
  for (let i = 0; i < 600; i++) {
    tick(straight, { knee: 0, weight: 0.5, push: i % 60 === 0 });
    tick(neutral, { knee: 0.35, weight: 0.5, push: i % 60 === 0 });
  }
  assert.ok(len(straight.vel) > 1.5, `a released trigger still gets moving: ${len(straight.vel).toFixed(2)} m/s`);
  assert.ok(len(straight.vel) > 0.8 * len(neutral.vel) && len(straight.vel) <= len(neutral.vel),
    `and close to the neutral stance: ${len(straight.vel).toFixed(2)} vs ${len(neutral.vel).toFixed(2)}`);

  // The floor is for the push only: between strokes the leg goes back to what
  // was asked for, so the trigger still owns the stance.
  for (let i = 0; i < 120; i++) tick(straight, { knee: 0, weight: 0.5 });
  assert.equal(straight.knee, 0, "no stroke, no floor");
});
