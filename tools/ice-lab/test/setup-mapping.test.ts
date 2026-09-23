// Setup mapping fixtures: game/setups.ts held to a golden record, tick by
// tick, over one fixed pad script (test/setup-script.ts). A change to a
// binding, a threshold or an assistance curve fails here, naming the first
// tick and field that moved. Regenerate only after an intended change:
//
//   node test/setup-script.ts --write
//
// Recorded, not changed (2026-09-22): Simulation's turn latch reads the two
// blades' average. One stick held at -0.5 averages to -0.088, under
// app/schemes.ts's LATCH_RELEASE (0.15), so the mirror lets go at the cusp —
// where Explorer and Repertoire, with the same thumb and the same -0.176 blade
// command, keep it. Whether Simulation should latch per blade is the
// operator's call; the fixture pins the mapping as it is.
//
// Re-recorded (2026-09-23, solver /35), all intended, operator-directed: the
// operator chose per-blade latching for Simulation (app/schemes.ts
// latchBlades); Simulation gained per-blade heel/toe and knees (LT/RT), the
// feet in the hips (D-pad layout by default), and lost the pad brake; Blade
// Explorer and Simulation gained slip and the trunk; a fourth setup,
// Experimental, maps pumps, thumb strokes, X/B weight and arms, L3/R3 toe
// picks, A/Y move families, automatic back crossovers and the free leg.
//
// Re-recorded (2026-09-23, solver /36): the contract bump alone (pitchMode,
// 0 everywhere); every mapped input is unchanged.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { SETUPS } from "../game/setups.ts";
import { REPLAY_SOLVER } from "../sim/replay.ts";
import { FIXTURE_URL, SCRIPT_TICKS, SCRIPT_SPEED, SCRIPT_ASSISTANCE, pad, runScript, encode, decode } from "./setup-script.ts";

const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8"));

test("the setup fixture was recorded on this solver, with this script's length and start", () => {
  assert.equal(fixture.solver, REPLAY_SOLVER, "the solver changed: re-record with node test/setup-script.ts --write, and say why");
  assert.equal(fixture.ticks, SCRIPT_TICKS);
  assert.equal(fixture.speed, SCRIPT_SPEED);
  assert.equal(fixture.assistance, SCRIPT_ASSISTANCE);
  assert.deepEqual(Object.keys(fixture.setups), SETUPS.map((s) => s.id), "one record per setup");
});

for (const { id } of SETUPS) {
  test(`${id}: the pad script maps to the recorded inputs, tick for tick`, () => {
    const run = runScript(id);
    const want = decode(fixture.setups[id].inputs, SCRIPT_TICKS);
    for (let i = 0; i < SCRIPT_TICKS; i++) {
      const got = run.inputs[i] as unknown as Record<string, unknown>, expected = want[i] as unknown as Record<string, unknown>;
      const moved = Object.keys({ ...expected, ...got }).filter((k) => got[k] !== expected[k]);
      if (moved.length) {
        const h = pad(i);
        assert.fail(`${id}, tick ${i} (axes ${h.axes.join(",")}; buttons ${h.buttons.map((b, n) => (b ? `${n}:${b}` : "")).filter(Boolean).join(" ")}): `
          + moved.map((k) => `${k} ${JSON.stringify(expected[k])} -> ${JSON.stringify(got[k])}`).join(", "));
      }
    }
    assert.deepEqual(run.story, fixture.setups[id].story, `${id}: what the script did on the ice`);
  });
}

test("the setups differ where they are meant to", () => {
  const story = (id: string): string[] => fixture.setups[id].story.map((e: string) => e.split(" ").slice(1).join(" "));
  const pushes = (id: string): number[] => decode(fixture.setups[id].inputs, SCRIPT_TICKS).flatMap((it, i) => (it.push ? [i] : []));
  // A held from 180: Simulation needs a fresh press for every push; the others repeat every 90 ticks.
  assert.deepEqual(pushes("simulation"), [120, 180]);
  for (const id of ["explorer", "repertoire"]) assert.deepEqual(pushes(id), [120, 180, 270], id);
  // Dedicated turn bindings (D-pad rocker, L3+B mohawk) are Repertoire's alone; B's three-turn works everywhere.
  // Since /34 Simulation and Explorer carry the trunk: the script's arm flick (L3 + right stick 0.8 at tick 600) skids the edge and the skater falls before the bracket.
  for (const id of ["simulation", "explorer"]) assert.deepEqual(story(id).filter((e) => e !== "takeoff"), ["three-turn", "fall"], id);
  assert.deepEqual(story("repertoire").filter((e) => e !== "takeoff" && e !== "fall"), ["three-turn", "rocker", "bracket", "mohawk"]);
  // Only Simulation splits the blades.
  const splits = (id: string): boolean => decode(fixture.setups[id].inputs, SCRIPT_TICKS).some((it) => it.leanSplit !== 0);
  assert.equal(splits("simulation"), true);
  assert.equal(splits("explorer") || splits("repertoire"), false, "a single lean in Explorer and Repertoire");
});

test("the change encoding round-trips through JSON, the way the fixture travels", () => {
  const run = runScript("explorer");
  const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // -0 arrives as 0, on both sides
  assert.deepEqual(decode(json(encode(run.inputs)), SCRIPT_TICKS), json(run.inputs));
});
