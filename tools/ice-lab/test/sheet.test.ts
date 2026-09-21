// A program's jump protocol (sim/sheet.ts): elements, design bible §2.7's
// repetition rule, and the data's fall deductions.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { loadTables } from "../sim/score.ts";
import { applyRepeatRule, segmentScore, ProtocolSheet } from "../sim/sheet.ts";
import type { SheetElement } from "../sim/sheet.ts";

const read = (f: string) => readFileSync(new URL(`../../../data/${f}`, import.meta.url), "utf8");
const tables = loadTables(read("scale-of-values.csv"), read("calls-and-deductions.csv"));

/** Elements from "3T", "3T+2T", ...; each jump worth 1 so TES counts the valid ones. */
function elements(...program: string[]): SheetElement[] {
  const e = program.map((el) => ({ jumps: el.split("+").map((label) => {
    const revolutions = Number(label[0]);
    return { label, key: label.replace(/[<q!e]+$/, ""), revolutions, score: 1, invalid: false };
  }) }));
  applyRepeatRule(e);
  return e;
}
const marks = (e: SheetElement[]) => e.map((x) => x.jumps.map((j) => j.label + (j.invalid ? "*" : "")).join("+"));

test("the same triple twice, both solo: the second is marked * — a repeat must be in a combination", () => {
  assert.deepEqual(marks(elements("3T", "3Lo", "3T")), ["3T", "3Lo", "3T*"]);
});

test("a repeat is legal once either attempt is in a combination, whichever comes first", () => {
  assert.deepEqual(marks(elements("3T", "3Lz+3T")), ["3T", "3Lz+3T"]);
  assert.deepEqual(marks(elements("3Lz+3T", "3T")), ["3Lz+3T", "3T"]);
});

test("a third attempt is marked * even in a combination: no more than twice", () => {
  assert.deepEqual(marks(elements("3T+3T", "3T")), ["3T+3T", "3T*"]);
});

test("the rule covers triples and quads only, and an under-rotated attempt is still the same jump", () => {
  assert.deepEqual(marks(elements("2A", "2A", "2A")), ["2A", "2A", "2A"]);
  assert.deepEqual(marks(elements("4T", "4T")), ["4T", "4T*"]);
  assert.deepEqual(marks(elements("3Lz", "3Lz<")), ["3Lz", "3Lz<*"]);
});

test("fall deductions follow data/calls-and-deductions.csv's schedule, and the segment total subtracts them", () => {
  const sheet = new ProtocolSheet(tables);
  assert.equal(sheet.deductions(0), 0);
  assert.equal(sheet.deductions(2), 2, "1st and 2nd: -1.00 each");
  assert.equal(sheet.deductions(3), 4, "3rd: -2.00");
  assert.equal(sheet.deductions(5), 9, "5th onward: -3.00 each");
  assert.equal(segmentScore(12.345, 20, 2), 30.35);
});
