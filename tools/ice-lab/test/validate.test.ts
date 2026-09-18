// The fidelity validator: verdicts, exit code and determinism, on a corpus built here.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { markdown, validateCorpus } from "../validate.mjs";

const HOP = [
  { seconds: 1.0, input: { weight: 1.0 } },
  { seconds: 0.3, input: { weight: 1.0, knee: 0.9 } },
  { seconds: 2.5, input: { weight: 1.0, knee: 0.2 } },
];

function derivedHop(id: string, value: number, tolerance = 0.05): object {
  return {
    id, kind: "jump", role: "validation",
    source: { type: "derived", citation: "h = g t² / 8", primary_checked: null, notes: "" },
    requires: ["jumps"], skater: null, venue: null,
    inputs: { initial: { speed_ms: 5, lean_rad: 0 }, modes: { jumpMode: 1, movesMode: 0 }, script: HOP, clip: null },
    observable: { name: "air_time_height_residual_m", window: "flight", radius: null },
    expected: { comparison: "within", value, unit: "m", measurement_uncertainty: 0, band: 0.05, tolerance, confidence: "L0" },
  };
}

function stub(id: string, requires: string[] = []): object {
  return {
    id, kind: "glide", role: "validation",
    source: { type: "footage", citation: "", primary_checked: null, notes: "" },
    requires, skater: null, venue: null, inputs: null,
    observable: { name: "glide_decel_ms2", window: "steady", radius: null }, expected: null,
  };
}

function corpus(cases: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ice-validate-"));
  for (const c of cases) writeFileSync(join(dir, `${(c as { id: string }).id}.json`), JSON.stringify(c));
  return dir;
}

test("each verdict, for the reason the gate gives", () => {
  const dir = corpus([
    derivedHop("hop-ballistic", 0),
    derivedHop("hop-wrong-on-purpose", 1.0),
    derivedHop("hop-bad-arithmetic", 0, 0.5),
    stub("a-stub"),
    stub("a-choctaw", ["choctaw"]),
  ]);
  try {
    const r = validateCorpus(dir);
    const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
    assert.equal(by["hop-ballistic"].verdict, "pass");
    assert.equal(by["hop-wrong-on-purpose"].verdict, "fail");
    assert.equal(by["hop-bad-arithmetic"].verdict, "fail");
    assert.match(by["hop-bad-arithmetic"].reason ?? "", /tolerance/);
    assert.equal(by["a-stub"].verdict, "unsourced");
    assert.equal(by["a-choctaw"].verdict, "unmodelled");
    assert.deepEqual(r.summary, { cases: 5, pass: 1, fail: 2, unsourced: 1, unmodelled: 1 });
    assert.equal(r.gate.met, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the same corpus gives the same report, byte for byte", () => {
  const dir = corpus([derivedHop("hop-ballistic", 0), stub("a-stub")]);
  try {
    assert.equal(JSON.stringify(validateCorpus(dir)), JSON.stringify(validateCorpus(dir)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a modelled bracket without measurements remains unsourced, never a fidelity pass", () => {
  const dir = corpus([stub("bracket-without-evidence", ["bracket"])]);
  try {
    const r = validateCorpus(dir);
    assert.equal(r.results[0].verdict, "unsourced");
    assert.equal(r.summary.pass, 0);
    assert.equal(r.gate.met, false);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("exit 0 only when every sourced case passes; unsourced and unmodelled never move it", () => {
  const cli = new URL("../validate.mjs", import.meta.url).pathname;
  const clean = corpus([derivedHop("hop-ballistic", 0), stub("a-stub"), stub("a-choctaw", ["choctaw"])]);
  const dirty = corpus([derivedHop("hop-ballistic", 0), derivedHop("hop-wrong-on-purpose", 1.0)]);
  try {
    const ok = spawnSync(process.execPath, [cli, "--json", "--cases", clean], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).summary.pass, 1);
    const bad = spawnSync(process.execPath, [cli, "--cases", dirty], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /FIDELITY REGRESSION/);
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  }
});

test("the Markdown report is marked generated, carries every case, and is the same every run", () => {
  const dir = corpus([derivedHop("hop-ballistic", 0), stub("a-stub"), stub("a-choctaw", ["choctaw"])]);
  try {
    const a = markdown(validateCorpus(dir)), b = markdown(validateCorpus(dir));
    assert.equal(a, b);
    assert.match(a, /GENERATED — do not edit/);
    assert.match(a, /\*\*Gate not met\.\*\*/);
    for (const id of ["hop-ballistic", "a-stub", "a-choctaw"]) assert.ok(a.includes(`\`${id}\``), id);
    assert.ok(a.endsWith("\n"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
