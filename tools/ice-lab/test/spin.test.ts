// Spins (sim/moves.ts, movesMode 1).
//
// Bible §2.5: "a continuous negotiation between speed, position and
// centering, under a slowly draining angular momentum". The entry sets L and
// nothing adds to it; the position and the arms set I from
// data/spin-positions.json, and omega = L / I — so a camel is slow and an
// upright fast "emergently, without any scripting", as that file puts it.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, SPIN_POSITION, FOOT, REGIME, codeToString } from "../sim/types.ts";
import type { SkaterState, EdgeEvent, SkatingInput } from "../sim/types.ts";
import { SPIN_INERTIA_SCALE } from "../sim/moves.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { dot } from "../sim/math.ts";

const moves = (): Params => ({ ...PRESETS.responsive, movesMode: 1 });
const RPS = 1 / (2 * Math.PI);

interface Spun { s: SkaterState; ends: EdgeEvent[]; omegaAt: (sec: number) => number; lMonotone: boolean; codes: Set<string> }

/**
 * Carve LFO (anticlockwise) at `speed` for 2 s, then hold the spin button for
 * `hold` ticks. `pose(t)` sets knee, stick and arms t ticks into the spin; `check`
 * is the arms at the press.
 */
function spin(speed: number, hold: number, pose: (t: number) => Partial<SkatingInput> = () => ({}), check = 0,
  rec?: ReplayRecorder): Spun {
  const p = moves();
  const s = createState(p, speed);
  const omega: number[] = [], codes = new Set<string>(), ends: EdgeEvent[] = [];
  let lastL = Infinity, lMonotone = true;
  for (let i = 0; i < 240 + hold + 240; i++) {
    const t = i - 240;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, weight: 0, lean: i < 240 ? 0.3 : 0, knee: 0.45,
      ...(t >= 0 ? pose(t) : {}),
      ...(t === 0 ? { carriage: check } : {}),
      spin: t >= 0 && t < hold,
    };
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    if (s.move === MOVE.Spin) {
      omega[t] = s.spin.omega;
      if (s.spin.angMomentum > lastL + 1e-12) lMonotone = false;
      lastL = s.spin.angMomentum;
      for (const b of s.blade) if (b.inContact) codes.add(codeToString(b.code));
    }
    for (const e of ev) if (e.type === EVENT.Spin) ends.push(e);
  }
  return { s, ends, omegaAt: (sec) => omega[Math.round(sec * 120)] ?? 0, lMonotone, codes };
}

test("every preset skates without spins, and the spin levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, spinTravelKeep: 2 }).some((e) => e.includes("spinTravelKeep")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spinMinSpeed: 0 }).some((e) => e.includes("spinMinSpeed")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spinReverseStick: 0 }).some((e) => e.includes("spinReverseStick")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spinReverseRate: 0 }).some((e) => e.includes("spinReverseRate")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spinReverseFloor: 0 }).some((e) => e.includes("spinReverseFloor")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spinReverseRegen: 0 }).some((e) => e.includes("spinReverseRegen")));
});

test("the positions' moments of inertia are data/spin-positions.json's", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/spin-positions.json", import.meta.url), "utf8"));
  const scale = (id: string): number => data.positions.find((q: { id: string }) => q.id === id).inertia_scale;
  assert.equal(SPIN_INERTIA_SCALE[SPIN_POSITION.Upright], scale("upright_basic"));
  assert.equal(SPIN_INERTIA_SCALE[SPIN_POSITION.Sit], scale("sit_basic"));
  assert.equal(SPIN_INERTIA_SCALE[SPIN_POSITION.Camel], scale("camel_basic"));
  assert.equal(DEFAULT_PARAMS.inertiaOpen, data.inertia_baseline_kgm2, "on the file's open baseline");
});

test("a camel is slow and an upright fast: the same entry and arms, three speeds", () => {
  const up = spin(4.5, 240), sit = spin(4.5, 240, () => ({ knee: 0.9 })), cam = spin(4.5, 240, () => ({ pitch: 0.9 }));
  const w = [up.omegaAt(1), sit.omegaAt(1), cam.omegaAt(1)];
  assert.ok(w[0] > w[1] && w[1] > w[2], `upright ${(w[0] * RPS).toFixed(2)}, sit ${(w[1] * RPS).toFixed(2)}, camel ${(w[2] * RPS).toFixed(2)} rev/s`);
  // Measured: an upright entered at 4.5 m/s, arms in, spins at 4.0 rev/s and is 3.15 a second later.
  assert.ok(up.omegaAt(0) * RPS > 3.8 && up.omegaAt(0) * RPS < 4.2, `upright entry ${(up.omegaAt(0) * RPS).toFixed(2)} rev/s`);
});

