// JPSE, issue #74's first vertical slice: one jump (the loop), one canonical
// entrance (backjump.test.ts's measured clean double), four candidates —
// canonical, mirror, reverse, mirror+reverse — each run through the
// unmodified solver, with a deterministic report.
//
// MEASURED 2026-11-09, on the Experimental setup with the sheet on, before
// jumpDirMode: the canonical accepted; the mirror off a SKID, no jump
// (rotation:cw-not-modelled); the reverse swivelling RFO to RBO mid-SKID; the
// mirror+reverse's load lapsing. The mirror on the ice was exact until the
// solver's own handedness parted it: the sheet's row boundary at y = 0, the
// tick-seeded fatigue wobble, and the two-foot tie that went to the right foot.
//
// MEASURED 2026-11-09, jumpDirMode on in every setup (a jump turns the way its
// entry turns it; the tie keeps its foot):
//   canonical       RBO off a CARVE, Lo, 1.971 revolutions ccw, stood: ACCEPTED
//   mirror          LBO off a CARVE, Lo, 1.971 revolutions cw, L -28.3, stood: ACCEPTED
//   reverse         the load lapses: takeoff:none
//   mirror+reverse  the load lapses: takeoff:none
// With the sheet and the wobble off the mirror is exact through the entrance.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { BASELINE, baselineParams, loopBaselineProgram } from "../jpse/baseline.ts";
import { CANDIDATES, applyTransform, mirrorInput } from "../jpse/transform.ts";
import { checkMirror, pinPushFeet, requirementFor, runCandidate, runSlice } from "../jpse/engine.ts";
import { baselineCurvature, bladeSkew, bladeTravelAngle, threePointCurvature } from "../jpse/geometry.ts";

const FIXTURE = new URL("./fixtures/jpse-loop-v1.json", import.meta.url);
const slice = () => runSlice(loopBaselineProgram(), baselineParams(), BASELINE.jump, BASELINE.runOut,
  { setup: BASELINE.setup, baselineSource: BASELINE.source }, CANDIDATES);
const { report, runs } = slice();
const cand = (id: string) => report.candidates.find((c) => c.id === id)!;

test("geometry: curvature, the lean baseline's sign, and the blade against its travel", () => {
  const R = 4, at = (a: number) => ({ x: R * Math.cos(a), y: R * Math.sin(a) });
  assert.ok(Math.abs(threePointCurvature(at(0), at(0.1), at(0.2)) - 1 / R) < 1e-12, "anticlockwise circle: +1/R");
  assert.ok(Math.abs(threePointCurvature(at(0.2), at(0.1), at(0)) + 1 / R) < 1e-12, "clockwise: -1/R");
  // The same lean curves a forward skater one way and a backward one the other.
  const h = { x: 1, y: 0 };
  assert.ok(baselineCurvature(0.3, { x: 5, y: 0 }, h, 9.81) > 0);
  assert.ok(baselineCurvature(0.3, { x: -5, y: 0 }, h, 9.81) < 0);
  assert.ok(Math.abs(baselineCurvature(0.3, { x: 5, y: 0 }, h, 9.81) - 9.81 * Math.tan(0.3) / 25) < 1e-12);
  assert.equal(bladeTravelAngle(h, { x: 5, y: 0 }), 0);
  assert.ok(Math.abs(bladeTravelAngle(h, { x: -5, y: 0 }) - Math.PI) < 1e-12, "skating backward along the blade");
  assert.ok(Math.abs(bladeSkew(Math.PI - 0.1) - 0.1) < 1e-12);
});

