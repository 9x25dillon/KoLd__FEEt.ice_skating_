import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { FALL, NEUTRAL_INPUT } from "../sim/types.ts";
import { makeProfile, overall, applyProfile } from "../sim/profile.ts";
import { CareerState, CAREER_EVENTS } from "../game/career.ts";
import type { Params } from "../sim/params.ts";
import { setupInput, setupParams } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { FALL_WEAR, FallWatch, HEALED_UNDER, INJURED_AT, INJURY_COST, REST_PER_WEEK, WEAR_COST, fallHit, fallRegion, fallSide, noInjury, noWear, wornProfile } from "../game/wear.ts";

test("a fall lands where it happened: a landing on the knees, the boards on the shoulder, everything else on the hip", () => {
  assert.equal(fallRegion(FALL.Landing), "knee");
  assert.equal(fallRegion(FALL.Collision), "shoulder");
  for (const r of [FALL.LeanExceeded, FALL.BalanceTimeout, FALL.ToePickTrip, FALL.Pitched]) assert.equal(fallRegion(r), "hip");
});

test("a faster fall costs more, within limits", () => {
  assert.equal(fallHit(FALL.LeanExceeded, 5).wear, FALL_WEAR.hip);
  assert.equal(fallHit(FALL.LeanExceeded, 0).wear, FALL_WEAR.hip * 0.5);
  assert.equal(fallHit(FALL.LeanExceeded, 40).wear, FALL_WEAR.hip * 1.5);
});

test("a fall is reported once, and again only after getting up", () => {
  const w = new FallWatch(), s = createState(setupParams("simulation"), 5);
  assert.equal(w.sample(s), null);
  s.fallen = true; s.fallReason = FALL.LeanExceeded;
  assert.equal(w.sample(s)!.region, "hip");
  assert.equal(w.sample(s), null);
  s.fallen = false; w.sample(s);
  s.fallen = true;
  assert.ok(w.sample(s));
});

test("the side she goes down on is the side she leans, which is the way she turns", () => {
  assert.equal(fallSide({ lean: 0.5, supportFoot: 1 }), 1);
  assert.equal(fallSide({ lean: -0.5, supportFoot: 0 }), -1);
  // Upright: over her skating foot, left foot left.
  assert.equal(fallSide({ lean: 0, supportFoot: 0 }), 1);
  assert.equal(fallSide({ lean: 0, supportFoot: 1 }), -1);
  // +1 is her left: a positive lean curves her counter-clockwise, to her left.
  const p = setupParams("simulation"), s = createState(p, 5);
  for (let i = 0; i < 120; i++) step(s, { ...NEUTRAL_INPUT, lean: 0.4, knee: 0.4, weight: 0.5 }, p, SIM_DT, []);
  assert.ok(s.lean > 0 && s.yawRate > 0, `lean ${s.lean} yaw ${s.yawRate}`);
});

test("enough falls become an injury, and it takes more than one week to heal", () => {
  const c = new CareerState();
  let hurt = null, falls = 0;
  while (!hurt && falls < 100) { hurt = c.takeFall(fallHit(FALL.LeanExceeded, 5)); falls++; }
  assert.equal(hurt, "hip");
  assert.equal(falls, Math.ceil(INJURED_AT / FALL_WEAR.hip));
  assert.equal(c.injured.hip, true);
  assert.equal(c.takeFall(fallHit(FALL.LeanExceeded, 5)), null, "only the first crossing announces it");
  c.weeks = 10;
  let weeks = 0;
  while (c.injured.hip && weeks < 10) { c.rest("hip"); weeks++; }
  assert.ok(weeks >= 3, `healed in ${weeks} weeks`);
  assert.ok(c.wear.hip < HEALED_UNDER);
});

test("rest costs a week, needs a week, and is not spent on a fresh body", () => {
  const c = new CareerState();
  const weeks = c.weeks;
  c.rest("hip");
  assert.equal(c.weeks, weeks, "nothing to rest");
  c.takeFall(fallHit(FALL.Landing, 5));
  c.rest("knee");
  assert.equal(c.weeks, weeks - 1);
  assert.equal(c.wear.knee, Math.max(0, FALL_WEAR.knee - REST_PER_WEEK));
  c.takeFall(fallHit(FALL.Landing, 5));
  c.weeks = 0;
  const before = c.wear.knee;
  c.rest("knee");
  assert.equal(c.wear.knee, before);
});

test("wear takes from what she skates with, never what she trained, the gate or a menu", () => {
  const c = new CareerState();
  const open = c.unlocked, score = overall(c.profile);
  for (let i = 0; i < 40; i++) c.takeFall(fallHit(FALL.LeanExceeded, 5));
  assert.equal(c.profile.stats.balance, 50, "trained stats untouched");
  assert.equal(overall(c.profile), score);
  assert.equal(c.unlocked, open);
  assert.equal(c.lockReason(0), "");
  assert.equal(c.bodyProfile.stats.balance, 50 - WEAR_COST - INJURY_COST);
  assert.equal(c.bodyProfile.stats.edgeControl, 50 - WEAR_COST - INJURY_COST);
  assert.equal(c.bodyProfile.stats.spring, 50, "the hip does not cost the jump");
});

test("a stat cannot go below zero, however worn", () => {
  const p = makeProfile("x", { stats: { strength: 5, spring: 5, edgeControl: 5, balance: 5, stamina: 5 } });
  const worn = wornProfile(p, { hip: 9, knee: 9, shoulder: 9 }, { hip: true, knee: true, shoulder: true });
  assert.ok(Object.values(worn.stats).every(v => v === 0));
});

