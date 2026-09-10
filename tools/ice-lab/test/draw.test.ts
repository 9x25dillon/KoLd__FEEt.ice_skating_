// The overlay has to agree with the solver about which side the body is on.
//
// It did not: the balance overlay drew the centre of mass at
// base - perpLeft * L sin(lean), which is the mirror image — outside the turn
// on every carve — while step() puts it at base + perpLeft * L sin(lean). The
// pendulum is the one overlay whose whole job is showing the balance problem,
// and it was showing it inverted. This file is the check that it stays fixed.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pendulum } from "../app/draw.ts";
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
