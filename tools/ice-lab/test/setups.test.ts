import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SETUPS, setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { latchTurns, newSchemeState, SCHEME } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT, validate } from "../sim/params.ts";
import { FALL, MOVE, NEUTRAL_INPUT, TURN_KIND } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { beatOffset } from "../sim/music.ts";
import { IceGrid } from "../sim/ice.ts";

function rig(setup: Setup, speed = 6.8, assist = 0.75) {
  const p = setupParams(setup, assist), s = createState(p, speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  h.buttons[7] = 0.38;
  const rec = new ReplayRecorder(p, speed);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const map = (autoPush = false) => setupInput({ hardware: h, autoPush } as Controls, s, setup, st, p, profile, assist);
  const tick = () => { const result = map(); const events: Parameters<typeof step>[4] = []; step(s, result.input, p, SIM_DT, events, ice); rec.capture(result.input, p, s, events, "D"); return result; };
  const skate = (ticks: number) => { for (let i = 0; i < ticks; i++) tick(); };
  return { p, s, h, st, profile, map, tick, skate, rec };
}

test("setup assistance remains bounded and preserves the blade and jump mechanics", () => {
  for (const { id } of SETUPS) for (const assist of [0.5, 0.75, 1]) assert.deepEqual(validate(setupParams(id, assist)), []);
  const sim = setupParams("simulation"), mid = setupParams("explorer", 0.5), high = setupParams("explorer", 1);
  assert.ok(sim.internalMax < mid.internalMax && mid.internalMax < high.internalMax);
  assert.ok(sim.controlLatency > mid.controlLatency && mid.controlLatency > high.controlLatency);
  assert.equal(sim.jumpAssist, 0); assert.equal(mid.jumpAssist, 0); assert.equal(sim.hypeMode, 0);
  for (const key of ["rocker", "muGlide", "sharpness", "jumpImpulse", "landingShock"] as const) assert.equal(sim[key], high[key], key);
  for (const bad of [0, 1.1, NaN]) assert.throws(() => setupParams("explorer", bad));
});

test("simulation independently controls blades and reaches arms without disturbing the held blade", () => {
  const r = rig("simulation"); r.h.axes = [-0.7, 0, 0.5, 0];
  const before = r.map().input;
  assert.ok(before.leanSplit > 0); assert.equal(before.carriage, 0); assert.equal(before.windup, 0);
  r.h.buttons[10] = 1; r.h.axes[2] = 1;
  const arms = r.map().input;
  assert.equal(arms.lean, before.lean); assert.equal(arms.leanSplit, before.leanSplit);
  assert.equal(arms.carriage, 1); assert.equal(arms.windup, 1);
  r.h.buttons[10] = 0; const after = r.map().input;
  assert.notEqual(after.leanSplit, before.leanSplit); assert.equal(after.carriage, 0);
});

test("simulation needs a fresh push and never accepts Cruise pulses", () => {
  const r = rig("simulation"); r.h.buttons[0] = 1;
  assert.equal(r.map().input.push, true);
  r.s.tick = 90; assert.equal(r.map(true).input.push, false);
  r.h.buttons[0] = 0; assert.equal(r.map(true).input.push, false);
  r.h.buttons[0] = 1; assert.equal(r.map().input.push, true);
});

test("Explorer assistance reduces deep lean demand at low speed without choosing the foot or pressure", () => {
  const mid = rig("explorer", 2, 0.5), high = rig("explorer", 2, 1);
  for (const r of [mid, high]) { r.h.axes = [0.9, -0.7, 0, 0]; r.h.buttons[4] = 1; }
  const a = mid.map().input, b = high.map().input;
  assert.ok(b.lean > 0 && b.lean < a.lean); assert.equal(b.weight, 0); assert.equal(b.pitch, a.pitch); assert.ok(b.pitch > 0);
  high.h.axes[0] *= -1; assert.ok(high.map().input.lean < 0);
  const stopped = rig("explorer", 0, 1); stopped.h.axes[0] = 1; assert.equal(stopped.map().input.lean, 0);
});

for (const { id } of SETUPS) test(`${id}: load/release and replay use the actual solver`, () => {
  const r = rig(id); r.skate(30); r.h.buttons[7] = 0.95; r.skate(36);
  assert.equal(r.s.jump.phase, JUMP_PHASE.Load);
  r.h.buttons[7] = 0; r.tick(); assert.equal(r.s.jump.phase, JUMP_PHASE.Air);
  r.skate(15); assert.ok(r.s.jump.z > 0);
  assert.equal(verifyReplay(parseReplay(r.rec.toJson())).divergence, null);
});

for (const id of ["simulation", "explorer"] as const) test(`${id}: manual turn release chooses three-turn, holding chooses loop`, () => {
  for (const held of [false, true]) {
    const r = rig(id); r.h.axes[0] = -0.5; if (id === "simulation") r.h.axes[2] = -0.5;
    r.skate(240); r.h.buttons[1] = 1; r.tick(); assert.equal(r.s.move, MOVE.Turn);
    if (!held) r.h.buttons[1] = 0;
    r.skate(100); assert.equal(r.s.moveDone.detail, held ? TURN_KIND.Loop : TURN_KIND.ThreeTurn);
    assert.equal(r.s.fallen, false);
  }
});

test("per-blade latch: a cusp mirrors each blade's stick, and each lets go on its own", () => {
  const st = newSchemeState();
  const blades = (left: number, right: number, flips: number) => {
    const it = latchTurns(SCHEME.A, { ...NEUTRAL_INPUT, lean: (left + right) / 2, leanSplit: (right - left) / 2 }, st, flips, true);
    return [it.lean - it.leanSplit, it.lean + it.leanSplit].map(v => Math.round(v * 1e12) / 1e12);
  };
  assert.deepEqual(blades(0.6, 0.4, 0), [0.6, 0.4]);
  assert.deepEqual(blades(0.6, 0.4, 1), [-0.6, -0.4], "the cusp mirrors both held blades");
  assert.deepEqual(blades(0.6, 0.05, 1), [-0.6, 0.05], "the right stick lets go of its mirror alone");
  assert.deepEqual(blades(0.6, -0.5, 1), [-0.6, -0.5], "the right's next edge is the new frame's; the left still holds its side");
  assert.deepEqual(blades(0, -0.5, 1), [0, -0.5]);
  assert.deepEqual(blades(0.6, -0.5, 1), [0.6, -0.5], "and the left, let go, reads the new frame too");
  assert.equal(st.mirror, false);
  // The shared latch is unchanged: one stick let go does not end the other's mirror.
  const shared = newSchemeState(), it = (lean: number, leanSplit: number) => ({ ...NEUTRAL_INPUT, lean, leanSplit });
  latchTurns(SCHEME.A, it(0.5, 0.1), shared, 1);
  assert.equal(latchTurns(SCHEME.A, it(0.3, -0.3), shared, 1).lean, -0.3, "shared: left held, right released, both still mirrored");
});

test("simulation: holding the left blade through a turn keeps its edge while the right re-chooses", () => {
  const r = rig("simulation"); r.h.axes = [-0.6, 0, -0.6, 0];
  const before = r.map().input;
  assert.ok(before.lean < 0 && before.leanSplit === 0);
  r.s.flips++; // a cusp
  const cusp = r.map().input;
  assert.equal(cusp.lean, -before.lean, "both held blades mirrored at the cusp");
  r.h.axes[2] = 0; r.map();
  r.h.axes[2] = 0.6;
  const after = r.map().input;
  assert.ok(Math.abs(after.lean + before.lean) < 1e-12 && Math.abs(after.leanSplit) < 1e-12,
    "left still mirrored, right pushed the other way in the new frame: the same edges on both blades");
});

test("simulation: each stick's fore–aft is its own blade's heel/toe; the other setups share one", () => {
  const r = rig("simulation"); r.h.axes = [0, 0, 0, -0.9]; // right stick forward (y is inverted)
  const toe = r.map().input;
  assert.ok(toe.pitchSplit! > 0 && Math.abs(toe.pitch - toe.pitchSplit!) < 1e-12, "left blade flat, right on its toe");
  r.h.axes = [0, 0.9, 0, 0]; // left stick back
  const heel = r.map().input;
  assert.ok(heel.pitchSplit! > 0 && Math.abs(heel.pitch + heel.pitchSplit!) < 1e-12, "left blade on its heel, right flat");
  r.h.keys = ["w"];
  assert.equal(r.map().input.pitchSplit, 0, "the keyboard's W/S stays shared");
  for (const id of ["explorer", "repertoire"] as const) {
    const o = rig(id); o.h.axes = [0, -0.9, 0, 0];
    assert.equal(o.map().input.pitchSplit, undefined, `${id} never drives the split`);
  }
});

test("simulation: LT and RT are the left and right knees; stops come from the blades, the keyboard's X still brakes", () => {
  const r = rig("simulation"); r.h.buttons[6] = 0.9; r.h.buttons[7] = 0;
  const left = r.map().input;
  const lt = (0.9 - r.profile.triggerDeadzone) / (1 - r.profile.triggerDeadzone);
  assert.ok(left.kneeSplit! < 0 && Math.abs(left.knee - left.kneeSplit! - lt) < 1e-12, "left knee from LT");
  assert.ok(Math.abs(left.knee + left.kneeSplit!) < 1e-12, "right leg straight");
  assert.equal(left.brake, false, "LT is no longer the brake here");
  r.h.buttons[6] = 0; r.h.buttons[12] = 1;
  assert.equal(r.map().input.brake, false, "D-pad up is the feet's now");
  r.h.buttons[12] = 0; r.h.keys = ["x"];
  assert.equal(r.map().input.brake, true);
  const other = rig("explorer"); other.h.buttons[6] = 0.9;
  const o = other.map().input;
  assert.equal(o.brake, true, "the other setups keep LT as the brake");
  assert.equal(o.kneeSplit, undefined);
});

// ── stages B/C by setup, and the feet on the pad ────────────────────────────

test("the new physics by setup: Simulation everything, Explorer parallel blades, Repertoire unchanged", () => {
  const sim = setupParams("simulation"), exp = setupParams("explorer"), rep = setupParams("repertoire");
  assert.deepEqual([sim.slipMode, sim.torqueMode, sim.footMode], [1, 1, 1]);
  assert.deepEqual([exp.slipMode, exp.torqueMode, exp.footMode], [1, 1, 0]);
  assert.deepEqual([rep.slipMode, rep.torqueMode, rep.footMode], [0, 0, 0]);
  for (const id of ["explorer", "repertoire"] as const) assert.equal(rig(id).map().input.toeOut, undefined, `${id} has no feet`);
});

const withFeet = (feet: "dpad" | "stickY" | "modifier") => { const r = rig("simulation"); r.profile.feet = feet; return r; };

test("feet, D-pad layout: left/right turn both feet and they stay; with the modifier, toes in/out; up straightens", () => {
  const r = withFeet("dpad");
  r.h.buttons[14] = 1; for (let i = 0; i < 60; i++) r.map();   // half a second of D-pad left
  r.h.buttons[14] = 0;
  const turned = r.map().input;
  assert.ok(Math.abs(turned.toeOutSplit! + 0.75) < 1e-9 && turned.toeOut === 0, `both feet anticlockwise (${turned.toeOutSplit})`);
  assert.equal(r.map().input.toeOutSplit, turned.toeOutSplit, "and they stay where they were left");
  r.h.buttons[10] = 1; r.h.buttons[15] = 1; for (let i = 0; i < 120; i++) r.map();
  r.h.buttons[10] = 0; r.h.buttons[15] = 0;
  assert.equal(r.map().input.toeOut, 1, "modifier + right: toes out, to the end of the turnout");
  r.h.buttons[12] = 1;
  const straight = r.map().input;
  assert.deepEqual([straight.toeOut, straight.toeOutSplit], [0, 0], "up straightens");
});

test("feet, stick layout: each stick's up/down turns its own foot; heel/toe moves under the modifier", () => {
  const r = withFeet("stickY"); r.h.axes = [0, -1, 0, 1];   // left stick up, right stick down
  const it = r.map().input;
  assert.ok(it.toeOut! - it.toeOutSplit! > 0.9 && it.toeOut! + it.toeOutSplit! < -0.9, "left toe out, right toe in");
  assert.equal(it.pitch, 0, "no heel/toe from the sticks");
  r.h.buttons[10] = 1;
  const mod = r.map().input;
  assert.ok(mod.pitch > 0.9, "modifier: the left stick's up is the toe");
  assert.ok(Math.abs(mod.toeOut! - it.toeOut!) < 1e-9 && Math.abs(mod.toeOutSplit! - it.toeOutSplit!) < 1e-9, "and the feet hold");
});

test("feet, modifier layout: hold the modifier and the left stick nudges the feet while the left blade keeps its edge", () => {
  const r = withFeet("modifier"); r.h.axes = [-0.8, 0, 0, 0];
  const edge = r.map().input.lean;
  r.h.buttons[10] = 1; r.h.axes = [1, 0, 0, 0];
  for (let i = 0; i < 30; i++) r.map();
  const held = r.map().input;
  assert.equal(held.lean, edge, "left blade's last edge held");
  assert.ok(held.toeOutSplit! > 0.3, `feet turned clockwise (${held.toeOutSplit!.toFixed(2)})`);
  r.h.buttons[10] = 0; r.h.axes = [0, 0, 0, 0];
  assert.equal(r.map().input.toeOutSplit, held.toeOutSplit, "let go: the feet stay, the stick is the edge again");
});

test("a snowplow played on the pad in Simulation: both bumpers, modifier + D-pad left toes in, then the sticks set the edges", () => {
  // MEASURED from 5 m/s (right trigger 0.5): both bumpers share the weight;
  // modifier + D-pad left for 1 s toes both feet in (34°, hipInternal); then
  // the thumbs set the edges over 0.15 s. Sticks pushed apart — each blade on
  // its inside edge, in the model's frame — 2.79 m/s after 3 s; sticks
  // centred, 4.25. Pushed toward each other the blades sit on their outside
  // edges, which catch: the stop is sudden and the fore-aft pendulum pitches
  // the skater forward, down at tick 176 (171 with the ankle alone), at 2.8 m/s. Slammed on in one tick
  // the inside-edge snowplow holds too (2.72). With the toe-pick trip on
  // (the morning of 2026-09-24, off since — the operator: it made pumping
  // useless) the slam and the catch tripped on the pick; with pitchMode 0 a
  // catch is a dead stop, upright.
  const plow = (lx: number, rx: number, ramp = 18) => {
    const r = rig("simulation", 5); r.h.buttons[7] = 0.5;
    for (let i = 0; i < 360 && !r.s.fallen; i++) {
      r.h.buttons[4] = r.h.buttons[5] = i < 2 ? 1 : 0;
      r.h.buttons[10] = r.h.buttons[14] = i < 120 ? 1 : 0;
      const k = i < 120 ? 0 : Math.min(1, (i - 119) / ramp);
      r.h.axes = [lx * k, 0, rx * k, 0];
      r.tick();
    }
    return r.s;
  };
  const inside = plow(-1, 1), flat = plow(0, 0), caught = plow(1, -1), slammed = plow(-1, 1, 1);
  for (const s of [inside, flat]) assert.equal(s.fallen, false);
  assert.deepEqual(inside.footAngle!.map(a => Math.round(a * 180 / Math.PI)), [-34, -34], "both toes in");
  const v = (s: typeof inside) => Math.hypot(s.vel.x, s.vel.y);
  assert.ok(Math.abs(v(inside) - 2.79) < 0.05 && Math.abs(v(flat) - 4.25) < 0.05, `inside ${v(inside).toFixed(2)}, flat ${v(flat).toFixed(2)}`);
  assert.equal(caught.fallReason, FALL.Pitched, "caught edges pitch the skater forward");
  assert.equal(caught.tick, 176);
  assert.equal(slammed.fallen, false, "slammed on, it holds");
  assert.ok(Math.abs(v(slammed) - 2.72) < 0.05, `slammed ${v(slammed).toFixed(2)}`);
});

test("rocking back on the pad in Simulation: both sticks to the heel, yanked or eased, and the skater stays up", () => {
  // MEASURED at 5 m/s. To lean the body back the ankle first drives the
  // contact toward the toe; with the toe-pick trip on (the morning of
  // 2026-09-24) a yank put it on the pick. Off, every rock-back holds.
  const rock = (depth: number, ramp: number) => {
    const r = rig("simulation", 5); r.h.buttons[7] = 0.5;
    for (let i = 0; i < 240 && !r.s.fallen; i++) {
      r.h.buttons[4] = r.h.buttons[5] = i < 2 ? 1 : 0;
      const k = i < 60 ? 0 : Math.min(1, (i - 59) / ramp) * depth;
      r.h.axes = [0, k, 0, k];
      r.tick();
    }
    return r.s;
  };
  for (const [depth, ramp] of [[1, 1], [1, 12], [1, 24], [0.8, 1]]) assert.equal(rock(depth, ramp).fallen, false, `${depth} over ${ramp} ticks`);
});

test("from a standstill, A pushes from the standing leg and the weight goes across — every push counts, and the knee makes it stronger", () => {
  // MEASURED from 0 m/s, A every 0.5 s for 4 s (the operator, 2026-09-24:
  // "i cant seem to gain any momentum from a standing position"). Before, the
  // weight stayed where the bumpers left it while the pushes alternated feet:
  // every other push came off an unloaded blade and the skater fell (0.44
  // m/s, down at 2 s in Simulation and Explorer). Now, knees straight: 1.09
  // m/s at 4 s (Repertoire 1.12); knees at 0.65: 2.53 (2.54); pushes
  // alternating right, left…; standing; never a jump.
  for (const setup of ["simulation", "explorer", "repertoire"] as const) for (const [knee, at4] of [[0, setup === "repertoire" ? 1.121 : setup === "explorer" ? 1.089 : 1.094], [0.65, setup === "simulation" ? 2.53 : 2.54]] as const) {
    const r = rig(setup, 0); const feet: string[] = [];
    for (let i = 0; i < 480 && !r.s.fallen; i++) {
      r.h.buttons.fill(0); r.h.axes = [0, 0, 0, 0]; r.h.buttons[7] = knee; if (setup === "simulation") r.h.buttons[6] = knee;
      if (i % 60 < 3) r.h.buttons[0] = 1;
      const { input } = r.tick(); if (input.push && input.pushFoot !== undefined) feet.push(String(input.pushFoot));
    }
    const v = Math.hypot(r.s.vel.x, r.s.vel.y);
    assert.equal(r.s.fallen, false, `${setup}, knee ${knee}`);
    assert.equal(r.s.jump.phase, JUMP_PHASE.None);
    assert.equal(feet.join(""), "10101010", `${setup}: pushes alternate feet`);
    assert.ok(Math.abs(v - at4) < 0.02, `${setup}, knee ${knee}: ${v.toFixed(3)} m/s at 4 s`);
  }
});

// ── Experimental: the legs on the triggers, pumps and thumb strokes ─────────

/** From 3 m/s, weight shared (X + B), the pad driven by `plan` each tick from rest. */
function experiment(plan: (i: number, h: ControllerHardware) => void, ticks = 120) {
  const r = rig("experimental", 3);
  const pushes: string[] = [], inputs: ReturnType<typeof r.tick>["input"][] = [];
  let took = false;
  for (let i = 0; i < ticks && !r.s.fallen; i++) {
    r.h.buttons.fill(0); r.h.axes = [0, 0, 0, 0];
    if (i < 2) r.h.buttons[1] = r.h.buttons[2] = 1;
    plan(i, r.h);
    const before = r.s.jump.phase, { input } = r.tick();
    inputs.push(input);
    if (input.push) pushes.push(`${input.pushFoot}@${input.pushPower!.toFixed(2)}`);
    if (before !== JUMP_PHASE.Air && r.s.jump.phase === JUMP_PHASE.Air) took = true;
  }
  return { v: Math.hypot(r.s.vel.x, r.s.vel.y), pushes, took, fallen: r.s.fallen, reason: r.s.fallReason, inputs, st: r.st };
}
const near = (x: number, y: number) => Math.abs(x - y) < 0.005;

test("experimental: a pump pushes by how deep and how quick; the leg extends from its bend", () => {
  // MEASURED from 3 m/s after 1 s: glide 2.891; a full bend snapped straight
  // 3.175 (push 1.00); 0.65 let down slowly, 2.931 (0.24).
  const glide = experiment(() => {});
  const deep = experiment((i, h) => { h.buttons[7] = i >= 10 && i < 20 ? 1 : 0; });
  const lazy = experiment((i, h) => { h.buttons[7] = i >= 10 && i < 20 ? 0.65 : i >= 20 && i < 40 ? 0.4 : 0; });
  assert.deepEqual([deep.pushes, lazy.pushes], [["1@1.00"], ["1@0.24"]]);
  assert.ok(near(glide.v, 2.891) && near(deep.v, 3.175) && near(lazy.v, 2.931), [glide, deep, lazy].map(r => r.v.toFixed(3)).join(" / "));
  assert.equal(deep.inputs.find(x => x.push)!.pushKnee, 1, "the push extends from the full bend");
});

test("experimental: a thumb stroke pushes by its accuracy, forgivingly", () => {
  // MEASURED (2026-09-24, the stroke made forgiving and the toe pick on): a
  // firm stroke, three-quarters down to three-quarters up, pushes 0.99, 2.985
  // (the old full bottom-to-top stroke gave 1.00, 2.987); a crooked one, 0.67;
  // a short one never reaches the edge and does not push. Yanked end to end,
  // a full push, 2.986 (with the toe-pick trip on, that morning, it tripped).
  const firm = experiment((i, h) => { h.axes[3] = i >= 10 && i < 16 ? 0.75 : i >= 16 && i < 19 ? -0.75 : 0; });
  const crooked = experiment((i, h) => { h.axes[3] = i >= 10 && i < 16 ? 0.75 : i >= 16 && i < 40 ? -0.75 : 0; h.axes[2] = i >= 16 && i < 40 ? 0.5 : 0; });
  const short = experiment((i, h) => { h.axes[3] = i >= 10 && i < 16 ? 0.65 : i >= 16 && i < 36 ? -0.65 : 0; });
  const yanked = experiment((i, h) => { h.axes[3] = i >= 10 && i < 16 ? 1 : i >= 16 && i < 19 ? -1 : 0; });
  assert.deepEqual(firm.pushes, ["1@0.99"]);
  assert.ok(near(firm.v, 2.985), firm.v.toFixed(3));
  assert.equal(crooked.pushes.length, 1);
  assert.ok(Number(crooked.pushes[0].split("@")[1]) < 0.7, `a crooked, slow stroke pushes less (${crooked.pushes[0]})`);
  assert.deepEqual(short.pushes, []);
  assert.equal(yanked.fallen, false);
  assert.deepEqual(yanked.pushes, ["1@1.00"]);
  assert.ok(near(yanked.v, 2.986), yanked.v.toFixed(3));
});

test("experimental: pumping the legs in turn builds real speed, and never reads as a jump; loading both and letting go does", () => {
  // MEASURED: alternating full pumps every 0.25 s for 2 s, 3 -> 4.061 m/s,
  // each leg on its own beat at full strength, no takeoff. (Before the push
  // extended from its bend, 3.276.)
  const pumping = experiment((i, h) => { const k = i % 60; h.buttons[6] = k < 10 ? 1 : 0; h.buttons[7] = k >= 30 && k < 40 ? 1 : 0; }, 240);
  assert.ok(near(pumping.v, 4.061) && !pumping.fallen && !pumping.took, `pumped to ${pumping.v.toFixed(3)}`);
  assert.deepEqual(pumping.pushes.slice(0, 4), ["0@1.00", "1@1.00", "0@1.00", "1@1.00"]);
  const jump = experiment((i, h) => { h.buttons[6] = h.buttons[7] = i >= 10 && i < 50 ? 0.95 : 0; });
  assert.equal(jump.took, true, "load and release is the takeoff");
  assert.deepEqual(jump.pushes, [], "and not a pump");
});

test("experimental: X / B shift the weight and swing the arms; the stick clicks pick the toe", () => {
  const left = experiment((i, h) => { h.buttons[2] = i >= 10 && i < 80 ? 1 : 0; }, 80);
  assert.equal(left.st.full!.foot, 0, "X: weight to the left foot, and it stays");
  const swing = left.inputs.map(x => x.windup);
  assert.ok(swing[79] < -0.69 && swing[12] > -0.1, `arms swing left, eased (${swing[12].toFixed(2)} -> ${swing[79].toFixed(2)})`);
  const right = experiment((i, h) => { h.buttons[1] = i >= 10 ? 1 : 0; }, 60);
  assert.equal(right.st.full!.foot, 1, "B: the right foot");
  assert.ok(right.inputs[59].windup > 0.5 && right.inputs[59].carriage > 0.7, "arms out to the right");
  for (const click of [10, 11]) {
    const pick = experiment((i, h) => { h.buttons[click] = i === 20 ? 1 : 0; }, 30);
    assert.ok(pick.inputs[20].toe && !pick.inputs[21].toe, `${click === 10 ? "L3" : "R3"}: one toe pick`);
  }
});

test("experimental: A asks for a turn and Y for rotation; held bumpers choose which", () => {
  const ask = (buttons: number[]) => experiment((i, h) => { if (i >= 10) for (const b of buttons) h.buttons[b] = 1; }, 12).inputs[11];
  assert.equal(ask([0]).turn, true, "A: three-turn gesture");
  assert.equal(ask([4, 0]).bracket, true, "LB + A: bracket");
  assert.equal(ask([3]).spin, true, "Y: spin");
  assert.equal(ask([4, 3]).twizzle, true, "LB + Y: twizzle");
  assert.equal(ask([5, 3]).inaBauer, true, "RB + Y: spiral");
  assert.equal(ask([4, 5, 3]).inaBauer, true, "both + Y: Ina Bauer");
  assert.equal(ask([4, 5, 3]).weight, 0.5, "the Ina Bauer is two-footed");
  assert.equal(ask([0]).push, false, "A is not the push here");
});

// ── Experimental: automatic back crossovers, on the beat ────────────────────


/** 8 s from `v0` m/s (negative is backward), both knees at `knees`, both sticks at `lean`. */
function crossing(v0: number, lean: number, knees: number) {
  const r = rig("experimental", v0);
  let crossovers = 0, offBeat = 0;
  for (let i = 0; i < 960 && !r.s.fallen; i++) {
    r.h.buttons.fill(0); if (i < 2) r.h.buttons[1] = r.h.buttons[2] = 1;
    r.h.buttons[6] = r.h.buttons[7] = knees; r.h.axes = [lean, 0, lean, 0];
    const tick = r.s.tick, { input } = r.tick();
    if (input.push && r.s.crossover) {
      crossovers++;
      const b = beatOffset(r.p, tick);
      if (b < 0 || b >= SIM_DT) offBeat++;
    }
  }
  return { v: Math.hypot(r.s.vel.x, r.s.vel.y), crossovers, offBeat, fallen: r.s.fallen };
}

test("experimental: skating backward on a deep enough curve, the crossovers come by themselves, on the beat", () => {
  // MEASURED from 3 m/s backward, sticks 0.65, knees 0.6: 20 crossovers in 8 s,
  // every one on the beat (128 bpm), 3 -> 6.133 m/s, no pumping. Knees 0.3:
  // 4.590 — the bend is the push. Before the pushes were on the beat, a
  // player's own crossover pumps were chopped to 45% (bible §2.6) and a curve
  // built 5.7 m/s where the straight built 8.55.
  const deep = crossing(-3, 0.65, 0.6), light = crossing(-3, 0.65, 0.3);
  assert.equal(deep.fallen, false);
  assert.ok(deep.crossovers === 20 && deep.offBeat === 0, `${deep.crossovers} crossovers, ${deep.offBeat} off the beat`);
  assert.ok(near(deep.v, 6.133) && near(light.v, 4.590), `${deep.v.toFixed(2)} / ${light.v.toFixed(2)} m/s`);
});

test("experimental: no automatic crossovers forward, straight, or too slow", () => {
  assert.equal(crossing(3, 0.65, 0.6).crossovers, 0, "forward");
  assert.equal(crossing(-3, 0, 0.6).crossovers, 0, "straight");
  assert.equal(crossing(-1, 0.65, 0.6).crossovers, 0, "under 1.5 m/s");
});

test("experimental: the free leg's trigger swings it — released it rests — and a snap on it is a push", () => {
  // B puts the weight on the right foot: the left leg is free. Held past the
  // gesture window (0.25 s) it is a swing — the leg stays at rest until then,
  // since a snapped swing twists the body hard and stroking spun the skater
  // round; snapped, the standing (right) leg pushes and the weight goes
  // across to the left (the operator's call, 2026-09-24: a lifted leg cannot
  // push; strokes switch feet).
  const r = experiment((i, h) => { if (i >= 2 && i < 4) h.buttons[1] = 1; h.buttons[6] = i >= 20 && i < 60 ? 1 : 0; }, 90);
  assert.equal(r.st.full!.foot, 1);
  assert.equal(r.inputs[10].freeLeg, 0.5, "released: at rest");
  assert.equal(r.inputs[25].freeLeg, 0.5, "LT just pulled: could still be a snap, the leg waits");
  assert.equal(r.inputs[55].freeLeg, 1, "LT held past 0.25 s: swung forward");
  assert.deepEqual(r.pushes, [], "a held swing released is a swing, not a push");
  const snap = experiment((i, h) => { if (i >= 2 && i < 4) h.buttons[1] = 1; h.buttons[6] = i >= 20 && i < 26 ? 1 : 0; }, 90);
  assert.deepEqual(snap.pushes, ["1@1.00"], "snapped: the standing leg pushes");
  assert.equal(snap.st.full!.foot, 0, "and the weight goes across");
  const shared = experiment(() => {}, 5);
  assert.equal(shared.inputs[4].freeLeg, undefined, "both feet down: no free leg");
});

test("experimental: strokes switch feet — each push is the standing leg's, then the weight goes across; a held trigger is still the jump", () => {
  // MEASURED from 3 m/s, weight on the right (B), a snap every 0.5 s for
  // 2.5 s, starting on the free (left) leg's trigger: the pushes alternate
  // right, left, right…, both blades down through each push, straight down
  // the ice, and none reads as a jump — while stroking, a snap of the
  // standing trigger is the next push. LT alone 4.087 m/s; alternating LT, RT
  // 4.090; gliding 2.731. (Before the free leg waited out a snap, its swing
  // spun the skater right round: 4.017 and 3.047, heading reversed.) From a glide the standing trigger is the jump's load at once, as
  // it was: RT snapped first takes off. Held 0.6 s, it takes off.
  const B = (i: number, h: ControllerHardware) => { if (i >= 2 && i < 4) h.buttons[1] = 1; };
  const snaps = (pick: (n: number) => number) => experiment((i, h) => {
    B(i, h);
    if (i >= 10 && (i - 10) % 60 < 8) h.buttons[pick(Math.floor((i - 10) / 60))] = 1;
  }, 300);
  const lt = snaps(() => 6), alt = snaps(n => n % 2 ? 7 : 6);
  for (const r of [lt, alt]) {
    assert.deepEqual(r.pushes, ["1@1.00", "0@1.00", "1@1.00", "0@1.00", "1@1.00"]);
    assert.equal(r.took, false, "a snap while stroking is never a jump");
    assert.equal(r.fallen, false);
  }
  assert.ok(near(lt.v, 4.087) && near(alt.v, 4.090), [lt, alt].map(r => r.v.toFixed(3)).join(" / "));
  for (const r of [lt, alt]) assert.ok(Math.abs(r.st.full!.foot - 0.5) === 0.5, "on one foot between strokes");
  const weights = lt.inputs.slice(10, 70).map(x => x.weight);
  assert.ok(weights.includes(0.5) && weights.at(-1) === 0, "both down through the push, then onto the left foot");
  const standingFirst = snaps(() => 7);
  assert.equal(standingFirst.took, true, "from a glide the standing trigger's snap is the jump's load");
  assert.deepEqual(standingFirst.pushes, []);
  const hold = experiment((i, h) => { B(i, h); h.buttons[7] = i >= 20 && i < 90 ? 1 : 0; }, 200);
  assert.equal(hold.took, true, "held: the jump");
});