test("no wear is exactly the skater they were", () => {
  const p = makeProfile("x");
  assert.deepEqual(applyProfile(setupParams("simulation"), wornProfile(p, noWear(), noInjury())), applyProfile(setupParams("simulation"), p));
});

test("wear and injury survive a save; a save from before them keeps a fresh body; a bad one is ignored", () => {
  const c = new CareerState();
  for (let i = 0; i < 30; i++) c.takeFall(fallHit(FALL.Landing, 5));
  const back = CareerState.restore(c.serialize());
  assert.deepEqual(back.wear, c.wear);
  assert.equal(back.injured.knee, true);
  const old = JSON.parse(c.serialize()); delete old.wear; delete old.injured;
  const fresh = CareerState.restore(JSON.stringify(old));
  assert.deepEqual(fresh.wear, noWear());
  assert.deepEqual(fresh.injured, noInjury());
  assert.equal(fresh.medals.length, CAREER_EVENTS.length);
  const bad = JSON.parse(c.serialize()); bad.wear.hip = -1; bad.injured.hip = "yes";
  const kept = CareerState.restore(JSON.stringify(bad));
  assert.deepEqual(kept.wear, noWear());
  assert.deepEqual(kept.injured, noInjury());
});

// ── what it does to the skating ─────────────────────────────────────────────
// A penalty is not assumed to make things harder: elsewhere a weaker spring made a jump easier.
// MEASURED 2026-11-02, the same pad scripts, neutral stats:
//             hop (knee)   strokes (shoulder)   deep edges held (hip), of 36
//   fresh     0.399 m      5.035 m/s            28
//   half worn 0.384        4.963                27
//   full wear 0.370        4.889                25
//   injured   0.337        4.709                24
function bodyParams(setup: "simulation" | "experimental", region: "hip" | "knee" | "shoulder" | null, level: number) {
  const wear = noWear(), injured = noInjury();
  if (region) { wear[region] = level; injured[region] = level >= INJURED_AT; }
  return applyProfile(setupParams(setup), wornProfile(makeProfile("x"), wear, injured));
}
const blankPad = (): ControllerHardware => ({ axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true });
function hopHeight(p: Params) {
  const s = createState(p, 4.5), st = newSchemeState(), profile = defaultControllerProfile(), h = blankPad();
  let top = 0;
  for (let i = 0; i < 480 && !s.fallen; i++) {
    const t = i * SIM_DT; h.buttons.fill(0);
    if (t >= 1 && t < 1.35) h.buttons[6] = h.buttons[7] = 0.95;
    step(s, setupInput({ hardware: h } as Controls, s, "simulation", st, p, profile).input, p, SIM_DT, []);
    top = Math.max(top, s.jump.z);
  }
  return top;
}
function strokeSpeed(p: Params) {
  const s = createState(p, 3), st = newSchemeState(), profile = defaultControllerProfile(), h = blankPad();
  for (let i = 0; i < 600 && !s.fallen; i++) {
    h.buttons.fill(0);
    if (i >= 2 && i < 4) h.buttons[1] = 1;
    if (i >= 10 && (i - 10) % 60 < 8) h.buttons[Math.floor((i - 10) / 60) % 2 ? 7 : 6] = 1;
    step(s, setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input, p, SIM_DT, []);
  }
  return Math.hypot(s.vel.x, s.vel.y);
}
function edgesHeld(p: Params) {
  let up = 0;
  for (const v of [3, 4, 5, 6, 7, 8]) for (const lean of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const s = createState(p, v), st = newSchemeState(), profile = defaultControllerProfile(), h = blankPad();
    for (let i = 0; i < 480 && !s.fallen; i++) {
      h.buttons.fill(0); h.axes = i < 60 ? [lean, 0, lean, 0] : i < 180 ? [-lean, 0, -lean, 0] : [0, 0, 0, 0];
      step(s, setupInput({ hardware: h } as Controls, s, "simulation", st, p, profile).input, p, SIM_DT, []);
    }
    if (!s.fallen) up++;
  }
  return up;
}
const near = (x: number, y: number) => Math.abs(x - y) < 0.002;

test("the more worn, the lower she jumps: fresh 0.399 m, injured 0.337 m", () => {
  const at = [0, 0.5, 0.99, 1].map(level => hopHeight(bodyParams("simulation", level ? "knee" : null, level)));
  for (const [i, want] of [0.399, 0.384, 0.370, 0.337].entries()) assert.ok(near(at[i], want), `${i}: ${at[i].toFixed(3)}`);
});

test("the more worn, the less her pushes give: fresh 5.035 m/s, injured 4.709 m/s", () => {
  const at = [0, 0.5, 0.99, 1].map(level => strokeSpeed(bodyParams("experimental", level ? "shoulder" : null, level)));
  for (const [i, want] of [5.035, 4.963, 4.889, 4.709].entries()) assert.ok(near(at[i], want), `${i}: ${at[i].toFixed(3)}`);
});

test("the more worn, the fewer deep edges she holds: fresh 28 of 36, injured 24", () => {
  assert.deepEqual([0, 0.5, 0.99, 1].map(level => edgesHeld(bodyParams("simulation", level ? "hip" : null, level))), [28, 27, 25, 24]);
});
