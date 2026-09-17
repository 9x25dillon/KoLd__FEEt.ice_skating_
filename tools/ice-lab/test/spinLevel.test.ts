// A spin's ISU level, from the two features sim/spinLevel.ts can actually
// score. See that file's own header for the other eight and why each is out
// of reach — this file does not re-litigate that, only tests what remains.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, MOVE, SPIN_POSITION } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import {
  SpinLevelTracker, loadSpinFeatureThresholds, scoreSpinLevel,
} from "../sim/spinLevel.ts";
import type { SpinSegment, SpinFeatureThresholds } from "../sim/spinLevel.ts";

const T: SpinFeatureThresholds = { speedRatioMin: 1.3, speedMinRevolutions: 2, maxSpeedFeatures: 2, longSegmentMinRevolutions: 8 };
const seg = (over: Partial<SpinSegment>): SpinSegment =>
  ({ position: SPIN_POSITION.Upright, revolutions: 3, omegaMin: 10, omegaMax: 10, ...over });

test("no segments: level B, nothing earned", () => {
  assert.deepEqual(scoreSpinLevel([], T), { level: 0, speedPositions: [], eightRevolutions: false });
});

test("a genuine speed increase within one position earns the feature once", () => {
  const r = scoreSpinLevel([seg({ omegaMin: 10, omegaMax: 14 })], T); // 1.4x
  assert.equal(r.level, 1);
  assert.deepEqual(r.speedPositions, [SPIN_POSITION.Upright]);
});

test("below the ratio, or too short a segment, earns nothing", () => {
  assert.equal(scoreSpinLevel([seg({ omegaMin: 10, omegaMax: 12 })], T).level, 0, "1.2x is not clear enough");
  assert.equal(scoreSpinLevel([seg({ omegaMin: 10, omegaMax: 14, revolutions: 1 })], T).level, 0, "too short to be sustained");
});

test("the same basic position counts once, even across two segments", () => {
  const r = scoreSpinLevel([
    seg({ position: SPIN_POSITION.Sit, omegaMin: 10, omegaMax: 14 }),
    seg({ position: SPIN_POSITION.Sit, omegaMin: 10, omegaMax: 14 }),
  ], T);
  assert.deepEqual(r.speedPositions, [SPIN_POSITION.Sit]);
});

test("distinct positions each count, capped at maxSpeedFeatures", () => {
  const good = { omegaMin: 10, omegaMax: 14 };
  const r = scoreSpinLevel([
    seg({ position: SPIN_POSITION.Upright, ...good }),
    seg({ position: SPIN_POSITION.Sit, ...good }),
    seg({ position: SPIN_POSITION.Camel, ...good }),
  ], T);
  assert.equal(r.speedPositions.length, 2, "capped at maxSpeedFeatures even with three qualifying positions");
});

test("eight or more revolutions in one unbroken segment earns its own feature", () => {
  const short = scoreSpinLevel([seg({ revolutions: 7.9 })], T);
  assert.equal(short.eightRevolutions, false);
  const long = scoreSpinLevel([seg({ revolutions: 8 })], T);
  assert.equal(long.eightRevolutions, true);
  assert.equal(long.level, 1);
});

test("both features together: level 2, never higher from this scorer alone", () => {
  const r = scoreSpinLevel([
    seg({ position: SPIN_POSITION.Upright, omegaMin: 10, omegaMax: 14, revolutions: 9 }),
    seg({ position: SPIN_POSITION.Sit, omegaMin: 10, omegaMax: 14 }),
  ], T);
  assert.equal(r.speedPositions.length, 2);
  assert.equal(r.eightRevolutions, true);
  assert.equal(r.level, Math.min(2 + 1, 4));
});

test("the thresholds are data/spin-features.json's, not hardcoded", () => {
  const json = readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8");
  const t = loadSpinFeatureThresholds(json);
  assert.equal(t.speedRatioMin, 1.3);
  assert.equal(t.speedMinRevolutions, 2);
  assert.equal(t.maxSpeedFeatures, 2);
  assert.equal(t.longSegmentMinRevolutions, 8);
});

test("a malformed features file is rejected, not silently defaulted", () => {
  assert.throws(() => loadSpinFeatureThresholds("{}"));
  assert.throws(() => loadSpinFeatureThresholds(JSON.stringify({ features: [] })));
  assert.throws(() => loadSpinFeatureThresholds(JSON.stringify({
    features: [{ id: "spin.increase_of_speed", max_per_element: 2, requires: {} },
      { id: "spin.eight_revolutions_no_change", requires: { min_revolutions: 8 } }],
  })), "omega_ratio_min missing must fail, not become NaN");
});

test("SpinLevelTracker rebuilds real segments from a real spin, arms pulled in mid-hold", () => {
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const s = createState(p, 4.5);
  const tracker = new SpinLevelTracker();
  for (let i = 0; i < 240 + 300 + 60; i++) {
    const t = i - 240;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, weight: 0, lean: i < 240 ? 0.3 : 0, knee: 0.45,
      carriage: t >= 0 && t < 150 ? 1 : 0, // open at entry, pulled in partway through the hold
      spin: t >= 0 && t < 300,
    };
    step(s, input, p, SIM_DT, []);
    if (s.move === MOVE.Spin) tracker.sample(s.spin);
  }
  const segments = tracker.finish();
  assert.ok(segments.length >= 1, "must have recorded at least one segment");
  assert.equal(segments[0].position, SPIN_POSITION.Upright, "knee 0.45 and pitch 0 stay upright throughout");
  assert.ok(segments[0].omegaMax > segments[0].omegaMin,
    `pulling the arms in must raise omega within the segment: min ${segments[0].omegaMin.toFixed(2)}, max ${segments[0].omegaMax.toFixed(2)}`);
});
