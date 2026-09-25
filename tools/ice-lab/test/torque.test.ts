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
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { dot } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

// The Simulation athlete with stages B/C and the fore-aft pendulum switched off: each test switches on what it measures.
const SIM = { ...setupParams("simulation"), slipMode: 0, torqueMode: 0, armsWhipMode: 0, footMode: 0, pitchMode: 0 };
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
  // MEASURED on a flat blade, 6 m/s: a flick either way pivots the feet ~24°.
  // SkatingInput.windup is clockwise-positive: +1 winds the shoulders CW.
  const cw = run(360, (i) => ({ weight: 1, knee: 0.5, pitch: 0.8, windup: flick(i) }));
  const ccw = run(360, (i) => ({ weight: 1, knee: 0.5, pitch: 0.8, windup: -flick(i) }));
  assert.equal(cw.s.fallen, false);
  assert.ok(cw.peak > 20 && ccw.peak < -20, `shoulders CW -> feet ${cw.peak.toFixed(1)}°, CCW -> ${ccw.peak.toFixed(1)}°`);
  assert.ok(Math.abs(ccw.peak + cw.peak) < 1, "mirror images");
  assert.ok(Math.abs(slipDeg(cw.s)) < 2, "and once the twist lets go the edge lines back up");
});

test("turns are made on the ball of the foot: a slow wind-up the heel holds pivots the toe", () => {
  // MEASURED, wind-up ramped over 0.6 s on the right foot at 6 m/s: on the heel
  // the blade holds (0°) at lean 0.25 and 0.3; on the toe, where the rocker is
  // shorter and less blade is in the ice, it pivots 6°.
  for (const lean of [0.25, 0.3]) {
    const slow = (pitch: number) => run(300, (i) => ({ lean, weight: 1, knee: 0.5, pitch, windup: i < 60 ? 0 : Math.min(1, (i - 60) / 72) }));
    const toe = slow(0.8), heel = slow(-0.8);
    assert.equal(heel.s.fallen || toe.s.fallen, false, `lean ${lean}`);
    assert.ok(Math.abs(heel.peak) < 0.5, `lean ${lean}: heel held (${heel.peak.toFixed(2)}°)`);
    assert.ok(Math.abs(toe.peak) > 4, `lean ${lean}: toe pivoted (${toe.peak.toFixed(2)}°)`);
  }
});

// ── stage C2: spin carried by the body, and the ice's torque into the jump ──


/**
 * Carve on both feet at 6 m/s, lean 0.5, for 1.5 s — optionally leading the
 * shoulders counter-clockwise (wind-up -1, ramped over 0.6 s from 0.8 s) — then
 * rise (knee straight) for 0.15 s releasing the shoulders clockwise (+1), then
 * sink (knee 0.7). Peak angle of the blades across the travel, and the state.
 */
function riseAndRelease(params: typeof ON, lead: boolean) {
  const s = createState(params, 6);
  let peak = 0;
  for (let i = 0; i < 480 && !s.fallen; i++) {
    const t = i * SIM_DT;
    const input = t < 1.5
      ? { lean: 0.5, knee: 0.6, weight: 0.5, windup: lead ? -Math.min(1, Math.max(0, (t - 0.8) / 0.6)) : 0 }
      : t < 1.65 ? { lean: 0.5, knee: 0, weight: 0.5, windup: 1 } : { lean: 0.5, knee: 0.7, weight: 0.5 };
    step(s, { ...NEUTRAL_INPUT, ...input }, params, SIM_DT, []);
    if (Math.abs(slipDeg(s)) > Math.abs(peak)) peak = slipDeg(s);
  }
  return { s, peak };
}

test("rise off the edge and the body keeps turning while the travel does not: a skidded entry from play", () => {
  // MEASURED (since /34, engagement from the whole load on the ice): shoulders
  // led then released on the rise, 32°, on their feet, the edge lining back up
  // on the sink; released without the lead, 12° — and a fall. A full 90°
  // hockey stop needs the feet turned in the hips too (stage B2).
  const led = riseAndRelease(ON, true), bare = riseAndRelease(ON, false);
  assert.equal(led.s.fallen, false);
  assert.equal(bare.s.fallen, true, "without the lead the release unbalances the skater");
  assert.ok(Math.abs(led.peak - 32) < 3, `led ${led.peak.toFixed(1)}°`);
  assert.ok(Math.abs(bare.peak - 12) < 3, `bare ${bare.peak.toFixed(1)}°`);
  assert.ok(Math.abs(slipDeg(led.s)) < 1, "and the edge takes hold again");
  // Without the trunk only the rise acts: the grip left on the edge cannot turn
  // the whole body's mass, and the travel runs on a little (0.52°).
  const slipOnly = riseAndRelease({ ...ON, torqueMode: 0 }, true);
  assert.ok(Math.abs(slipOnly.peak - 0.52) < 0.2, `without the trunk, the rise alone: ${slipOnly.peak.toFixed(2)}°`);
});

/** On the right foot at 6 m/s, lean 0.5, load at 0.6 s, release at 0.9 s, the wind-up by `plan`. The takeoff's L. */
function windJump(plan: "none" | "held" | "snap" | "smooth"): number {
  const p = { ...ON, jumpMode: 2 }, s = createState(p, 6, 0.5 * p.maxLean);
  for (let i = 0; i < 300 && !s.fallen; i++) {
    const t = i * SIM_DT, wound = Math.min(1, Math.max(0, (t - 0.2) / 0.5));
    const windup = plan === "none" ? 0 : plan === "held" ? wound
      : plan === "snap" ? (t < 0.8 ? wound : 0) : wound * Math.min(1, Math.max(0, (0.9 - t) / 0.2));
    const events: Parameters<typeof step>[4] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0.5, weight: 1, knee: t < 0.6 ? 0.5 : t < 0.9 ? 0.9 : 0.2, windup }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) return s.jump.angMomentum;
  }
  throw new Error(`no takeoff (${plan})`);
}

test("the wind-up is rotation for the jump only if the edge holds the feet while the shoulders swing", () => {
  // MEASURED (lean 0.5): none 4.61; wound and held 4.50; snapped back 2.38 —
  // the feet pivot and the swing is wasted, a twist makes no spin by itself;
  // released over 0.2 s 8.57, the edge answering the swing with the ice's torque.
  const none = windJump("none"), held = windJump("held"), snap = windJump("snap"), smooth = windJump("smooth");
  assert.ok(Math.abs(none - 4.61) < 0.05 && Math.abs(held - 4.50) < 0.05, `none ${none.toFixed(2)}, held ${held.toFixed(2)}`);
  assert.ok(snap < none, `snapped ${snap.toFixed(2)} wastes it`);
  assert.ok(smooth > 1.7 * none, `smooth ${smooth.toFixed(2)} vs none ${none.toFixed(2)}`);
});
