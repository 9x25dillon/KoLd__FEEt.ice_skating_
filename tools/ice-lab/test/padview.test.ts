// The input panel draws the sticks as each scheme reads them. The one piece of
// logic in it — folding the keyboard into two virtual sticks — is checked here,
// because a panel that shows the arrows on the wrong stick under C would be
// teaching the tester the wrong scheme.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { displaySticks, STICK_ROLE } from "../app/padview.ts";
import { SCHEME, SCHEME_LABEL } from "../app/schemes.ts";
import type { Controls } from "../app/pad.ts";

const idle: Controls = {
  lx: 0, ly: 0, rx: 0, ry: 0, lean: 0, pitch: 0,
  kx: 0, ky: 0, kPrimaryX: 0, kAltX: 0,
  knee: 0.35, weight: 0.5, push: false, brake: false,
  reset: false, pause: false, cyclePreset: false, cycleScheme: false,
};

test("every scheme has a caption for both sticks", () => {
  assert.equal(STICK_ROLE.length, SCHEME_LABEL.length);
  for (const r of STICK_ROLE) assert.ok(r.left.length > 0 && r.right.length > 0);
});

test("under C the arrows are the right stick; under A and B they are the left", () => {
  // A held, right-arrow held: pad.ts sets kx from A/D first.
  const keys = { ...idle, kPrimaryX: -1, kAltX: 1, kx: -1, ky: 1 };
  const c = displaySticks(keys, SCHEME.C);
  assert.deepEqual(c, { left: { x: -1, y: 1 }, right: { x: 1, y: 0 } });
  for (const scheme of [SCHEME.A, SCHEME.B]) {
    assert.deepEqual(displaySticks(keys, scheme), { left: { x: -1, y: 1 }, right: { x: 0, y: 0 } });
  }
});

test("a pad stick wins over the keyboard, as it does in the schemes", () => {
  const both = { ...idle, lx: 0.5, ly: -0.25, rx: -0.75, ry: 0.5, kx: 1, kPrimaryX: 1, kAltX: -1 };
  assert.deepEqual(displaySticks(both, SCHEME.C),
    { left: { x: 0.5, y: -0.25 }, right: { x: -0.75, y: 0.5 } });
});
