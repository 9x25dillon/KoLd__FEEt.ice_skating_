// Stage B1, slip (slipMode): the travel and the blades are separate.
//
// With it off, every tick carries the travel round with the blades, so a
// blade can never point across its path; the committed fixture's digests are
// unchanged by its arrival (replay.ts, /23). With it on, an edge that holds
// carves exactly as before, and a blade across its travel scrapes along the
// grip curve instead of sliding sideways for free: a skill, a hockey stop, or
// on the wrong edge a trip.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, REGIME } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { rotate, len, dot } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";
import { JUMP, JUMP_NONE } from "../sim/jump.ts";

// The Simulation athlete with stages B/C and the fore-aft pendulum switched off: each test switches on what it measures.
const SIM = { ...setupParams("simulation"), slipMode: 0, torqueMode: 0, footMode: 0, pitchMode: 0 };
const slipDeg = (s: SkaterState): number =>
  Math.acos(Math.min(1, Math.abs(dot(s.vel, s.heading)) / Math.max(len(s.vel), 1e-9))) * 180 / Math.PI;

/** A skater whose blades meet the ice `deg` across their travel, as off an unaligned landing. */
function across(p: Params, deg: number, speed = 5, lean = 0): SkaterState {
  const s = createState(p, speed, lean), a = deg * Math.PI / 180;
  s.heading = rotate(s.heading, a);
  for (const b of s.blade) b.tangent = rotate(b.tangent, a);
  return s;
}

test("slipMode is 0 by default and validated as 0 or 1", () => {
  assert.equal(DEFAULT_PARAMS.slipMode, 0);
  assert.deepEqual(validate({ ...DEFAULT_PARAMS, slipMode: 1 }), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, slipMode: 2 }).some(e => /slipMode/.test(e)));
});

test("an edge that holds carves as it did: slip on and off agree to rounding", () => {
  // MEASURED: 5 s on the right foot at 5 m/s, lean 0.2 and 0.5 — positions
  // agree to 1e-14 m and the slip angle stays 0.
  for (const lean of [0.2, 0.5]) {
    const [off, on] = [0, 1].map((slipMode) => {
      const p = { ...SIM, slipMode }, s = createState(p, 5);
      for (let i = 0; i < 600; i++) step(s, { ...NEUTRAL_INPUT, lean, weight: 1 }, p, SIM_DT, []);
      return s;
    });
    assert.ok(Math.hypot(off.pos.x - on.pos.x, off.pos.y - on.pos.y) < 1e-9, `lean ${lean}`);
    assert.ok(slipDeg(on) < 1e-6);
  }
});

/** Skate `s` until it stops, falls or `limit` seconds pass. */
function stop(p: Params, s: SkaterState, lean: number, limit = 5) {
  const events: EdgeEvent[] = [];
  let t = 0, dist = 0;
  while (t < limit && !s.fallen && len(s.vel) > 0.3) {
    step(s, { ...NEUTRAL_INPUT, lean, knee: 0.5 }, p, SIM_DT, events);
    t += SIM_DT; dist += len(s.vel) * SIM_DT;
  }
  return { t, dist, events };
}

test("a hockey stop: blades across the travel, leaning into it, scrape to a standstill on their feet", () => {
  // MEASURED (Simulation params, knee 0.5, lean 0.3 into the scrape):
  //   3 m/s 1.08 s / 2.42 m · 5 m/s 1.63 s / 5.26 m · 7 m/s 2.16 s / 9.02 m.
  // Without slip the same blades slide sideways and keep 4.8 m/s of 5 after 0.5 s.
  const p = { ...SIM, slipMode: 1 };
  for (const [speed, time] of [[3, 1.08], [5, 1.63], [7, 2.16]]) {
    const s = across(p, 90, speed), r = stop(p, s, 0.3);
    assert.equal(s.fallen, false, `${speed} m/s`);
    assert.ok(len(s.vel) <= 0.3 && Math.abs(r.t - time) < 0.05, `${speed} m/s: stopped in ${r.t.toFixed(2)} s`);
    assert.ok(r.events.some(e => e.type === EVENT.SkidBegin), "the stop is a skid");
  }
  const off = { ...SIM, slipMode: 0 }, s0 = across(off, 90);
  for (let i = 0; i < 60; i++) step(s0, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5 }, off, SIM_DT, []);
  assert.ok(len(s0.vel) > 4.6 && slipDeg(s0) > 89, "slip off: a crosswise blade slides almost free");
});

