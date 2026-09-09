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
import { NEUTRAL_INPUT } from "../sim/types.ts";
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

test("MEASURED: speed is what buys depth, far more than gains do", () => {
  // kappa = g tan(phi) / v^2, so the arc a lean demands gets cheap quickly.
  // This is the single most important thing the model says about the game:
  // deep edges are a reward for having built speed.
  const p = PRESETS.responsive;
  const slow = entryLimit(p, 3.0);
  const mid = entryLimit(p, 4.0);
  const fast = entryLimit(p, 6.0);
  // Measured: 13 / 26 / 46 degrees at 3 / 4 / 6 m/s. Doubling from a crawl to
  // a stroking pace doubles the depth available.
  assert.ok(slow < mid && mid < fast, `${slow} / ${mid} / ${fast} deg at 3 / 4 / 6 m/s`);
  assert.ok(mid >= 1.8 * slow, `3 -> 4 m/s should roughly double depth: ${slow} -> ${mid}`);
  assert.ok(fast >= 1.6 * mid, `4 -> 6 m/s should still buy a lot: ${mid} -> ${fast}`);
});

test("equilibrium lean is the arctangent it claims to be", () => {
  assert.equal(equilibriumLean(0, 9.81), 0);
  const phi = equilibriumLean(9.81, 9.81);
  assert.ok(Math.abs(phi - Math.PI / 4) < 1e-12, "1 g of lateral is 45 degrees");
  assert.ok(equilibriumLean(-5, 9.81) < 0, "and it is signed");
});

test("the internal authority term destabilizes if it is simply turned up", () => {
  // Recorded because it is the obvious way to write an assist tier and it
  // makes balance WORSE. The term is proportional on balance error with no
  // rate component, so raising its ceiling adds gain without adding damping.
  const sequence = (i: number) => ({
    lean: 0.30 * Math.sin(i * 0.017), knee: 0.45, weight: 0.5,
    pitch: 0, push: i % 90 === 0, brake: false,
  });
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
  // Measured on the responsive preset: down at tick 527 at the shipped ceiling
  // of 1.5, and at tick 77 with it raised to 2.5. The response is not even
  // monotonic — 2.0 lasts LONGER than 1.5 — which is the signature of a gain
  // term with no damping rather than of a difficulty knob.
  const shipped = ticksUp(PRESETS.responsive);
  const cranked = ticksUp({ ...PRESETS.responsive, internalMax: 2.5 });
  assert.ok(cranked < shipped / 3,
    `raising internal authority should collapse the loop: ${shipped} -> ${cranked} ticks`);
});
