import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SIM_DT } from "../sim/params.ts";
import { JUMP_NONE } from "../sim/jump.ts";
import type { SkaterState } from "../sim/types.ts";
import { chainParams, chainRun, contactOffBackward } from "./landing-chain.ts";
import { orientation, turnOf } from "./takeoff-orientation.ts";

const p = chainParams([]), check = 0.375;
const base = chainRun(p, check, { rideOut: 0 });
assert.ok(base.lb);
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// A diagnostic perturbation, not a proposed takeoff: hold momentum, flight
// and the element's rotation ledger fixed while changing only the pose.
function rotatePose(s: SkaterState, angle: number, travel = false) {
  const rot = (v: { x: number; y: number }) => ({ x: v.x * Math.cos(angle) - v.y * Math.sin(angle), y: v.x * Math.sin(angle) + v.y * Math.cos(angle) });
  s.heading = rot(s.heading);
  for (const b of s.blade) b.tangent = rot(b.tangent);
  if (travel) s.vel = rot(s.vel);
}

test("orientation uses the first contact's incoming velocity, including the final air tick", () => {
  const a = orientation(base.r, base.lb!);
  // MEASURED 2026-09-27: 115.957 at contact, 107.280 a tick before it.
  assert.ok(a.contactBody > 115 && a.contactBody < 117);
  close(a.contactBody - a.lastAirBody, base.lb!.omega * SIM_DT * 180 / Math.PI);
  close(a.airBody, base.lb!.rotation * 180 / Math.PI);
  close(a.closure, 0);
  // Using the post-projection velocity would wrongly report a forward,
  // fully aligned blade (180 off backward) for this crossways touchdown.
  assert.ok(Math.abs(contactOffBackward({ ...base.lb!, velPre: base.lb!.velPost }) - a.contactBody) > 60);
});

test("a held takeoff's world turn is path turn, not rotation relative to travel", () => {
  const a = orientation(base.r, base.lb!);
  assert.ok(a.groundBody > 80 && a.groundBody < 95);
  close(a.groundRelative, 0);
  close(a.offBody, 0);
  close(a.offBlade, 0);
});

test("shoulder rotation is unwrapped separately from the landing blade", () => {
  const frames = [0, 120, 240, 360, 480].map(deg => ({ ...base.r.frames[0], heading: Math.atan2(Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)), shoulderHeading: deg * Math.PI / 180 * 0.9 }));
  close(turnOf(frames, "heading"), 480);
  close(turnOf(frames, "shoulderHeading"), 432);
});

test("experimental landing check measures arrival geometry, separately from rotation credit", () => {
  for (const when of [0.15, 0.25, 0.325, check]) {
    const { r, lb } = chainRun(p, when, { rideOut: 0 });
    assert.ok(lb);
    close(lb.checkErr, Math.abs(contactOffBackward(lb)) / 180);
    assert.ok(r.result.takeoffEdge! > 0.2, "the entry curve remains in the element's ledger");
  }
});

test("aligned contact does not inherit an entry-world-angle penalty or gain rotation credit", () => {
  const delta = -contactOffBackward(base.lb!) * Math.PI / 180;
  const { r, lb } = chainRun(p, check, { rideOut: 0, atTakeoff: s => rotatePose(s, delta) });
  assert.ok(lb);
  close(lb.checkErr, 0);
  close(lb.edgeOK, 1);
  assert.equal(lb.fall, false, "the touchdown's score accepts the aligned, bent-knee contact");
  assert.equal(r.result.rotationCall, base.r.result.rotationCall, "pose correction does not repair the under-rotation call");
  for (const key of ["airborne", "takeoffTurn", "takeoffEdge", "takeoffPivot", "shortBy", "airTime"] as const) assert.equal(r.result[key], base.r.result[key], key);
  assert.equal(r.L, base.r.L);
  close(lb.velPre.x, base.lb!.velPre.x);
  close(lb.velPre.y, base.lb!.velPre.y);
});

test("arrival geometry is independent of the rink's world axes", () => {
  for (const angle of [Math.PI / 2, -2.3]) {
    const { lb } = chainRun(p, check, { rideOut: 0, atTakeoff: s => rotatePose(s, angle, true) });
    assert.ok(lb);
    close(lb.checkErr, base.lb!.checkErr);
    close(contactOffBackward(lb), contactOffBackward(base.lb!));
  }
});

test("a hop may align forward or backward, but sideways is still misaligned", () => {
  const align = -contactOffBackward(base.lb!) * Math.PI / 180;
  for (const [angle, error] of [[0, 0], [Math.PI / 2, 0.5], [Math.PI, 0]]) {
    const { lb } = chainRun(p, check, { rideOut: 0, atTakeoff: s => { rotatePose(s, align + angle); s.jump.kind = JUMP_NONE; } });
    assert.ok(lb);
    close(lb.checkErr, error);
  }
});

test("rotationCallMode off retains the legacy rotation-ledger check", () => {
  const old = chainParams(["rotationCallMode=0"]);
  const a = chainRun(old, check, { rideOut: 0 });
  const b = chainRun(old, check, { rideOut: 0, atTakeoff: s => rotatePose(s, 0.7) });
  assert.ok(a.lb && b.lb);
  assert.equal(a.lb.checkErr, b.lb.checkErr);
  assert.equal(a.r.result.turned, b.r.result.turned);
  assert.ok(Math.abs(contactOffBackward(a.lb) - contactOffBackward(b.lb)) > 30);
});
