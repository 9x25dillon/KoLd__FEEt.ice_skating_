// The custom style (the owner, 2026-11-09): forged at the end of the first
// season from how the career skater actually skated (game/journal.ts), the
// four styles blended by what that record leans toward, and nudged by the
// player a quarter toward one of them.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { NEUTRAL_INPUT, MOVE } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { RunJournal, emptyJournal, leanings, styleShares, NUDGE } from "../game/journal.ts";
import type { Journal } from "../game/journal.ts";
import { STYLES, customStyle, styleParams } from "../game/styles.ts";
import { CareerState, CAREER_EVENTS, CUSTOM_STYLE } from "../game/career.ts";
import type { Choreography } from "../game/career.ts";
import { makeProfile } from "../sim/profile.ts";
import { BASELINE, baselineParams, loopBaselineProgram } from "../jpse/baseline.ts";
import { pinPushFeet, runCandidate } from "../jpse/engine.ts";
import { spiralRun } from "../jpse/styles.ts";

const base = baselineParams();

test("a run's journal: the double loop's entrance writes one landed jump, its height, turn and spin", () => {
  const p = base, prog = pinPushFeet(loopBaselineProgram(), p);
  const s = createState(p, prog.speed), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth), rj = new RunJournal();
  for (const input of prog.inputs) { step(s, input, p, SIM_DT, [], ice); rj.sample(s, SIM_DT); }
  const j = rj.finish();
  assert.equal(j.jumpsLanded, 1); assert.equal(j.falls, 0);
  assert.ok(Math.abs(j.jumpTurned - 1.971) < 0.001, `${j.jumpTurned}`);
  assert.ok(Math.abs(j.jumpL - 28.3) < 0.1, `${j.jumpL}`);
  assert.ok(j.jumpHeight > 0.3 && j.topSpeed > 6.5 && j.legsLeft < 1);
});

test("a spiral's seconds above the hip go in the journal", () => {
  const s = createState(base, 5), ice = new IceGrid(base.rinkHalfLength, base.rinkHalfWidth), rj = new RunJournal();
  for (let i = 0; i < 60; i++) { step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.25 }, base, SIM_DT, [], ice); rj.sample(s, SIM_DT); }
  for (let i = 0; i < 480; i++) {
    step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.25, kneeSplit: 0.25, lean: -0.3, inaBauer: true, freeLegRaise: 1 }, base, SIM_DT, [], ice);
    rj.sample(s, SIM_DT);
  }
  assert.equal(s.move, MOVE.Spiral);
  assert.ok(rj.finish().spiralAboveHip > 3.5, `${rj.finish().spiralAboveHip}`);
});

/** A season of five runs, each the same. */
const season = (run: Partial<Journal>): Journal => {
  const j = { ...emptyJournal(), ...run, runs: 1 };
  return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, (v as number) * 5])) as unknown as Journal;
};
const JUMPER = season({ seconds: 100, jumpsLanded: 2, jumpHeight: 0.9, jumpTurned: 4.4, jumpL: 48, topSpeed: 12, falls: 1, legsLeft: 0.3 });
const SPIRALLER = season({ seconds: 100, spiralAboveHip: 6, splitSeconds: 3, topSpeed: 7, legsLeft: 0.3 });