test("nothing adds angular momentum: pulling the arms in is what speeds a spin up", () => {
  const r = spin(4.5, 480, (t) => ({ carriage: t < 240 ? 1 : 0 }));
  assert.equal(r.lMonotone, true, "L only ever falls");
  assert.ok(r.omegaAt(2.5) > 2 * r.omegaAt(1.9), `${(r.omegaAt(1.9) * RPS).toFixed(2)} rev/s open, ${(r.omegaAt(2.5) * RPS).toFixed(2)} drawn in`);
});

test("a checked entry is a faster spin", () => {
  // Measured: 4.0 rev/s unchecked, 5.0 checked, half a second in.
  const plain = spin(4.5, 240), checked = spin(4.5, 240, () => ({}), 1);
  assert.ok(checked.omegaAt(0.5) > 1.3 * plain.omegaAt(0.5),
    `checked ${(checked.omegaAt(0.5) * RPS).toFixed(2)} against ${(plain.omegaAt(0.5) * RPS).toFixed(2)} rev/s`);
});

test("a held, opposing stick checks and reverses Sp.dir — data/spin-features.json's both_directions", () => {
  // This file's standard entry (lean 0.3 during the 240-tick carve) always
  // hooks +1 (anticlockwise): "the spinning blade is on the back edge..."
  // below confirms it directly. A few revolutions in sit, then the stick held
  // hard against +1, then released once the flip has room to run.
  const r = spin(4.5, 900, (t) => ({ knee: 0.7, lean: t < 150 ? 0 : t < 500 ? -1 : 0 }));
  assert.equal(r.s.spin.dir, -1, "held opposition past spinReverseStick must flip it");
  // Measured: about 2.3 s of held opposition to check a typical entry.
  assert.ok(r.s.moveDone.revolutions > 10, `${r.s.moveDone.revolutions.toFixed(1)} revolutions total: a real respin, not a stall`);
});

test("letting go of a check before it completes never flips: the threshold is a real gate", () => {
  const r = spin(4.5, 900, (t) => ({ knee: 0.7, lean: t < 150 ? 0 : t < 200 ? -1 : 0 }));
  assert.equal(r.s.spin.dir, 1, "released long before spinReverseFloor: the entry direction stands");
  assert.equal(r.ends.length, 1, "and the spin still ends normally when the button is released");
});

test("a light push against the direction, under spinReverseStick, costs nothing: it is not a check at all", () => {
  const held = spin(4.5, 480, () => ({ knee: 0.7, lean: -0.2 }));
  const bare = spin(4.5, 480, () => ({ knee: 0.7 }));
  assert.equal(held.s.spin.dir, 1);
  assert.ok(Math.abs(held.omegaAt(2) - bare.omegaAt(2)) < 1e-9, "under the stick threshold, `against` is clamped to 0");
});

test("a fresh toe press mid-spin starts a brief airborne change, landing on the other foot", () => {
  // data/spin-features.json's change_foot_by_jump: an entry, then one clean
  // foot change well clear of the exit.
  const r = spin(4.5, 900, (t) => ({ knee: 0.7, toe: t === 50 }));
  assert.equal(r.s.spin.foot, FOOT.Right, "one completed change toggles Sp.foot from its LFO entry (Left)");
  assert.ok(r.s.spin.changeCompletedTick > 0, "the change is recorded as completed, not still in progress");
  assert.ok(r.s.spin.changeAirTimeS >= 0.12, `air time ${r.s.spin.changeAirTimeS}s must clear the data's own floor`);
  assert.ok(r.s.spin.changeRevolutionsLost >= 0 && r.s.spin.changeRevolutionsLost <= 0.75,
    `revolutions lost ${r.s.spin.changeRevolutionsLost} must be small and non-negative`);
  assert.equal(r.s.spin.changePositionChanged, false, "the pose did not change across this particular hop");
  assert.ok(r.s.moveDone.revolutions > 5, "the spin continues and keeps sweeping after the change");
});

test("holding toe through the change does not chain a second one: only a fresh press starts it", () => {
  const r = spin(4.5, 900, (t) => ({ knee: 0.7, toe: t >= 50 }));
  assert.equal(r.s.spin.foot, FOOT.Right, "exactly one change from one fresh edge, however long toe stays held after");
});

