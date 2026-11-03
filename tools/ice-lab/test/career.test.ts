import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  CareerState, Choreography, CAREER_EVENTS, HYPE_FLOW_BONUS_MAX, TECHNICAL_XP_PER_POINT, SPIN_LEVEL_XP,
  STEP_LEVEL_XP, EVENT_FLOORS, JUMP_TURN, LESSON_XP, START_WEEKS, WEEKS_PER_TIER, validPlan,
} from "../game/career.ts";
import { RUST_PER_STEP, RUST_TURN, landingFamily } from "../game/training.ts";
import { AIR_TURN } from "../game/tutorial.ts";
import type { CareerEvent, ElementId } from "../game/career.ts";
import { createState, step } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { MOVE, NEUTRAL_INPUT, TURN_KIND, EVENT, FOOT, DIR, EDGE, makeCode } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE, JUMP_NONE } from "../sim/jump.ts";
import { SIM_DT } from "../sim/params.ts";
import { applyProfile, overall, TIERS } from "../sim/profile.ts";
import { loadTables } from "../sim/score.ts";
import { loadSpinFeatureThresholds } from "../sim/spinLevel.ts";
import { loadStepFeatureThresholds, STEP_TYPE } from "../sim/stepLevel.ts";
import { loadSegmentRules } from "../sim/pcs.ts";
import { IceGrid } from "../sim/ice.ts";

const tables = loadTables(
  readFileSync(new URL("../../../data/scale-of-values.csv", import.meta.url), "utf8"),
  readFileSync(new URL("../../../data/calls-and-deductions.csv", import.meta.url), "utf8"));
