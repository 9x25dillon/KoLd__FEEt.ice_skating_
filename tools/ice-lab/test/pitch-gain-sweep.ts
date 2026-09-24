// The fore-aft pendulum's fingerprint, and the pitchGain calibration sweep.
//
//   node test/pitch-gain-sweep.ts            the sweep, one row per gain
//
// fingerprint() measures the pendulum on the behaviours its ankle gain moves:
// how long the contact takes to reach an asked lean and how far it first runs
// the other way, the dig with the lean begun late and begun early, a stop that
// builds and a stop that catches. test/pendulum-fingerprint.test.ts pins it at
// the default gain, so a change to pitchGain — which is global, not the dig's
// alone — fails there and sends you back to the whole pendulum suite. The
// sweep is the calibration record: raising the gain five-fold gives the late
// dig back L 1.11 of the 6.52 it had before the pendulum, and moves everything
// else (2026-09-24). The dig's fix is the skater's: lean early.
//
// The helpers here are the dig tests' too (test/dig.test.ts).

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, FALL } from "../sim/types.ts";
import type { SkaterState, EdgeEvent, SkatingInput } from "../sim/types.ts";
import { rotate } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

/** Simulation's athlete with slip and the pendulum on, the trunk, the feet and the toe pick off. */
export const DIG_BASE: Params = {
  ...setupParams("simulation"), slipMode: 1, torqueMode: 0, footMode: 0, pitchMode: 1, toePickMode: 0,
};

/**
 * Glide leaned in at `speed`, asking `pitch`, for `early` s; then the blades
 * are `deg` across the travel, as off an unaligned landing or a skid — the
 * dig tests' arrival (test/slip.test.ts `across`), with a lean begun first.
 */
export function arrive(p: Params, deg: number, speed: number, pitch: number, early: number): SkaterState {
  const s = createState(p, speed, 0.34);
  for (let i = 0; i < Math.round(early / SIM_DT); i++) step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5, pitch }, p, SIM_DT, []);
  const a = deg * Math.PI / 180;
  s.heading = rotate(s.heading, a);
  for (const b of s.blade) b.tangent = rotate(b.tangent, a);
  return s;
}

/** Dig 0.3 s at 90° from 5 m/s: the winding, the blades' summed telemetry, and the support contact's mean. */
export function wind(p: Params, pitch: number, early = 0) {
  const s = arrive(p, 90, 5, pitch, early), before = s.spinCarry;
  let contact = 0, digSum = 0;
  for (let i = 0; i < 36; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5, pitch }, p, SIM_DT, []);
    contact += s.blade[s.supportFoot].contactS / 36;
    digSum += s.digL ?? 0;
  }
  return { s, winding: s.spinCarry - before, contact, digSum };
}

/** Dig 0.1 s at 100° from 6 m/s on the left foot, load 0.3 s, release; the takeoff's jump state, or null. */
export function digJump(p: Params, pitch: number, early = 0, toe = false) {
  const s = arrive(p, 100, 6, pitch, early);
  for (let i = 0; i < 240 && !s.fallen; i++) {
    const knee = i < 12 ? 0.5 : i < 48 ? 0.9 : 0.2, events: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee, pitch, weight: 0, toe: toe && i === 44 }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) return s.jump;
  }
  return null;
}

/** From a settled 5 m/s glide the asked lean steps 0 -> 0.75: how far the contact first runs the other way, and when it arrives. */
export function askedStep(p: Params) {
  const s = createState(p, 5);
  for (let i = 0; i < 120; i++) step(s, { ...NEUTRAL_INPUT, knee: 0.5 }, p, SIM_DT, []);
  let first = 1, arrived = -1;
  for (let i = 1; i <= 480 && arrived < 0; i++) {
    step(s, { ...NEUTRAL_INPUT, knee: 0.5, pitch: 0.75 }, p, SIM_DT, []);
    const c = s.blade[s.supportFoot].contactS;
    first = Math.min(first, c);
    if (i > 2 && Math.abs(c - s.contactAsked![s.supportFoot]) < 0.01) arrived = i * SIM_DT;
  }
  return { first, arrived };
}

function stop(p: Params, input: Partial<SkatingInput>, speed: number) {
  const q = { ...p, footMode: 1 }, s = createState(q, speed);
  let t = 0, pitchMin = 0;
  while (t < 6 && !s.fallen) {
    step(s, { ...NEUTRAL_INPUT, knee: 0.5, ...input }, q, SIM_DT, []);
    t += SIM_DT;
    pitchMin = Math.min(pitchMin, s.pitch ?? 0);
  }
  return { s, t, pitchMin };
}

export interface Fingerprint {
  /** Contact's first excursion (contactS) on a step to a toe lean, and when it reaches the asked, s. */
  counter: number; arrive: number;
  /** Toe dig's winding (rad/s of spinCarry) and takeoff L, the lean begun at the dig. */
  windLate: number; digLate: number;
  /** The same with the lean settled 1.5 s before. */
  windEarly: number; digEarly: number;
  /** The full inside snowplow from 5 m/s: the most the body leans back, rad. */
  plowLeanBack: number;
  /** Both outside edges caught from 3 m/s: s until down, Pitched. */
  caughtDown: number;
}

export function fingerprint(gain: number): Fingerprint {
  const p = { ...DIG_BASE, pitchGain: gain };
  const step0 = askedStep(p);
  const late = wind(p, 0.75), early = wind(p, 0.75, 1.5);
  const plow = stop(p, { toeOut: -1, leanSplit: 0.6 }, 5);
  const caught = stop(p, { toeOut: -1, leanSplit: -0.6 }, 3);
  return {
    counter: step0.first, arrive: step0.arrived,
    windLate: late.winding, digLate: digJump(p, 0.75)?.angMomentum ?? NaN,
    windEarly: early.winding, digEarly: digJump(p, 0.75, 1.5)?.angMomentum ?? NaN,
    plowLeanBack: plow.pitchMin,
    caughtDown: caught.s.fallReason === FALL.Pitched ? caught.t : NaN,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = Object.keys(fingerprint(1)) as (keyof Fingerprint)[];
  console.log(["pitchGain", ...keys].map(k => k.padStart(14)).join(""));
  for (const gain of [0.5, 1, 2, 3, 5]) {
    const f = fingerprint(gain);
    console.log([gain.toFixed(1), ...keys.map(k => f[k].toFixed(3))].map(v => v.padStart(14)).join(""));
  }
}
