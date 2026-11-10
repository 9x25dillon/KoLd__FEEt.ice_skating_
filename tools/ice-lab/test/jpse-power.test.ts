// Power's own entrances (hand-off 2026-11-09, next step 4). Recorded in
// docs/jpse/power-search-2026-11-10.md; the figures here are that page's.
//
// MEASURED 2026-11-10, Experimental setup, on a sheet:
//   - "Power lands none of the grid's double loops" (2026-11-09) was the
//     measurement, not the skater. The pad script was recorded on the neutral
//     skater and replayed on Power, so the check came at the wrong moment of a
//     longer flight and the inputs could end in the air. Recorded on Power, the
//     same first grid lands 4 doubles drilled and 3 on the day it is chosen.
//   - Power's entrance is faster and shorter-loaded than the neutral one: at
//     7.5 m/s with a 0.35 s load it has a 4-tick double window at every
//     mastery. The window slides 3 ticks earlier as the style is drilled
//     (53-56 chosen, 50-53 drilled), so one check tick, 53, lands at all five.
//   - The neutral skater on that same entrance needs no check at all.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { STYLES, styleParams } from "../game/styles.ts";
import { BASELINE, BASELINE_KNOBS, baselineParams, loopBaselineProgram } from "../jpse/baseline.ts";
import type { EntranceKnobs } from "../jpse/baseline.ts";
import { pinPushFeet, runCandidate } from "../jpse/engine.ts";
import { POWER_GRID, checkWindows, gridPoints, revolutionsOf, runSearch } from "../jpse/search.ts";
import type { SearchPoint } from "../jpse/search.ts";

const base = baselineParams();
const power = (mastery: number): Params => styleParams(base, STYLES.findIndex((s) => s.id === "power"), mastery);
const CANONICAL = { mirror: false, reverse: false };
/** Power's entrance: 7.5 m/s backward, a 0.35 s load, the full stick. */
const ENTRANCE: EntranceKnobs = { ...BASELINE_KNOBS, speed: -7.5, load: 0.35 };
const checkTick = (tick: number): number => tick * SIM_DT + 1e-9;
/** One entrance with one check, skated by `p` on a script recorded on `p`. */
const skate = (p: Params, knobs: EntranceKnobs, checkAt: number): SearchPoint =>
  runSearch({ schema: "jpse-search/1", axes: { speed: [knobs.speed], load: [knobs.load], checkAt: [checkAt] }, repeat: 0 }, p).points[0];

test("the pad script is recorded on the skater who skates it; for the neutral skater that is the same script", () => {
  assert.deepEqual(loopBaselineProgram(BASELINE_KNOBS, baselineParams()), loopBaselineProgram());
  // The first grid's #98: 7 m/s, a 0.4 s load, checked 0.4 s into the air.
  const knobs: EntranceKnobs = { ...BASELINE_KNOBS, load: 0.4, checkAt: 0.4 }, p = power(1);
  const replayed = runCandidate("neutral-script", pinPushFeet(loopBaselineProgram(knobs), p), CANONICAL, p, BASELINE.jump, BASELINE.runOut).report;
  const own = runCandidate("own-script", pinPushFeet(loopBaselineProgram(knobs, p), p), CANONICAL, p, BASELINE.jump, BASELINE.runOut).report;
  // The neutral skater falls there, so its script has no run-out: Power lands
  // it and the inputs end 30 ticks later. The 2026-11-09 "0 of 225".
  assert.equal(replayed.rejected, true);
  assert.deepEqual(replayed.reasons, ["landing:stood-30-of-144-ticks"]);
  assert.equal(own.rejected, false);
  assert.ok(Math.abs(own.landing!.turned - 1.970) < 0.001, `${own.landing!.turned}`);
  // And the search now skates the skater's own script.
  const pt = skate(p, knobs, 0.4);
  assert.equal(pt.accepted, true);
  assert.equal(pt.digest, own.replay.digest);
});

test("Power's entrance: at 7.5 m/s off a 0.35 s load the double has a 4-tick window, drilled", () => {
  const scan = checkWindows(ENTRANCE, power(1));
  assert.equal(scan.airTicks, 76);
  // Unchecked, Power turns past the double and does not stand.
  assert.equal(scan.uncheckedAccepted, false);
  const doubles = scan.windows.filter((w) => w.revolutions === 2);
  assert.deepEqual(doubles.map((w) => [w.from, w.to, w.open]), [[50, 53, false]]);
  // The gates take a single loop as a loop: an early check lands one. Not what a search for doubles counts.
  assert.ok(scan.windows.some((w) => w.revolutions === 1));
  assert.equal(scan.evaluated, 76 - 24 + 1);
});

