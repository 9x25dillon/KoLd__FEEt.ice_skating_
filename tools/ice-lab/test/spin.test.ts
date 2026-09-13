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
import { NEUTRAL_INPUT, EVENT, MOVE, SPIN_POSITION, codeToString } from "../sim/types.ts";
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