const spinThresholds = loadSpinFeatureThresholds(
  readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8"));
const stepThresholds = loadStepFeatureThresholds(
  readFileSync(new URL("../../../data/step-features.json", import.meta.url), "utf8"));
const segmentRules = loadSegmentRules(
  readFileSync(new URL("../../../data/segment-rules.csv", import.meta.url), "utf8"));

const state = () => createState(GAME_PARAMS, 4.5);
const program = (...routine: ElementId[]) => new Choreography({ id: "test", title: "Test", venue: "Test", seconds: 30, routine });
function finish(event: CareerEvent, falls = 0) {
  const c = new Choreography(event); c.index = event.routine.length; c.falls = falls; return c;
}

test("choreography requires ordered sustained moves, movement and grounded poses", () => {
  const c = program("edge", "pose"), s = state();
  c.sample(s, true, 2); assert.equal(c.index, 0, "future pose cannot count early");
  s.lean = .2; c.sample(s, false, 1); s.lean = 0; c.sample(s, false, .1);
  s.lean = .2; c.sample(s, false, 1); assert.equal(c.index, 0, "hold resets on exit");
  c.sample(s, false, 1); assert.equal(c.index, 1);
  s.jump.phase = JUMP_PHASE.Air; c.sample(s, true, 2); assert.equal(c.index, 1);
  s.jump.phase = JUMP_PHASE.None; s.vel = { x: 0, y: 0 }; c.sample(s, true, 2); assert.equal(c.index, 1);
  s.vel = { x: 4, y: 0 }; c.sample(s, true, 2); assert.equal(c.medal, 3);
});

test("old landings and repeated frames cannot satisfy a later jump", () => {
  const c = program("glide", "jump", "jump"), s = state();
  s.landed.tick = 1; s.landed.height = .2; s.landed.turned = JUMP_TURN;
  c.sample(s, false, 3); c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 2; s.landed.stepOut = true; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 3; s.landed.stepOut = false; c.sample(s, false, .1); assert.equal(c.index, 2);
  c.sample(s, false, .1); assert.equal(c.index, 2);
  s.landed.tick = 4; c.sample(s, false, .1); assert.equal(c.complete, true);
});

test("a jump element needs half a turn in the air: a straight hop is not one (owner, 2026-11-02)", () => {
  const c = program("glide", "jump"), s = state();
  c.sample(s, false, 3); assert.equal(c.index, 1);
  s.landed.tick = 1; s.landed.height = .39; s.landed.turned = 0; c.sample(s, false, .1);
  assert.equal(c.index, 1, "the season's 0-rotation, 0.39 m hop");
  s.landed.tick = 2; s.landed.turned = JUMP_TURN - .01; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 3; s.landed.turned = -JUMP_TURN; c.sample(s, false, .1); assert.equal(c.complete, true, "either way round");
  assert.equal(JUMP_TURN, AIR_TURN, "the tutorial's turning jump and career's are the same rule");
});

test("rust raises the turn a jump needs in its own family (owner, 2026-11-02)", () => {
  const c = program("jump"), s = state();
  c.rust = { toe: 1, edge: 0.5 };
  assert.equal(c.jumpBar(0), JUMP_TURN + RUST_TURN, "a fully rusty toe loop needs three-quarters");
  assert.equal(c.jumpBar(2), JUMP_TURN + RUST_TURN / 2, "a half-rusty loop");
  assert.equal(c.jumpBar(JUMP_NONE), c.jumpBar(2), "an uncalled landing counts as edge");
  s.landed.tick = 1; s.landed.height = .3; s.landed.kind = 0; s.landed.turned = 0.65; c.sample(s, false, .1);
  assert.equal(c.index, 0, "0.65 of a turn is short of a fully rusty toe jump's 0.75");
  s.landed.tick = 2; s.landed.kind = 2; c.sample(s, false, .1);
  assert.equal(c.complete, true, "the same 0.65 clears a half-rusty edge jump's 0.625");
  assert.equal(new Choreography(CAREER_EVENTS[0]).jumpBar(0), JUMP_TURN, "no rust, no extra");
  assert.equal(landingFamily(4), "toe"); assert.equal(landingFamily(5), "edge");
});

test("a career program runs its full time; finishing the elements early does not end it", () => {
  const c = program("glide"), s = state();
  c.fullTime = true;
  c.sample(s, false, 3); assert.ok(c.complete); assert.equal(c.done, false);
  s.fallen = true; c.sample(s, false, 1); assert.equal(c.falls, 1, "a fall after the last element still counts");
  s.fallen = false; c.sample(s, false, 30); assert.ok(c.done); assert.equal(c.medal, 2);
});

test("spin needs a new full rotation per element and resets when interrupted", () => {
  const c = program("spin", "spin"), s = state(); s.move = MOVE.Spin;
  s.spin.swept = Math.PI * 2; c.sample(s, false, .1); assert.equal(c.index, 1);
  c.sample(s, false, .1); assert.equal(c.index, 1);
  s.spin.swept += Math.PI; c.sample(s, false, .1);
  s.move = MOVE.None; c.sample(s, false, .1);
  s.move = MOVE.Spin; s.spin.swept = Math.PI; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.spin.swept = Math.PI * 2; c.sample(s, false, .1); assert.equal(c.complete, true);
});

test("falls count transitions, clear a hold, and downgrade medals without blocking completion", () => {
  const c = program("glide"), s = state(); c.sample(s, false, 2);
  s.fallen = true; c.sample(s, false, .1); c.sample(s, false, .1);
  assert.equal(c.falls, 1); assert.equal(c.held, 0);
  s.fallen = false; c.sample(s, false, 3); assert.equal(c.medal, 2);
  assert.equal(finish(CAREER_EVENTS[0], 3).medal, 1);
});

test("deadline and invalid time cannot earn moves or corrupt a routine", () => {
  const c = program("glide"), s = state();
  for (const dt of [NaN, Infinity, -1, 0]) c.sample(s, false, dt);
  assert.equal(c.elapsed, 0);
  c.sample(s, false, 30); c.sample(s, false, 3);
  assert.equal(c.done, true); assert.equal(c.medal, 0); assert.equal(c.index, 0);
});

test("career unlocks sequentially and pays only improved medals, once", () => {
  const c = new CareerState();
  assert.equal(c.award(finish(CAREER_EVENTS[1])), 0);
  assert.equal(c.award(new Choreography(CAREER_EVENTS[0])), 0);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 3)), 150); assert.equal(c.medalCap, 1);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 1)), 150);
  assert.equal(c.award(finish(CAREER_EVENTS[0])), 150);
  assert.equal(c.award(finish(CAREER_EVENTS[0])), 0);
  assert.equal(c.award(finish(CAREER_EVENTS[0], 3)), 0); assert.equal(c.medals[0], 3);
  // Untrained (overall 50) holds the stat gate at Club debut since the floors were
  // re-spaced on 2026-11-02 (statCap 0), so none of the remaining four events
  // can award: they are blocked by stats, not sequence.
  for (const event of CAREER_EVENTS.slice(1)) c.award(finish(event));
  assert.deepEqual(c.medals, [3, 0, 0, 0, 0]);
  assert.equal(c.statCap, 0); assert.equal(c.unlocked, 0);
  assert.equal(c.profile.xp, 450, "450 for event 0's climb to gold; the stat gate allowed nothing more");
});

