// The controller workshop's raw readout exists to answer one question — does
// the browser expose the Elite Series 2's back paddles, and where — so what it
// logs has to be exactly the presses and nothing else. A readout that logged
// stick jitter, or a trigger resting at -1, would bury the paddle press it is
// there to catch.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PadProbe, AXIS_STEP, LOG_LENGTH, beyondStandard, describeChange, describeSlots } from "../game/pad-probe.ts";
import type { PadLike } from "../game/pad-probe.ts";

function pad(buttons = 21, axes = 6, id = "045e-0b00-Microsoft X-Box One Elite 2 pad"): PadLike {
  return {
    index: 0, id, mapping: "standard", connected: true,
    buttons: Array.from({ length: buttons }, () => ({ value: 0, pressed: false })),
    axes: Array(axes).fill(0),
  };
}
function press(p: PadLike, i: number, down = true): PadLike {
  return { ...p, buttons: p.buttons.map((b, j) => j === i ? { value: down ? 1 : 0, pressed: down } : b) };
}
function axis(p: PadLike, i: number, v: number): PadLike {
  return { ...p, axes: p.axes.map((a, j) => j === i ? v : a) };
}

test("a new pad is its own baseline: only 'connected' is logged, not its resting values", () => {
  const probe = new PadProbe();
  const changes = probe.update([axis(axis(pad(), 4, -1), 5, -1)], 0);
  assert.deepEqual(changes.map((c) => c.kind), ["connected"]);
  assert.deepEqual(probe.update([axis(axis(pad(), 4, -1), 5, -1)], 0.1), []);
});

test("a press on an index past the standard 17 is logged and headlined with its index", () => {
  const probe = new PadProbe(), p = pad();
  probe.update([p], 0);
  const changes = probe.update([press(p, 17)], 1.5);
  assert.equal(changes.length, 1);
  assert.deepEqual({ kind: probe.last!.kind, index: probe.last!.index, t: probe.last!.t }, { kind: "button", index: 17, t: 1.5 });
  assert.equal(describeChange(probe.last!), "t=1.50 s · slot 0 · button 17 pressed (1.00)");
  assert.ok(beyondStandard("standard", "button", 17));
  assert.ok(!beyondStandard("standard", "button", 16));
  assert.ok(!beyondStandard("", "button", 30), "a non-standard pad has no standard layout to be beyond");
});

test("the release is logged, but the headline stays on the press", () => {
  const probe = new PadProbe(), p = pad();
  probe.update([p], 0); probe.update([press(p, 18)], 1); probe.update([p], 2);
  assert.equal(probe.log[0].pressed, false);
  assert.equal(probe.log[0].index, 18);
  assert.equal(probe.last!.pressed, true);
});

test("stick jitter is not logged; a real move, or reaching an end, is", () => {
  const probe = new PadProbe(), p = pad();
  probe.update([p], 0);
  assert.deepEqual(probe.update([axis(p, 0, AXIS_STEP / 2)], 1), []);
  const moved = probe.update([axis(p, 0, 0.6)], 2);
  assert.deepEqual(moved.map((c) => [c.kind, c.index, c.from, c.to]), [["axis", 0, 0, 0.6]]);
  // From 0.9 to the end of travel is less than a step, but an axis at ±1 is
  // how a paddle reported as an axis would look.
  const q = axis(p, 5, 0.9);
  probe.update([q], 3);
  assert.equal(probe.update([axis(q, 5, 1)], 4).length, 1);
});

test("the log keeps the newest ten, newest first", () => {
  const probe = new PadProbe(), p = pad();
  probe.update([p], 0);
  for (let i = 0; i < 8; i++) { probe.update([press(p, i)], i + 1); probe.update([p], i + 1.5); }
  assert.equal(probe.log.length, LOG_LENGTH);
  assert.equal(probe.log[0].t, 8.5);
});

test("a pad listed twice is two slots; unplugging one logs a disconnect", () => {
  const probe = new PadProbe(), p = pad();
  const twice = [p, null, { ...p, index: 2, mapping: "" }];
  assert.deepEqual(probe.update(twice, 0).map((c) => c.slot), [0, 2]);
  assert.match(describeSlots(twice), /slot 1 · empty/);
  assert.match(describeSlots(twice), /slot 2 · index 2 · connected · mapping "\(none\)"/);
  const gone = probe.update([p, null, null], 1);
  assert.deepEqual(gone.map((c) => [c.kind, c.slot]), [["disconnected", 2]]);
  assert.match(describeSlots([]), /empty/);
});
