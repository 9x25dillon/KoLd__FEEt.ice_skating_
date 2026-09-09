// Determinism, which is the property everything downstream is built on.
//
// Replays, ghost skaters, server-side verification and every regression test
// in this rig need the same inputs to produce the same state, tick for tick.
// The checksum stream is how a divergence gets LOCATED rather than merely
// detected: the first tick whose checksum differs is the tick to look at.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step, checksum } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, EdgeEvent } from "../sim/types.ts";
import { rng } from "../sim/math.ts";

/**
 * A scripted input sequence: edge changes, weight transfers, rocker movement.
 *
 * Run against PRESETS.responsive rather than the spec defaults, because the
 * spec's own gains put the skater down inside three seconds of this input —
 * see test/balance.test.ts, which measures that rather than working around it.
 *
 * IT STROKES. Without a push every few beats the skater coasts down through
 * the speed at which the commanded lean is still holdable and falls over — a
 * determinism test running on a ragdoll proves nothing about the control path,
 * because a fallen skater ignores its inputs entirely. `stays up` below is
 * asserted rather than assumed for exactly that reason.
 */
function scripted(i: number): SkatingInput {
  return {
    lean: 0.30 * Math.sin(i * 0.017),
    knee: 0.45 + 0.25 * Math.sin(i * 0.004),
    weight: 0.5 + 0.45 * Math.sin(i * 0.011),
    pitch: 0.4 * Math.sin(i * 0.009),
    push: i % 90 === 0,           // stroke, or the skater coasts to a fall
    brake: false,
  };
}

function checksumStream(ticks: number): number[] {
  const p = PRESETS.responsive;
  const s = createState(p, 4.0, 0);
  const events: EdgeEvent[] = [];
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    step(s, scripted(i), p, SIM_DT, events);
    out.push(checksum(s));
  }
  return out;
}

test("the scripted run stays on its feet, so the control path is live", () => {
  const p = PRESETS.responsive;
  const s = createState(p, 4.0, 0);
  const events: EdgeEvent[] = [];
  for (let i = 0; i < 1200; i++) step(s, scripted(i), p, SIM_DT, events);
  assert.ok(!s.fallen, "the reference sequence must be skateable end to end");
});

test("the same inputs produce the same checksum stream", () => {
  const a = checksumStream(1200);   // ten seconds
  const b = checksumStream(1200);
  assert.deepEqual(a, b, "two identical runs diverged");
  assert.equal(a.length, 1200);
  assert.ok(new Set(a).size > 1000, "the checksum should actually be moving");
});

test("an altered input diverges the stream, at or after the tick that changed", () => {
  const p = PRESETS.responsive;
  const runWith = (from: number, amount: number): number[] => {
    const s = createState(p, 4.0, 0);
    const events: EdgeEvent[] = [];
    const out: number[] = [];
    for (let i = 0; i < 600; i++) {
      const inp = scripted(i);
      if (i >= from) inp.lean += amount;
      step(s, inp, p, SIM_DT, events);
      out.push(checksum(s));
    }
    return out;
  };
  const clean = runWith(Infinity, 0);
  // One LSB of an int8 axis: the smallest difference a real controller can express.
  const nudged = runWith(300, 1 / 127);

  let first = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] !== nudged[i]) { first = i; break; }
  }
  assert.notEqual(first, -1, "one controller step of difference must eventually show");
  assert.ok(first >= 300, `divergence cannot precede its cause: saw ${first}`);
  // Within a second. One controller step of lean is a small perturbation and
  // the solver is dissipative, so it takes time to grow past the quantum —
  // measured at 59 ticks. What matters for divergence detection is that the
  // window is bounded and short, not that it is instant.
  assert.ok(first < 420, `should surface within a second, took ${first - 300} ticks`);
});

test("a single sub-quantum tick of noise does NOT diverge a replay", () => {
  // The other half of the contract, and the reason the quantum exists: the
  // solver is dissipative, so a perturbation smaller than the checksum's
  // resolution decays instead of growing. Replays survive last-bit noise.
  const p = PRESETS.responsive;
  const runWith = (at: number, amount: number): number => {
    const s = createState(p, 4.0, 0);
    const events: EdgeEvent[] = [];
    for (let i = 0; i < 600; i++) {
      const inp = scripted(i);
      if (i === at) inp.lean += amount;
      step(s, inp, p, SIM_DT, events);
    }
    return checksum(s);
  };
  assert.equal(runWith(300, 1e-9), runWith(Infinity, 0),
    "a one-tick nudge far below the quantum should leave no trace");
});

test("the checksum notices an edge call changing with the kinematics unchanged", () => {
  // Position to a tenth of a millimetre is not enough on its own: a build that
  // classified edges differently while moving identically would replay clean.
  const p = PRESETS.responsive;
  const s = createState(p, 4.0, 0);
  const events: EdgeEvent[] = [];
  step(s, NEUTRAL_INPUT, p, SIM_DT, events);
  const before = checksum(s);
  s.blade[0].code = s.blade[0].code ^ 0b1000;   // flip the side bit only
  assert.notEqual(checksum(s), before, "an edge code change must move the checksum");
});

test("quantization truncates, so the checksum is not a rounding mode", () => {
  const p = PRESETS.responsive;
  const a = createState(p, 4.0, 0);
  const b = createState(p, 4.0, 0);
  // A difference far below the quantum must NOT show up.
  b.pos.x += 1e-9;
  assert.equal(checksum(a), checksum(b), "sub-quantum noise should not diverge a replay");
  // A difference above it must.
  b.pos.x += 1e-3;
  assert.notEqual(checksum(a), checksum(b), "a tenth of a millimetre must diverge it");
});

test("the seeded generator is stable, so ice variance will replay too", () => {
  const a = rng(12345);
  const b = rng(12345);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  const c = rng(12346);
  assert.notEqual(rng(12345)(), c());
});