test("hype and flow, averaged over a real routine, bonus career XP only alongside a medal improvement", () => {
  // CAREER_EVENTS[0]'s own routine (glide, edge, pose), driven for real
  // through sample() rather than finish()'s shortcut, so hypeMean/flowMean
  // accumulate from actual ticks the way a play session would leave them.
  const run = () => {
    const c = new Choreography(CAREER_EVENTS[0]), s = state();
    s.hype = 1; s.flow = 1;
    c.sample(s, false, 3);      // glide: grounded, no move, >=3 m/s, held 3s
    s.lean = 0.2;
    c.sample(s, false, 2);      // edge: a moving edge held 2s
    c.sample(s, true, 2);       // pose: low=true, held 2s
    return c;
  };
  const c = run();
  assert.equal(c.complete, true);
  assert.equal(c.medal, 3, "no fall: gold");
  assert.ok(c.hypeMean > 0.99 && c.flowMean > 0.99, `hypeMean ${c.hypeMean} flowMean ${c.flowMean}`);

  const cs = new CareerState();
  const first = cs.award(c);
  assert.equal(first, 3 * 150 + Math.round(HYPE_FLOW_BONUS_MAX * c.hypeMean) + Math.round(HYPE_FLOW_BONUS_MAX * c.flowMean));

  const second = cs.award(run());
  assert.equal(second, 0, "no medal improvement this time, so no bonus either, even at full hype and flow");

  // Zero hype and flow throughout: no bonus, only the medal itself, on a
  // career that has not yet earned this event's gold.
  const fresh = new CareerState();
  const flat = new Choreography(CAREER_EVENTS[0]), s = state();
  flat.sample(s, false, 3); s.lean = 0.2; flat.sample(s, false, 2); flat.sample(s, true, 2);
  assert.equal(flat.hypeMean, 0); assert.equal(flat.flowMean, 0);
  assert.equal(fresh.award(flat), 3 * 150);
});

test("real jump TES, spin level and step level bonus career XP, the same anti-farming gate as hype and flow", () => {
  const c = new Choreography(CAREER_EVENTS[0], tables, spinThresholds, stepThresholds);
  c.technicalScore = 5.5; c.bestSpinLevel = 2; c.bestStepLevel = 1;
  c.index = CAREER_EVENTS[0].routine.length; // finish() 's own shortcut, for the award math alone
  assert.equal(c.medal, 3);

  const cs = new CareerState();
  const earned = cs.award(c);
  assert.equal(earned, 3 * 150 + Math.round(TECHNICAL_XP_PER_POINT * 5.5) + SPIN_LEVEL_XP * 2 + STEP_LEVEL_XP * 1);

  // No medal improvement the second time: no technical, spin or step bonus
  // either, even though all three are still sitting at their full values.
  const c2 = new Choreography(CAREER_EVENTS[0], tables, spinThresholds, stepThresholds);
  c2.technicalScore = 5.5; c2.bestSpinLevel = 2; c2.bestStepLevel = 1; c2.index = CAREER_EVENTS[0].routine.length;
  assert.equal(cs.award(c2), 0);
});

test("step sequence: five distinct types on both feet inside the window makes the element active and scores grade 1", () => {
  const c = new Choreography(
    { id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["step"] },
    undefined, undefined, stepThresholds);
  const s = state();
  const code = (foot: 0 | 1) => makeCode(foot, DIR.Backward, EDGE.Outside);

  s.tick = 0; s.moveDone.tick = 0; s.moveDone.kind = MOVE.Turn; s.moveDone.detail = TURN_KIND.ThreeTurn;
  s.moveDone.toCode = code(FOOT.Right);
  c.sample(s, false, 0.01);
  s.tick = 100; s.moveDone.tick = 100; s.moveDone.detail = TURN_KIND.Mohawk; s.moveDone.toCode = code(FOOT.Left);
  c.sample(s, false, 0.01);
  s.tick = 200; s.moveDone.tick = 200; s.moveDone.detail = TURN_KIND.Bracket; s.moveDone.toCode = code(FOOT.Right);
  c.sample(s, false, 0.01);
  s.tick = 300; s.moveDone.tick = 300; s.moveDone.kind = MOVE.Twizzle; s.moveDone.toCode = code(FOOT.Left);
  c.sample(s, false, 0.01);
  assert.equal(c.index, 0, "only four distinct types so far: not enough for grade 1's own five");
  // A crossover: not a MOVE, so the tracker sees the false-to-true transition.
  s.tick = 400; s.crossover = true; s.strokeTime = 0.1; s.strokeFoot = FOOT.Right;
  c.sample(s, false, 0.01);
  assert.equal(c.index, 0, "active now, but the element's own 2 s hold has not accumulated yet");
  s.tick = 401; c.sample(s, false, 1);
  s.tick = 402; c.sample(s, false, 1);
  assert.equal(c.index, 1, "five distinct types, both feet, held 2 s: the step element is satisfied");
  assert.equal(c.bestStepLevel, 1, "exactly grade 1 — this rig's own honest ceiling with six observable types");
});

