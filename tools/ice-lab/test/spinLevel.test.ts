// A spin's ISU level, from the six features sim/spinLevel.ts can actually
// score. See that file's own header for the other four and why each is out
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

const T: SpinFeatureThresholds = {
  speedRatioMin: 1.3, speedMinRevolutions: 2, maxSpeedFeatures: 2, longSegmentMinRevolutions: 8,
  reverseMinRevolutions: 3, footChangeMinAirTimeS: 0.12, footChangeMaxRevolutionsLost: 0.75,
  difficultChangeMaxRevolutionsLost: 0.5, secondFootDistinctPositions: 3, secondFootMinRevolutionsEach: 2,
};
const seg = (over: Partial<SpinSegment>): SpinSegment =>
  ({ position: SPIN_POSITION.Upright, dir: 1, foot: 0, revolutions: 3, omegaMin: 10, omegaMax: 10, ...over });

test("no segments: level B, nothing earned", () => {
  assert.deepEqual(scoreSpinLevel([], T), {
    level: 0, speedPositions: [], eightRevolutions: false, bothDirections: false,
    footChangeByJump: false, difficultChangeOfFoot: false, allThreePositionsSecondFoot: false,
  });
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
  assert.equal(t.reverseMinRevolutions, 3);
  assert.equal(t.footChangeMinAirTimeS, 0.12);
  assert.equal(t.footChangeMaxRevolutionsLost, 0.75);
  assert.equal(t.difficultChangeMaxRevolutionsLost, 0.5);
  assert.equal(t.secondFootDistinctPositions, 3);
  assert.equal(t.secondFootMinRevolutionsEach, 2);
});

test("a direction reversal earns its feature only with enough revolutions each way, in sit or camel", () => {
  const flip = (a: Partial<SpinSegment>, b: Partial<SpinSegment>) =>
    scoreSpinLevel([seg({ position: SPIN_POSITION.Sit, dir: 1, revolutions: 3, ...a }),
      seg({ position: SPIN_POSITION.Sit, dir: -1, revolutions: 3, ...b })], T).bothDirections;
  assert.equal(flip({}, {}), true, "opposite dir, 3 revs each, both sit: earned");
  assert.equal(flip({ revolutions: 2.9 }, {}), false, "short of the minimum on one side");
  assert.equal(flip({}, { revolutions: 2.9 }), false, "short of the minimum on the other side");
  assert.equal(scoreSpinLevel([seg({ dir: 1, revolutions: 3 }), seg({ dir: 1, revolutions: 3 })], T).bothDirections,
    false, "same direction throughout: never a flip at all");
  assert.equal(flip({ position: SPIN_POSITION.Upright }, {}), false, "upright is not sit or camel");
  assert.equal(scoreSpinLevel([
    seg({ position: SPIN_POSITION.Sit, dir: 1, revolutions: 3 }),
    seg({ position: SPIN_POSITION.Camel, dir: -1, revolutions: 3 }),
  ], T).bothDirections, true, "the two sides need not share a position, only each be sit or camel");
  // Not adjacent: a same-direction segment sits between the two flips, so
  // neither pair by itself is "immediately following" the other.
  assert.equal(scoreSpinLevel([
    seg({ position: SPIN_POSITION.Sit, dir: 1, revolutions: 3 }),
    seg({ position: SPIN_POSITION.Upright, dir: 1, revolutions: 1 }),
    seg({ position: SPIN_POSITION.Sit, dir: -1, revolutions: 3 }),
  ], T).bothDirections, false, "a same-direction segment sits between them — not actually adjacent");
});

test("a reversal and a genuine speed increase together can reach level 2", () => {
  const r = scoreSpinLevel([
    seg({ position: SPIN_POSITION.Sit, dir: 1, revolutions: 3, omegaMin: 10, omegaMax: 14 }),
    seg({ position: SPIN_POSITION.Camel, dir: -1, revolutions: 3 }),
  ], T);
  assert.equal(r.bothDirections, true);
  assert.equal(r.speedPositions.length, 1);
  assert.equal(r.level, 2);
});

