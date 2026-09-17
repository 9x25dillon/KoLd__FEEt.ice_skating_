// A step sequence's ISU level, from the variety ladder sim/stepLevel.ts can
// actually score. See that file's own header for why six rig-observable
// types cap this scorer at grade 1, never grade 2, 3 or 4 — this file does
// not re-litigate that, only tests what remains.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  StepSequenceTracker, loadStepFeatureThresholds, scoreStepLevel, STEP_TYPE,
} from "../sim/stepLevel.ts";
import type { StepEvent, StepFeatureThresholds } from "../sim/stepLevel.ts";
import { FOOT } from "../sim/types.ts";
import type { Foot } from "../sim/types.ts";

const T: StepFeatureThresholds = {
  grades: [
    { grade: 1, distinctTypes: 5, distinctDifficult: 0, bothFeet: true, difficultBothFeet: false },
    { grade: 2, distinctTypes: 7, distinctDifficult: 2, bothFeet: true, difficultBothFeet: false },
    { grade: 3, distinctTypes: 9, distinctDifficult: 4, bothFeet: true, difficultBothFeet: true },
    { grade: 4, distinctTypes: 11, distinctDifficult: 5, bothFeet: true, difficultBothFeet: true },
  ],
};

const ev = (type: number, foot: Foot = FOOT.Right, tick = 0): StepEvent => ({ type, foot, tick });

test("no events: level B, nothing earned", () => {
  assert.deepEqual(scoreStepLevel([], T), { level: 0, distinctTypes: [], bothFeet: false, difficultBothFeet: false });
});

test("five distinct types, both feet: grade 1, the only grade this rig's six types can ever reach", () => {
  const events = [
    ev(STEP_TYPE.ThreeTurn, FOOT.Right), ev(STEP_TYPE.Mohawk, FOOT.Left),
    ev(STEP_TYPE.Bracket, FOOT.Right), ev(STEP_TYPE.Twizzle, FOOT.Right),
    ev(STEP_TYPE.Crossover, FOOT.Right),
  ];
  const r = scoreStepLevel(events, T);
  assert.equal(r.level, 1);
  assert.equal(r.distinctTypes.length, 5);
  assert.ok(r.bothFeet);
});

test("fewer than five distinct types: level B, however many feet were used", () => {
  const events = [ev(STEP_TYPE.ThreeTurn, FOOT.Right), ev(STEP_TYPE.Mohawk, FOOT.Left), ev(STEP_TYPE.Bracket, FOOT.Right)];
  assert.equal(scoreStepLevel(events, T).level, 0);
});

test("five distinct types on one foot never clears grade 1: both_feet_used is a real gate", () => {
  const events = [STEP_TYPE.ThreeTurn, STEP_TYPE.Mohawk, STEP_TYPE.Bracket, STEP_TYPE.Twizzle, STEP_TYPE.Crossover]
    .map((ty) => ev(ty, FOOT.Right));
  assert.equal(scoreStepLevel(events, T).level, 0);
});

test("all six of this rig's types, both feet: still grade 1 — grade 2 needs 7, one more than exists", () => {
  const events = Object.values(STEP_TYPE).map((ty, i) => ev(ty as number, i % 2 === 0 ? FOOT.Right : FOOT.Left));
  const r = scoreStepLevel(events, T);
  assert.equal(r.distinctTypes.length, 6);
  assert.equal(r.level, 1, "six distinct types cannot reach grade 2's own requirement of seven");
});

test("repeating the same type does not inflate the distinct count", () => {
  const events = [ev(STEP_TYPE.ThreeTurn, FOOT.Right), ev(STEP_TYPE.ThreeTurn, FOOT.Left), ev(STEP_TYPE.ThreeTurn, FOOT.Right)];
  assert.equal(scoreStepLevel(events, T).distinctTypes.length, 1);
});

test("StepSequenceTracker.recent windows by tick, and reset clears the history", () => {
  const tracker = new StepSequenceTracker();
  tracker.record(STEP_TYPE.ThreeTurn, FOOT.Right, 0);
  tracker.record(STEP_TYPE.Mohawk, FOOT.Left, 500);
  tracker.record(STEP_TYPE.Bracket, FOOT.Right, 1000);
  assert.equal(tracker.recent(1000, 600).length, 2, "only the last two fall inside a 600-tick window from 1000");
  assert.equal(tracker.recent(1000, 2000).length, 3);
  tracker.reset();
  assert.equal(tracker.events.length, 0);
});

test("the thresholds are data/step-features.json's own variety_ladder, not hardcoded", () => {
  const json = readFileSync(new URL("../../../data/step-features.json", import.meta.url), "utf8");
  const t = loadStepFeatureThresholds(json);
  assert.deepEqual(t.grades.map((g) => g.grade).sort(), [1, 2, 3, 4]);
  const g1 = t.grades.find((g) => g.grade === 1)!;
  assert.equal(g1.distinctTypes, 5);
  assert.equal(g1.distinctDifficult, 0);
  assert.equal(g1.bothFeet, true);
  const g2 = t.grades.find((g) => g.grade === 2)!;
  assert.equal(g2.distinctTypes, 7);
  assert.equal(g2.distinctDifficult, 2);
  const g4 = t.grades.find((g) => g.grade === 4)!;
  assert.equal(g4.difficultBothFeet, true);
});

test("a malformed features file is rejected, not silently defaulted", () => {
  assert.throws(() => loadStepFeatureThresholds("{}"));
  assert.throws(() => loadStepFeatureThresholds(JSON.stringify({ variety_ladder: { grades: [] } })));
  assert.throws(() => loadStepFeatureThresholds(JSON.stringify({
    variety_ladder: { grades: [{ grade: 1, requires: {} }] },
  })), "distinct_turn_and_step_types missing must fail, not become NaN");
});
