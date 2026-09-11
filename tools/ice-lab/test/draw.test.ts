// The overlay has to agree with the solver about which side the body is on.
//
// It did not: the balance overlay drew the centre of mass at
// base - perpLeft * L sin(lean), which is the mirror image — outside the turn
// on every carve — while step() puts it at base + perpLeft * L sin(lean). The
// pendulum is the one overlay whose whole job is showing the balance problem,
// and it was showing it inverted. This file is the check that it stays fixed.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pendulum, bodyPoints, SEGMENT } from "../app/draw.ts";
import type { V3 } from "../app/draw.ts";
import { PRESETS } from "../sim/params.ts";
import { createState, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { perpLeft, sub, dot } from "../sim/math.ts";

test("the drawn centre of mass is where the solver put it, on the inside of the lean", () => {
  const p = { ...PRESETS.responsive };
  for (const lean of [0.4, -0.4]) {
    const s = createState(p, 5, 0);
    run(s, { ...NEUTRAL_INPUT, lean }, p, 90);
    assert.ok(!s.fallen, "the skater should still be up after 0.75 s");
    assert.ok(Math.abs(s.lean) > 0.05, `the skater should be leaning, is at ${s.lean}`);

    const { base, com, eq } = pendulum(s);
    assert.deepEqual(com, s.pos);
    const side = dot(sub(com, base), perpLeft(s.heading));
    assert.equal(Math.sign(side), Math.sign(s.lean), "COM drawn on the wrong side of the base");
    assert.ok(Math.abs(side - s.legLength * Math.sin(s.lean)) < 1e-9,
      `COM offset ${side} is not L sin(lean) = ${s.legLength * Math.sin(s.lean)}`);

    const eqSide = dot(sub(eq, base), perpLeft(s.heading));
    assert.equal(Math.sign(eqSide), Math.sign(s.leanEq), "equilibrium line on the wrong side");
  }
});

test("the tilted figure is the pendulum: the COM where the solver put it, leaning its way", () => {
  const p = { ...PRESETS.responsive };
  for (const lean of [0.4, -0.4]) {
    const s = createState(p, 5, 0);
    run(s, { ...NEUTRAL_INPUT, lean }, p, 90);
    const b = bodyPoints(s, p);
    assert.deepEqual([b.com.x, b.com.y, b.com.z], [s.pos.x, s.pos.y, s.comZ]);
    const L = Math.hypot(b.com.x - b.base.x, b.com.y - b.base.y, b.com.z - b.base.z);
    assert.ok(Math.abs(L - s.legLength) < 1e-9, `base to COM ${L} is the leg length ${s.legLength}`);
    const side = dot(sub(b.com, b.base), perpLeft(s.heading));
    assert.equal(Math.sign(side), Math.sign(s.lean), "the body tips the way the solver leans it");
    assert.ok(b.head.z > b.shoulder.z && b.shoulder.z > b.hip.z, "and it is standing up");
  }
});

test("the knee is solved, not placed: two fixed segments, bending forward, deeper with RT", () => {
  const p = { ...PRESETS.responsive };
  const d = (a: V3, c: V3): number => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
  const forward: number[] = [];
  for (const knee of [0.35, 0.95]) {
    const s = createState(p, 4, 0);
    run(s, { ...NEUTRAL_INPUT, knee }, p, 120);
    assert.ok(!s.fallen);
    const b = bodyPoints(s, p);
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(d(b.hips[i], b.knees[i]) - SEGMENT) < 1e-9, "thigh keeps its length");
      assert.ok(Math.abs(d(b.knees[i], b.feet[i]) - SEGMENT) < 1e-9, "shin keeps its length");
    }
    const mid = { x: (b.hips[0].x + b.feet[0].x) / 2, y: (b.hips[0].y + b.feet[0].y) / 2 };
    forward.push(dot(sub(b.knees[0], mid), s.heading));
  }
  assert.ok(forward[0] > 0, "the knee goes forward, not back");
  assert.ok(forward[1] > forward[0], `a deep knee bends further: ${forward.map((f) => f.toFixed(3))}`);
});