test("a change of edge while gliding is a sixth distinct type, but six still cannot reach grade 2", () => {
  const c = new Choreography(
    { id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["step"] },
    undefined, undefined, stepThresholds);
  const s = state();
  const types = [
    [MOVE.Turn, TURN_KIND.ThreeTurn, FOOT.Right], [MOVE.Turn, TURN_KIND.Mohawk, FOOT.Left],
    [MOVE.Turn, TURN_KIND.Bracket, FOOT.Right], [MOVE.Twizzle, 0, FOOT.Left],
  ] as const;
  types.forEach(([kind, detail, foot], i) => {
    s.tick = i * 100; s.moveDone.tick = i * 100; s.moveDone.kind = kind; s.moveDone.detail = detail;
    s.moveDone.toCode = makeCode(foot, DIR.Backward, EDGE.Outside);
    c.sample(s, false, 0.01);
  });
  s.tick = 400; s.crossover = true; s.strokeTime = 0.1; s.strokeFoot = FOOT.Right;
  c.sample(s, false, 0.01);
  s.tick = 500;
  const changeOfEdge = { tick: 500, type: EVENT.EdgeChanged, foot: FOOT.Left, prevCode: 0, newCode: 0, prevDwell: 0, value: 0 };
  c.sample(s, false, 0.01, [changeOfEdge]);
  s.tick = 501; c.sample(s, false, 1);
  s.tick = 502; c.sample(s, false, 1);
  assert.equal(c.bestStepLevel, 1, "six of this rig's six observable types is still grade 1: grade 2 needs seven");
});

test("step sequence: fewer than five distinct types, or only one foot, never activates the element", () => {
  const oneType = new Choreography(
    { id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["step"] },
    undefined, undefined, stepThresholds);
  const s = state();
  s.tick = 0; s.moveDone.tick = 0; s.moveDone.kind = MOVE.Turn; s.moveDone.detail = TURN_KIND.ThreeTurn;
  s.moveDone.toCode = makeCode(FOOT.Right, DIR.Backward, EDGE.Outside);
  oneType.sample(s, false, 3);
  assert.equal(oneType.index, 0);
  assert.equal(oneType.bestStepLevel, 0);

  const oneFoot = new Choreography(
    { id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["step"] },
    undefined, undefined, stepThresholds);
  const s2 = state();
  const kinds: Array<[number, number]> = [
    [MOVE.Turn, TURN_KIND.ThreeTurn], [MOVE.Turn, TURN_KIND.Mohawk],
    [MOVE.Turn, TURN_KIND.Bracket], [MOVE.Twizzle, 0],
  ];
  kinds.forEach(([kind, detail], i) => {
    s2.tick = i * 100; s2.moveDone.tick = i * 100; s2.moveDone.kind = kind; s2.moveDone.detail = detail;
    s2.moveDone.toCode = makeCode(FOOT.Right, DIR.Backward, EDGE.Outside); // every one on the right foot
    oneFoot.sample(s2, false, 0.01);
  });
  s2.tick = 400; s2.crossover = true; s2.strokeTime = 0.1; s2.strokeFoot = FOOT.Right;
  oneFoot.sample(s2, false, 3);
  assert.equal(oneFoot.index, 0, "five distinct types, but never the left foot: both_feet_used fails");
  assert.equal(oneFoot.bestStepLevel, 0);
});

test("each recorded turn carries its rotation sense from s.turn.dir; a crossover carries none", () => {
  const c = program("step");
  const s = state();
  s.tick = 0; s.moveDone.tick = 0; s.moveDone.kind = MOVE.Turn; s.moveDone.detail = TURN_KIND.Rocker;
  s.moveDone.toCode = makeCode(FOOT.Right, DIR.Forward, EDGE.Inside); s.turn.dir = -1;
  c.sample(s, false, 0.01);
  s.tick = 100; s.crossover = true; s.strokeTime = 0.1; s.strokeFoot = FOOT.Left;
  c.sample(s, false, 0.01);
  assert.deepEqual(c["stepTracker"].events.map((e) => e.dir), [-1, 0]);
});

