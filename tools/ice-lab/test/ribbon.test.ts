// The Edge Ribbon bends the way the skater turns. Its one piece of arithmetic
// is the path; a ribbon that bent right on a left carve would teach the wrong
// edge to anyone reading it out of the corner of their eye.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ribbonPath } from "../app/ribbon.ts";

test("straight ahead is straight up the screen", () => {
  const pts = ribbonPath(0);
  assert.ok(pts.every(([x]) => Math.abs(x) < 1e-9));
  assert.ok(pts[pts.length - 1][1] < -100, "4.5 m ahead is well up the screen");
});

test("a left carve bends left, a right carve right, a tight one more", () => {
  const end = (k: number): number => ribbonPath(k).at(-1)![0];
  assert.ok(end(0.2) < 0 && end(-0.2) > 0);
  assert.ok(Math.abs(end(0.2) + end(-0.2)) < 1e-9, "mirror images");
  assert.ok(end(0.4) < end(0.2));
});
