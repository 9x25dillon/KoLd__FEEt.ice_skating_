// Losses: friction, drag, and the one thing friction must never do.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import { createState, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { len, dot } from "../sim/math.ts";
import { muLong } from "../sim/blade.ts";

const flat = { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 };

test("friction never reverses motion", () => {
  // The classic integration bug: a fixed decrement applied to a velocity
  // smaller than itself, and the skater starts gliding backwards.
  const p = DEFAULT_PARAMS;
  const s = createState(p, 0.02, 0);
  run(s, flat, p, 600);
  assert.ok(dot(s.vel, s.heading) >= 0, `ran backwards: ${dot(s.vel, s.heading)} m/s`);
  assert.ok(len(s.vel) >= 0);
});

test("a glide slows down, and roughly as fast as the closed form says", () => {
  const p = DEFAULT_PARAMS;
  const s = createState(p, 5.0, 0);
  run(s, flat, p, 120);                       // one second
  const v = len(s.vel);
  assert.ok(v < 5.0, "must have lost speed");

  // dv/dt = -(mu g + 0.5 rho CdA v^2 / m). Evaluated at the start, this is an
  // upper bound on the loss over the second; the true answer is a little less.
  const worst = p.muGlide * p.gravity + (0.5 * p.airDensity * p.cdA * 25) / p.mass;
  assert.ok(5.0 - v <= worst + 1e-6, `lost ${(5 - v).toFixed(4)} m/s, bound ${worst.toFixed(4)}`);
  assert.ok(5.0 - v > 0.5 * worst, "and it should be the same order as the bound");
});

test("air drag dominates blade friction at speed", () => {
  // The reason speed is expensive to build and cheap to keep, and the reason a
  // deep-knee stroke matters more than a sharper blade.
  const p = DEFAULT_PARAMS;
  const blade = p.muGlide * p.mass * p.gravity;
  const dragAt = (v: number): number => 0.5 * p.airDensity * p.cdA * v * v;
  assert.ok(dragAt(2) < blade, "at 2 m/s the blade is the bigger loss");
  assert.ok(dragAt(8) > 3 * blade, "at 8 m/s drag has taken over");
});

test("a deeper edge costs more speed than a flat blade", () => {
  const p = DEFAULT_PARAMS;
  assert.ok(muLong(0.5, false, p) > muLong(0.0, false, p));
  assert.ok(muLong(0.0, true, p) > muLong(0.5, false, p), "a skid costs more than any edge");
});

test("a skater at rest stays at rest", () => {
  const p = DEFAULT_PARAMS;
  const s = createState(p, 0, 0);
  run(s, flat, p, 240);
  assert.ok(len(s.vel) < 1e-9, `drifted to ${len(s.vel)} m/s from a standstill`);
  assert.ok(!s.fallen, "and should not fall over standing still on two feet");
});

test("standing two-footed recovers from a nudge; one foot does not", () => {
  // Centre-of-pressure shift within the stance is real authority and it is the
  // only thing holding a stationary skater up. Take it away and they go down.
  const p = DEFAULT_PARAMS;
  const two = createState(p, 0, 0.10);
  run(two, { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 }, p, 480);
  assert.ok(!two.fallen, "two feet should save a 6 degree lean at a standstill");

  const one = createState(p, 0, 0.10);
  run(one, { ...NEUTRAL_INPUT, lean: 0, weight: 1 }, p, 480);
  assert.ok(one.fallen, "one foot at a standstill has no way back from the same lean");
});