test("during the airborne moment neither blade is on the ice, and angular momentum only pays the transfer cost once", () => {
  const p = moves();
  const s = createState(p, 4.5);
  let momentumAtTrigger = -1, sawUnloadedDuringChange = false, changed = false;
  for (let i = 0; i < 240 + 200; i++) {
    const t = i - 240;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, weight: 0, lean: i < 240 ? 0.3 : 0, knee: 0.7,
      toe: t === 40, spin: t >= 0 && t < 200,
    };
    const before = s.spin.angMomentum;
    step(s, input, p, SIM_DT, []);
    if (s.move === MOVE.Spin && t === 40) momentumAtTrigger = before;
    if (s.move === MOVE.Spin && s.spin.changingFoot) {
      sawUnloadedDuringChange = true;
      for (const b of s.blade) assert.equal(b.regime, REGIME.Unloaded, "neither blade is on the ice mid-change");
    }
    if (s.move === MOVE.Spin && s.spin.changeCompletedTick === s.tick) changed = true;
  }
  assert.ok(sawUnloadedDuringChange, "must actually have observed the airborne window");
  assert.ok(changed, "the change must have completed within the window this test ran");
  assert.ok(momentumAtTrigger > 0, "must have been mid-spin when toe was pressed");
});

test("releasing spin mid-air-change still ends it, exactly like releasing mid-check does", () => {
  // spin() only holds for a fixed number of ticks; release right after the
  // trigger, before spinFootChangeAirTime (about 22 ticks at 120 Hz) elapses.
  const r = spin(4.5, 55, (t) => ({ knee: 0.7, toe: t === 50 }));
  assert.equal(r.ends.length, 1, "the spin still ends, mid-hop or not");
  assert.equal(r.s.spin.changeCompletedTick, -1, "an interrupted change never completes");
});

test("the spinning blade is on the back edge the rotation curves, and letting go checks out backward", () => {
  const r = spin(4.5, 480);
  assert.deepEqual([...r.codes], ["LBI"], "anticlockwise on the left foot: back inside");
  assert.equal(r.ends.length, 1);
  assert.equal(codeToString(r.s.moveDone.toCode), "RBO");
  assert.ok(dot(r.s.vel, r.s.heading) < 0, "skating backward out of it");
  assert.equal(r.s.fallen, false, "and still up two seconds later");
  // Measured: 11.3 revolutions in four seconds, drifting 0.29 m.
  assert.ok(r.s.moveDone.revolutions > 10 && r.s.moveDone.revolutions < 13, `${r.s.moveDone.revolutions.toFixed(1)} revolutions`);
  assert.ok(r.s.moveDone.travel < 0.45, `drift ${r.s.moveDone.travel.toFixed(2)} m, inside data/spin-features.json's 0.45 m centering`);
});

test("a spin held until it runs out checks out by itself", () => {
  const r = spin(4.5, 12000, () => ({ carriage: 1 }));
  assert.equal(r.ends.length, 1);
  assert.ok(r.s.moveDone.tick > 0 && r.s.move === MOVE.None);
});

test("a combination: position changes change the speed, and two revolutions in a position put it on the record", () => {
  // camel 2 s (1.8 revolutions: not held), sit 2 s, upright 3.5 s. Measured bits: sit and upright.
  const r = spin(4.5, 900, (t) => (t < 240 ? { pitch: 0.9, carriage: 0.2 } : t < 480 ? { knee: 0.9, carriage: 0.3 } : {}));
  assert.ok(r.omegaAt(4.5) > 1.5 * r.omegaAt(3.5), "sit to upright speeds it up");
  const held = r.s.moveDone.positions;
  assert.equal(held & (1 << SPIN_POSITION.Camel), 0, "under two revolutions of camel does not count");
  assert.notEqual(held & (1 << SPIN_POSITION.Sit), 0);
  assert.notEqual(held & (1 << SPIN_POSITION.Upright), 0);
});

test("too slow to hook, no spin", () => {
  const r = spin(2.2, 240);
  assert.equal(r.ends.length, 0);
});

test("spins replay tick for tick", () => {
  const p = moves();
  const rec = new ReplayRecorder(p, 4.5);
  spin(4.5, 480, (t) => ({ knee: t > 200 ? 0.9 : 0.45, carriage: t < 100 ? 0.8 : 0.1 }), 1, rec);
  assert.equal(verifyReplay(parseReplay(rec.toJson())).divergence, null);
});
