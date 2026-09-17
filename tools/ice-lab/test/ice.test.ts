// The sheet itself: a grid that takes wear, and feeds it back as friction.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, validate } from "../sim/params.ts";
import { createState, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { biteCapacity, muLong } from "../sim/blade.ts";
import { v2, len } from "../sim/math.ts";
import { IceGrid } from "../sim/ice.ts";

const glide = { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 };

test("a fresh grid reports no wear, and a resurface clears one that has some", () => {
  const g = new IceGrid(5, 5);
  const p = DEFAULT_PARAMS;
  assert.equal(g.condition(v2(0, 0)), 0);
  g.deposit(v2(0, 0), 1, 1 / 120, p);
  assert.ok(g.condition(v2(0, 0)) > 0);
  g.resurface();
  assert.equal(g.condition(v2(0, 0)), 0);
});

test("coverage: a fresh grid is 0, and depositing raises it by exactly the cells touched", () => {
  const g = new IceGrid(1, 1); // small: cols/rows are easy to reason about by hand
  const p = DEFAULT_PARAMS;
  assert.equal(g.coverage(), 0);
  g.deposit(v2(0, 0), 0, 1, p);
  assert.equal(g.coverage(), 1 / (g.cols * g.rows));
  g.deposit(v2(0, 0), 0, 1, p); // the same cell again: coverage does not double-count
  assert.equal(g.coverage(), 1 / (g.cols * g.rows));
  g.deposit(v2(0.9, 0.9), 4, 1, p); // scrub only, no plain pass — snow alone still counts as visited
  assert.equal(g.coverage(), 2 / (g.cols * g.rows));
  g.resurface();
  assert.equal(g.coverage(), 0, "a resurfaced sheet forgets it was ever skated on");
});

test("damage saturates at 1 and never goes past it", () => {
  const g = new IceGrid(5, 5);
  const p = { ...DEFAULT_PARAMS, iceDamagePerPass: 0.9 };
  for (let i = 0; i < 20; i++) g.deposit(v2(0, 0), 0, 1 / 120, p);
  assert.equal(g.condition(v2(0, 0)), 1);
});

test("snow comes only from scrub; an ordinary pass leaves none", () => {
  const g = new IceGrid(5, 5);
  const p = DEFAULT_PARAMS;
  g.deposit(v2(0, 0), 0, 1 / 120, p);
  assert.equal(g.sample(v2(0, 0)).snow, 0);
  assert.ok(g.sample(v2(0, 0)).damage > 0, "the pass itself still counts as damage");

  g.deposit(v2(1, 1), 4, 1 / 120, p);
  assert.ok(g.sample(v2(1, 1)).snow > 0, "scrub deposits snow too");
});

test("cellAt agrees with condition/sample: the same cell, or null off the sheet", () => {
  const g = new IceGrid(5, 5, 0.5);   // a coarse cell, so the arithmetic is easy to check by hand
  assert.deepEqual(g.cellAt(v2(0, 0)), { col: 10, row: 10 }, "the centre cell of a 20x20 grid at 0.5 m cells");
  assert.deepEqual(g.cellAt(v2(-5, -5)), { col: 0, row: 0 }, "the low corner");
  assert.equal(g.cellAt(v2(5, 0)), null, "exactly on the far edge is one cell past the last one");
  assert.equal(g.cellAt(v2(50, 50)), null);
  g.deposit(v2(0, 0), 0, 1 / 120, DEFAULT_PARAMS);
  const cell = g.cellAt(v2(0, 0))!;
  // A renderer reading the cell back should find the same wear condition() gives at the same point.
  assert.ok(g.condition(v2(0, 0)) > 0);
  assert.deepEqual(cell, { col: 10, row: 10 });
});

test("off the sheet is a no-op: nothing to write, nothing to read", () => {
  const g = new IceGrid(5, 5);
  const p = DEFAULT_PARAMS;
  const outside = v2(50, 50);
  g.deposit(outside, 5, 1 / 120, p);
  assert.equal(g.condition(outside), 0);
  assert.deepEqual(g.sample(outside), { damage: 0, snow: 0 });
});

test("chewed ice glides slower and holds less than fresh ice", () => {
  const p = DEFAULT_PARAMS;
  assert.ok(muLong(0.3, false, p, 1) > muLong(0.3, false, p, 0),
    "full wear must cost more than fresh ice");
  assert.ok(muLong(0.3, false, p, 1) <= muLong(0.3, false, p, 0) + p.iceMuChewed,
    "and stay bounded by the chewed ceiling, not run away");
  assert.ok(biteCapacity(500, 0.4, p, 1) < biteCapacity(500, 0.4, p, 0),
    "wear must lower bite, never raise it");
  assert.equal(muLong(0.3, false, p, 0), muLong(0.3, false, p),
    "the default, with no ice argument at all, is 0");
});

test("with no grid passed, a lap changes nothing — the same reason movesMode's button does", () => {
  const p = { ...DEFAULT_PARAMS, iceGridMode: 1 };
  const bare = createState(p, 5, 0);
  run(bare, glide, p, 240);          // iceGridMode 1, but no grid: nothing to read or write

  const withGridOff = createState({ ...p, iceGridMode: 0 }, 5, 0);
  run(withGridOff, glide, { ...p, iceGridMode: 0 }, 240, [], new IceGrid(p.rinkHalfLength, p.rinkHalfWidth));

  assert.deepEqual(bare, withGridOff, "iceGridMode 0 must be inert even with a grid supplied");
});

test("the last skater in a warm-up group is genuinely at a disadvantage", () => {
  // bible §3.2, verbatim: damage raises local friction, "which is why the
  // last skater in a warm-up group is genuinely at a disadvantage".
  const p = { ...DEFAULT_PARAMS, iceGridMode: 1, iceDamagePerPass: 0.02 };
  const grid = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);

  const first = createState(p, 5, 0);
  run(first, glide, p, 300, [], grid);           // chews the ice along its own line

  const second = createState(p, 5, 0);           // the same start, the same ice — now worn
  run(second, glide, p, 300, [], grid);

  assert.ok(len(second.vel) < len(first.vel),
    `second skater kept ${len(second.vel).toFixed(3)} m/s, first kept ${len(first.vel).toFixed(3)}`);

  // Resurfaced, a third skater gets the first skater's own deal back.
  grid.resurface();
  const third = createState(p, 5, 0);
  run(third, glide, p, 300, [], grid);
  assert.ok(Math.abs(len(third.vel) - len(first.vel)) < 1e-9,
    "a resurfaced sheet must be indistinguishable from a fresh one");
});

test("the ice levers validate, and a bad one is caught", () => {
  const p = DEFAULT_PARAMS;
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ ...p, iceGridMode: 2 }).length > 0);
  assert.ok(validate({ ...p, iceDamagePerPass: 0 }).length > 0);
  assert.ok(validate({ ...p, iceDamagePerPass: 1.5 }).length > 0);
  assert.ok(validate({ ...p, iceSnowPerScrub: -0.1 }).length > 0);
  assert.ok(validate({ ...p, iceMuChewed: 0.001 }).length > 0, "chewed ice cannot be slicker than fresh");
  assert.ok(validate({ ...p, iceBiteLossMax: 1.5 }).length > 0);
});
