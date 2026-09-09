// The exported CSV, which is the artifact a tuning session actually leaves
// behind. Its columns are also the C++ frame struct's field list, so a header
// that has drifted from the rows is a port bug waiting to happen rather than a
// cosmetic one.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { Telemetry } from "../sim/telemetry.ts";

const deg = (d: number): number => (d * Math.PI) / 180;

function skateFor(ticks: number): Telemetry {
  const p = PRESETS.responsive;
  const s = createState(p, 4.0, 0);
  const t = new Telemetry();
  const ev: never[] = [];
  for (let i = 0; i < ticks; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: deg(20) / p.maxLean, weight: 1, push: i % 90 === 0 }, p, SIM_DT, ev);
    t.capture(s);
  }
  return t;
}

test("every CSV row has exactly as many fields as the header", () => {
  const lines = skateFor(300).toCsv().split("\n");
  const n = lines[0].split(",").length;
  for (let i = 1; i < lines.length; i++) {
    assert.equal(lines[i].split(",").length, n,
      `row ${i} has ${lines[i].split(",").length} fields against ${n} in the header`);
  }
});

test("the internal authority is exported, or a save cannot be read back", () => {
  // Without this column a tuning log shows a skater recovering from nothing:
  // the lean moves, the edge force does not explain it, and the term that did
  // the work is invisible.
  const csv = skateFor(300).toCsv();
  const head = csv.split("\n")[0].split(",");
  const col = head.indexOf("int_accel");
  assert.ok(col > 0, `int_accel must be a column: ${head.join(",")}`);
  const values = csv.split("\n").slice(1).map((r) => Number(r.split(",")[col]));
  assert.ok(values.every((v) => Number.isFinite(v)), "and must be finite on every row");
  assert.ok(values.some((v) => Math.abs(v) > 1e-3),
    "and non-zero somewhere in an entry, which is where the arms do their work");
});