test("the window slides earlier as Power is drilled, and check tick 53 lands the double at every mastery", () => {
  const turned = [0, 0.25, 0.5, 0.75, 1].map((m) => {
    const pt = skate(power(m), ENTRANCE, checkTick(53));
    assert.equal(pt.accepted, true, `mastery ${m}: ${pt.reasons.join("; ")}`);
    assert.equal(revolutionsOf(pt.turned), 2);
    return pt.turned;
  });
  // More whip and a faster pull-in: the same check finds more rotation each quarter.
  for (let i = 1; i < turned.length; i++) assert.ok(turned[i] > turned[i - 1], `${turned}`);
  // The edges of the window on the day the style is chosen (53-56) and drilled (50-53).
  assert.equal(skate(power(0), ENTRANCE, checkTick(52)).accepted, false);
  assert.equal(skate(power(0), ENTRANCE, checkTick(56)).accepted, true);
  assert.equal(skate(power(0), ENTRANCE, checkTick(57)).accepted, false);
  assert.equal(skate(power(1), ENTRANCE, checkTick(54)).accepted, false);
});

test("Power's forgiving entrance: off a 0.3 s load, a check half a second in lands the double at every mastery", () => {
  // MEASURED 2026-11-10: the double's window at 7.25 m/s is ticks 59-65 chosen,
  // 57-61 drilled; at 7.5 m/s 58-63 and 55-60. Ticks 59-61 and 58-60 are in all five.
  for (const m of [0, 0.25, 0.5, 0.75, 1]) for (const [speed, tick] of [[-7.25, 59], [-7.25, 61], [-7.5, 59]]) {
    const pt = skate(power(m), { ...BASELINE_KNOBS, speed, load: 0.3 }, checkTick(tick));
    assert.equal(pt.accepted, true, `mastery ${m}, ${speed} m/s, tick ${tick}: ${pt.reasons.join("; ")}`);
    assert.equal(revolutionsOf(pt.turned), 2);
  }
});

test("Power drilled lands the triple loop with no check; the neutral skater's most rotation is short of it", () => {
  const knobs: EntranceKnobs = { ...BASELINE_KNOBS, speed: -7.25, load: 0.45 };
  const drilled = skate(power(1), knobs, 5);
  assert.equal(drilled.accepted, true, drilled.reasons.join("; "));
  assert.equal(revolutionsOf(drilled.turned), 3);
  assert.ok(Math.abs(drilled.turned - 2.95) < 0.01, `${drilled.turned}`);
  // On the day it is chosen Power turns 2.65 there and does not stand.
  const chosen = skate(power(0), knobs, 5);
  assert.equal(chosen.accepted, false);
  assert.ok(Math.abs(chosen.turned - 2.65) < 0.01, `${chosen.turned}`);
  // The neutral skater's most unchecked rotation on Power's grid: 2.39, at 7 m/s off the same load.
  const neutral = skate(base, { ...knobs, speed: -7 }, 5);
  assert.ok(Math.abs(neutral.turned - 2.39) < 0.01, `${neutral.turned}`);
  assert.equal(neutral.accepted, false);
});

test("the neutral skater lands the same entrance with no check in the air", () => {
  const pt = skate(base, ENTRANCE, 5);
  assert.equal(pt.accepted, true, pt.reasons.join("; "));
  assert.ok(Math.abs(pt.turned - 2.12) < 0.01, `${pt.turned}`);
  // Where the first grid looked (a check 0.35 to 0.45 s in), it falls: the grid stopped short of the window.
  assert.equal(skate(base, ENTRANCE, 0.45).accepted, false);
});

test("Power's grid is declared, and reaches the loads and checks the first grid did not", () => {
  const pts = gridPoints(POWER_GRID);
  assert.equal(pts.length, 4 * 6 * 9);
  assert.ok(pts.every((k) => k.depth === 1 && k.loadAt === BASELINE_KNOBS.loadAt));
  assert.ok(pts.some((k) => k.speed === ENTRANCE.speed && k.load === ENTRANCE.load && k.checkAt === 0.45));
});
