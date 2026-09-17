import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  CareerState, Choreography, CAREER_EVENTS, HYPE_FLOW_BONUS_MAX, TECHNICAL_XP_PER_POINT, SPIN_LEVEL_XP,
} from "../game/career.ts";
import type { CareerEvent, ElementId } from "../game/career.ts";
import { createState, step } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";
import { MOVE, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { SIM_DT } from "../sim/params.ts";
import { applyProfile, overall, TIERS } from "../sim/profile.ts";
import { loadTables } from "../sim/score.ts";
import { loadSpinFeatureThresholds } from "../sim/spinLevel.ts";

const tables = loadTables(
  readFileSync(new URL("../../../data/scale-of-values.csv", import.meta.url), "utf8"),
  readFileSync(new URL("../../../data/calls-and-deductions.csv", import.meta.url), "utf8"));
const spinThresholds = loadSpinFeatureThresholds(
  readFileSync(new URL("../../../data/spin-features.json", import.meta.url), "utf8"));

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
  s.landed.tick = 1; s.landed.height = .2;
  c.sample(s, false, 3); c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 2; s.landed.stepOut = true; c.sample(s, false, .1); assert.equal(c.index, 1);
  s.landed.tick = 3; s.landed.stepOut = false; c.sample(s, false, .1); assert.equal(c.index, 2);
  c.sample(s, false, .1); assert.equal(c.index, 2);
  s.landed.tick = 4; c.sample(s, false, .1); assert.equal(c.complete, true);
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
  // Untrained (overall 50) holds the stat gate at regionals (statCap 1), so of
  // the remaining four events only the one within reach — index 1 — can
  // actually award; the rest are blocked by stats, not sequence.
  for (const event of CAREER_EVENTS.slice(1)) c.award(finish(event));
  assert.deepEqual(c.medals, [3, 3, 0, 0, 0]);
  assert.equal(c.statCap, 1); assert.equal(c.unlocked, 1);
  assert.equal(c.profile.xp, 900, "450 for event 0's climb to gold, 450 for the one event 1 the stat gate allowed");
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

test("real jump TES and spin level bonus career XP, the same anti-farming gate as hype and flow", () => {
  const c = new Choreography(CAREER_EVENTS[0], tables, spinThresholds);
  c.technicalScore = 5.5; c.bestSpinLevel = 2;
  c.index = CAREER_EVENTS[0].routine.length; // finish() 's own shortcut, for the award math alone
  assert.equal(c.medal, 3);

  const cs = new CareerState();
  const earned = cs.award(c);
  assert.equal(earned, 3 * 150 + Math.round(TECHNICAL_XP_PER_POINT * 5.5) + SPIN_LEVEL_XP * 2);

  // No medal improvement the second time: no technical or spin bonus either,
  // even though both are still sitting at their full values.
  const c2 = new Choreography(CAREER_EVENTS[0], tables, spinThresholds);
  c2.technicalScore = 5.5; c2.bestSpinLevel = 2; c2.index = CAREER_EVENTS[0].routine.length;
  assert.equal(cs.award(c2), 0);
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

test("stats gate progression independent of medals: a neutral profile holds at regionals", () => {
  const c = new CareerState();
  assert.equal(overall(c.profile), 50, "every stat starts neutral");
  assert.equal(c.statCap, 1, "overall 50 clears club (0) and regionals (40), not nationals (55)");
  c.medals = CAREER_EVENTS.map(() => 3);         // every medal already earned, by fiat
  assert.equal(c.medalCap, CAREER_EVENTS.length - 1);
  assert.equal(c.unlocked, 1, "medals in hand cannot outrun the stats behind them");
});

test("training raises overall past a tier floor and lifts the stat gate", () => {
  const c = new CareerState();
  c.profile = { ...c.profile, xp: 100000 };
  // CareerState.train spends exactly one point's price per call (the UI's one
  // click, one point), so reaching 100 from neutral 50 takes fifty calls.
  for (let i = 0; i < 50; i++) c.train("edgeControl");   // overall 50 -> 64
  assert.equal(c.profile.stats.edgeControl, 100);
  assert.ok(overall(c.profile) >= TIERS[2].floor && overall(c.profile) < TIERS[3].floor,
    `overall ${overall(c.profile)} should clear nationals (${TIERS[2].floor}) but not grand prix (${TIERS[3].floor})`);
  assert.equal(c.statCap, 2);
  assert.equal(CAREER_EVENTS.length, TIERS.length, "the five events and the five tiers are the same ladder");
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
