// Report-only two-sided diagnostics and takeoff_vz diagnostics:
// verdicts, counts, coverage and exit code must be identical with or without them,
// and malformed diagnostics entries must be rejected loudly.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { markdown, validateCorpus } from "../validate.mjs";

const CASES_DIR = new URL("../../../data/validation/cases", import.meta.url).pathname;

function tempCorpus(cases: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ice-twosided-"));
  for (const c of cases) writeFileSync(join(dir, `${(c as { id: string }).id}.json`), JSON.stringify(c));
  return dir;
}

const HOP_SCRIPT = [
  { seconds: 1.0, input: { weight: 1.0 } },
  { seconds: 0.3, input: { weight: 1.0, knee: 0.9 } },
  { seconds: 2.5, input: { weight: 1.0, knee: 0.2 } },
];

function hopCase(id: string, comparison: "at_least" | "at_most", value: number, diagnostics?: unknown): object {
  return {
    id, kind: "jump", role: "validation",
    source: { type: "derived", citation: "synthetic hop", primary_checked: null, notes: "" },
    requires: ["jumps"], skater: null, venue: null,
    inputs: { initial: { speed_ms: 5, lean_rad: 0 }, modes: { jumpMode: 1, movesMode: 0 }, script: HOP_SCRIPT, clip: null },
    observable: { name: "air_time_s", window: "flight", radius: null },
    expected: { comparison, value, unit: "s", measurement_uncertainty: 0, band: 0.05, tolerance: 0.05, confidence: "L0" },
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}

test("verdicts, counts and coverage are identical with and without diagnostics", () => {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json")).sort();
  const strippedDir = mkdtempSync(join(tmpdir(), "ice-stripped-"));
  try {
    for (const file of files) {
      const c = JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
      delete c.diagnostics;
      writeFileSync(join(strippedDir, file), JSON.stringify(c));
    }
    const withDiag = validateCorpus(CASES_DIR);
    const withoutDiag = validateCorpus(strippedDir);

    assert.deepEqual(withDiag.summary, withoutDiag.summary);
    assert.deepEqual(withDiag.coverage, withoutDiag.coverage);
    assert.deepEqual(withDiag.gate, withoutDiag.gate);
    assert.equal(withDiag.results.length, withoutDiag.results.length);

    for (let i = 0; i < withDiag.results.length; i++) {
      const a = withDiag.results[i];
      const b = withoutDiag.results[i];
      assert.equal(a.id, b.id);
      assert.equal(a.verdict, b.verdict);
      assert.equal(a.actual, b.actual);
      assert.equal(a.deviation, b.deviation);
      assert.deepEqual(a.twoSided, b.twoSided);
      assert.equal(a.spec?.verdict, b.spec?.verdict);
      assert.equal(a.spec?.actual, b.spec?.actual);
      assert.equal(a.spec?.reason, b.spec?.reason);
    }

    const kogaIds = [
      "air-time-waltz-jump-koga2025",
      "air-time-single-axel-koga2025",
      "air-time-double-axel-koga2025",
    ];
    for (const id of kogaIds) {
      const r = withDiag.results.find((x) => x.id === id);
      assert.ok(r, id);
      assert.equal(r.verdict, "pass");
      assert.equal(r.twoSided?.within, false);
      assert.ok(r.twoSided && r.twoSided.deviation > 0);
      assert.equal(r.diagnostics?.length, 1);
      assert.equal(r.diagnostics?.[0].observable, "takeoff_vz");
      assert.equal(r.diagnostics?.[0].gated, false);
      assert.equal(r.diagnostics?.[0].within_sd, false);
    }
  } finally {
    rmSync(strippedDir, { recursive: true, force: true });
  }
});

test("twoSided diagnostic covers at_least and at_most without moving verdict or exit code", () => {
  const cli = new URL("../validate.mjs", import.meta.url).pathname;
  const dir = tempCorpus([
    // HOP_SCRIPT flies ~0.5583 s: passes at_least 0.20 (over two-sided) and at_most 0.90 (under two-sided)
    hopCase("hop-over", "at_least", 0.20),
    hopCase("hop-under", "at_most", 0.90),
    hopCase("hop-within", "at_least", 0.55),
  ]);
  try {
    const res = spawnSync(process.execPath, [cli, "--json", "--cases", dir], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const report = JSON.parse(res.stdout);
    assert.deepEqual(report.summary, { cases: 3, pass: 3, fail: 0, unsourced: 0, unmodelled: 0 });
    const by = Object.fromEntries(report.results.map((r: { id: string }) => [r.id, r]));
    assert.equal(by["hop-over"].twoSided.within, false);
    assert.ok(by["hop-over"].twoSided.deviation > 0.05);
    assert.equal(by["hop-under"].twoSided.within, false);
    assert.ok(by["hop-under"].twoSided.deviation < -0.05);
    assert.equal(by["hop-within"].twoSided.within, true);

    const md = markdown(report);
    assert.match(md, /\| Two-sided \|/);
    assert.match(md, /over by /);
    assert.match(md, /under by /);
    assert.match(md, /✓/);
    assert.equal(md, markdown(report));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed diagnostics entries are rejected loudly", () => {
  const badCases = [
    ["not-a-list", hopCase("bad-list", "at_least", 0.3, { observable: "takeoff_vz" })],
    ["not-an-object", hopCase("bad-entry", "at_least", 0.3, ["takeoff_vz"])],
    ["unknown-key", hopCase("bad-key", "at_least", 0.3, [{ observable: "takeoff_vz", value: 2.0, sd: 0.3, unit: "m/s", gated: false, typo: 1 }])],
    ["unknown-observable", hopCase("bad-obs", "at_least", 0.3, [{ observable: "takeoff_vx", value: 2.0, sd: 0.3, unit: "m/s", gated: false }])],
    ["negative-sd", hopCase("bad-sd", "at_least", 0.3, [{ observable: "takeoff_vz", value: 2.0, sd: -0.1, unit: "m/s", gated: false }])],
    ["empty-unit", hopCase("bad-unit", "at_least", 0.3, [{ observable: "takeoff_vz", value: 2.0, sd: 0.3, unit: "", gated: false }])],
    ["gated-true", hopCase("bad-gated", "at_least", 0.3, [{ observable: "takeoff_vz", value: 2.0, sd: 0.3, unit: "m/s", gated: true }])],
  ] as const;

  for (const [label, c] of badCases) {
    const dir = tempCorpus([c]);
    try {
      const r = validateCorpus(dir);
      assert.equal(r.results[0].verdict, "fail", `${label}: expected fail`);
      assert.match(r.results[0].reason ?? "", /^invalid case:/, `${label}: expected invalid case reason`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