test("a finished choctaw is recorded as its own step type", () => {
  const c = program("step");
  const s = state();
  s.tick = 0; s.moveDone.tick = 0; s.moveDone.kind = MOVE.Turn; s.moveDone.detail = TURN_KIND.Choctaw;
  s.moveDone.toCode = makeCode(FOOT.Left, DIR.Backward, EDGE.Outside);
  c.sample(s, false, 0.01);
  assert.deepEqual(c["stepTracker"].events.map((e) => [e.type, e.foot]), [[STEP_TYPE.Choctaw, FOOT.Left]]);
});

test("without stepThresholds, the step element never activates — the same graceful degradation as spin/technical", () => {
  const c = new Choreography({ id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["step"] });
  const s = state();
  const types: Array<[number, number, 0 | 1]> = [
    [MOVE.Turn, TURN_KIND.ThreeTurn, FOOT.Right], [MOVE.Turn, TURN_KIND.Mohawk, FOOT.Left],
    [MOVE.Turn, TURN_KIND.Bracket, FOOT.Right], [MOVE.Twizzle, 0, FOOT.Left],
  ];
  types.forEach(([kind, detail, foot], i) => {
    s.tick = i * 100; s.moveDone.tick = i * 100; s.moveDone.kind = kind; s.moveDone.detail = detail;
    s.moveDone.toCode = makeCode(foot, DIR.Backward, EDGE.Outside);
    c.sample(s, false, 0.01);
  });
  s.tick = 400; s.crossover = true; s.strokeTime = 0.1; s.strokeFoot = FOOT.Right;
  c.sample(s, false, 3);
  assert.equal(c.index, 0);
  assert.equal(c.bestStepLevel, 0);
});

test("technicalScore and bestSpinLevel accumulate from real physics, not just the checklist", () => {
  // CAREER_EVENTS[3] ("regional"): glide, edge, jump, spin, pose. Only the
  // jump and spin matter here; sample() is driven directly rather than
  // through a full clean run of every element.
  const c = new Choreography(CAREER_EVENTS[3], tables, spinThresholds);
  const s = createState(GAME_PARAMS, -5);

  // A real, identified toe loop — test/jump.test.ts's own "a perfect toe
  // loop with a full whip and a tuck is a clean triple" recipe (backward
  // entry, lean -0.25, toe pick, full whip), so `kind` is a real jump and
  // score.ts's jumpValue does not return null for it.
  for (let i = 0; i < 600 && s.jump.phase !== JUMP_PHASE.Air; i++) {
    const loading = i >= 180 && i < 216;
    const input: SkatingInput = { ...NEUTRAL_INPUT, lean: -0.25, weight: 1,
      knee: loading ? 0.95 : i >= 216 && i < 219 ? 0 : i >= 216 ? 0.8 : 0.35,
      carriage: loading || i === 216 ? 1 : 0, toe: i === 214 };
    step(s, input, GAME_PARAMS, SIM_DT, []);
    c.sample(s, false, SIM_DT);
  }
  for (let i = 0; i < 200 && s.jump.phase === JUMP_PHASE.Air; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: 0, weight: 1, knee: 0.8, carriage: 0 }, GAME_PARAMS, SIM_DT, []);
    c.sample(s, false, SIM_DT);
  }
  assert.ok(s.landed.tick >= 0, "must actually have landed");
  assert.ok(c.technicalScore > 0, `a real landing must score real TES, got ${c.technicalScore}`);

  // A fresh skater for the spin: Choreography's own bookkeeping (falls,
  // landings, spin tracking) lives on `c`, not on any one SkaterState, so a
  // second skater mid-routine is exactly as legitimate as the first —
  // without untangling whatever the jump's own fall left in `s.legs`,
  // `s.wind` and `pEff`, which is not what this test is about.
  const spinner = createState(GAME_PARAMS, 4.5);
  for (let i = 0; i < 240; i++) {
    step(spinner, { ...NEUTRAL_INPUT, weight: 0, lean: 0.3, knee: 0.45 }, GAME_PARAMS, SIM_DT, []);
    c.sample(spinner, false, SIM_DT);
  }
  for (let i = 0; i < 300; i++) {
    step(spinner, { ...NEUTRAL_INPUT, weight: 0, knee: 0.45, carriage: i < 150 ? 1 : 0, spin: true }, GAME_PARAMS, SIM_DT, []);
    c.sample(spinner, false, SIM_DT);
  }
  step(spinner, { ...NEUTRAL_INPUT, weight: 0, knee: 0.45, spin: false }, GAME_PARAMS, SIM_DT, []); // release
  c.sample(spinner, false, SIM_DT);
  assert.ok(c.bestSpinLevel > 0, `a real spin must reach a real level, got ${c.bestSpinLevel}`);
});

