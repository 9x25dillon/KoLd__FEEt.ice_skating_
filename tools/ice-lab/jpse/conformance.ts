// tools/ice-lab/jpse/conformance.ts — the files another implementation is held to.
//
// docs/jpse/CONTRACT.md §5. The reference (this rig) writes them; a stage in
// any language conforms when it reproduces them. `node jpse/conformance.ts
// --write` regenerates them on purpose (a solver change says so in its commit);
// test/jpse-contract.test.ts fails if they drift without that.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { SIM_DT } from "../sim/params.ts";
import { BASELINE, baselineParams, loopBaselineProgram } from "./baseline.ts";
import { CANDIDATES, applyTransform, mirrorInput } from "./transform.ts";
import { pinPushFeet, runCandidate } from "./engine.ts";
import type { MotionFrame } from "./engine.ts";
import { baselineCurvature, bladeSkew, bladeTravelAngle, threePointCurvature, velocityCurvature } from "./geometry.ts";

export const CONFORMANCE_DIR = new URL("../test/fixtures/jpse/", import.meta.url);
/** The frames file keeps every this-many ticks, plus the takeoff and landing ticks. */
export const FRAME_STRIDE = 12;
const GEO_TOL = 1e-12;

export function conformanceFiles(): Record<string, string> {
  const p = baselineParams();
  const program = pinPushFeet(loopBaselineProgram(), p);
  const run = runCandidate("canonical", program, { mirror: false, reverse: false }, p, BASELINE.jump, BASELINE.runOut);
  const files: Record<string, string> = {};

  // JPSE-001 output / JPSE-002 input.
  files["canonical.program.json"] = JSON.stringify({ schema: "jpse-program/1", speed: program.speed, inputs: program.inputs }) + "\n";

  // JPSE-002: the mirror of a spread of real inputs (every push, and every
  // FRAME_STRIDE-th tick), and each candidate's starting speed.
  const picks = program.inputs.filter((i, k) => i.push || k % FRAME_STRIDE === 0);
  files["transforms.json"] = JSON.stringify({
    schema: "jpse-conformance-transforms/1",
    comparison: "value-exact",
    mirror: picks.map((input) => ({ input, expected: mirrorInput(input) })),
    speed: CANDIDATES.map((c) => ({ id: c.id, transform: c.transform, from: program.speed, expected: applyTransform({ speed: program.speed, inputs: [] }, c.transform).speed })),
  }, null, 1) + "\n";

  // JPSE-003: each geometry function on values the canonical run produced.
  const fr = run.frames, cases: unknown[] = [];
  for (let k = 1; k < fr.length; k += FRAME_STRIDE) {
    const a = fr[k - 1], b = fr[k], blade = b.blades[b.supportFoot];
    cases.push({ fn: "velocityCurvature", args: [a.vel, b.vel, SIM_DT], expected: velocityCurvature(a.vel, b.vel, SIM_DT), tol: GEO_TOL });
    cases.push({ fn: "baselineCurvature", args: [b.lean, b.vel, b.heading, p.gravity], expected: baselineCurvature(b.lean, b.vel, b.heading, p.gravity), tol: GEO_TOL });
    const alpha = bladeTravelAngle(blade.tangent, b.vel);
    cases.push({ fn: "bladeTravelAngle", args: [blade.tangent, b.vel], expected: alpha, tol: GEO_TOL });
    cases.push({ fn: "bladeSkew", args: [alpha], expected: bladeSkew(alpha), tol: GEO_TOL });
    if (k >= 2) {
      const c0 = fr[k - 2].blades[b.supportFoot].contact, c1 = a.blades[b.supportFoot].contact;
      cases.push({ fn: "threePointCurvature", args: [c0, c1, blade.contact], expected: threePointCurvature(c0, c1, blade.contact), tol: GEO_TOL });
    }
  }
  files["geometry-cases.json"] = JSON.stringify({ schema: "jpse-conformance-geometry/1", comparison: "within tol", cases }, null, 1) + "\n";

  // JPSE-009: the canonical MotionFrame stream, thinned.
  const keep = new Set([run.report.takeoff?.tick, run.report.landing?.tick].filter((t): t is number => t !== undefined));
  const thin: MotionFrame[] = fr.filter((f, k) => k % FRAME_STRIDE === 0 || keep.has(f.tick));
  files["canonical.frames.jsonl"] = thin.map((f) => JSON.stringify(f)).join("\n") + "\n";
  return files;
}

export function readConformance(name: string): string {
  return readFileSync(new URL(name, CONFORMANCE_DIR), "utf8");
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--write")) {
  mkdirSync(CONFORMANCE_DIR, { recursive: true });
  for (const [name, text] of Object.entries(conformanceFiles())) writeFileSync(new URL(name, CONFORMANCE_DIR), text);
  console.log(`wrote ${Object.keys(conformanceFiles()).join(", ")}`);
}
