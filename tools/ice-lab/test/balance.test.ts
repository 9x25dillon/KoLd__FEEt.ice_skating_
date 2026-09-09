// The balance loop, and the envelope it can actually skate inside.
//
// These tests are measurements, not guarantees. Several of them record limits
// that are LOWER than a figure skater's, and they are written down rather than
// tuned away because the whole point of the rig is to find them here instead
// of six weeks into a UE5 build.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, PRESETS, SIM_DT, leanLoopResponse, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FALL } from "../sim/types.ts";
import { equilibriumLean } from "../sim/blade.ts";

const deg = (d: number): number => (d * Math.PI) / 180;

/** Deepest lean, in whole degrees, reachable from upright without going down. */
function entryLimit(p: Params, speed: number): number {
  let best = 0;
  for (let d = 2; d <= 60; d++) {
    const s = createState(p, speed, 0);
    const ev: never[] = [];
    let up = true;
    for (let i = 0; i < 720; i++) {
      step(s, { ...NEUTRAL_INPUT, lean: deg(d) / p.maxLean, weight: 1 }, p, SIM_DT, ev);
      if (s.fallen) { up = false; break; }
    }
    if (up) best = d; else break;
  }
  return best;
}

test("the linearized lean loop is stable, and the panel's numbers are right", () => {
  const r = leanLoopResponse(DEFAULT_PARAMS);
  assert.ok(DEFAULT_PARAMS.balanceKp > DEFAULT_PARAMS.gravity, "Kp must exceed g");
  assert.ok(Math.abs(r.wn - 5.54) < 0.05, `w_n ${r.wn.toFixed(2)}`);
  assert.ok(Math.abs(r.zeta - 0.76) < 0.02, `zeta ${r.zeta.toFixed(2)}`);
  assert.deepEqual(validate(DEFAULT_PARAMS), [], "the shipped defaults must validate");
});

test("gains at or below g are rejected before they can be skated", () => {
  const errs = validate({ ...DEFAULT_PARAMS, balanceKp: 9.0 });
  assert.ok(errs.some((e) => e.includes("balanceKp")), errs.join("; "));
});

test("holding an established edge is stable at ordinary speed", () => {
  const p = DEFAULT_PARAMS;
  const s = createState(p, 4.0, deg(20));
  const ev: never[] = [];
  for (let i = 0; i < 600; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: deg(20) / p.maxLean, weight: 1 }, p, SIM_DT, ev);
  }
  assert.ok(!s.fallen, "an edge entered at equilibrium should simply hold");
  assert.ok(Math.abs(s.lean - deg(20)) < deg(2), `lean settled at ${(s.lean * 180 / Math.PI).toFixed(1)} deg`);
  // A small steady-state error survives, because the skater is decelerating
  // (nothing strokes here) and so is continuously running a slightly deeper
  // edge to hold the same lean. Measured at 1.3 degrees over five seconds.
  assert.ok(Math.abs(s.balanceError) < deg(2),
    `balance error ${(s.balanceError * 180 / Math.PI).toFixed(2)} deg`);
});

test("MEASURED: the spec's gains cannot enter a deep edge from upright", () => {
  // The finding. Holding 20 degrees at 4 m/s is stable (above), but GETTING
  // there from upright is not: the angulation limit means the blade cannot
  // reach the 27 degrees that lean needs until the body has already leaned
  // over, so the entry is an under-supported fall that the loop has to arrest
  // — and at the spec's damping it overshoots and keeps going.
  //
  // Entering an edge from upright is the most common thing a skater does, so
  // this is not an edge case. It is the first thing to fix.
  const spec = entryLimit(DEFAULT_PARAMS, 4.0);
  assert.ok(spec >= 9 && spec <= 13,
    `expected the spec defaults to top out near 11 deg at 4 m/s, measured ${spec}`);
});

