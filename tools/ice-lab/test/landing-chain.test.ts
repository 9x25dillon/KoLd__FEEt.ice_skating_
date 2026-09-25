// The touchdown's telemetry (SkaterState.landingBudget, test/landing-chain.ts):
// attached it moves nothing; it records the three states land() passes
// through; and the impulse arithmetic holds together.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checksum } from "../sim/solver.ts";
import type { LandingBudget, SkaterState } from "../sim/types.ts";
import { chainParams, chainRun, touchdown } from "./landing-chain.ts";
import { attempt } from "./takeoff-budget.ts";
import { throughAt } from "./swing-through.ts";

const p = chainParams([]);

test("the landing budget is observability: attached, the run is the run", () => {
  let bare = 0, watched = 0;
  attempt("held", p, 0.25, { ...throughAt(0.3), landKnee: 0.8, rideOut: 0.5, atTakeoff: s => { bare = checksum(s); } });
  let w: SkaterState | null = null;
  const a = attempt("held", p, 0.25, { ...throughAt(0.3), landKnee: 0.8, rideOut: 0.5 });
  const b = attempt("held", p, 0.25, { ...throughAt(0.3), landKnee: 0.8, rideOut: 0.5, atTakeoff: s => { s.landingBudget = {} as LandingBudget; w = s; watched = checksum({ ...s, landingBudget: undefined }); } });
  assert.equal(watched, bare);
  assert.deepEqual(b.result, a.result);
  assert.equal(JSON.stringify(b.frames), JSON.stringify(a.frames));
  assert.ok(w && (w as SkaterState).landingBudget!.tick > 0, "land() filled it");
});

test("the three touchdown states: the contact keeps only the velocity along the blade and stops the spin; the shock moves only the lean's rate", () => {
  const { lb } = chainRun(p, 0.25);
  assert.ok(lb && !lb.fall, "a landing that passes its score");
  const along = (v: { x: number; y: number }) => v.x * lb.heading.x + v.y * lb.heading.y;
  assert.ok(Math.abs(lb.velPost.x - lb.heading.x * along(lb.velPre)) < 1e-12 && Math.abs(lb.velPost.y - lb.heading.y * along(lb.velPre)) < 1e-12);
  assert.equal(lb.yawRatePost, 0);
  assert.ok(Math.abs(Math.abs(lb.leanRatePost - lb.leanRatePre) - p.landingShock * (1 - lb.landingQuality)) < 1e-12);
});

test("the impulse arithmetic: J is the momentum the contact takes, r x J its moment, and a straight landing's lean prediction is the fall's alone", () => {
  const { lb } = chainRun(p, 0.25);
  const T = touchdown(lb!, p);
  assert.ok(Math.abs(T.J.z + p.mass * lb!.vz) < 1e-9, "the vertical speed stopped");
  assert.ok(Math.abs(T.J.t) < 1e-9, "nothing along the blade");
  assert.ok(Math.abs(T.rJ.t - (T.r.n * T.J.z - T.r.z * T.J.n)) < 1e-9);
  // Along the blade, no lean, no pitch: nothing to tip the pendulum but the along-track speed, which has no lean moment.
  const straight: LandingBudget = { ...lb!, velPre: { x: lb!.heading.x * 3, y: lb!.heading.y * 3 }, velPost: { x: lb!.heading.x * 3, y: lb!.heading.y * 3 }, lean: 0, pitch: 0, leanRatePre: 0.4 };
  const S = touchdown(straight, p);
  assert.ok(Math.abs(S.J.n) < 1e-9 && Math.abs(S.leanRatePred) < 1e-9, "upright and along the blade: the impact leaves no lean rate");
  assert.ok(Math.abs(S.dLeanPred + 0.4) < 1e-9, "a point mass's airborne roll does not survive the contact");
});
