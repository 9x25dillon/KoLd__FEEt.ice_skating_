// JPSE-007's first pass on a small grid: deterministic order, repeatable,
// the baseline point is the slice's canonical, and the report fits the contract.
// The full first grid (225 points) is recorded in docs/jpse/search-2026-11-09.md.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { gridPoints, runSearch } from "../jpse/search.ts";
import type { SearchSpec } from "../jpse/search.ts";
import { BASELINE_KNOBS } from "../jpse/baseline.ts";
import { validate } from "../jpse/schema-check.ts";

const SMALL: SearchSpec = { schema: "jpse-search/1", axes: { speed: [-6, -7], depth: [0.8, 1] }, repeat: 4 };

test("the grid is walked in declared order, the last axis fastest", () => {
  const pts = gridPoints(SMALL);
  assert.deepEqual(pts.map((p) => [p.speed, p.depth]), [[-6, 0.8], [-6, 1], [-7, 0.8], [-7, 1]]);
  assert.deepEqual({ ...pts[3] }, { ...BASELINE_KNOBS }, "the last point is the baseline");
});

test("a small search: repeatable, the baseline accepted, slower or shallower never leaves the ice", () => {
  const r = runSearch(SMALL);
  assert.deepEqual(validate(r, "search-report.schema.json"), []);
  assert.deepEqual(r.repeatability, { checked: 4, identical: 4 });
  assert.deepEqual(r.accepted, [3]);
  assert.deepEqual(r.pareto, [3]);
  assert.ok(Math.abs(r.points[3].turned - 1.971) < 0.001);
  // MEASURED 2026-11-09: below 7 m/s, or at 0.8 of the stick, the loop's load lapses.
  for (const i of [0, 1, 2]) assert.equal(r.points[i].firstReason, "takeoff:none", `#${i}`);
  assert.deepEqual(r.distribution, { "accepted": 1, "takeoff:none": 3 });
  assert.equal(JSON.stringify(runSearch(SMALL)), JSON.stringify(r), "two searches, one report");
});
