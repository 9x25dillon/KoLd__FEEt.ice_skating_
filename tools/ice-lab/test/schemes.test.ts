// The three control schemes, measured.
//
// pre-production-plan.md §3 requires three that span the space, §7 requires
// they be labelled A/B/C to everyone including the observers, and §4 W8 puts a
// blind ranking of them in front of eight friendly externals. None of that is
// worth doing if one of the three quietly does not work — so each is asserted
// against the solver here, not just against its own arithmetic.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { codeToString } from "../sim/types.ts";
import { len, v2 } from "../sim/math.ts";
import { schemeA, schemeB, schemeC, newSchemeState } from "../app/schemes.ts";
import type { Controls } from "../app/pad.ts";

const D = 180 / Math.PI;
const p = PRESETS.responsive;

const sticks: Controls = {
  lx: 0, ly: 0, rx: 0, ry: 0, lean: 0, pitch: 0,
  kx: 0, ky: 0, kPrimaryX: 0, kAltX: 0,
  knee: 0.45, weight: 1, push: false, brake: false,
  carriage: 0, toe: false, turn: false, twizzle: false, spin: false,
  reset: false, pause: false, cyclePreset: false, cycleScheme: false, cycleJump: false, cycleView: false, zoom: 0, tilt: 0, toggleGame: false, cycleGhost: false, pickJump: -1, dpadStep: 0, cycleProfile: false,
  cycleMoves: false,
};

/** Hold a target heading with B for `secs`, reporting the error it settles to. */
function chaseWithB(targetDeg: number, secs = 14, weight = 1): { settle: number; fell: boolean } {
  const s = createState(p, 4.5, 0);
  const st = newSchemeState();
  const ev: never[] = [];
  const target = { x: Math.cos(targetDeg / D), y: Math.sin(targetDeg / D) };
  const late: number[] = [];
  for (let i = 0; i < secs * 120; i++) {
    const c = { ...sticks, lx: target.x, ly: target.y, weight, push: i % 90 === 0 };
    step(s, schemeB(c, s.heading, s.vel, s.yawRate, p, st), p, SIM_DT, ev);
    if (s.fallen) return { settle: 999, fell: true };
    if (i >= (secs - 3) * 120) {
      let err = Math.atan2(target.y, target.x) - Math.atan2(s.heading.y, s.heading.x);
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      late.push(Math.abs(err) * D);
    }
  }
  return { settle: late.reduce((a, b) => a + b, 0) / late.length, fell: false };
}

test("A · the left stick is the lean, and only the lean", () => {
  const right = schemeA({ ...sticks, lean: 0.8, pitch: 0.2 });
  assert.equal(right.lean, 0.8);
  assert.equal(right.pitch, 0.2);
  assert.equal(right.leanSplit, 0, "A never drives the two-foot axis");
  // The keyboard says the same thing by other means, and wins when held.
  assert.equal(schemeA({ ...sticks, lean: 0.8, kx: -1 }).lean, -1);
});

test("A and B · the right stick does nothing on the ice, because the bible reserves it", () => {
  // §2.1 gives the right stick to carriage, and A is under test as written:
  // three analog channels, not four. B is the one-stick fallback, and a rocker
  // or weight channel on its spare stick would hand it a piece of A and blur
  // the contrast the down-select needs.
  //
  // Carriage is now modelled, for jumps only: the stick reaches the solver as
  // `carriage` and nothing else, and nothing on the ice reads it. So the rule
  // is checked where it matters — the skater — with jumps off, as every preset
  // has them.
  const idle = { ...sticks, lean: 0.4, pitch: 0.1, weight: 0.5 };
  const pushed = { ...idle, rx: 0.9, ry: -0.8 };
  const { carriage: ca, ...a1 } = schemeA(pushed);
  const { carriage: ca0, ...a0 } = schemeA(idle);
  assert.deepEqual(a1, a0, "A maps the right stick to carriage and nothing else");
  assert.ok(ca > 0.99 && ca0 === 0);
  const st = newSchemeState();
  const { carriage: _b0, ...b0 } = schemeB({ ...idle, lx: 0, ly: 1 }, v2(1, 0), v2(5, 0), 0, p, st);
  const { carriage: _b1, ...b1 } = schemeB({ ...pushed, lx: 0, ly: 1 }, v2(1, 0), v2(5, 0), 0, p, st);
  assert.deepEqual(b1, b0, "B ignores it too, apart from carriage");
  assert.equal(b0.pitch, 0, "and B has no rocker on the pad at all");

  assert.equal(p.jumpMode, 0, "every preset skates with jumps off");
  const still = createState(p, 5, 0), moved = createState(p, 5, 0);
  for (let i = 0; i < 240; i++) {
    const c = { ...idle, knee: i % 60 < 30 ? 0.95 : 0.1, push: i % 90 === 0 };
    step(still, schemeA(c), p, SIM_DT, []);
    step(moved, schemeA({ ...c, rx: 0.9, ry: -0.8 }), p, SIM_DT, []);
  }
  assert.deepEqual(moved, still, "with jumps off the right stick cannot move the skater");
});

test("B · steers to the heading it was pointed at, from 45 to 170 degrees", () => {
  // Measured, one-footed: about a degree of standing error at every target.
  for (const target of [45, 90, 135, -120]) {
    const r = chaseWithB(target);
    assert.ok(!r.fell, `${target} deg must not put the skater down`);
    assert.ok(r.settle < 4, `${target} deg should settle within a few degrees, got ${r.settle.toFixed(1)}`);
  }
});

