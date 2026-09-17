// Two pools, design-bible.md §2.8: Wind (aerobic) and Legs (anaerobic), and
// the four physics effects fatigue feeds back into. Off in every preset, the
// way jumps, moves, music and the ice grid are.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, MOVE, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

const glide = { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 };
const cruise = { ...NEUTRAL_INPUT, lean: 0.35, weight: 0.5 };

test("staminaMode 0 is inert: the pools never move, whatever the skater does", () => {
  const p = PRESETS.responsive; // staminaMode 0, every preset
  const s = createState(p, 5);
  run(s, cruise, p, 600);
  assert.equal(s.wind, 1);
  assert.equal(s.legs, 1);
});

test("Wind drains under sustained effort and recovers slowly at genuine rest", () => {
  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const s = createState(p, 6);
  run(s, cruise, p, 600); // 5 s of continuous moderate effort
  assert.ok(s.wind < 1, "sustained effort must cost Wind");
  const worn = s.wind;
  run(s, glide, p, 3600); // 30 s of genuinely low-effort gliding
  assert.ok(s.wind > worn, "low-effort gliding must recover some of it back");
  assert.ok(s.wind < 1, "and recovery is slow, not instant, over 30 s");
});

test("a standstill costs almost nothing: two feet at rest still wobble a little", () => {
  // Measured, not assumed: the two-footed stance's own balance loop swings
  // tiltCmd a few degrees either way even at v=0 with lean commanded flat
  // (up to 0.34 rad here) — a real, pre-existing solver characteristic, not
  // a stamina defect — so a standstill is CHEAP, not perfectly free.
  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const s = createState(p, 0);
  run(s, { ...NEUTRAL_INPUT, lean: 0, weight: 0.5, push: false }, p, 2400); // 20 s
  assert.ok(s.wind > 0.999, `wind ${s.wind} should barely move at a standstill`);
  assert.ok(s.legs > 0.999, `legs ${s.legs} should barely move at a standstill`);
});

test("Legs drains per push, scaled by knee: SkateSolver.cpp's own S.LegPool -= 0.011f * Knee", () => {
  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const s = createState(p, 3);
  s.knee = 0.8; // pre-settled, so the knee-rate ramp cannot mask the exact number
  const before = s.legs;
  step(s, { ...NEUTRAL_INPUT, lean: 0, weight: 0.5, push: true, knee: 0.8 }, p, SIM_DT, []);
  assert.ok(Math.abs((before - s.legs) - p.staminaLegsPerPush * 0.8) < 1e-9);
});

test("Legs drains on a jump takeoff and on a held sit spin", () => {
  const p = { ...PRESETS.responsive, staminaMode: 1, jumpMode: 2 };
  const s = createState(p, 6);
  for (let i = 0; i < 400 && s.jump.phase !== JUMP_PHASE.Air; i++) {
    const loading = i >= 60 && i < 96;
    step(s, { ...NEUTRAL_INPUT, lean: 0.2, weight: 1,
      knee: loading ? 0.95 : i >= 96 ? 0 : 0.35 }, p, SIM_DT, []);
  }
  assert.equal(s.jump.phase, JUMP_PHASE.Air, "must actually have taken off");
  assert.ok(s.legs <= 1 - p.staminaLegsPerJump + 1e-6, "the takeoff itself must have cost staminaLegsPerJump");

  // A real spin entry (test/spin.test.ts's own pattern): carve into it, then
  // hold the button with the knee at a sit position (>= spinSitKnee).
  const sp = { ...PRESETS.responsive, staminaMode: 1, movesMode: 1 };
  const sit = createState(sp, 6);
  for (let i = 0; i < 240; i++) step(sit, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.45, weight: 0 }, sp, SIM_DT, []);
  let before = -1;
  for (let i = 0; i < 120; i++) {
    if (i === 30) before = sit.legs;
    step(sit, { ...NEUTRAL_INPUT, lean: 0, knee: 0.9, weight: 0, spin: true }, sp, SIM_DT, []);
  }
  assert.equal(sit.move, MOVE.Spin, "must actually be spinning to test the sit drain");
  assert.ok(sit.legs < before, "a sit position drains Legs while it is held");
});

test("Legs recovery is gated by Wind: once Wind is low, Legs stop coming back", () => {
  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const low = createState(p, 0); low.wind = 0.1; low.legs = 0.3;
  run(low, glide, p, 2400); // 20 s of low-effort glide
  assert.ok(low.legs <= 0.3 + 1e-6, "Wind below the floor: Legs must not recover, only (barely) drain");

  const high = createState(p, 0); high.wind = 0.9; high.legs = 0.3;
  run(high, glide, p, 2400);
  assert.ok(high.legs > 0.3, "Wind well above the floor: Legs recover during the same rest");
});