test("change_foot_by_jump: a completed change within the data's own bounds earns it", () => {
  const within = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.18, revolutionsLost: 0.3, positionChanged: false }]);
  assert.equal(within.footChangeByJump, true);
  const tooShort = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.05, revolutionsLost: 0.3, positionChanged: false }]);
  assert.equal(tooShort.footChangeByJump, false, "under footChangeMinAirTimeS: not a real change_foot_by_jump");
  const tooCostly = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.18, revolutionsLost: 0.9, positionChanged: false }]);
  assert.equal(tooCostly.footChangeByJump, false, "over footChangeMaxRevolutionsLost");
  assert.equal(scoreSpinLevel([seg({})], T, []).footChangeByJump, false, "no attempts at all: nothing earned");
});

test("difficult_change_of_foot: only a change where SPIN_POSITION also differs, within the cost bound", () => {
  const both = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.18, revolutionsLost: 0.2, positionChanged: true }]);
  assert.equal(both.difficultChangeOfFoot, true);
  const footOnly = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.18, revolutionsLost: 0.2, positionChanged: false }]);
  assert.equal(footOnly.difficultChangeOfFoot, false, "a plain change, foot only, is not the difficult one");
  const tooCostly = scoreSpinLevel([seg({})], T, [{ airTimeS: 0.18, revolutionsLost: 0.6, positionChanged: true }]);
  assert.equal(tooCostly.difficultChangeOfFoot, false, "over difficultChangeMaxRevolutionsLost");
});

test("all_three_positions_second_foot: distinct positions counted only on the foot reached after a change", () => {
  const threeOnSecond = scoreSpinLevel([
    seg({ foot: 0, position: SPIN_POSITION.Upright, revolutions: 3 }),
    seg({ foot: 1, position: SPIN_POSITION.Upright, revolutions: 2 }),
    seg({ foot: 1, position: SPIN_POSITION.Sit, revolutions: 2 }),
    seg({ foot: 1, position: SPIN_POSITION.Camel, revolutions: 2 }),
  ], T);
  assert.equal(threeOnSecond.allThreePositionsSecondFoot, true);
  const onlyTwo = scoreSpinLevel([
    seg({ foot: 0, position: SPIN_POSITION.Upright, revolutions: 3 }),
    seg({ foot: 1, position: SPIN_POSITION.Upright, revolutions: 2 }),
    seg({ foot: 1, position: SPIN_POSITION.Sit, revolutions: 2 }),
  ], T);
  assert.equal(onlyTwo.allThreePositionsSecondFoot, false, "only two distinct positions on the second foot");
  const neverChangedFoot = scoreSpinLevel([
    seg({ foot: 0, position: SPIN_POSITION.Upright, revolutions: 3 }),
    seg({ foot: 0, position: SPIN_POSITION.Sit, revolutions: 3 }),
    seg({ foot: 0, position: SPIN_POSITION.Camel, revolutions: 3 }),
  ], T);
  assert.equal(neverChangedFoot.allThreePositionsSecondFoot, false, "all three positions, but no second foot at all");
  const tooShort = scoreSpinLevel([
    seg({ foot: 0, position: SPIN_POSITION.Upright, revolutions: 3 }),
    seg({ foot: 1, position: SPIN_POSITION.Upright, revolutions: 1 }),
    seg({ foot: 1, position: SPIN_POSITION.Sit, revolutions: 1 }),
    seg({ foot: 1, position: SPIN_POSITION.Camel, revolutions: 1 }),
  ], T);
  assert.equal(tooShort.allThreePositionsSecondFoot, false, "each under secondFootMinRevolutionsEach");
  assert.equal(scoreSpinLevel([], T).allThreePositionsSecondFoot, false, "no segments at all");
});

