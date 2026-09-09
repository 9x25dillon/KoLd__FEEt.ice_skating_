// Bite: whether the edge holds, and what happens when it does not.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, REGIME, EVENT, FALL } from "../sim/types.ts";
import type { SkatingInput, EdgeEvent } from "../sim/types.ts";
import { biteCapacity, carveRadius, effectiveRocker } from "../sim/blade.ts";
import { len } from "../sim/math.ts";

const holding = (leanRad: number, p: Params, weight = 1): SkatingInput =>
  ({ ...NEUTRAL_INPUT, lean: leanRad / p.maxLean, weight });

const deg = (d: number): number => (d * Math.PI) / 180;

test("a moderate edge at a sane speed simply holds", () => {
  const p = { ...DEFAULT_PARAMS, controlLatency: 0 };
  const s = createState(p, 4.0, deg(20));
  const events: EdgeEvent[] = [];
  run(s, holding(deg(20), p), p, 360, events);

  const b = s.blade[1];
  assert.equal(b.latSlipAccel, 0, "no residual slip while holding");
  assert.ok(b.demandRatio < 1, `demand ratio ${b.demandRatio.toFixed(3)} should be under 1`);
  assert.ok(!events.some((e) => e.type === EVENT.SkidBegin), "no skid was reported");

  // The force the edge supplies must be the centripetal force the arc needs.
  // At the CURRENT speed: friction and drag are live in this test, and holding
  // the same lean as speed falls means running a progressively deeper edge.
  const v = len(s.vel);
  const need = (p.mass * v * v) / carveRadius(b.tilt, effectiveRocker(b.contactS, p));
  assert.ok(Math.abs(Math.abs(s.latAccel * p.mass) - need) / need < 0.05,
    `edge supplied ${(s.latAccel * p.mass).toFixed(1)} N, arc needs ${need.toFixed(1)} N`);
});

test("a fast edge chatters, scrubs speed, and recovers", () => {
  // No crippled blade here — DEFAULT parameters at 10 m/s. Holding 30 degrees
  // that fast needs only a shallow tilt (kappa = a / v^2), and a shallow edge
  // has little bite, so the demand runs just over capacity. This is the
  // "very fast deep edges chatter" prediction the model makes about itself,
  // and it is the first thing to check against a real skater's eye.
  const p = { ...DEFAULT_PARAMS, controlLatency: 0 };
  const s = createState(p, 10.0, deg(30));
  const events: EdgeEvent[] = [];

  run(s, holding(deg(30), p), p, 10, events);
  assert.equal(s.blade[1].regime, REGIME.Skid, "should be skidding at 10 m/s");
  assert.ok(s.blade[1].demandRatio > 1, "demand must exceed capacity for a skid");
  assert.ok(s.blade[1].latSlipAccel > 0, "the unmet lateral acceleration is nonzero");

  run(s, holding(deg(30), p), p, 350, events);
  assert.ok(!s.fallen, "chattering is not falling: the skater should stay up");
  assert.equal(s.blade[1].regime, REGIME.Carve, "should recover once speed has bled off");
  assert.equal(s.blade[1].latSlipAccel, 0, "and stop slipping");

  const begins = events.filter((e) => e.type === EVENT.SkidBegin);
  const ends = events.filter((e) => e.type === EVENT.SkidEnd);
  assert.equal(begins.length, 1, `one skid begin, saw ${begins.length}`);
  assert.equal(ends.length, 1, `one skid end, saw ${ends.length}`);
  assert.ok(ends[0].tick > begins[0].tick, "and they are in that order");
});

test("when the edge lets go the arc widens rather than the skater teleporting", () => {
  const p = { ...DEFAULT_PARAMS, controlLatency: 0 };
  const s = createState(p, 10.0, deg(30));
  run(s, holding(deg(30), p), p, 10);

  const b = s.blade[1];
  const geometric = carveRadius(b.tilt, effectiveRocker(b.contactS, p));
  assert.equal(b.regime, REGIME.Skid);
  assert.ok(b.turnRadius > geometric,
    `skidding radius ${b.turnRadius.toFixed(2)} must exceed geometric ${geometric.toFixed(2)}`);
});

test("a blunt blade gives up before a sharp one", () => {
  const sharp = biteCapacity(500, 0.4, DEFAULT_PARAMS);
  const dull = biteCapacity(500, 0.4, { ...DEFAULT_PARAMS, sharpness: 0.5 });
  assert.ok(dull < sharp);
  const soft = biteCapacity(500, 0.4, { ...DEFAULT_PARAMS, iceHardness: 0.6 });
  assert.ok(soft < sharp);
});

test("capacity rises with lean, which is why a deep edge holds a tighter arc", () => {
  const p = DEFAULT_PARAMS;
  assert.ok(biteCapacity(500, 0.05, p) < biteCapacity(500, 0.25, p));
  assert.ok(biteCapacity(500, 0.25, p) < biteCapacity(500, 0.50, p));
});

test("the weight split does not decide which blade skids first, and that is a model fact", () => {
  // The engineering package lists "light blade skids first" as an acceptance
  // criterion. It cannot hold here, and the reason is worth stating rather
  // than patching around: demand on a blade goes as its share of the mass, and
  // capacity goes as its share of the load, so the share cancels and both
  // blades sit at the SAME demand ratio.
  //
  // If a lighter blade should let go first, bite capacity has to be sublinear
  // in normal load — a groove cut by less pressure being shallower than
  // proportionally. That is a real modelling choice, and it is not in the
  // model yet. This test exists to fail loudly on the day someone adds it.
  const p = { ...DEFAULT_PARAMS, controlLatency: 0 };
  const s = createState(p, 5.0, deg(25));
  run(s, holding(deg(25), p, 0.7), p, 240);   // 30 / 70 split

  const [l, r] = s.blade;
  assert.ok(l.inContact && r.inContact, "both blades loaded");
  assert.ok(Math.abs(l.normalLoad - r.normalLoad) > 1, "the split really is uneven");
  assert.ok(Math.abs(l.demandRatio - r.demandRatio) < 1e-9,
    `demand ratios ${l.demandRatio} and ${r.demandRatio} should be identical`);
});

test("an edge that cannot hold the lean drops the skater inward", () => {
  const p: Params = { ...DEFAULT_PARAMS, biteC0: 0.01, biteC1: 0.02, controlLatency: 0 };
  const s = createState(p, 8.0, deg(35));
  const events: EdgeEvent[] = [];
  for (let i = 0; i < 1200 && !s.fallen; i++) {
    step(s, holding(deg(35), p), p, 1 / 120, events);
  }
  assert.ok(s.fallen, "the skater should have gone down");
  assert.notEqual(s.fallReason, FALL.None);
  assert.ok(s.lean > deg(35), `fell inward: lean ${s.lean.toFixed(3)} exceeded the command`);
  assert.equal(events.filter((e) => e.type === EVENT.Fall).length, 1,
    "the fall is reported once, not every tick");
});

test("no speed, no edge: a deep lean at walking pace is unsupportable", () => {
  // At 2 m/s a 20 degree lean asks for sin(theta) near 2, which is not a blade
  // angle. The command clamps, the edge cannot supply the acceleration, and
  // the skater topples the way they were leaning.
  const p = { ...DEFAULT_PARAMS, controlLatency: 0 };
  const s = createState(p, 2.0, deg(20));
  const events: EdgeEvent[] = [];
  for (let i = 0; i < 1200 && !s.fallen; i++) step(s, holding(deg(20), p), p, 1 / 120, events);
  assert.ok(s.fallen, "should fall: the arc that lean needs cannot be cut at 2 m/s");
});
