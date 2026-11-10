// docs/jpse/CONTRACT.md held to the reference implementation: every record
// the rig writes validates against docs/jpse/schema, every gate and reason is
// in the closed list, and the conformance files regenerate exactly.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { validate, SCHEMA_DIR } from "../jpse/schema-check.ts";
import { conformanceFiles, readConformance } from "../jpse/conformance.ts";
import { BASELINE } from "../jpse/baseline.ts";

const report = JSON.parse(readFileSync(new URL("./fixtures/jpse-loop-v1.json", import.meta.url), "utf8"));

test("the reference's records validate against the contract's schemas", () => {
  assert.deepEqual(validate(report, "jpse-report.schema.json"), []);
  assert.deepEqual(validate(JSON.parse(readConformance("canonical.program.json")), "input-program.schema.json"), []);
  for (const line of readConformance("canonical.frames.jsonl").trim().split("\n"))
    assert.deepEqual(validate(JSON.parse(line), "motion-frame.schema.json"), []);
  const program = JSON.parse(readConformance("canonical.program.json"));
  const candidate = { schema: "jpse-candidate/1", id: "mirror", transform: { mirror: true, reverse: false }, jump: "Lo", setup: BASELINE.setup, program };
  assert.deepEqual(validate(candidate, "candidate.schema.json"), []);
});

test("the schemas reject what they should", () => {
  assert.ok(validate({ schema: "jpse-program/1", speed: -7, inputs: [{}] }, "input-program.schema.json").length > 0, "an input missing its fields");
  const bad = structuredClone(report);
  bad.candidates[0].takeoff.code = "RBX";
  bad.candidates[1].surprise = 1;
  const errs = validate(bad, "jpse-report.schema.json");
  assert.ok(errs.some((e) => e.includes("takeoff.code")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("surprise")), errs.join("\n"));
});

test("every gate and reason the reference emits is in the closed list, in order", () => {
  const reasons = JSON.parse(readFileSync(new URL("reasons.json", SCHEMA_DIR), "utf8"));
  const order: string[] = reasons.gates.map((g: { gate: string }) => g.gate);
  for (const c of report.candidates) {
    const names: string[] = c.gates.map((g: { gate: string }) => g.gate);
    assert.deepEqual(names, order.filter((n) => names.includes(n)), `${c.id}: gates out of order`);
    for (const g of c.gates) {
      const entry = reasons.gates.find((e: { gate: string }) => e.gate === g.gate);
      assert.ok(entry, `unknown gate ${g.gate}`);
      if (!g.pass) assert.ok(entry.reasons.some((r: string) => g.reason.startsWith(r)), `${g.gate}: ${g.reason}`);
    }
  }
});

test("the conformance files regenerate exactly", () => {
  for (const [name, text] of Object.entries(conformanceFiles()))
    assert.equal(text, readConformance(name), `${name} drifted: if on purpose, node jpse/conformance.ts --write`);
});
