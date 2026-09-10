// Scoring one jump from the data, and the data against the reference.
//
// Three sources say what a jump is worth: data/scale-of-values.csv, the table
// inlined in src/reference/ScoreCalculator.cs, and the rel_difficulty column of
// jump-definitions.csv, which data/README.md says is derived. They are
// compared here so a season's SOV patch that updates one and not the others
// fails in CI rather than in a protocol sheet.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  loadTables, parseCsv, jumpValue, judgePanel, scoreJump, trimmedMean, fallDeduction, round2,
} from "../sim/score.ts";
import { JUMP, JUMP_NONE, ROTATION_CALL, EDGE_CALL, noResult } from "../sim/jump.ts";
import type { JumpResult } from "../sim/types.ts";

const repo = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repo), "utf8");
const tables = loadTables(read("data/scale-of-values.csv"), read("data/calls-and-deductions.csv"));

const jump = (over: Partial<JumpResult>): JumpResult => ({
  ...noResult(), tick: 1234, kind: JUMP.Lutz, revolutions: 3, turned: 3,
  takeoffQuality: 1, landingQuality: 0.8, ...over,
});

test("the scale of values in data/ is the table ScoreCalculator.cs inlines", () => {
  const cs = read("src/reference/ScoreCalculator.cs");
  const block = /JumpBV = \{([\s\S]*?)\};/.exec(cs)![1];
  const rows = block.split("\n").filter((l) => /\{/.test(l))
    .map((l) => [...l.matchAll(/(\d+\.\d+)f/g)].map((m) => Number(m[1])));
  const order = ["T", "S", "Lo", "F", "Lz", "A"];
  assert.equal(rows.length, order.length);
  rows.forEach((bvs, k) => bvs.forEach((bv, n) => {
    assert.equal(tables.sov.get(`${n + 1}${order[k]}`)?.baseValue, bv, `${n + 1}${order[k]}`);
  }));
});

test("goe_step is 10% of base value, and rel_difficulty is the triple against 3T", () => {
  for (const row of tables.sov.values()) assert.equal(row.goeStep, round2(row.baseValue / 10), row.code);
  const three = (c: string): number => tables.sov.get(`3${c}`)!.baseValue;
  for (const r of parseCsv(read("data/jump-definitions.csv"))) {
    assert.equal(Number(r.rel_difficulty), round2(three(r.code) / three("T")), r.code);
  }
});

test("base value follows the calls: < is 80%, << scores one fewer revolution, e is 80%", () => {
  assert.equal(jumpValue(tables, jump({}))!.baseValue, 5.90);
  assert.equal(jumpValue(tables, jump({ rotationCall: ROTATION_CALL.Quarter }))!.baseValue, 5.90);
  assert.equal(jumpValue(tables, jump({ rotationCall: ROTATION_CALL.UnderRotated }))!.baseValue, 4.72);
  const dg = jumpValue(tables, jump({ rotationCall: ROTATION_CALL.Downgraded }))!;
  assert.deepEqual([dg.label, dg.scoredAs, dg.baseValue], ["3Lz<<", "2Lz", 2.10]);
  assert.equal(jumpValue(tables, jump({ edgeCall: EDGE_CALL.Unclear }))!.baseValue, 5.90);
  assert.equal(jumpValue(tables, jump({ edgeCall: EDGE_CALL.Wrong }))!.baseValue, 4.72);
  const both = jumpValue(tables, jump({ rotationCall: ROTATION_CALL.UnderRotated, edgeCall: EDGE_CALL.Wrong }))!;
  assert.deepEqual([both.label, both.baseValue], ["3Lz<e", 3.78]);
  assert.equal(jumpValue(tables, jump({ kind: JUMP.Axel, revolutions: 2 }))!.baseValue, 3.30);
  assert.equal(jumpValue(tables, jump({ kind: JUMP_NONE, revolutions: 0 })), null, "a hop is not an element");
  assert.equal(jumpValue(tables, jump({ revolutions: 1, rotationCall: ROTATION_CALL.Downgraded }))!.baseValue, 0);
});

test("nine judges, trimmed: the highest and lowest marks are dropped", () => {
  assert.equal(trimmedMean([5, -5, 1, 1, 1, 1, 1, 1, 1]), 1);
  assert.equal(trimmedMean([0, 0, 0, 0, 0, 0, 0, 3, 3]), 3 / 7);
});

test("the panel is seeded: a replay re-scores the same, another landing does not", () => {
  const r = jump({});
  assert.deepEqual(judgePanel(tables, r, 1234), judgePanel(tables, r, 1234));
  assert.notDeepEqual(judgePanel(tables, r, 1234), judgePanel(tables, r, 99));
  assert.ok(judgePanel(tables, r, 1234).every((m) => Number.isInteger(m) && m >= -5 && m <= 5));
});

test("a fall is -5 from every judge; the data's mandatory reductions bite", () => {
  const fell = scoreJump(tables, jump({ fall: true }))!;
  assert.ok(fell.panel.every((m) => m === -5));
  assert.equal(fell.score, round2(5.90 - 5 * 0.59));
  // Same takeoff and landing, with an e: the data says -3 to -4 mandatory, so
  // the mean GOE falls by at least three steps. (The reference's min(v, -1)
  // would allow much less; data wins, per the header of sim/score.ts.)
  const clean = scoreJump(tables, jump({}))!.goe;
  const wrong = scoreJump(tables, jump({ edgeCall: EDGE_CALL.Wrong }))!.goe;
  assert.ok(clean - wrong >= 2.5, `clean ${clean} vs e ${wrong}`);
});

test("fall deductions follow the schedule in the data: -1, -1, -2, -2, -3 ...", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => fallDeduction(tables, n)), [1, 2, 4, 6, 9, 12]);
});
