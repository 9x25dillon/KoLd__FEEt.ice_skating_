// Stage C1, the trunk (torqueMode, with slipMode): two bodies, upper and
// lower, twisted apart by the arms' wind-up. The carve is the legs' — the
// lower body turns as its edges carve — and the pivot grip of the blades
// (grip x contact chord / 4, the chord from the rocker at contactDepth) is
// what resists the trunk twisting the feet OFF that carve. Past it the feet
// pivot the opposite way to the shoulders, and the slip solve skids them.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { dot } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

const SIM = setupParams("simulation");
const ON = { ...SIM, slipMode: 1, torqueMode: 1 };
/** Signed angle of the blades against the travel, degrees, counter-clockwise positive. */
const slipDeg = (s: SkaterState): number =>
  Math.atan2(s.heading.x * s.vel.y - s.heading.y * s.vel.x, dot(s.heading, s.vel)) * -180 / Math.PI;

function run(ticks: number, at: (i: number) => Partial<SkatingInput>) {
  const s = createState(ON, 6);
  let peak = 0, peakTwist = 0;
  for (let i = 0; i < ticks && !s.fallen; i++) {
    step(s, { ...NEUTRAL_INPUT, ...at(i) }, ON, SIM_DT, []);
    if (Math.abs(slipDeg(s)) > Math.abs(peak)) peak = slipDeg(s);
    peakTwist = Math.max(peakTwist, Math.abs(s.twist ?? 0));
  }
  return { s, peak, peakTwist };
}
const flick = (i: number) => (i >= 60 && i < 96 ? 1 : 0);

test("torqueMode is 0 by default, needs slipMode, and at rest changes nothing", () => {
  assert.equal(DEFAULT_PARAMS.torqueMode, 0);
  assert.deepEqual(validate(ON), []);
  assert.ok(validate({ ...SIM, torqueMode: 1 }).some(e => /slipMode/.test(e)));
  // MEASURED: 5 s carving, no wind-up — identical to slip alone, to the bit.
  for (const lean of [0.2, 0.5]) {
    const [slip, torque] = [0, 1].map((torqueMode) => {
      const p = { ...SIM, slipMode: 1, torqueMode }, s = createState(p, 5);
      for (let i = 0; i < 600; i++) step(s, { ...NEUTRAL_INPUT, lean, weight: 1 }, p, SIM_DT, []);
      return s;
    });
    assert.deepEqual([torque.pos, torque.vel, torque.heading], [slip.pos, slip.vel, slip.heading], `lean ${lean}`);
    assert.equal(slip.twist, undefined, "no trunk state without the mode");
  }
});

test("wound up slowly on a deep edge, the shoulders turn and the feet hold: the jump's wind-up", () => {
  // MEASURED: lean 0.4, wind-up ramped over 0.6 s — twist 0.80 rad, slip 0°.
  const slow = run(360, (i) => ({ lean: 0.4, weight: 1, knee: 0.5, windup: i < 60 ? 0 : Math.min(1, (i - 60) / 72) }));
  assert.equal(slow.s.fallen, false);
  assert.ok(slow.peakTwist > 0.75, `twist ${slow.peakTwist.toFixed(2)}`);
  assert.ok(Math.abs(slow.peak) < 0.5, `feet held (${slow.peak.toFixed(2)}°)`);
  // A flick the same size on the same edge is more than it can hold.
  const fast = run(360, (i) => ({ lean: 0.4, weight: 1, knee: 0.5, windup: flick(i) }));
  assert.ok(Math.abs(fast.peak) > 5, `a flick skids the edge (${fast.peak.toFixed(1)}°)`);
});

test("the feet pivot opposite to the shoulders: the trunk's reaction", () => {
  // MEASURED on a flat blade, 6 m/s: a flick either way pivots the feet ~25°.
  const ccw = run(360, (i) => ({ weight: 1, knee: 0.5, pitch: 0.8, windup: flick(i) }));
  const cw = run(360, (i) => ({ weight: 1, knee: 0.5, pitch: 0.8, windup: -flick(i) }));
  assert.equal(ccw.s.fallen, false);
  assert.ok(ccw.peak < -20 && cw.peak > 20, `shoulders CCW -> feet ${ccw.peak.toFixed(1)}°, CW -> ${cw.peak.toFixed(1)}°`);
  assert.ok(Math.abs(ccw.peak + cw.peak) < 1, "mirror images");
  assert.ok(Math.abs(slipDeg(ccw.s)) < 2, "and once the twist lets go the edge lines back up");
});

test("turns are made on the ball of the foot: on the toe the blade pivots further than on the heel", () => {
  // MEASURED, flick on an edge: lean 0.2 toe 22° / heel 19°; lean 0.3 toe 19° / heel 14°.
  for (const lean of [0.2, 0.3]) {
    const [toe, heel] = [0.8, -0.8].map((pitch) => Math.abs(run(150, (i) => ({ lean, weight: 1, knee: 0.5, pitch, windup: flick(i) })).peak));
    assert.ok(toe > heel + 2, `lean ${lean}: toe ${toe.toFixed(1)}° vs heel ${heel.toFixed(1)}°`);
  }
  const shallow = Math.abs(run(150, (i) => ({ lean: 0.1, weight: 1, knee: 0.5, pitch: -0.8, windup: flick(i) })).peak);
  const deep = Math.abs(run(150, (i) => ({ lean: 0.3, weight: 1, knee: 0.5, pitch: -0.8, windup: flick(i) })).peak);
  assert.ok(deep < shallow, `and a deeper edge holds more: ${deep.toFixed(1)}° vs ${shallow.toFixed(1)}°`);
});
