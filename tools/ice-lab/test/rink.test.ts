// The boards (game/rink.ts) — a rounded rectangle around the ice a skater
// can bounce off of or crash into (bible §3.5), matching the shape
// scene.ts draws. Game-only: applied to the live/replayed render state,
// never inside sim/'s own step(), so a clip's recorded digest stays pure
// regardless of which wall it hit (see the file's own header).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { rinkHit, resolveRinkCollision, RINK, CRASH_SPEED } from "../game/rink.ts";
import { createState } from "../sim/solver.ts";
import { PRESETS } from "../sim/params.ts";
import { FALL, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";

test("well inside the rink, there is no hit", () => {
  assert.equal(rinkHit(0, 18), null);
  assert.equal(rinkHit(RINK.minX + RINK.corner, RINK.minY + RINK.corner), null, "inside the inset rectangle's own corner");
});

test("past a flat side, the normal is axis-aligned and penetration is exact", () => {
  const hit = rinkHit(0, 50); // 4 m past maxY (46), nowhere near a rounded corner
  assert.ok(hit);
  assert.equal(hit.nx, 0);
  assert.equal(hit.ny, 1);
  assert.ok(Math.abs(hit.penetration - 4) < 1e-9);
});

test("past a rounded corner, the normal points diagonally away from its centre", () => {
  const hit = rinkHit(30, -15); // beyond both maxX and minY: the top-right corner
  assert.ok(hit);
  assert.ok(hit.nx > 0 && hit.ny < 0, `expected an up-and-right normal, got (${hit.nx}, ${hit.ny})`);
  assert.ok(Math.abs(Math.hypot(hit.nx, hit.ny) - 1) < 1e-9, "a unit normal");
});

function skaterAt(x: number, y: number, vx: number, vy: number) {
  const s = createState(PRESETS.assisted, 0);
  s.pos = { x, y }; s.vel = { x: vx, y: vy };
  return s;
}

test("a soft hit bounces: pushed back inside, velocity reflected, standing", () => {
  const s = skaterAt(0, 47, 0, 2); // just past maxY (46), heading further out
  const events: EdgeEvent[] = [];
  resolveRinkCollision(s, events);
  assert.ok(s.pos.y <= RINK.maxY + 1e-9, "pushed back to (or inside) the boundary");
  assert.ok(s.vel.y < 0, "velocity into the wall reversed");
  assert.equal(s.fallen, false);
  assert.equal(events.length, 0);
});

test("a hard hit crashes: fallen, the boards as the reason, an event recorded", () => {
  const s = skaterAt(0, 47, 0, CRASH_SPEED + 1);
  const events: EdgeEvent[] = [];
  resolveRinkCollision(s, events);
  assert.equal(s.fallen, true);
  assert.equal(s.fallReason, FALL.Collision);
  assert.equal(s.strokeTime, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, EVENT.Fall);
  assert.equal(events[0].newCode, FALL.Collision);
});

test("already leaving the wall, or already down, nothing happens", () => {
  const leaving = skaterAt(0, 47, 0, -2); // past the boundary but heading back onto the ice
  resolveRinkCollision(leaving, []);
  assert.equal(leaving.pos.y, 47, "left exactly where it was: not moving into the wall");
  const down = skaterAt(0, 47, 0, 10);
  down.fallen = true;
  const before = { ...down.pos };
  resolveRinkCollision(down, []);
  assert.deepEqual(down.pos, before, "a fallen skater is not also bounced");
});
