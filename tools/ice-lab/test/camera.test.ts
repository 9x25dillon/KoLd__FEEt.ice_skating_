// The debug camera — app/camera.ts.
//
// What it must not do is change what the rig showed before it existed: north
// up, zoom 1 is the original transform. What it adds must hold still where
// design-bible §4.5 says a camera holds still — through a jump's rotation —
// and turn the short way round.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Camera, PX, VIEW, ZOOM_MAX, ZOOM_MIN, CHASE_MAX, CHASE_MIN } from "../app/camera.ts";
import type { Matrix } from "../app/camera.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import type { SkaterState } from "../sim/types.ts";

const W = 1200, H = 800;
const apply = (m: Matrix, x: number, y: number): [number, number] =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function skater(x: number, y: number, vx: number, vy: number): SkaterState {
  const s = createState(PRESETS.responsive, 0);
  s.pos = { x, y }; s.vel = { x: vx, y: vy };
  return s;
}

test("north up at zoom 1 is the rig's original camera", () => {
  // translate(w/2, h/2), scale(PX, -PX), translate(-pos), as draw.ts had it.
  const s = skater(12.5, -3.25, 4, 1);
  const cam = new Camera();
  for (let i = 0; i < 240; i++) cam.update(s, SIM_DT);
  const want = [PX, 0, 0, -PX, W / 2 - PX * 12.5, H / 2 + PX * -3.25];
  cam.groundMatrix(W, H).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `m[${i}] ${v} vs ${want[i]}`));
  assert.equal(cam.cx, 12.5, "no lead, no lag: centred on the skater exactly");
});

test("travel up puts the direction of travel at the top of the screen, and looks ahead", () => {
  const s = skater(0, 0, 3, 4);
  const cam = new Camera();
  cam.snap(s);
  cam.cycleView();
  assert.equal(cam.view, VIEW.TravelUp);
  for (let i = 0; i < 1200; i++) cam.update(s, SIM_DT);
  const m = cam.groundMatrix(W, H);
  const [sx, sy] = apply(m, s.pos.x, s.pos.y);
  const [ax, ay] = apply(m, s.pos.x + 0.6, s.pos.y + 0.8);   // one metre along travel
  assert.ok(Math.abs(ax - sx) < 1e-6, `travel is straight up the screen: dx ${ax - sx}`);
  assert.ok(ay < sy, "and up, not down");
  assert.ok(Math.abs(sy - ay - PX) < 1e-6, "a metre is PX pixels at zoom 1");
  assert.ok(sy > H / 2, "the skater sits below centre, so there is more ice in front");
});

test("in the air the view holds still while the body spins", () => {
  // Ballistics are fixed at takeoff (sim/jump.ts): the velocity does not
  // change in flight, the heading does. A camera on the heading would spin
  // with a triple; this one must not move at all.
  // Measured against a twin that watches the same flight without the spin:
  // the yaw is still settling after a turn, so "unchanged" would be the wrong
  // claim. "The spin changes nothing" is the right one.
  const spun = skater(0, 0, -5, 1), still = skater(0, 0, -5, 1);
  const a = new Camera(), b = new Camera();
  for (const [cam, s] of [[a, spun], [b, still]] as const) {
    cam.snap(skater(0, 0, 5, 0)); cam.cycleView();
    for (let i = 0; i < 72; i++) {
      if (s === spun) s.heading = { x: Math.cos(i * 0.6), y: Math.sin(i * 0.6) };
      cam.update(s, SIM_DT);
    }
  }
  assert.equal(a.yaw, b.yaw);
  assert.ok(a.yaw !== new Camera().yaw, "and the twin really was turning, so this is not vacuous");
});

test("slow or stopped, the view keeps the direction it had", () => {
  const s = skater(0, 0, 4, 0);
  const cam = new Camera();
  cam.snap(s); cam.cycleView();
  for (let i = 0; i < 600; i++) cam.update(s, SIM_DT);
  const before = cam.yaw;
  s.vel = { x: 0.01, y: -0.3 };   // below walking pace, pointing anywhere
  for (let i = 0; i < 240; i++) cam.update(s, SIM_DT);
  assert.equal(cam.yaw, before);
});