test("B · a near-reversal picks a side instead of chattering on the antipode", () => {
  // Without the commit rule the heading error flips sign every tick as it
  // crosses 180, and the skater parks facing exactly backwards with the
  // controller technically satisfied. Measured at 170 degrees of error.
  const r = chaseWithB(170);
  assert.ok(!r.fell, "a reversal must not be fatal");
  assert.ok(r.settle < 4, `a 170 degree turn should still arrive: ${r.settle.toFixed(1)} deg`);
});

test("B · asks for nothing at a standstill, and never more than the blade holds", () => {
  const still = schemeB({ ...sticks, lx: 0, ly: 1 }, v2(1, 0), v2(0, 0), 0, p, newSchemeState());
  assert.equal(still.lean, 0, "there is no edge to lean on at zero speed");

  // The ceiling is atan(v^2 sin(maxTilt) / rho / g); B is allowed 75% of it.
  for (const speed of [2, 4, 6, 9]) {
    const hard = schemeB({ ...sticks, lx: 0, ly: 1 }, v2(1, 0), v2(speed, 0), 0, p, newSchemeState());
    const ceiling = Math.atan2(speed * speed * Math.sin(p.maxTilt) / p.rocker, p.gravity);
    assert.ok(Math.abs(hard.lean * p.maxLean) <= 0.76 * ceiling + 1e-9,
      `at ${speed} m/s B asked for ${(hard.lean * p.maxLean * D).toFixed(1)} deg `
      + `against a ceiling of ${(ceiling * D).toFixed(1)}`);
  }
});

test("B · commits to a foot as the edge deepens, because two-footed it cannot steer", () => {
  // Two-footed the same chase settles 12 degrees off and falls on big turns:
  // you cannot hold a deep edge with both feet down, which is why skaters lift
  // one. The assist does it for the player rather than pretending otherwise.
  const deep = schemeB({ ...sticks, lx: 0, ly: 1, weight: 0.5 }, v2(1, 0), v2(6, 0), 0, p, newSchemeState());
  assert.ok(deep.weight > 0.9 || deep.weight < 0.1,
    `a deep turn should be on one foot, got weight ${deep.weight.toFixed(2)}`);
  const gentle = schemeB({ ...sticks, lx: 1, ly: 0.02, weight: 0.5 }, v2(1, 0), v2(4, 0), 0, p, newSchemeState());
  assert.ok(Math.abs(gentle.weight - 0.5) < 0.2,
    `a gentle one should stay flat-footed, got ${gentle.weight.toFixed(2)}`);
});

test("C · the two sticks are the mean and the difference of the blades", () => {
  const both = schemeC({ ...sticks, lx: -1, rx: -1 });
  assert.equal(both.lean, -1);
  assert.equal(both.leanSplit, 0, "pushed the same way is a lean and nothing else");

  const apart = schemeC({ ...sticks, lx: -1, rx: 1 });
  assert.equal(apart.lean, 0);
  assert.equal(apart.leanSplit, 1, "pushed apart is pure split");

  const one = schemeC({ ...sticks, lx: -1, rx: 0 });
  assert.equal(one.lean, -0.5);
  assert.equal(one.leanSplit, 0.5, "one blade alone is half a lean and half a split");
});

test("C · fore/aft on either stick is the rocker, and the solver gets their mean", () => {
  // Each stick is a blade, so each stick's fore/aft is where that blade's
  // contact sits. The solver carries one contact point, so it gets the mean —
  // the same rule the sideways axes follow.
  assert.equal(schemeC({ ...sticks, ly: 1, ry: 1 }).pitch, 1, "both forward is full toe");
  assert.equal(schemeC({ ...sticks, ly: 1, ry: 0 }).pitch, 0.5, "one forward is half");
  assert.equal(schemeC({ ...sticks, ly: 1, ry: -1 }).pitch, 0, "opposed cancels: there is no pitch split");
  assert.equal(schemeC({ ...sticks, ly: 1, ry: 1, ky: -1 }).pitch, -1, "the keyboard wins when held");

  // A sideways push on a blade is an edge and nothing else — the same relief
  // A's left stick gets, or holding a curve walks the contact point.
  for (const y of [0.05, 0.1, 0.2, 0.3]) {
    const bled = schemeC({ ...sticks, lx: 0.9, ly: y, rx: 0.9, ry: y });
    assert.equal(bled.pitch, 0, `${y} of stray fore/aft on a sideways push must not reach the rocker`);
    assert.equal(bled.lean, 0.9, "while the edge survives it");
  }
  assert.ok(schemeC({ ...sticks, lx: 0.7, ly: 0.7, rx: 0.7, ry: 0.7 }).pitch > 0.3,
    "a deliberate diagonal still pitches");
});

test("C · actually puts the two blades on separate edges", () => {
  // The point of the scheme, and the thing leanSplit was added to the solver
  // for. Measured: both blades on their inside edges, 20 degrees apart, which
  // is the shape a crossover and a spread eagle are made of.
  const s = createState(p, 4.0, 0);
  const ev: never[] = [];
  for (let i = 0; i < 240; i++) step(s, schemeC({ ...sticks, lx: -1, rx: 1, weight: 0.5 }), p, SIM_DT, ev);
  assert.ok(!s.fallen, "standing on two opposed edges is not a fall");
  assert.equal(codeToString(s.blade[0].code), "LFI");
  assert.equal(codeToString(s.blade[1].code), "RFI");
  assert.ok(s.blade[0].tilt < -0.3 && s.blade[1].tilt > 0.3,
    `the blades must actually be apart: ${(s.blade[0].tilt * D).toFixed(1)} / ${(s.blade[1].tilt * D).toFixed(1)}`);
  assert.ok(len(s.vel) > 0.5, "and still moving");
});