test("transforms: the mirror is its own inverse, the reverse flips the travel and nothing else", () => {
  const i: SkatingInput = { ...NEUTRAL_INPUT, lean: -0.4, weight: 0.8, windup: 0.3, kneeSplit: 0.2, pushFoot: 1, carriage: 0.6, knee: 0.7 };
  assert.deepEqual(mirrorInput(mirrorInput(i)), i);
  const m = mirrorInput(i);
  assert.equal(m.lean, 0.4); assert.ok(Math.abs(m.weight - 0.2) < 1e-15); assert.equal(m.windup, -0.3);
  assert.equal(m.kneeSplit, -0.2); assert.equal(m.pushFoot, 0); assert.equal(m.carriage, 0.6); assert.equal(m.knee, 0.7);
  assert.ok(!Object.is(mirrorInput({ ...NEUTRAL_INPUT }).lean, -0), "no negative zero: it would change a digest");
  const r = applyTransform({ speed: -7, inputs: [i] }, { mirror: false, reverse: true });
  assert.equal(r.speed, 7); assert.deepEqual(r.inputs[0], i);
});

test("each candidate is held to the loop's own definition: the mirror swaps the foot and the rotation", () => {
  assert.deepEqual(requirementFor(JUMP.Loop, { mirror: false, reverse: false }), { jump: "Lo", takeoff: "RBO", toe: false, rotation: "ccw" });
  assert.deepEqual(requirementFor(JUMP.Loop, { mirror: true, reverse: false }), { jump: "Lo", takeoff: "LBO", toe: false, rotation: "cw" });
  assert.deepEqual(requirementFor(JUMP.Loop, { mirror: false, reverse: true }).takeoff, "RBO");
});

test("the baseline is backjump.test.ts's measured double loop: 1.994 without a sheet, and clean with one", () => {
  // backjump.test.ts steps without an ice grid; the game and the replay player always pass one.
  const p = { ...baselineParams(), iceGridMode: 0 };
  const bare = runCandidate("canonical", loopBaselineProgram(), { mirror: false, reverse: false }, p, JUMP.Loop, BASELINE.runOut);
  assert.ok(Math.abs(bare.report.landing!.turned - 1.994) < 0.001, `${bare.report.landing!.turned}`);
  const c = cand("canonical");
  assert.equal(c.rejected, false, c.reasons.join("; "));
  assert.equal(c.takeoff!.code, "RBO"); assert.equal(c.takeoff!.regime, "CARVE"); assert.equal(c.takeoff!.simCalls, "Lo");
  assert.equal(c.landing!.simCalls, "Lo"); assert.equal(c.landing!.rotationCall, "clean");
  assert.ok(Math.abs(c.landing!.turned - 1.971) < 0.001, `${c.landing!.turned}`);
  assert.ok(c.landing!.stoodTicks >= BASELINE.runOut);
});

test("naming each push's leg changes nothing the solver does", () => {
  const p = baselineParams(), prog = loopBaselineProgram(), pinned = pinPushFeet(prog, p);
  assert.ok(pinned.inputs.some((i) => i.push && i.pushFoot !== undefined), "the baseline pushes");
  const id = { mirror: false, reverse: false };
  assert.equal(runCandidate("a", prog, id, p, JUMP.Loop, 144).report.replay.digest,
    runCandidate("b", pinned, id, p, JUMP.Loop, 144).report.replay.digest);
});

test("both directions land the loop; the reversed entrances never leave the ice", () => {
  assert.deepEqual(report.accepted, ["canonical", "mirror"]);
  const c = cand("canonical"), m = cand("mirror"), r = cand("reverse"), mr = cand("mirror+reverse");
  assert.equal(m.takeoff!.code, "LBO"); assert.equal(m.takeoff!.simCalls, "Lo"); assert.equal(m.takeoff!.direction, "cw");
  assert.equal(m.landing!.simCalls, "Lo"); assert.equal(m.landing!.direction, "cw"); assert.equal(m.landing!.rotationCall, "clean");
  assert.equal(c.takeoff!.direction, "ccw");
  // The mirror's angular momentum is the canonical's, turned the other way, to the wobble's last digits.
  assert.ok(Math.abs(m.takeoff!.angMomentum + c.takeoff!.angMomentum) < 0.05, `${m.takeoff!.angMomentum} vs ${c.takeoff!.angMomentum}`);
  assert.ok(Math.abs(m.landing!.turned - c.landing!.turned) < 0.01);
  for (const x of [r, mr]) { assert.equal(x.takeoff, null); assert.ok(x.reasons.includes("takeoff:none"), x.id); }
  // A hard failure is never bought back: every rejected candidate carries a reason per failed gate.
  for (const k of report.candidates) assert.equal(k.rejected, k.gates.some((g) => !g.pass));
});