test("the season's leanings: a jumper's leans to Power, a spiral skater's to Finesse; nothing skated shares evenly", () => {
  const lj = leanings(JUMPER), ls = leanings(SPIRALLER);
  assert.equal(lj.indexOf(Math.max(...lj)), 0, `${lj}`);
  assert.equal(ls.indexOf(Math.max(...ls)), 1, `${ls}`);
  for (const x of styleShares([0, 0, 0, 0])) assert.equal(x, 0.25);
  const shares = styleShares(lj);
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test("the nudge tips the shares a quarter toward one style, and only that far", () => {
  const lean = [0.5, 0.5, 0.5, 0.5], plain = styleShares(lean), nudged = styleShares(lean, 1);
  assert.ok(nudged[1] > plain[1]);
  assert.ok(Math.abs(nudged[1] - (0.25 + NUDGE) / (1 + NUDGE)) < 1e-12);
  assert.deepEqual(styleShares(lean, -1), plain);
});

test("the blend: all of one style is that style; a mix sits between, never past either", () => {
  const power = styleParams(base, 0, 1), allPower = styleParams(base, customStyle([1, 0, 0, 0]), 1);
  for (const k of ["jumpImpulse", "jumpWhip", "angulationLimit", "controlLatency", "flexibility"] as const)
    assert.ok(Math.abs(allPower[k] - power[k]) < 1e-12, k);
  const half = styleParams(base, customStyle([0.5, 0.5, 0, 0]), 1), fin = styleParams(base, 1, 1);
  for (const k of ["jumpImpulse", "flexibility", "strokePower"] as const) {
    const lo = Math.min(power[k], fin[k]), hi = Math.max(power[k], fin[k]);
    assert.ok(half[k] >= lo - 1e-12 && half[k] <= hi + 1e-12, `${k} ${half[k]} not within ${lo}..${hi}`);
  }
});

test("measured: a jumper's own style jumps higher than no style; a spiral skater's raises the spiral leg higher", () => {
  const jumper = styleParams(base, customStyle(styleShares(leanings(JUMPER))), 1);
  const spiraller = styleParams(base, customStyle(styleShares(leanings(SPIRALLER))), 1);
  const height = (p: typeof base) => runCandidate("c", pinPushFeet(loopBaselineProgram(), p), { mirror: false, reverse: false }, p, JUMP.Loop, BASELINE.runOut).report.flight!.height;
  assert.ok(height(jumper) > height(base), `${height(jumper)} vs ${height(base)}`);
  assert.ok(spiralRun(spiraller).spiralPeak > spiralRun(base).spiralPeak + 0.05, `${spiralRun(spiraller).spiralPeak}`);
});

/** A finished career run as CareerState.award reads it. */
const finished = (i: number, medal: number, j: Journal) => ({
  event: CAREER_EVENTS[i], done: true, complete: true, medal, hypeMean: 0, flowMean: 0, technicalScore: 0,
  bestSpinLevel: 0, bestStepLevel: 0, pcsScore: null, segmentScore: 10, journal: { finish: () => j },
}) as unknown as Choreography;

test("career: the first season fills the journal, the finale's medal forges the style, and it can be chosen, nudged, drilled and saved", () => {
  const c = new CareerState();
  c.profile = makeProfile("Career skater", { stats: { strength: 100, spring: 100, edgeControl: 100, balance: 100, stamina: 100 } });
  const perRun = { ...JUMPER, runs: 1 };
  c.chooseStyle(CUSTOM_STYLE);
  assert.equal(c.style, -1, "not before it is forged");
  for (let i = 0; i < CAREER_EVENTS.length - 1; i++) c.award(finished(i, 3, perRun));
  assert.equal(c.customLeanings, null);
  assert.equal(c.journal.runs, CAREER_EVENTS.length - 1);
  c.award(finished(CAREER_EVENTS.length - 1, 1, perRun));
  assert.ok(c.customLeanings, "forged at the finale's medal");
  const forged = [...c.customLeanings!];
  c.award(finished(0, 3, SPIRALLER));
  assert.deepEqual(c.customLeanings, forged, "the second season does not rewrite the first's");
  c.chooseStyle(CUSTOM_STYLE);
  assert.equal(c.style, CUSTOM_STYLE);
  assert.equal(c.activeStyle!.id, "custom");
  c.nudgeCustom(1);
  c.drillStyle();
  assert.equal(c.styleMastery[CUSTOM_STYLE], 0.25);
  const back = CareerState.restore(c.serialize());
  assert.equal(back.style, CUSTOM_STYLE); assert.equal(back.customNudge, 1);
  assert.deepEqual(back.customLeanings, forged); assert.deepEqual(back.styleMastery, c.styleMastery);
  // A save from before the custom style: four masteries, no journal — loads with an empty journal.
  const old = JSON.parse(c.serialize());
  delete old.journal; delete old.customLeanings; delete old.customNudge; old.style = 0; old.styleMastery = old.styleMastery.slice(0, STYLES.length);
  const was = CareerState.restore(JSON.stringify(old));
  assert.equal(was.customLeanings, null); assert.equal(was.styleMastery.length, STYLES.length + 1); assert.equal(was.style, 0);
});
