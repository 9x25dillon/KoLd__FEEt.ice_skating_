// The stick mapping.
//
// Here because this is where a real bug lived for the whole life of the file:
// the header described a radial deadzone and the code applied a per-axis one,
// which is the squared-off behaviour that same paragraph names as the thing to
// avoid. Nobody reads a mapping and notices; you feel it, badly, two minutes
// into holding a curve. So it is measured.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { leanVector } from "../app/pad.ts";

test("the deadzone is radial, so a corner does not out-reach a cardinal", () => {
  // The bug: with a per-axis deadzone the corner reads 1.0 on both axes, a
  // magnitude of 1.41, and the diagonals get forty percent more reach than the
  // cardinals — a deeper edge than the stick can express sideways.
  const corner = leanVector(1, 1);
  assert.ok(Math.hypot(corner.lean, corner.pitch) <= 1.0 + 1e-9,
    `corner magnitude ${Math.hypot(corner.lean, corner.pitch).toFixed(3)} must not exceed full deflection`);
  assert.equal(leanVector(1, 0).lean, 1, "and a cardinal still reaches full deflection");
  assert.equal(leanVector(0, 1).pitch, 1, "on both axes");
});

test("a sideways push is a lean and nothing else", () => {
  // The play report this came from: "the x and y axis on the same control stick
  // makes it a little bit more difficult to navigate". Nobody pushes a stick
  // along an exact axis, and every stray degree was moving the contact point
  // along the blade while the skater was trying to hold an edge.
  for (const y of [0.05, 0.10, 0.20, 0.30]) {
    const r = leanVector(0.9, y);
    assert.equal(r.pitch, 0, `${y} of fore/aft on a sideways push must not reach the rocker`);
    assert.ok(r.lean > 0.7, `while the lean survives it: ${r.lean.toFixed(3)}`);
  }
});

test("a deliberate diagonal still pitches, and pure fore/aft is untouched", () => {
  // The suppression is an attenuation, not a gate. If it were a gate, the
  // rocker would snap in at the band edge and that is worse than the bleed.
  const diagonal = leanVector(0.7, 0.7);
  assert.ok(diagonal.pitch > 0.3, `45 degrees must still reach the rocker: ${diagonal.pitch.toFixed(3)}`);
  assert.ok(diagonal.lean > 0.6, "and still lean");
  assert.equal(leanVector(0, 0.6).lean, 0, "pure fore/aft is not a lean");
  assert.ok(leanVector(0, 0.6).pitch > 0.3, "and does reach the rocker");
});

test("the deadzone still holds, and the curve still shapes the first third", () => {
  assert.deepEqual(leanVector(0.15, 0.10), { lean: 0, pitch: 0 }, "inside the deadzone is nothing");
  // The curve is why a shallow edge is a slow, precise thing: a third of the
  // stick is well under a third of the lean.
  const third = leanVector(0.33, 0).lean;
  assert.ok(third > 0 && third < 0.15,
    `a third of deflection should be a small lean, measured ${third.toFixed(3)}`);
  assert.ok(leanVector(0.6, 0).lean < leanVector(0.9, 0).lean, "and it stays monotonic");
});
