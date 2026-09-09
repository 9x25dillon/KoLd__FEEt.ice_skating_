// The stroke: the only thing in the rig that adds speed.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EDGE, codeSide } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { len } from "../sim/math.ts";

const P = DEFAULT_PARAMS;

function strokeFor(ticks: number, everyN: number, knee = 0.9, start = 0.5): SkaterState {
  const s = createState(P, start, 0);
  const ev: never[] = [];
  for (let i = 0; i < ticks; i++) {
    step(s, { ...NEUTRAL_INPUT, knee, weight: 0.5, push: i % everyN === 0 }, P, SIM_DT, ev);
  }
  return s;
}

test("strokes build speed from a standstill", () => {
  const s = strokeFor(600, 60);
  assert.ok(len(s.vel) > 3.5, `ten strokes should reach stroking pace, got ${len(s.vel).toFixed(2)} m/s`);
  assert.ok(!s.fallen, "and should not put the skater down doing it");
});

test("a deeper knee is a stronger push", () => {
  const soft = len(strokeFor(600, 60, 0.25).vel);
  const deep = len(strokeFor(600, 60, 0.95).vel);
  assert.ok(deep > soft * 1.5, `knee should matter: ${soft.toFixed(2)} vs ${deep.toFixed(2)} m/s`);
});

test("the pushing foot alternates, so a stroke sequence is two-beat", () => {
  const s = createState(P, 1.0, 0);
  const ev: never[] = [];
  const feet: number[] = [];
  for (let i = 0; i < 400; i++) {
    const push = i % 60 === 0;
    step(s, { ...NEUTRAL_INPUT, knee: 0.8, weight: 0.5, push }, P, SIM_DT, ev);
    if (push) feet.push(s.strokeFoot);
  }
  assert.ok(feet.length >= 6, "several strokes");
  for (let i = 1; i < feet.length; i++) {
    assert.notEqual(feet[i], feet[i - 1], `stroke ${i} used the same foot as the one before`);
  }
});

test("the pushing blade is on its inside edge, which is what it pushes against", () => {
  const s = createState(P, 2.0, 0);
  const ev: never[] = [];
  step(s, { ...NEUTRAL_INPUT, knee: 0.8, weight: 0.5, push: true }, P, SIM_DT, ev);
  const push = s.blade[s.strokeFoot];
  assert.ok(s.strokeTime > 0, "a stroke is in progress");
  assert.equal(codeSide(push.code), EDGE.Inside,
    "a push is made against an inside edge, never a flat blade");
});

test("a stroke does not weave the skater off its own line", () => {
  // The bug this guards. The pushing blade was being counted twice — once as
  // an explicit push and once as a carving edge with a 20 degree tilt — so
  // every beat shoved the body sideways and the lean wound up over ten
  // strokes: 0.4, 1.0, 3.9, 8.2, 17.4, 29, 39.8 degrees, then down.
  const s = strokeFor(600, 60);
  assert.ok(Math.abs(s.lean) < (2 * Math.PI) / 180,
    `lean drifted to ${(s.lean * 180 / Math.PI).toFixed(1)} deg from straight stroking`);
  assert.ok(Math.abs(s.pos.y) < 0.5, `wandered ${s.pos.y.toFixed(2)} m off the line`);
});

test("holding the push button does not machine-gun strokes", () => {
  const s = createState(P, 0.5, 0);
  const ev: never[] = [];
  let count = 0;
  let last = s.strokeFoot;
  for (let i = 0; i < 600; i++) {
    step(s, { ...NEUTRAL_INPUT, knee: 0.9, weight: 0.5, push: true }, P, SIM_DT, ev);
    if (s.strokeFoot !== last) { count++; last = s.strokeFoot; }
  }
  // One push per strokeDuration is the ceiling: 5 s / 0.3 s.
  assert.ok(count <= Math.ceil(5 / P.strokeDuration) + 1, `${count} strokes in five seconds`);
  assert.ok(count >= 10, "but held push should keep stroking");
});

test("stroke parameters are validated", () => {
  assert.deepEqual(validate(P), []);
  assert.ok(validate({ ...P, strokeEdge: 0.01 }).some((e) => e.includes("strokeEdge")));
  assert.ok(validate({ ...P, strokeBeta: 0 }).some((e) => e.includes("strokeBeta")));
});