test("PCS scores once a routine with segmentRules and an ice grid actually finishes, and feeds the award bonus", () => {
  // CAREER_EVENTS[0] ("first-ice"): glide, edge, pose. Its own discipline/
  // segment ("women"/"short") is a real row in data/segment-rules.csv.
  const ice = new IceGrid(GAME_PARAMS.rinkHalfLength, GAME_PARAMS.rinkHalfWidth);
  const c = new Choreography(CAREER_EVENTS[0], tables, spinThresholds, stepThresholds, segmentRules, ice);
  // Not `assert.equal(c.pcsScore, null, ...)`: assert.strict's `equal<T>(actual, expected):
  // asserts actual is T` would pin the mutable `pcsScore` property to `null` clear across
  // every `sample()` call below — the exact tsc failure a prior session already found and
  // fixed once (Hand_off.md) for `effects.landing`. Assert the boolean instead.
  assert.equal(c.pcsScore === null, true, "nothing to score before the routine has even started");
  const s = state();
  c.sample(s, false, 3);      // glide: grounded, no move, >=3 m/s, held 3s
  s.lean = 0.2;
  c.sample(s, false, 2);      // edge: a moving edge held 2s
  c.sample(s, true, 2);       // pose: low=true, held 2s
  assert.equal(c.complete, true, "the routine must actually finish for PCS to score");
  assert.ok(c.pcsScore, "a finished routine with segmentRules and ice must score PCS");
  assert.ok(c.pcsScore!.total > 0, `PCS total should be positive, got ${c.pcsScore!.total}`);
  for (const component of [c.pcsScore!.composition, c.pcsScore!.presentation, c.pcsScore!.skatingSkills]) {
    assert.ok(component >= 0, "every component score is non-negative");
  }
  // Sampling again after the routine is done must not re-score it (scorePcs
  // runs once, post-hoc — sample()'s own top guard returns before reaching
  // finalizePcs a second time).
  const firstScore = c.pcsScore;
  c.sample(s, true, 1);
  assert.equal(c.pcsScore, firstScore, "PCS is computed once, not resampled after the routine ends");

  const career = new CareerState();
  const withoutPcs = new CareerState().award(finish(CAREER_EVENTS[0]));
  const earned = career.award(c);
  assert.ok(earned > withoutPcs, "a scored PCS total must add to the award over the plain medal + checklist bonus");
});

test("PCS stays unscored, gracefully, without segmentRules or an ice grid", () => {
  const c = new Choreography(CAREER_EVENTS[0], tables, spinThresholds, stepThresholds); // no segmentRules, no ice
  const s = state();
  c.sample(s, false, 3); s.lean = 0.2; c.sample(s, false, 2); c.sample(s, true, 2);
  assert.equal(c.complete, true);
  assert.equal(c.pcsScore === null, true, "no segmentRules/ice supplied means PCS silently stays unscored, not a crash");
});

test("stats gate progression independent of medals: a neutral profile holds at regionals", () => {
  const c = new CareerState();
  assert.equal(overall(c.profile), 50, "every stat starts neutral");
  assert.equal(c.statCap, 0, "overall 50 clears First ice only since 2026-11-02: Club debut asks for training");
  c.medals = CAREER_EVENTS.map(() => 3);         // every medal already earned, by fiat
  assert.equal(c.medalCap, CAREER_EVENTS.length - 1);
  assert.equal(c.unlocked, 0, "medals in hand cannot outrun the stats behind them");
});

test("training raises overall past an event floor and lifts the stat gate", () => {
  const c = new CareerState();
  c.profile = { ...c.profile, xp: 100000 };
  // Five edge points (five weeks): 51.40, past Jump showcase's 51.35 and short of Regional's 51.9.
  c.weeks = 5;
  for (let i = 0; i < 5; i++) c.train("edgeControl");
  assert.ok(overall(c.profile) >= EVENT_FLOORS[2] && overall(c.profile) < EVENT_FLOORS[3], `overall ${overall(c.profile)}`);
  assert.equal(c.statCap, 2);
  assert.equal(CAREER_EVENTS.length, TIERS.length, "the five events and the five tiers are the same ladder");
  assert.equal(EVENT_FLOORS.length, CAREER_EVENTS.length);
});

/** The most overall `xp` buys, from neutral: every point into edge control, the heaviest stat. */
function bestOverall(xp: number) {
  const c = new CareerState();
  c.profile = { ...c.profile, xp }; c.weeks = 1000;
  for (let i = 0; i < 50; i++) c.train("edgeControl");
  return overall(c.profile);
}