test("it turns the short way round", () => {
  const cam = new Camera();
  cam.snap(skater(0, 0, -5, 0.01));     // travel ~ +179 degrees
  cam.cycleView();
  const s = skater(0, 0, -5, 0.01);
  for (let i = 0; i < 600; i++) cam.update(s, SIM_DT);
  const from = cam.yaw;
  s.vel = { x: -5, y: -0.01 };            // ~ -179 degrees: two degrees away
  cam.update(s, SIM_DT);
  const moved = Math.abs(Math.atan2(Math.sin(cam.yaw - from), Math.cos(cam.yaw - from)));
  assert.ok(moved < 0.01, `one tick moves a fraction of two degrees, not 358: ${moved}`);
});

test("zoom is multiplicative and bounded", () => {
  const cam = new Camera();
  cam.zoomBy(1); cam.zoomBy(-1);
  assert.ok(Math.abs(cam.zoom - 1) < 1e-12, "in then out is where you started");
  cam.zoomBy(100);
  assert.equal(cam.zoom, ZOOM_MAX);
  cam.zoomBy(-100);
  assert.equal(cam.zoom, ZOOM_MIN);
  assert.equal(cam.px, PX * ZOOM_MIN);
});

test("chase tilts the ice away and lifts what stands on it", () => {
  const s = skater(0, 0, 5, 0);
  const cam = new Camera();
  cam.snap(s); cam.cycleView(); cam.cycleView();
  assert.equal(cam.view, VIEW.Chase);
  for (let i = 0; i < 600; i++) cam.update(s, SIM_DT);
  assert.equal(cam.elevation, cam.chaseElevation, "the glide lands exactly; it does not creep for ever");
  const m = cam.groundMatrix(W, H), e = cam.elevation * Math.PI / 180;
  const [bx, by] = cam.project(s.pos.x, s.pos.y, 0);
  const g = apply(m, s.pos.x, s.pos.y);
  assert.ok(Math.abs(bx - g[0]) < 1e-9 && Math.abs(by - g[1]) < 1e-9, "z = 0 is the ice transform");
  const [ux, uy] = cam.project(s.pos.x, s.pos.y, 1);
  assert.ok(Math.abs(ux - bx) < 1e-9, "up is straight up the screen");
  assert.ok(Math.abs(by - uy - PX * Math.cos(e)) < 1e-6, "a metre up is PX cos(elevation) pixels");
  const [, fy] = cam.project(s.pos.x + 1, s.pos.y, 0);    // a metre ahead: travel is +x
  assert.ok(Math.abs(by - fy - PX * Math.sin(e)) < 1e-6, "a metre ahead is foreshortened by sin(elevation)");
  assert.ok(by > H / 2, "the skater sits low, with the ice they are heading for above");
  assert.ok(cam.depth(s.pos.x + 1, 0) > cam.depth(s.pos.x, 0), "ahead is farther");
});

test("back to north up is the original camera again, exactly", () => {
  const s = skater(3, 4, 2, -4);
  const cam = new Camera();
  cam.snap(s); cam.cycleView(); cam.cycleView();
  for (let i = 0; i < 600; i++) cam.update(s, SIM_DT);
  cam.cycleView();
  assert.equal(cam.view, VIEW.NorthUp);
  for (let i = 0; i < 1200; i++) cam.update(s, SIM_DT);
  assert.equal(cam.elevation, 90);
  assert.equal(cam.yaw, Math.PI / 2);
  const want = [PX, 0, 0, -PX, W / 2 - PX * 3, H / 2 + PX * 4];
  cam.groundMatrix(W, H).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `m[${i}] ${v} vs ${want[i]}`));
});

test("the chase camera stays between 15 and 85 degrees", () => {
  const cam = new Camera();
  cam.tiltBy(100);
  assert.equal(cam.chaseElevation, CHASE_MAX);
  cam.tiltBy(-100);
  assert.equal(cam.chaseElevation, CHASE_MIN);
});