test("MEASURED: damping and angulation together buy the entry back", () => {
  // Neither alone is enough — more damping alone reaches 18 degrees, a wider
  // angulation limit alone reaches 15. Together they reach usable depth.
  const tuned = entryLimit(PRESETS.responsive, 4.0);
  assert.ok(tuned >= 24, `responsive preset should enter past 24 deg, measured ${tuned}`);
  assert.ok(tuned > entryLimit(DEFAULT_PARAMS, 4.0), "and must beat the spec defaults");
});

test("MEASURED: speed buys depth, and it buys it as v squared", () => {
  // kappa = g tan(phi) / v^2, so the arc a lean demands gets cheap quickly.
  // This is the single most important thing the model says about the game:
  // deep edges are a reward for having built speed.
  //
  // The right way to state it is not a ratio of ANGLES but a ratio of their
  // tangents, which is what the closed form actually predicts — and once the
  // controller stopped throwing depth away at low speed, the rig reproduces
  // that closed form to three digits.
  const p = PRESETS.responsive;
  const slow = entryLimit(p, 3.0);
  const mid = entryLimit(p, 4.0);
  const fast = entryLimit(p, 6.0);
  // Measured: 16 / 27 / 46 degrees at 3 / 4 / 6 m/s.
  assert.ok(slow < mid && mid < fast, `${slow} / ${mid} / ${fast} deg at 3 / 4 / 6 m/s`);

  const r1 = Math.tan(deg(mid)) / Math.tan(deg(slow));
  const r2 = Math.tan(deg(fast)) / Math.tan(deg(mid));
  // 3 -> 4 m/s: measured 1.777 against (4/3)^2 = 1.778. That is the model
  // agreeing with its own algebra, not a tuned number.
  assert.ok(Math.abs(r1 - 16 / 9) < 0.15,
    `tan-depth should scale as v^2: measured ${r1.toFixed(3)} against ${(16 / 9).toFixed(3)}`);
  // 4 -> 6 m/s: measured 2.03 against 2.25. It falls short of the closed form
  // because the run is six seconds long with no propulsion, and a deep edge at
  // speed bleeds enough of it that the last degree is unholdable by the end.
  assert.ok(r2 > 1.85 && r2 < 2.40,
    `and still nearly so at the top: measured ${r2.toFixed(3)} against ${(36 / 16).toFixed(3)}`);
});

test("MEASURED: the missing rate term alone buys back most of the entry envelope", () => {
  // Attribution, measured one lever at a time rather than asserted. The rate
  // term costs nothing in Kp, Kd or angulation — it is a term the engineering
  // package simply does not have.
  const rateOnly = { ...DEFAULT_PARAMS, internalRateGain: 2.0 };
  const spec = [3, 4, 6].map((v) => entryLimit(DEFAULT_PARAMS, v));
  const fixed = [3, 4, 6].map((v) => entryLimit(rateOnly, v));
  // Measured: 4 / 11 / 32 -> 9 / 19 / 43 degrees at 3 / 4 / 6 m/s.
  assert.deepEqual(spec.map((d, i) => fixed[i] > d), [true, true, true],
    `the rate term must deepen every speed: ${spec.join("/")} -> ${fixed.join("/")}`);
  assert.ok(fixed[1] >= 1.5 * spec[1],
    `and substantially at stroking pace: ${spec[1]} -> ${fixed[1]} deg`);

  // The fall credit, by contrast, buys NO depth at all — it is not a gain, it
  // is a correction to how a fall is detected. Recorded so the two are never
  // conflated.
  const creditOnly = [3, 4, 6].map((v) => entryLimit({ ...DEFAULT_PARAMS, fallAuthorityCredit: 1.0 }, v));
  assert.deepEqual(creditOnly, spec, `the fall credit is not a gain: ${creditOnly.join("/")}`);
});