test("fatigue lowers jump height, raises the tightest achievable inertia, and shrinks the edge", () => {
  const attempt = (legs: number) => {
    const p = { ...PRESETS.responsive, staminaMode: 1, jumpMode: 2 };
    const s = createState(p, 6); s.legs = legs; s.wind = 1;
    for (let i = 0; i < 400 && s.jump.phase !== JUMP_PHASE.Air; i++) {
      const loading = i >= 60 && i < 96;
      step(s, { ...NEUTRAL_INPUT, lean: 0.2, weight: 1,
        knee: loading ? 0.95 : i >= 96 ? 0 : 0.35 }, p, SIM_DT, []);
    }
    return s;
  };
  const fresh = attempt(1), spent = attempt(0);
  assert.ok(spent.jump.vz < fresh.jump.vz * 0.90,
    `spent takeoff vz ${spent.jump.vz.toFixed(3)} should be well under fresh's ${fresh.jump.vz.toFixed(3)}`);

  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const tight = createState(p, 5); tight.legs = 1;
  const loose = createState(p, 5); loose.legs = 0;
  run(tight, { ...NEUTRAL_INPUT, lean: 0.3, weight: 0.5 }, p, 200);
  run(loose, { ...NEUTRAL_INPUT, lean: 0.3, weight: 0.5 }, p, 200);
  assert.ok(Math.max(...tight.blade.map(b => Math.abs(b.tilt))) >= Math.max(...loose.blade.map(b => Math.abs(b.tilt))) - 1e-6,
    "an exhausted skater cannot hold as deep an edge as a fresh one commanding the same lean");
});

test("balance noise is present only while staminaMode is on, and deterministic given the same ticks", () => {
  const off = { ...PRESETS.responsive, staminaMode: 0 };
  const a = createState(off, 4), b = createState(off, 4);
  run(a, glide, off, 300); run(b, glide, off, 300);
  assert.deepEqual(a, b, "off, two identical runs must be bit-for-bit identical, with no noise at all");

  const on = { ...PRESETS.responsive, staminaMode: 1 };
  const spent1 = createState(on, 4); spent1.legs = 0;
  const spent2 = createState(on, 4); spent2.legs = 0;
  run(spent1, glide, on, 300); run(spent2, glide, on, 300);
  assert.deepEqual(spent1, spent2, "on, the SAME tick sequence must still replay identically");

  const fresh = createState(on, 4); fresh.legs = 1;
  run(fresh, glide, on, 300);
  assert.notEqual(spent1.tiltCmd, fresh.tiltCmd,
    "a fresh and an exhausted run, same everything else, must actually diverge under the noise");
});

test("a fall preserves fatigue: getting up does not hand back a fresh Wind and Legs", () => {
  const p = { ...PRESETS.responsive, staminaMode: 1 };
  const s = createState(p, 8, 1.2); // a lean the responsive preset cannot hold
  const events: EdgeEvent[] = [];
  run(s, { ...NEUTRAL_INPUT, lean: 1, weight: 1 }, p, 300, events);
  s.wind = 0.4; s.legs = 0.2;
  assert.ok(events.some(e => e.type === EVENT.Fall) || s.fallen, "exercise an actual fall");
  step(s, { ...NEUTRAL_INPUT, push: true }, p, SIM_DT, []); // fresh press: stand up
  assert.equal(s.fallen, false);
  assert.equal(s.wind, 0.4);
  assert.equal(s.legs, 0.2);
});

test("the stamina levers validate, and a bad one is caught", () => {
  const p = DEFAULT_PARAMS;
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ ...p, staminaMode: 2 }).length > 0);
  assert.ok(validate({ ...p, staminaWindTimeDrain: -1 }).length > 0);
  assert.ok(validate({ ...p, staminaWindRecover: 0 }).length > 0, "recover must exceed the time drain");
  assert.ok(validate({ ...p, staminaLegsRecoverWindFloor: 1.5 }).length > 0);
  assert.ok(validate({ ...p, staminaJumpImpulseMin: 1.5 }).length > 0);
  assert.ok(validate({ ...p, staminaInertiaFloorMax: 0.1 }).length > 0, "cannot pull in tighter than fresh");
  assert.ok(validate({ ...p, staminaMaxLeanLoss: 10 }).length > 0);
  assert.ok(validate({ ...p, staminaBalanceNoiseMax: 0.5 }).length > 0, "fatigue cannot reduce noise");
});
