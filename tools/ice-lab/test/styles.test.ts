// Career styles (game/styles.ts): Power, Finesse, Technician, Endurance — the
// owner's four, 2026-11-09. A style is authored multipliers on Params; what it
// does is measured through the physics (jpse/styles.ts), and pinned here.
//
// MEASURED 2026-11-09, Experimental setup, full mastery (npm run jpse:styles
// has the jump grid too):
//                stroke top m/s  legs left  hard carve   serpentine (of 576 ticks)
//   none            12.68         0.560     stands        495
//   power           13.18         0.562     FALLS         438
//   finesse         11.99         0.558     stands        576
//   technician      12.34         0.558     stands        576
//   endurance       12.68         0.669     stands        495
// On the double loop's entrance Power leaves with L 18.7 mean against 14.2 and
// highest; Finesse lowest and least spin.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { STYLES, STYLE_CHOSEN_SHARE, styleParams, styleStrength } from "../game/styles.ts";
import { CareerState } from "../game/career.ts";
import { validate } from "../sim/params.ts";
import { JUMP } from "../sim/jump.ts";
import { BASELINE, baselineParams, loopBaselineProgram } from "../jpse/baseline.ts";
import { pinPushFeet, runCandidate } from "../jpse/engine.ts";
import { SERPENTINE_TICKS, carveRun, serpentineRun, strokeRun } from "../jpse/styles.ts";

const base = baselineParams();
const at = (id: string, mastery = 1) => styleParams(base, STYLES.findIndex((s) => s.id === id), mastery);

test("four styles, each with something given and something paid, and every styled skater still validates", () => {
  assert.deepEqual(STYLES.map((s) => s.id), ["power", "finesse", "technician", "endurance"]);
  for (const st of STYLES) {
    assert.ok(st.gives.length > 0 && st.costs.length > 0, st.id);
    for (const m of [0, 1]) assert.deepEqual(validate(at(st.id, m)), [], `${st.id} at ${m}`);
  }
  assert.deepEqual(styleParams(base, -1, 1), base, "no style is the skater as trained");
});

test("choosing gives half the benefit and all the cost; drilling gives the rest", () => {
  assert.equal(styleStrength(0), STYLE_CHOSEN_SHARE);
  assert.equal(styleStrength(1), 1);
  const power = STYLES[0], give = power.gives[0], cost = power.costs[0];
  const chosen = at("power", 0), drilled = at("power", 1);
  assert.ok(Math.abs((chosen[give.key] as number) / (base[give.key] as number) - (1 + (give.mul - 1) * 0.5)) < 1e-12);
  assert.ok(Math.abs((drilled[give.key] as number) / (base[give.key] as number) - give.mul) < 1e-12);
  assert.equal(chosen[cost.key], drilled[cost.key], "the cost does not shrink");
});

test("career: take up a style, drill it a week at a time, and a style put down rusts but keeps what it had", () => {
  const c = new CareerState();
  assert.equal(c.style, -1);
  c.chooseStyle(0);
  const weeks = c.weeks;
  c.drillStyle(); c.drillStyle();
  assert.equal(c.weeks, weeks - 2);
  assert.equal(c.styleMastery[0], 0.5);
  c.chooseStyle(1);                    // retrain as Finesse
  c.drillStyle();
  // A season step: the put-down Power rusts a step, the skated Finesse holds.
  (c as unknown as { seasonStep(): void }).seasonStep();
  assert.equal(c.styleMastery[0], 0.25);
  assert.equal(c.styleMastery[1], 0.25);
  c.chooseStyle(0);                    // and back: what was left is still there
  assert.equal(c.styleMastery[0], 0.25);
  c.chooseStyle(7);                    // not a style: nothing changes
  assert.equal(c.style, 0);
  const back = CareerState.restore(c.serialize());
  assert.equal(back.style, 0);
  assert.deepEqual(back.styleMastery, c.styleMastery);
  // A save from before styles skates with none.
  const old = JSON.parse(c.serialize()); delete old.style; delete old.styleMastery;
  assert.equal(CareerState.restore(JSON.stringify(old)).style, -1);
});

test("the trade-offs are the physics': speed, legs, the hard carve and the serpentine", () => {
  const row = (p: typeof base) => ({ ...strokeRun(p), ...carveRun(p), ...serpentineRun(p) });
  const none = row(base), power = row(at("power")), finesse = row(at("finesse")), tech = row(at("technician")), endu = row(at("endurance"));
  // Power is fastest and falls on the hard carve and first in the serpentine.
  assert.ok(power.topSpeed > none.topSpeed && none.topSpeed > finesse.topSpeed);
  assert.equal(power.carveFell, true); assert.equal(none.carveFell, false);
  assert.ok(power.serpentineTicks < none.serpentineTicks);
  // Finesse and Technician skate the whole serpentine; the neutral skater falls partway.
  assert.equal(finesse.serpentineTicks, SERPENTINE_TICKS);
  assert.equal(tech.serpentineTicks, SERPENTINE_TICKS);
  assert.ok(none.serpentineTicks < SERPENTINE_TICKS);
  // Endurance has the most legs left.
  assert.ok(endu.legs > none.legs + 0.1, `${endu.legs} vs ${none.legs}`);
  // Pinned, so a re-tune says what it moved.
  assert.deepEqual([none.serpentineTicks, power.serpentineTicks], [495, 438]);
  assert.ok(Math.abs(power.topSpeed - 13.18) < 0.01 && Math.abs(finesse.topSpeed - 11.99) < 0.01);
});

test("on the double loop's entrance Power leaves higher and spinning harder, Finesse lower", () => {
  const off = (p: typeof base) => runCandidate("c", pinPushFeet(loopBaselineProgram(), p), { mirror: false, reverse: false }, p, JUMP.Loop, BASELINE.runOut).report;
  const n = off(base), pw = off(at("power")), fi = off(at("finesse"));
  assert.ok(pw.flight!.height > n.flight!.height && n.flight!.height > fi.flight!.height,
    `${pw.flight!.height} / ${n.flight!.height} / ${fi.flight!.height}`);
  assert.ok(pw.takeoff!.angMomentum > n.takeoff!.angMomentum, `${pw.takeoff!.angMomentum} vs ${n.takeoff!.angMomentum}`);
});
