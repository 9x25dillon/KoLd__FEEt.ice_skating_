// What the model does when asked for a long-track speed skater's curve.
//
// Kimura and Yokozawa (2024, doi:10.3389/fspor.2024.1396219, Tables 2 and 4)
// measured fourteen world-class women through the inner curve of a 3,000 m
// World Cup race: on the right stroke, early in the race, 12.37 m/s on a
// centre-of-mass radius of 26.14 m, 6.25 m/s² toward the centre, the body
// tilted 32.18°. Those are the numbers in the two validation cases
// carve-lean-speedskate-curve-{right,left}-kimura2024, which the validator
// reports as unmodelled.
//
// This file is why they are unmodelled and not failing, measured rather than
// asserted. It runs the paper's skater on the gate's preset and records what
// happens. It pins a finding; it tunes nothing and nothing in sim/ reads it.
// docs/divergences/speedskate-curve-out-of-envelope.md has the reasoning.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, BOOT_PRESET, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { applyProfile, makeProfile } from "../sim/profile.ts";
import { NEUTRAL_INPUT, EVENT, REGIME } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";

const DEG = 180 / Math.PI;
/** Table 2 and Table 4, right stroke, initial stage: means over 14 skaters. */
const PAPER = { speed: 12.37, radius: 26.14, accel: 6.25, tiltDeg: 32.18, massKg: 60.36, heightM: 1.68 };

const p = applyProfile(PRESETS[BOOT_PRESET], makeProfile("kimura2024", { massKg: PAPER.massKg, heightM: PAPER.heightM }));

test("the bite law cannot supply the paper's centripetal acceleration on the paper's radius", () => {
  // A rigid rocker traces R = rho / sin(tilt) (fidelity-gate S2), so a 26.14 m
  // curve needs a blade nearly upright, and the bite law's capacity grows with
  // tilt (S5): g (c0 + c1 sin(tilt)) per unit mass. The two together cap the
  // lateral acceleration a wide curve can carry.
  const sinTilt = p.rocker / PAPER.radius;
  const capacity = p.gravity * (p.biteC0 + p.biteC1 * sinTilt) * p.sharpness * p.iceHardness;
  const demand = PAPER.speed * PAPER.speed / PAPER.radius;
  assert.ok(Math.abs(demand - 5.854) < 0.01, `v²/R from the paper's means is ${demand.toFixed(3)} m/s²`);
  assert.ok(Math.abs(capacity - 3.478) < 0.01, `capacity on a 26.14 m curve is ${capacity.toFixed(3)} m/s²`);
  assert.ok(capacity < demand && capacity < PAPER.accel, "the model's edge holds less than the skaters' did");
  // The fastest the model can carry that radius, and the lean that goes with it.
  const vMax = Math.sqrt(capacity * PAPER.radius), leanMax = Math.atan(capacity / p.gravity) * DEG;
  assert.ok(Math.abs(vMax - 9.53) < 0.02, `fastest held speed on that radius is ${vMax.toFixed(2)} m/s`);
  assert.ok(Math.abs(leanMax - 19.5) < 0.1, `deepest balanced lean on that radius is ${leanMax.toFixed(2)}°`);
});

test("asked for the paper's curve, the model skids, and the speed it settles at is not the paper's", (t) => {
  const s = createState(p, PAPER.speed, 0);
  const input: SkatingInput = { ...NEUTRAL_INPUT, lean: PAPER.tiltDeg / DEG / p.maxLean, weight: 1 };
  const events: EdgeEvent[] = [];
  let firstSkid = -1, lastSkid = -1, speedAfterSkid = 0;
  for (let i = 1; i <= 6 * 120; i++) {
    events.length = 0;
    step(s, input, p, SIM_DT, events);
    if (events.some((e) => e.type === EVENT.SkidBegin) && firstSkid < 0) firstSkid = i;
    if (s.blade.some((b) => b.inContact && b.regime === REGIME.Skid)) lastSkid = i;
    else if (lastSkid === i - 1) speedAfterSkid = Math.hypot(s.vel.x, s.vel.y);
  }
  const speedAt6s = Math.hypot(s.vel.x, s.vel.y);
  t.diagnostic(`first skid at ${(firstSkid / 120).toFixed(3)} s; last skidding tick at ${(lastSkid / 120).toFixed(3)} s; `
    + `speed when the edge held again ${speedAfterSkid.toFixed(2)} m/s; speed at 6 s ${speedAt6s.toFixed(2)} m/s; `
    + `lean at 6 s ${(Math.abs(s.lean) * DEG).toFixed(2)}°; fallen ${s.fallen}`);
  assert.ok(firstSkid > 0 && firstSkid <= 120, `the edge lets go inside the first second (tick ${firstSkid})`);
  assert.ok(speedAfterSkid > 0 && speedAfterSkid < PAPER.speed - 2,
    `the edge holds again only after the skid has taken more than 2 m/s (${speedAfterSkid.toFixed(2)} m/s)`);
  // fidelity-gate §4.4 opens a steady window 5 s after the last input change.
  // By then nothing pushes, drag has been working, and the speed is far from the paper's.
  assert.ok(speedAt6s < PAPER.speed - 4, `at 6 s the model is doing ${speedAt6s.toFixed(2)} m/s, not ${PAPER.speed}`);
  assert.equal(s.fallen, false, "it skids and slows; it does not fall");
});

test("the paper's skaters lean what a point mass would, within the gate's band", (t) => {
  // The relation the model holds by construction (fidelity-gate S1, S3):
  // tan(lean) = a / g. Table 2's accelerations against Table 4's body tilts,
  // all six rows. This compares the paper with the relation, not with a run.
  const rows = [
    { name: "left, initial", accel: 5.81, tilt: 28.00, sd: 1.95 }, { name: "left, middle", accel: 5.40, tilt: 26.79, sd: 1.25 },
    { name: "left, final", accel: 5.31, tilt: 26.37, sd: 1.86 }, { name: "right, initial", accel: 6.25, tilt: 32.18, sd: 1.79 },
    { name: "right, middle", accel: 5.94, tilt: 30.97, sd: 2.53 }, { name: "right, final", accel: 5.85, tilt: 31.19, sd: 1.45 },
  ];
  const BAND = 3;   // fidelity-gate §5.1, carve_lean_deg
  const lines: string[] = [];
  for (const r of rows) {
    const pointMass = Math.atan(r.accel / p.gravity) * DEG;
    const deviation = pointMass - r.tilt, tolerance = Math.hypot(r.sd, BAND);
    lines.push(`${r.name}: measured ${r.tilt.toFixed(2)} ± ${r.sd.toFixed(2)}°, point mass ${pointMass.toFixed(2)}°, `
      + `deviation ${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}°, tolerance ${tolerance.toFixed(2)}°`);
    assert.ok(Math.abs(deviation) <= tolerance, lines[lines.length - 1]);
  }
  for (const line of lines) t.diagnostic(line);
});