test("the whole ladder can be reached: silver alone pays for every floor, bronze alone does not", () => {
  // Medals pay 150 a tier. Before event i, the i events below it have paid.
  for (let i = 0; i < CAREER_EVENTS.length; i++) {
    assert.ok(bestOverall(i * 300) >= EVENT_FLOORS[i], `silver reaches event ${i}: ${bestOverall(i * 300)} against ${EVENT_FLOORS[i]}`);
  }
  assert.ok(bestOverall(2 * 150) < EVENT_FLOORS[2], "bronze alone does not skip the training");
  // Playing it: the top event really opens, with the XP really earned.
  const c = new CareerState();
  for (let i = 0; i < CAREER_EVENTS.length; i++) {
    while (c.profile.xp >= 110 && c.unlocked < i) c.train("edgeControl");
    assert.equal(c.unlocked >= i, true, `event ${i} opens (overall ${overall(c.profile)}, ${c.profile.xp} XP)`);
    assert.equal(c.award(finish(CAREER_EVENTS[i], 1)), 300);
  }
  assert.deepEqual(c.medals, [2, 2, 2, 2, 2]);
});

test("a save holding more XP than five medals still loads: bonuses are real XP", () => {
  const c = new CareerState();
  c.medals = [3, 3, 0, 0, 0];
  c.profile = { ...c.profile, xp: 2600 };
  const back = CareerState.restore(c.serialize());
  assert.equal(back.profile.xp, 2600, "a career was wiped on load past 2,250 XP");
  assert.deepEqual(back.medals, [3, 3, 0, 0, 0]);
});

test("a closed event says why, and which gate", () => {
  const c = new CareerState();
  assert.equal(c.lockReason(0), "");
  assert.match(c.lockReason(1), /medal/);
  c.medals = [1, 1, 0, 0, 0];
  assert.match(c.lockReason(2), /Needs overall 51\.35; you are at 50\.00/);
  assert.match(c.lockReason(3), /medal/);
});

test("a lesson step pays once, survives a save, and a bad list keeps the career", () => {
  const c = new CareerState();
  assert.equal(c.recordLesson("glide"), LESSON_XP);
  assert.equal(c.recordLesson("glide"), 0);
  assert.equal(c.profile.xp, LESSON_XP);
  const back = CareerState.restore(c.serialize());
  assert.deepEqual(back.lessons, ["glide"]);
  assert.equal(back.recordLesson("glide"), 0);
  const old = JSON.parse(c.serialize()); old.lessons = [1, 2];
  assert.deepEqual(CareerState.restore(JSON.stringify(old)).lessons, []);
  assert.equal(CareerState.restore(JSON.stringify(old)).profile.xp, LESSON_XP);
});

test("XP training persists, spends one point and changes the next career parameter bake", () => {
  const c = new CareerState(); c.award(finish(CAREER_EVENTS[0]));
  const before = applyProfile(GAME_PARAMS, c.profile);
  c.train("strength"); assert.equal(c.profile.xp, 340); assert.equal(c.profile.stats.strength, 51);
  assert.ok(applyProfile(GAME_PARAMS, c.profile).strokePower > before.strokePower);
  const loaded = CareerState.restore(c.serialize());
  assert.deepEqual(loaded.profile, c.profile); assert.deepEqual(loaded.medals, c.medals);
  const fresh = new CareerState(); fresh.train("balance"); assert.equal(fresh.profile.stats.balance, 50);
});

test("corrupt, incompatible and broken-chain saves fall back safely", () => {
  for (const json of [null, "bad json", "{}", '{"version":99}', JSON.stringify({version:1,medals:[0,3,0,0,0],xp:0,stats:new CareerState().profile.stats})]) {
    const c = CareerState.restore(json); assert.equal(c.unlocked, 0); assert.equal(c.profile.xp, 0);
  }
});

// ── training weeks, rust, planning ──────────────────────────────────────────

test("training costs a week as well as XP, and a medal tier earns weeks back", () => {
  const c = new CareerState();
  c.profile = { ...c.profile, xp: 1000 };
  assert.equal(c.weeks, START_WEEKS);
  c.train("balance");
  assert.equal(c.weeks, START_WEEKS - 1);
  c.weeks = 0;
  const before = c.profile.xp;
  c.train("balance");
  assert.equal(c.profile.stats.balance, 51, "no week, no training");
  assert.equal(c.profile.xp, before);
  c.award(finish(CAREER_EVENTS[0], 1));
  assert.equal(c.weeks, 2 * WEEKS_PER_TIER, "silver is two tiers");
  c.award(finish(CAREER_EVENTS[0], 1));
  assert.equal(c.weeks, 2 * WEEKS_PER_TIER, "a repeat earns none");
  // Too little XP costs no week either.
  const poor = new CareerState(); poor.train("balance");
  assert.equal(poor.weeks, START_WEEKS);
});