test("MEASURED: at 6 m/s the deepest lean belongs to the blade, not the loop", () => {
  // Where the entry limit is controller-bound, control gains move it. Where it
  // is geometry-bound they stop working, and this is the speed at which that
  // happens — which is the difference between "tune the loop" and "sharpen the
  // rocker" being the right answer to a skater saying it will not bite.
  const p = PRESETS.responsive;
  const base = entryLimit(p, 6);                                        // 46
  const moreRate = entryLimit({ ...p, internalRateGain: 6.0 }, 6);      // 47
  const moreDamping = entryLimit({ ...p, balanceKd: 28.0 }, 6);         // 48
  const tighterRocker = entryLimit({ ...p, rocker: 1.6 }, 6);           // 53
  assert.ok(moreRate - base <= 2 && moreDamping - base <= 2,
    `tripling the rate term and near-doubling Kd should be worth almost nothing at 6 m/s: `
    + `${base} -> ${moreRate} / ${moreDamping}`);
  assert.ok(tighterRocker - base >= 5,
    `while the blade still moves it: ${base} -> ${tighterRocker}`);
});

test("equilibrium lean is the arctangent it claims to be", () => {
  assert.equal(equilibriumLean(0, 9.81), 0);
  const phi = equilibriumLean(9.81, 9.81);
  assert.ok(Math.abs(phi - Math.PI / 4) < 1e-12, "1 g of lateral is 45 degrees");
  assert.ok(equilibriumLean(-5, 9.81) < 0, "and it is signed");
});

/**
 * The reference wobble sequence: a slow sinusoidal lean with a stroke every
 * 90 ticks. The stroke is not decoration — without propulsion the speed decays,
 * the holdable lean decays with it, and every parameter set eventually falls
 * for that reason instead of the one under test.
 */
const sequence = (i: number) => ({
  lean: 0.30 * Math.sin(i * 0.017), knee: 0.45, weight: 0.5,
  pitch: 0, push: i % 90 === 0, brake: false,
});

test("MEASURED: as the package specifies it, internal authority is not a knob", () => {
  // Recorded because it is the obvious way to write an assist tier and it
  // makes balance WORSE. The term is proportional on balance error with no
  // rate component, so raising its ceiling adds gain without adding damping.
  const survives = (p: Params): boolean => {
    const s = createState(p, 4.0, 0);
    const ev: never[] = [];
    for (let i = 0; i < 1800; i++) { step(s, sequence(i), p, SIM_DT, ev); if (s.fallen) return false; }
    return true;
  };

  const ticksUp = (p: Params): number => {
    const s = createState(p, 4.0, 0);
    const ev: never[] = [];
    for (let i = 0; i < 1800; i++) { step(s, sequence(i), p, SIM_DT, ev); if (s.fallen) return i; }
    return 1800;
  };
  assert.ok(survives(PRESETS.assisted), "the assisted preset skates this sequence");

  // The tuned gains with the package's own internal authority: proportional
  // only, and a fall test that credits none of it. This is the parameter set
  // the finding was measured on, kept so the defect stays reproducible after
  // the presets were fixed.
  const asSpecified = { ...PRESETS.responsive, internalRateGain: 0, fallAuthorityCredit: 0 };
  const at15 = ticksUp(asSpecified);                                 // 617
  const at20 = ticksUp({ ...asSpecified, internalMax: 2.0 });        // 725
  const at25 = ticksUp({ ...asSpecified, internalMax: 2.5 });        //  77
  assert.ok(at25 < at15 / 3,
    `raising internal authority should collapse the loop: ${at15} -> ${at25} ticks`);
  assert.ok(at20 > at15,
    `and not even monotonically — 2.0 outlasts 1.5: ${at15} vs ${at20}`);
});