test("the scrape follows the edge: lean harder into it and the stop is harder, up to what the edge can give", () => {
  // MEASURED at 5 m/s, 90°: about 0.5 s to lean in, then a steady stop set by
  // the lean — 2.2 m/s² at lean 0.2, 3.6 at 0.3, 5.4 at 0.4, where the edge
  // reaches maxTilt (the grip curve's ceiling, about 0.55 g). Lean 0.6 asks
  // more than any edge gives, over-leans and falls.
  const p = { ...SIM, slipMode: 1 };
  const steady = (lean: number): number => {
    const s = across(p, 90);
    for (let i = 0; i < 108; i++) step(s, { ...NEUTRAL_INPUT, lean, knee: 0.5 }, p, SIM_DT, []);
    const v0 = len(s.vel);
    for (let i = 0; i < 36; i++) step(s, { ...NEUTRAL_INPUT, lean, knee: 0.5 }, p, SIM_DT, []);
    assert.equal(s.fallen, false, `lean ${lean}`);
    assert.ok(s.blade.every(b => b.regime === REGIME.Skid && b.latSlipAccel > 0 && Math.sign(b.tilt) === Math.sign(s.lean)),
      `lean ${lean}: both blades skidding, dug in on the lean's side, throwing snow`);
    return (v0 - len(s.vel)) / (36 * SIM_DT);
  };
  const [soft, mid, hard] = [0.2, 0.3, 0.4].map(steady);
  assert.ok(soft < mid && mid < hard && hard > 2 * soft, `${soft.toFixed(2)} < ${mid.toFixed(2)} < ${hard.toFixed(2)} m/s²`);
  const over = across(p, 90);
  stop(p, over, 0.6);
  assert.equal(over.fallen, true, "past the edge's ceiling the lean cannot be held");
});

test("lean with the slide instead of against it and the downhill edge catches: a trip", () => {
  // MEASURED: lean -0.3 at 3, 5 and 7 m/s falls in 0.94-0.95 s, still moving at 1.7-5.5 m/s.
  const p = { ...SIM, slipMode: 1 };
  for (const speed of [3, 5, 7]) {
    const s = across(p, 90, speed), r = stop(p, s, -0.3);
    assert.equal(s.fallen, true, `${speed} m/s`);
    assert.ok(r.t < 1.2 && len(s.vel) > 1, `${speed} m/s: tripped at ${r.t.toFixed(2)} s, not stopped`);
  }
});

test("flat blades across the travel drift: a flat scrape holds almost nothing", () => {
  const p = { ...SIM, slipMode: 1 }, s = across(p, 90);
  for (let i = 0; i < 240; i++) step(s, { ...NEUTRAL_INPUT, knee: 0.5 }, p, SIM_DT, []);
  assert.equal(s.fallen, false);
  assert.ok(len(s.vel) > 3 && slipDeg(s) > 85, `still drifting sideways at ${len(s.vel).toFixed(2)} m/s`);
});

test("part-way across, the scrape takes the sideways travel out and the edge grips again", () => {
  // MEASURED: 30° is lined up again by 1 s, 60° by 2 s (20° left at 1 s).
  for (const deg of [30, 60]) {
    const p = { ...SIM, slipMode: 1 }, s = across(p, deg), events: EdgeEvent[] = [];
    for (let i = 0; i < 240 && !s.fallen; i++) step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5 }, p, SIM_DT, events);
    assert.equal(s.fallen, false, `${deg}°`);
    assert.ok(slipDeg(s) < 1, `${deg}°: travel lined up with the blades (${slipDeg(s).toFixed(2)}°)`);
    assert.ok(events.some(e => e.type === EVENT.SkidEnd), `${deg}°: the edge took hold again`);
    assert.ok(len(s.vel) < 4.5, `${deg}°: and the scrape cost speed`);
  }
});