test("all six features together reach the ISU's own level-4 clamp, not higher", () => {
  const r = scoreSpinLevel([
    seg({ position: SPIN_POSITION.Sit, dir: 1, foot: 0, revolutions: 3, omegaMin: 10, omegaMax: 14 }),
    seg({ position: SPIN_POSITION.Camel, dir: -1, foot: 0, revolutions: 9, omegaMin: 10, omegaMax: 14 }),
    seg({ position: SPIN_POSITION.Upright, dir: -1, foot: 1, revolutions: 2 }),
    seg({ position: SPIN_POSITION.Sit, dir: -1, foot: 1, revolutions: 2 }),
    seg({ position: SPIN_POSITION.Camel, dir: -1, foot: 1, revolutions: 2 }),
  ], T, [{ airTimeS: 0.18, revolutionsLost: 0.2, positionChanged: true }]);
  assert.equal(r.bothDirections, true);
  assert.equal(r.eightRevolutions, true);
  assert.equal(r.speedPositions.length, 2);
  assert.equal(r.footChangeByJump, true);
  assert.equal(r.difficultChangeOfFoot, true);
  assert.equal(r.allThreePositionsSecondFoot, true);
  assert.equal(r.level, 4, "six real features attained, but level_rule's own min(count, 4) caps it");
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

test("a real reversal, driven the way a player would, reaches level 3 end to end", () => {
  // Physics through the tracker through the scorer: a real spin, held in sit,
  // checked against its own entry direction long enough to flip, sustained
  // long enough each way and long enough overall for all three features.
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const s = createState(p, 4.5);
  const tracker = new SpinLevelTracker();
  let enteredDir: number | null = null;
  for (let i = 0; i < 240 + 900; i++) {
    const t = i - 240;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, weight: 0, lean: t < 0 ? 0.3 : t < 150 ? 0 : t < 500 ? -(enteredDir ?? 1) : 0,
      knee: t < 0 ? 0.45 : 0.7, spin: t >= 0 && t < 900,
    };
    step(s, input, p, SIM_DT, []);
    if (s.move === MOVE.Spin) {
      if (enteredDir === null) enteredDir = s.spin.dir;
      tracker.sample(s.spin);
    }
  }
  assert.equal(s.spin.dir, -(enteredDir as number), "the held check flipped it");
  const json = readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8");
  const result = scoreSpinLevel(tracker.finish(), loadSpinFeatureThresholds(json));
  assert.equal(result.bothDirections, true);
  assert.equal(result.eightRevolutions, true);
  assert.ok(result.speedPositions.length >= 1);
  assert.equal(result.level, 3, `all three of this scorer's features together: ${JSON.stringify(result)}`);
});

test("a real foot change, driven the way a player would, earns change_foot_by_jump end to end", () => {
  // A fresh toe press mid-hold: sim/moves.ts spinTick's own mechanic, read
  // through SpinLevelTracker.footChanges the same way a real career routine
  // (game/career.ts) or the free-skate HUD (game/main.ts) does.
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const s = createState(p, 4.5);
  const tracker = new SpinLevelTracker();
  for (let i = 0; i < 240 + 300; i++) {
    const t = i - 240;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, weight: 0, lean: i < 240 ? 0.3 : 0, knee: 0.7,
      toe: t === 60, spin: t >= 0 && t < 300,
    };
    step(s, input, p, SIM_DT, []);
    if (s.move === MOVE.Spin) tracker.sample(s.spin);
  }
  assert.equal(tracker.footChanges.length, 1, "exactly one completed change from one fresh press");
  const json = readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8");
  const result = scoreSpinLevel(tracker.finish(), loadSpinFeatureThresholds(json), tracker.footChanges);
  assert.equal(result.footChangeByJump, true, `real change did not qualify: ${JSON.stringify(tracker.footChanges)}`);
  assert.ok(result.level >= 1);
});