test("MEASURED: a save is scored as a fall, which is most of why", () => {
  // The other half of the same defect, and the sharper half. balanceError is
  // the gap between the body's lean and the lean the EDGE alone would balance
  // — so a skater using their arms and free leg is deliberately not at it.
  // With the fall test crediting none of that, using the recovery authority
  // IS the fall condition, and the more authority the sooner it fires.
  //
  // The tell is where the skater is standing when it does.
  const p = { ...PRESETS.responsive, internalRateGain: 0, fallAuthorityCredit: 0, internalMax: 2.5 };
  const s = createState(p, 4.0, 0);
  const ev: never[] = [];
  let tick = -1;
  for (let i = 0; i < 1800; i++) {
    step(s, sequence(i), p, SIM_DT, ev);
    if (s.fallen) { tick = i; break; }
  }
  assert.ok(tick > 0 && tick < 120, `the package's criterion fires early: tick ${tick}`);
  assert.equal(s.fallReason, FALL.BalanceTimeout, "and by timeout, not by lean");
  // Measured: down at tick 77, at 2.6 degrees of lean, upright, at 4 m/s.
  // Whatever that is, it is not a fall.
  assert.ok(Math.abs(s.lean) < deg(6),
    `nobody is on the ice at ${(s.lean * 180 / Math.PI).toFixed(1)} degrees of lean`);

  // Credit the authority and the same run simply skates.
  const fixed = { ...p, internalRateGain: 2.0, fallAuthorityCredit: 1.0 };
  const s2 = createState(fixed, 4.0, 0);
  for (let i = 0; i < 1800; i++) step(s2, sequence(i), fixed, SIM_DT, ev);
  assert.ok(!s2.fallen, "with the authority credited, the save is a save");
});

test("the fixed authority IS a knob: raising the ceiling no longer costs anything", () => {
  // The precondition the finding asked for, delivered. Same sequence, same
  // gains, rate term and credit in place: 1.5, 2.5 and 3.0 all skate it.
  for (const internalMax of [1.5, 2.5, 3.0]) {
    const p = { ...PRESETS.responsive, internalMax };
    const s = createState(p, 4.0, 0);
    const ev: never[] = [];
    for (let i = 0; i < 1800; i++) step(s, sequence(i), p, SIM_DT, ev);
    assert.ok(!s.fallen, `internalMax ${internalMax} should skate the sequence`);
  }
});

test("crediting the authority does not make the skater unfallable", () => {
  // The obvious risk in the fix, checked rather than assumed. A lean the edge
  // cannot hold at that speed still goes down — by LEAN EXCEEDED, which is the
  // honest reason, at maximum assist.
  const p = { ...PRESETS.assisted, internalMax: 2.5 };
  for (const [v, cmdDeg] of [[3, 50], [4, 60], [2, 45]] as Array<[number, number]>) {
    const s = createState(p, v, 0);
    const ev: never[] = [];
    let fell = false;
    for (let i = 0; i < 1200; i++) {
      step(s, { ...NEUTRAL_INPUT, lean: deg(cmdDeg) / p.maxLean, weight: 1 }, p, SIM_DT, ev);
      if (s.fallen) { fell = true; break; }
    }
    assert.ok(fell, `${cmdDeg} deg at ${v} m/s must still go down`);
    assert.equal(s.fallReason, FALL.LeanExceeded, `and for the right reason at ${v} m/s`);
  }
});

test("the new control parameters are validated the way the old ones are", () => {
  assert.deepEqual(validate(PRESETS.responsive), [], "the responsive preset must validate");
  assert.deepEqual(validate(PRESETS.assisted), [], "and so must the assist tier");
  assert.ok(validate({ ...DEFAULT_PARAMS, internalRateGain: -1 })
    .some((e) => e.includes("internalRateGain")), "anti-damping is not a tuning choice");
  assert.ok(validate({ ...DEFAULT_PARAMS, fallAuthorityCredit: 1.5 })
    .some((e) => e.includes("fallAuthorityCredit")), "the credit is a fraction");
  // The finding, encoded as the check that stops it being rediscovered in UE5.
  assert.ok(validate({ ...DEFAULT_PARAMS, internalMax: 2.5 })
    .some((e) => e.includes("internalRateGain")),
    "raising the ceiling with no rate term under it must be rejected");
});
