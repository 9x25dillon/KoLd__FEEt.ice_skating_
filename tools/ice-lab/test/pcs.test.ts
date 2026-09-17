// Program Component Score — sim/pcs.ts.
//
// The formula and the component factor are transcribed from data/ and
// src/reference/ScoreCalculator.cs; the physics-to-0..10 mapping is not — see
// pcs.ts's own header. This file tests both halves, and keeps them apart:
// the data/formula tests would catch a season's rules patch breaking
// something, the physics tests only prove the mapping is monotonic and
// bounded, never that a number is "the right one" — there is no such thing
// to check it against.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  loadSegmentRules, findSegmentRule, pcsJudgePanel, scorePcs, pcsInputsFrom, PcsMeter,
} from "../sim/pcs.ts";
import type { PcsInputs } from "../sim/pcs.ts";
import { trimmedMean } from "../sim/score.ts";
import { IceGrid } from "../sim/ice.ts";
import { createState, run } from "../sim/solver.ts";
import { PRESETS, DEFAULT_PARAMS } from "../sim/params.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { SessionMeter } from "../sim/session.ts";
import { v2 } from "../sim/math.ts";

const repo = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repo), "utf8");
const rules = loadSegmentRules(read("data/segment-rules.csv"));

const noInputs: PcsInputs = { meanFlow: 0, meanLeanDepth: 0, skidRatio: 0, edgeChangesPerMinute: 0, musicCreditRate: 0 };
const goodInputs: PcsInputs = { meanFlow: 1, meanLeanDepth: 0.5, skidRatio: 0, edgeChangesPerMinute: 100, musicCreditRate: 10 };

test("segment-rules.csv parses into the four rows, and the free-skate factors match ScoreCalculator.cs's own comment", () => {
  assert.equal(rules.length, 4);
  const women = findSegmentRule(rules, "women", "free");
  const men = findSegmentRule(rules, "men", "free");
  // src/reference/ScoreCalculator.cs: "e.g. 2.67, women's free skate".
  assert.equal(women.componentFactor, 2.67);
  assert.equal(men.componentFactor, 3.33);
  assert.equal(findSegmentRule(rules, "women", "short").componentFactor, 1.33);
  assert.equal(findSegmentRule(rules, "men", "short").componentFactor, 1.67);
});

test("an unknown discipline or segment throws rather than silently defaulting", () => {
  assert.throws(() => findSegmentRule(rules, "women", "gala"));
  assert.throws(() => findSegmentRule(rules, "pairs", "free"));
});

test("the judge panel is seeded, quarter-point, and bounded 0.25..10", () => {
  assert.deepEqual(pcsJudgePanel(0.7, 1234), pcsJudgePanel(0.7, 1234));
  assert.notDeepEqual(pcsJudgePanel(0.7, 1234), pcsJudgePanel(0.7, 99));
  const marks = pcsJudgePanel(0.7, 1234);
  assert.equal(marks.length, 9);
  for (const m of marks) {
    assert.ok(m >= 0.25 && m <= 10, `${m} out of range`);
    assert.ok(Math.abs(m * 4 - Math.round(m * 4)) < 1e-9, `${m} is not a quarter-point step`);
  }
});

test("quality 0 and quality 1 bracket the panel's own range, trimmed mean included", () => {
  const low = trimmedMean(pcsJudgePanel(0, 1));
  const high = trimmedMean(pcsJudgePanel(1, 1));
  assert.ok(low < 1.5, `quality 0 should sit near the panel's floor, trimmed mean ${low}`);
  assert.ok(high > 8.5, `quality 1 should sit near the panel's ceiling, trimmed mean ${high}`);
  assert.ok(high > low);
});

test("scorePcs: better inputs and more ice coverage score higher, holding the seed fixed", () => {
  const rule = findSegmentRule(rules, "women", "free");
  // A small sheet, not the full rink: coverage() is a share of the whole
  // grid, and a program only ever touches a thin trace of a real-sized one —
  // this asks whether the signal moves the score at all, not what share a
  // real routine reaches.
  const bare = new IceGrid(2, 2);
  const covered = new IceGrid(2, 2);
  for (let x = -2; x <= 2; x += 0.1) for (let y = -2; y <= 2; y += 0.1) covered.deposit(v2(x, y), 0, 1, DEFAULT_PARAMS);

  const worst = scorePcs(rule, noInputs, bare, 42);
  const best = scorePcs(rule, goodInputs, covered, 42);
  assert.ok(best.skatingSkills > worst.skatingSkills);
  assert.ok(best.presentation > worst.presentation);
  assert.ok(best.composition > worst.composition, `coverage should move Composition: ${best.composition} vs ${worst.composition}`);
  assert.ok(best.total > worst.total);
  assert.equal(best.total, best.composition + best.presentation + best.skatingSkills);
  // The component factor bounds every component to [0.25, 10] * factor.
  for (const score of [worst, best]) {
    for (const c of [score.composition, score.presentation, score.skatingSkills]) {
      assert.ok(c >= 0.25 * rule.componentFactor - 0.01 && c <= 10 * rule.componentFactor + 0.01, `${c} out of the panel's own bound`);
    }
  }
});

test("the same seed re-scores the same, a different one does not", () => {
  const rule = findSegmentRule(rules, "women", "free");
  const grid = new IceGrid(DEFAULT_PARAMS.rinkHalfLength, DEFAULT_PARAMS.rinkHalfWidth);
  assert.deepEqual(scorePcs(rule, goodInputs, grid, 7), scorePcs(rule, goodInputs, grid, 7));
  assert.notDeepEqual(scorePcs(rule, goodInputs, grid, 7), scorePcs(rule, goodInputs, grid, 8));
});

test("PcsMeter's mean flow matches a hand-computed average over the same ticks", () => {
  const p = { ...PRESETS.responsive, flowMode: 1 };
  const s = createState(p, 5);
  const meter = new PcsMeter();
  let sum = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    run(s, { ...NEUTRAL_INPUT, lean: 0.3, weight: 1 }, p, 1);
    meter.sample(s);
    sum += s.flow; n++;
  }
  assert.ok(Math.abs(meter.meanFlow - sum / n) < 1e-9);
});

test("pcsInputsFrom reads session.ts's own fields, and a session with no free play never divides by zero", () => {
  const session = new SessionMeter().summary();
  const meter = new PcsMeter();
  const inputs = pcsInputsFrom(session, meter, 0);
  assert.equal(inputs.meanFlow, 0);
  assert.equal(inputs.meanLeanDepth, session.meanLeanDepth);
  assert.equal(inputs.skidRatio, session.skidRatio);
  assert.equal(inputs.edgeChangesPerMinute, session.edgeChangesPerMinute);
  assert.equal(inputs.musicCreditRate, 0, "freePlaySeconds is 0: must not be NaN or Infinity");
});