test("at jumpDirMode 0 the mirror cannot turn clockwise: the gate says so", () => {
  const p = { ...baselineParams(), jumpDirMode: 0 };
  const m = runCandidate("mirror", pinPushFeet(loopBaselineProgram(), p), { mirror: true, reverse: false }, p, JUMP.Loop, BASELINE.runOut);
  assert.ok(m.report.reasons.some((x) => x.startsWith("rotation:cw-not-modelled")));
});

test("the mirror on the ice is exact wherever the solver is symmetric", () => {
  // A one-foot carve with the sheet and the wobble off: exact, every tick.
  const p = { ...baselineParams(), iceGridMode: 0, staminaMode: 0 };
  const carve = { speed: -7, inputs: Array.from({ length: 240 }, () => ({ ...NEUTRAL_INPUT, weight: 1, lean: -0.5, knee: 0.6 })) };
  const a = runCandidate("canonical", carve, { mirror: false, reverse: false }, p, JUMP.Loop, 144);
  const b = runCandidate("mirror", carve, { mirror: true, reverse: false }, p, JUMP.Loop, 144);
  const exact = checkMirror(a, b, p);
  assert.equal(exact.pass, true); assert.equal(exact.maxPositionError, 0); assert.equal(exact.ticks, 240);
  // Each handedness source alone parts it.
  for (const [over, cause] of [[{ iceGridMode: 1 }, "ice-grid"], [{ staminaMode: 1 }, "fatigue-noise"]] as const) {
    const q = { ...p, ...over };
    const k = checkMirror(runCandidate("c", carve, { mirror: false, reverse: false }, q, JUMP.Loop, 144),
      runCandidate("m", carve, { mirror: true, reverse: false }, q, JUMP.Loop, 144), q);
    assert.equal(k.pass, false); assert.equal(k.cause, cause);
  }
  // The baseline entrance, sheet and wobble off: exact all through, since jumpDirMode keeps the tie's foot.
  const ctl = report.invariants.mirrorControlled;
  assert.equal(ctl.pass, true); assert.equal(ctl.maxPositionError, 0); assert.equal(ctl.feetSwapped, true);
  assert.equal(report.invariants.reverseMirrorControlled.pass, true);
  // At jumpDirMode 0 the two-foot tie went to the right foot and parted it at tick 119.
  const old = { ...p, jumpDirMode: 0 }, prog = pinPushFeet(loopBaselineProgram(), old);
  const k0 = checkMirror(runCandidate("c", prog, { mirror: false, reverse: false }, old, JUMP.Loop, 144),
    runCandidate("m", prog, { mirror: true, reverse: false }, old, JUMP.Loop, 144), old);
  assert.equal(k0.divergesAtTick, 119); assert.equal(k0.cause, "two-foot-tie");
  // P(L - s): the reverse traverses the curve the other way round.
  assert.equal(report.invariants.reverseCurvatureSense.flipped, true);
});

test("every candidate's replay verifies, and the report is the fixture byte for byte", () => {
  for (const r of runs) assert.equal(r.report.replay.verified, true, r.id);
  const again = slice().report;
  assert.equal(JSON.stringify(again), JSON.stringify(report), "two runs, one report");
  const fixture = readFileSync(FIXTURE, "utf8");
  assert.equal(JSON.stringify(report, null, 1) + "\n", fixture,
    "jpse report changed: if the solver moved on purpose, regenerate with node jpse/cli.ts --out test/fixtures/jpse-loop-v1.json");
});
