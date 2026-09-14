import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SkateScene } from "../game/scene.ts";
import { Practice } from "../game/practice.ts";
import { createState } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { MOVE } from "../sim/types.ts";

test("camera follows inertia through body rotation and backward skating", () => {
  const s = createState(GAME_PARAMS, 5), scene = new SkateScene(); scene.reset(s);
  assert.equal(scene.camera.yaw, 0);
  s.heading = {x:-1,y:0};
  for(let i=0;i<120;i++) scene.update(s, 1/120);
  assert.equal(scene.camera.yaw, 0, "turning the body does not rotate the camera");
  assert.deepEqual(scene.worldAim(0,1), {x:1,y:0});
  s.vel = {x:0,y:5};
  for(let i=0;i<600;i++) scene.update(s,1/120);
  assert.ok(Math.abs(scene.camera.yaw-Math.PI/2)<0.001);
  const right = scene.worldAim(1,0);
  assert.ok(right.x > .999 && Math.abs(right.y) < .001);
  s.vel = {x:0,y:0}; const yaw = scene.camera.yaw;
  s.heading = {x:1,y:0}; scene.update(s,1/120);
  assert.equal(scene.camera.yaw,yaw,"at rest the camera keeps its bearings");
});
test("overview aiming stays world aligned", () => {
  const scene = new SkateScene(); scene.overview = true;
  const aim = scene.worldAim(0,1);
  assert.ok(Math.abs(aim.x)<1e-8); assert.equal(aim.y,1);
});
test("practice awards observed moves once and a fall cannot complete an objective", () => {
  const s=createState(GAME_PARAMS,5), practice=new Practice();
  s.move=MOVE.Spin;s.spin.swept=Math.PI*2;
  s.fallen=true;practice.sample(s,false,1);assert.equal(practice.count,0);
  s.fallen=false;practice.sample(s,false,1);assert.equal(practice.count,1);
  practice.sample(s,false,1);assert.equal(practice.count,1);
  s.move=MOVE.None;s.lean=.2;practice.sample(s,false,1);s.lean=0;practice.sample(s,false,1);
  s.lean=.2;practice.sample(s,false,.8);assert.equal(practice.done[0],false);
  practice.sample(s,false,.8);assert.equal(practice.done[0],true);
});