test("a family not drilled goes rusty at each new event, drilling holds it and wins it back", () => {
  const c = new CareerState();
  c.drill("toe");
  c.award(finish(CAREER_EVENTS[0]));
  assert.deepEqual(c.rust, { toe: 0, edge: RUST_PER_STEP }, "the one drilled held");
  c.award(finish(CAREER_EVENTS[0]));
  assert.equal(c.rust.edge, RUST_PER_STEP, "a repeat is not a season step");
  c.weeks = 10;
  c.drill("edge");
  assert.equal(c.rust.edge, 0);
  c.rust = { toe: 1, edge: 1 };
  c.weeks = 0;
  c.drill("edge");
  assert.equal(c.rust.edge, 1, "no week, no drill");
});

test("silver alone can reach every floor and still keep both families sharp", () => {
  const c = new CareerState();
  for (let i = 0; i < CAREER_EVENTS.length; i++) {
    c.drill("toe"); c.drill("edge");
    while (c.unlocked < i && c.weeks > 0 && c.profile.xp >= 110) c.train("edgeControl");
    assert.ok(c.unlocked >= i, `event ${i}: overall ${overall(c.profile)}, ${c.weeks} weeks, ${c.profile.xp} XP`);
    c.award(finish(CAREER_EVENTS[i], 1));
  }
  assert.deepEqual(c.rust, { toe: 0, edge: 0 });
  assert.deepEqual(c.medals, [2, 2, 2, 2, 2]);
});

test("a plan must hold what its event asks, adds up to PLAN_EXTRA, and awards the same rung", () => {
  const event = CAREER_EVENTS[0];
  assert.ok(validPlan(event, ["pose", "edge", "glide"]), "any order");
  assert.ok(validPlan(event, ["glide", "spiral", "edge", "combo", "pose"]), "two of your own");
  assert.ok(!validPlan(event, ["glide", "edge"]), "the pose is missing");
  assert.ok(!validPlan(event, ["glide", "edge", "pose", "spin", "spin", "spin"]), "too many");
  assert.ok(!validPlan(event, ["glide", "edge", "pose", "dance"]), "unknown element");
  assert.ok(validPlan(CAREER_EVENTS[4], [...CAREER_EVENTS[4].routine]));
  assert.ok(!validPlan(CAREER_EVENTS[4], CAREER_EVENTS[4].routine.slice(1)), "a repeated element counts twice");
  const c = new CareerState();
  assert.equal(c.setPlan(0, ["glide"]), false);
  assert.equal(c.plans[0], null);
  assert.equal(c.setPlan(0, ["edge", "glide", "pose", "spiral"]), true);
  assert.deepEqual(c.planned(0).routine, ["edge", "glide", "pose", "spiral"]);
  assert.equal(c.award(finish(c.planned(0))), 450, "a planned program is the same rung");
  assert.equal(c.medals[0], 3);
  assert.equal(c.setPlan(0, null), true);
  assert.equal(c.planned(0), CAREER_EVENTS[0]);
});

test("weeks, rust, plans and best scores survive a save; a save from before them still loads", () => {
  const c = new CareerState();
  c.weeks = 7; c.rust = { toe: 0.5, edge: 0.25 }; c.drilled = { toe: true, edge: false };
  c.setPlan(1, [...CAREER_EVENTS[1].routine, "spiral"]);
  c.best[0] = 12.5;
  const back = CareerState.restore(c.serialize());
  assert.equal(back.weeks, 7);
  assert.deepEqual(back.rust, { toe: 0.5, edge: 0.25 });
  assert.deepEqual(back.drilled, { toe: true, edge: false });
  assert.deepEqual(back.plans[1], [...CAREER_EVENTS[1].routine, "spiral"]);
  assert.equal(back.best[0], 12.5);
  const old = JSON.parse(new CareerState().serialize());
  for (const k of ["weeks", "rust", "drilled", "plans", "best"]) delete old[k];
  old.medals = [3, 0, 0, 0, 0];
  const older = CareerState.restore(JSON.stringify(old));
  assert.equal(older.medals[0], 3);
  assert.equal(older.weeks, START_WEEKS);
  const bad = JSON.parse(c.serialize()); bad.plans[1] = ["glide"]; bad.rust = { toe: 9, edge: 0 };
  const kept = CareerState.restore(JSON.stringify(bad));
  assert.equal(kept.plans[1], null, "a plan that no longer fits falls back to the event's own");
  assert.deepEqual(kept.rust, { toe: 0, edge: 0 });
});
