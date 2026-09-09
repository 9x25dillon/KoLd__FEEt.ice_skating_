// The carve: does a leaning skater actually trace the arc the geometry claims?
//
// The engineering package's version of this test asserts that the measured
// radius equals rho/sin(theta) — but it obtains the measured radius from the
// yaw rate the solver computed from rho/sin(theta), so it can only ever pass.
// Here the radius is fitted to the INTEGRATED POSITIONS, through three points
// on the path, which is a measurement the solver cannot satisfy by restating
// its own formula.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FALL, REGIME } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { effectiveRocker, carveRadius, skidOnsetSpeed } from "../sim/blade.ts";
import { len } from "../sim/math.ts";
import type { Vec2 } from "../sim/math.ts";

/** Strip every dissipative term so the constraint can be examined alone. */
function frictionless(over: Partial<Params> = {}): Params {
  return { ...DEFAULT_PARAMS, muGlide: 0, muEdgeGain: 0, cdA: 0, controlLatency: 0, ...over };
}

const holding = (lean: number): SkatingInput =>
  ({ ...NEUTRAL_INPUT, lean, weight: 1 });

/** Radius of the circle through three points. Independent of the solver. */
function circumradius(a: Vec2, b: Vec2, c: Vec2): number {
  const ax = a.x - c.x, ay = a.y - c.y, bx = b.x - c.x, by = b.y - c.y;
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) < 1e-12) return Infinity;
  const la = ax * ax + ay * ay, lb = bx * bx + by * by;
  const ux = (by * la - ay * lb) / (2 * cross);
  const uy = (ax * lb - bx * la) / (2 * cross);
  return Math.sqrt(ux * ux + uy * uy);
}

test("the traced path is a circle of radius rho / sin(theta)", () => {
  const p = frictionless();
  const leanCmd = 20 / (p.maxLean * (180 / Math.PI));   // 20 degrees, as a fraction
  const s = createState(p, 4.0, (20 * Math.PI) / 180);
  run(s, holding(leanCmd), p, 240);                      // two seconds to settle

  assert.equal(s.fallReason, FALL.None, "should not fall while holding 20 deg at 4 m/s");
  assert.ok(s.blade[1].regime === REGIME.Edge || s.blade[1].regime === REGIME.Carve,
    `support blade should be on an edge, was regime ${s.blade[1].regime}`);

  const samples: Vec2[] = [];
  for (let i = 0; i < 3; i++) {
    run(s, holding(leanCmd), p, 40);
    samples.push({ ...s.pos });
  }
  const measured = circumradius(samples[0], samples[1], samples[2]);
  const expected = carveRadius(s.blade[1].tilt, effectiveRocker(s.blade[1].contactS, p));

  assert.ok(Math.abs(measured - expected) / expected < 0.02,
    `fitted radius ${measured.toFixed(3)} m vs geometric ${expected.toFixed(3)} m`);
});

test("an ideal edge does no work: speed is conserved exactly", () => {
  // The constraint changes where the velocity points, not how big it is. The
  // package projects out the lateral component instead, which bleeds
  // cos(w dt) of speed every tick — about 1% per second at 4 m/s and 20 deg,
  // scaling with the timestep. That is a discretization artifact, and left in
  // it would be tuned around as though it were drag.
  const p = frictionless();
  const leanCmd = (20 * Math.PI) / 180 / p.maxLean;
  const s = createState(p, 4.0, (20 * Math.PI) / 180);
  run(s, holding(leanCmd), p, 360);
  assert.ok(Math.abs(len(s.vel) - 4.0) < 1e-9,
    `speed drifted to ${len(s.vel)} with every loss term disabled`);
});

test("deeper lean, tighter circle", () => {
  const p = frictionless();
  const radiusAt = (deg: number): number => {
    const s = createState(p, 4.0, (deg * Math.PI) / 180);
    run(s, holding((deg * Math.PI) / 180 / p.maxLean), p, 240);
    return carveRadius(s.blade[1].tilt, effectiveRocker(s.blade[1].contactS, p));
  };
  const shallow = radiusAt(10), mid = radiusAt(20), deep = radiusAt(30);
  assert.ok(shallow > mid && mid > deep,
    `expected monotonic tightening, got ${shallow.toFixed(2)} ${mid.toFixed(2)} ${deep.toFixed(2)}`);
});

test("a flat blade goes straight", () => {
  const p = frictionless();
  const s = createState(p, 4.0, 0);
  run(s, { ...NEUTRAL_INPUT, lean: 0, weight: 1 }, p, 240);
  assert.ok(Math.abs(s.pos.y) < 1e-6, `drifted ${s.pos.y} m sideways on a flat blade`);
  assert.ok(s.pos.x > 7.9, "should have covered ~8 m in 2 s");
});

test("moving the contact toward the toe tightens the arc at the same lean", () => {
  // Turns are executed "on the rocker" — the front third of the blade is far
  // tighter, so the contact point is a second steering channel independent of
  // lean. The engineering package used one constant radius and lost it.
  const p = DEFAULT_PARAMS;
  const heel = effectiveRocker(0.0, p);
  const mid = effectiveRocker(0.5, p);
  const toe = effectiveRocker(1.0, p);
  assert.equal(heel, mid, "the back of the blade is a single radius");
  assert.ok(toe < mid, "the toe must be tighter");
  assert.ok(Math.abs(toe - p.rocker * p.rockerToeFraction) < 1e-9);

  const tilt = 0.3;
  assert.ok(carveRadius(tilt, toe) < carveRadius(tilt, mid),
    "same lean on the toe must carve a smaller circle");
});

test("the geometric radius is symmetric in the direction of lean", () => {
  const p = DEFAULT_PARAMS;
  assert.equal(carveRadius(0.3, p.rocker), carveRadius(-0.3, p.rocker));
});

test("skid onset speed matches the closed form it is derived from", () => {
  const p = DEFAULT_PARAMS;
  const tilt = 0.44;
  const v = skidOnsetSpeed(tilt, p.rocker, p);
  // At exactly that speed, demand equals capacity.
  const s = Math.abs(Math.sin(tilt));
  const demand = (v * v * s) / p.rocker;
  const capacity = p.gravity * (p.biteC0 + p.biteC1 * s);
  assert.ok(Math.abs(demand - capacity) / capacity < 1e-9,
    `demand ${demand} vs capacity ${capacity}`);
});
