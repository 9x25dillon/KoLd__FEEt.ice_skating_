// The edge vocabulary, checked against the repository's own data.
//
// This is the test that decides whether the handedness correction in
// sim/math.ts is right. It does not assert against numbers chosen here — it
// reads data/jump-definitions.csv and requires the classifier to name the same
// edges the technical content already names. If the mirror were flipped, every
// row would fail.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import { classifyCode, classifyEdgeSide, classifyDepth } from "../sim/classify.ts";
import { codeToString, EDGE_CODE_NONE, EDGE, DEPTH, FOOT } from "../sim/types.ts";
import type { Foot } from "../sim/types.ts";

const P = DEFAULT_PARAMS;
const REPO = new URL("../../../", import.meta.url).pathname;

/** A tilt that is unambiguously on an edge, signed by which way it leans. */
const LEFTWARD = 0.20;
const RIGHTWARD = -0.20;

test("all eight edge codes, from foot and lean alone", () => {
  const cases: Array<[Foot, number, number, string]> = [
    // foot,        tilt,      longSpeed, expected
    [FOOT.Right, RIGHTWARD, 3, "RFO"],
    [FOOT.Right, LEFTWARD, 3, "RFI"],
    [FOOT.Right, RIGHTWARD, -3, "RBO"],
    [FOOT.Right, LEFTWARD, -3, "RBI"],
    [FOOT.Left, LEFTWARD, 3, "LFO"],
    [FOOT.Left, RIGHTWARD, 3, "LFI"],
    [FOOT.Left, LEFTWARD, -3, "LBO"],
    [FOOT.Left, RIGHTWARD, -3, "LBI"],
  ];
  for (const [foot, tilt, v, want] of cases) {
    const got = codeToString(classifyCode(foot, tilt, v, EDGE_CODE_NONE, P));
    assert.equal(got, want, `foot ${foot} tilt ${tilt} speed ${v}`);
  }
});

test("a flat blade and a standstill are named, not guessed", () => {
  assert.equal(codeToString(classifyCode(FOOT.Right, 0.01, 3, EDGE_CODE_NONE, P)), "RF-");
  assert.equal(codeToString(classifyCode(FOOT.Left, 0, 0, EDGE_CODE_NONE, P)), "L--");
  assert.equal(codeToString(EDGE_CODE_NONE), "---");
});

test("every jump in data/jump-definitions.csv gets the edge the data says", () => {
  // takeoff_foot + takeoff_edge + takeoff_direction is the decomposed form;
  // landing_edge is the packed form. The classifier has to reproduce both.
  const csv = readFileSync(join(REPO, "data/jump-definitions.csv"), "utf8");
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);

  let checked = 0;
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const foot: Foot = f[col("takeoff_foot")] === "right" ? FOOT.Right : FOOT.Left;
    const wantSide = f[col("takeoff_edge")];       // "outside" | "inside"
    const dir = f[col("takeoff_direction")];        // "forward" | "backward"
    const code = f[col("code")];

    // Derive the tilt sign the way the geometry does: the LEFT foot leaning
    // toward perpLeft is on its outside edge, the right foot is on its inside.
    const wantOutside = wantSide === "outside";
    const tilt = ((foot === FOOT.Left) === wantOutside) ? LEFTWARD : RIGHTWARD;
    const speed = dir === "forward" ? 3 : -3;

    const got = codeToString(classifyCode(foot, tilt, speed, EDGE_CODE_NONE, P));
    const expect = (foot === FOOT.Right ? "R" : "L")
      + (dir === "forward" ? "F" : "B")
      + (wantOutside ? "O" : "I");
    assert.equal(got, expect, `${code} (${f[col("name")]}) takeoff`);

    // And the landing edge, which the data writes out in full.
    const landing = f[col("landing_edge")];
    assert.equal(landing.length, 3, `${code} landing_edge`);
    const lFoot: Foot = landing[0] === "R" ? FOOT.Right : FOOT.Left;
    const lOut = landing[2] === "O";
    const lTilt = ((lFoot === FOOT.Left) === lOut) ? LEFTWARD : RIGHTWARD;
    const lSpeed = landing[1] === "F" ? 3 : -3;
    assert.equal(codeToString(classifyCode(lFoot, lTilt, lSpeed, EDGE_CODE_NONE, P)),
      landing, `${code} landing`);
    checked++;
  }
  assert.ok(checked >= 6, `expected every jump row, saw ${checked}`);
});

test("the Lutz and the Flip differ only by the side of the same foot", () => {
  // The whole reason both are edge-callable: same foot, same direction, and a
  // flutz is a Lutz whose outside edge drifted to the inside one. If the
  // classifier could not tell those apart there would be no call to make.
  const lutz = classifyCode(FOOT.Left, LEFTWARD, -3, EDGE_CODE_NONE, P);
  const flip = classifyCode(FOOT.Left, RIGHTWARD, -3, EDGE_CODE_NONE, P);
  assert.equal(codeToString(lutz), "LBO");
  assert.equal(codeToString(flip), "LBI");
  assert.notEqual(lutz, flip);
});

test("hysteresis stops an edge flickering at the threshold", () => {
  // flat 4 deg, hysteresis 1.5 deg -> enters at 5.5, leaves at 2.5.
  const d = (deg: number) => (deg * Math.PI) / 180;
  let c = EDGE_CODE_NONE;
  c = classifyCode(FOOT.Right, d(-5.0), 3, c, P);
  assert.equal(codeToString(c), "RF-", "5.0 deg from flat is still flat");
  c = classifyCode(FOOT.Right, d(-6.0), 3, c, P);
  assert.equal(codeToString(c), "RFO", "6.0 deg enters the outside edge");
  c = classifyCode(FOOT.Right, d(-3.0), 3, c, P);
  assert.equal(codeToString(c), "RFO", "3.0 deg holds it, above the leave band");
  c = classifyCode(FOOT.Right, d(-2.0), 3, c, P);
  assert.equal(codeToString(c), "RF-", "2.0 deg drops back to flat");
});

test("a roll through zero changes edge immediately, it does not stall", () => {
  // The failure this guards: holding the previously committed SIDE through the
  // dead band. A skater rolling from an outside to an inside edge would be
  // reported as still on the outside one for the length of the roll, and that
  // is precisely the interval a three-turn is timed from.
  let c = classifyCode(FOOT.Right, -0.30, 3, EDGE_CODE_NONE, P);
  assert.equal(codeToString(c), "RFO");
  c = classifyCode(FOOT.Right, 0.30, 3, c, P);
  assert.equal(codeToString(c), "RFI", "rolled onto the other edge, said so at once");
});

test("depth bands are ordered and closed at the top", () => {
  assert.equal(classifyDepth(0.01, P), DEPTH.Flat);
  assert.equal(classifyDepth(0.15, P), DEPTH.Shallow);
  assert.equal(classifyDepth(0.30, P), DEPTH.Moderate);
  assert.equal(classifyDepth(0.90, P), DEPTH.Deep);
  assert.equal(classifyDepth(-0.90, P), DEPTH.Deep, "depth is unsigned");
});

test("an unloaded blade is flat regardless of how it is held", () => {
  assert.equal(classifyEdgeSide(FOOT.Left, 0.0, EDGE_CODE_NONE, P), EDGE.Flat);
});