// ── the dig ─────────────────────────────────────────────────────────────────
// A scraping blade pushes where it meets the ice; the heel/toe puts that ahead
// of or behind the boot (bladeLength), and r x F winds the body. That winding
// is carried into the takeoff (spinCarry), so a dig is rotation for a jump.
// These start already leaned into the scrape, as a skater arriving off a carve
// does: on one foot there is no way to lean in once the blade is across.

test("the dig: on the toe it winds the body counter-clockwise, on the heel clockwise, centred not at all", () => {
  // MEASURED at 90°, 5 m/s, leaned in, 0.3 s: toe +1.276, heel -1.278 rad/s
  // (the rocker differs toe to heel, so the paths are not exact mirrors).
  const p = { ...SIM, slipMode: 1 };
  const wind = (pitch: number): number => {
    const s = across(p, 90, 5, 0.34);
    for (let i = 0; i < 36; i++) step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5, pitch }, p, SIM_DT, []);
    assert.equal(s.fallen, false);
    return s.spinCarry;
  };
  const toe = wind(0.8), flat = wind(0), heel = wind(-0.8);
  assert.ok(Math.abs(toe - 1.276) < 0.01, `toe ${toe.toFixed(3)}`);
  assert.ok(Math.abs(heel + 1.278) < 0.01, `heel ${heel.toFixed(3)}`);
  assert.equal(flat, 0);
  const off = { ...SIM, slipMode: 0 }, s0 = across(off, 90, 5, 0.34);
  for (let i = 0; i < 36; i++) step(s0, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5, pitch: 0.8 }, off, SIM_DT, []);
  assert.equal(s0.spinCarry, 0, "no slip, no dig");
});

/** Arrive leaned in, `deg` across, dig for `digT` s, load 0.3 s, release. The takeoff's jump state. */
function digJump(deg: number, pitch: number, weight: number, toe: boolean) {
  const p = { ...SIM, slipMode: 1 }, s = across(p, deg, 6, 0.34);
  let took = false;
  for (let i = 0; i < 240 && !took && !s.fallen; i++) {
    const knee = i < 12 ? 0.5 : i < 48 ? 0.9 : 0.2;
    const events: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee, pitch, weight, toe: toe && i === 44 }, p, SIM_DT, events);
    took = events.some(e => e.type === EVENT.Takeoff);
  }
  assert.ok(took, `took off (${deg}°, pitch ${pitch})`);
  return s.jump;
}

test("a dig is rotation for the jump: the toe dig's winding leaves the ice with the skater", () => {
  // MEASURED, 6 m/s, 100°, 0.1 s dig then a 0.3 s load, no arms: toe dig L 6.52
  // (full arms alone give inertiaOpen x jumpWhip = 38); flat 0; heel 0 — a
  // counter-clockwise skater cannot use a clockwise winding. A 150° dig lines
  // up sooner and gives 0.
  const toe = digJump(100, 0.8, 0, false), flat = digJump(100, 0, 0, false), heel = digJump(100, -0.8, 0, false);
  assert.ok(Math.abs(toe.angMomentum - 6.52) < 0.05, `toe dig L ${toe.angMomentum.toFixed(2)}`);
  assert.equal(flat.angMomentum, 0);
  assert.equal(heel.angMomentum, 0);
  assert.ok(digJump(150, 0.8, 0, false).angMomentum < toe.angMomentum, "the angle of the dig matters");
});

test("which jump is read off the dig's takeoff: foot, blade direction, edge and pick", () => {
  // Past 90° the blade leaves backward. On the left foot leaning left that is
  // LBO: with a toe tap in the window a lutz, without one no listed jump.
  const lutz = digJump(100, 0.8, 0, true), bare = digJump(100, 0.8, 0, false);
  assert.equal(lutz.kind, JUMP.Lutz);
  assert.equal(bare.kind, JUMP_NONE);
  assert.ok(lutz.angMomentum > 0, "and the lutz carries the dig");
});
