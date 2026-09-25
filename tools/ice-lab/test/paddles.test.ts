// The Xbox Elite Series 2's back paddles (game/full-controls.ts, the paddle
// layer): buttons 18–21 as Firefox reports them, a lower-body layer bindable
// per setup, read by Experimental and Simulation only. Every test drives the
// real mapping (setupInput) with a raw 22-button pad, and those that skate run
// the real solver. Nothing here changes the physics: a paddle asks only what a
// D-pad direction, a trigger, X / B, LB / RB or a stick click already asks.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SETUPS, setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import {
  PADDLE_ACTIONS, PADDLE_BUTTONS, PADDLE_POSITIONS, PADDLE_PRESETS, defaultControllerProfile, paddleLayer, paddlePreset, parseControllerProfile,
} from "../game/full-controls.ts";
import type { ControllerProfile, GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import type { SkatingInput } from "../sim/types.ts";
import { IceGrid } from "../sim/ice.ts";
import { SCRIPT_TICKS, SCRIPT_SPEED, SCRIPT_ASSISTANCE, pad } from "./setup-script.ts";

const TOP_RIGHT = 18, BOTTOM_RIGHT = 19, TOP_LEFT = 20, BOTTOM_LEFT = 21;

/** A skater on `setup`, the pad a 22-button Elite as Firefox reports it, driven by `plan` each tick from rest. */
function elite(setup: Setup, plan: (i: number, h: ControllerHardware) => void, ticks: number, speed = 3, profile: ControllerProfile = defaultControllerProfile(), buttons = 22) {
  const p = setupParams(setup), s = createState(p, speed), st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(buttons).fill(0), keys: [], connected: true };
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const inputs: SkatingInput[] = [], feet: number[] = [];
  for (let i = 0; i < ticks && !s.fallen; i++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    plan(i, h);
    const { input } = setupInput({ hardware: h } as Controls, s, setup, st, p, profile, 0.75);
    inputs.push({ ...input }); feet.push(st.full!.foot);
    step(s, input, p, SIM_DT, [], ice);
  }
  return { s, st, inputs, feet };
}
/** Experimental's weight on the right foot (B, two ticks): the left leg is free. */
const onRight = (i: number, h: ControllerHardware) => { if (i < 2) h.buttons[1] = 1; };
const withLayer = (setup: "experimental" | "simulation", preset: "skating" | "weight" | "toe") => {
  const profile = defaultControllerProfile(); profile.paddles = { [setup]: paddlePreset(preset) }; return profile;
};

test("paddles: the defaults — Experimental skating / stops, Simulation weight shift — and the assumed positions", () => {
  const profile = defaultControllerProfile();
  assert.equal(profile.paddles, undefined, "a fresh profile carries no layer: each setup reads its default");
  assert.deepEqual(paddleLayer(profile, "experimental"),
    { [TOP_LEFT]: "feetAnticlockwise", [TOP_RIGHT]: "feetClockwise", [BOTTOM_LEFT]: "freeLegLeft", [BOTTOM_RIGHT]: "freeLegRight" });
  assert.deepEqual(paddleLayer(profile, "simulation"),
    { [TOP_LEFT]: "feetAnticlockwise", [TOP_RIGHT]: "feetClockwise", [BOTTOM_LEFT]: "weightLeft", [BOTTOM_RIGHT]: "weightRight" });
  assert.deepEqual(PADDLE_BUTTONS, [18, 19, 20, 21]);
  assert.deepEqual(PADDLE_POSITIONS, { 18: "top-right", 19: "bottom-right", 20: "top-left", 21: "bottom-left" }, "xpad's P1..P4, assumed");
});

test("paddles: three presets, the top paddles the feet in each; the bottom free leg, weight or toe picks", () => {
  assert.deepEqual(PADDLE_PRESETS.map(p => p.name), ["Skating / stops", "Weight shift", "Toe picks"]);
  for (const p of PADDLE_PRESETS) assert.deepEqual([p.layer[TOP_LEFT], p.layer[TOP_RIGHT]], ["feetAnticlockwise", "feetClockwise"], p.name);
  assert.deepEqual(PADDLE_PRESETS.map(p => [p.layer[BOTTOM_LEFT], p.layer[BOTTOM_RIGHT]]),
    [["freeLegLeft", "freeLegRight"], ["weightLeft", "weightRight"], ["toeLeft", "toeRight"]]);
  const a = paddlePreset("toe"); a[TOP_LEFT] = "none";
  assert.equal(paddlePreset("toe")[TOP_LEFT], "feetAnticlockwise", "a preset hands out a copy");
});

test("paddles: an old saved profile still loads; a layer round-trips; a bad one is refused", () => {
  // A version-1 profile as saved before the feet or the paddles existed.
  const old = { version: 1, deadzone: 0.22, curve: 1.35, leanGain: 0.7, keyboardLean: 0.35, triggerDeadzone: 0.05, modifier: 10,
    bindings: defaultControllerProfile().bindings };
  const loaded = parseControllerProfile(JSON.parse(JSON.stringify(old)));
  assert.equal(loaded.paddles, undefined);
  assert.deepEqual(paddleLayer(loaded, "simulation"), paddlePreset("weight"));
  assert.deepEqual(paddleLayer(loaded, "experimental"), paddlePreset("skating"));
  // One setup's layer saved: the other keeps its default. JSON keys are strings.
  const saved = { ...old, paddles: { experimental: { ...paddlePreset("toe"), 18: "none" } } };
  const back = parseControllerProfile(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(back.paddles, { experimental: { 18: "none", 19: "toeRight", 20: "feetAnticlockwise", 21: "toeLeft" } });
  assert.deepEqual(paddleLayer(back, "simulation"), paddlePreset("weight"));
  assert.deepEqual(parseControllerProfile(JSON.parse(JSON.stringify(back))), back, "and it round-trips");
  for (const bad of [
    { experimental: { ...paddlePreset("skating"), 19: "jump" } },
    { experimental: { 18: "none", 19: "none", 20: "none" } },
    { simulation: paddlePreset("skating") },
    { simulation: null },
    [],
  ]) assert.throws(() => parseControllerProfile({ ...old, paddles: bad }), Error, JSON.stringify(bad));
  assert.throws(() => parseControllerProfile({ ...old, paddles: { simulation: paddlePreset("skating") } }), /simulation has no free leg/);
  for (const action of PADDLE_ACTIONS) parseControllerProfile({ ...old, paddles: { experimental: { 18: action.id, 19: "none", 20: "none", 21: "none" } } });
});

for (const setup of ["experimental", "simulation"] as const) test(`paddles, ${setup}: the top paddles turn the feet exactly as D-pad left / right do`, () => {
  const split = (plan: (i: number, h: ControllerHardware) => void) =>
    elite(setup, (i, h) => { if (i < 2) h.buttons[setup === "simulation" ? 4 : 1] = h.buttons[setup === "simulation" ? 5 : 2] = 1; plan(i, h); }, 150).inputs.map(x => x.toeOutSplit);
  const held = (b: number) => (i: number, h: ControllerHardware) => { if (i >= 10 && i < 70) h.buttons[b] = 1; };
  const anti = split(held(TOP_LEFT)), dpadLeft = split(held(14));
  assert.deepEqual(anti, dpadLeft, "top-left: D-pad left, tick for tick");
  assert.ok(Math.abs(anti[69]! + 0.75) < 1e-9 && anti[149] === anti[69], `half a second: -0.75, and the feet stay (${anti[69]})`);
  assert.deepEqual(split(held(TOP_RIGHT)), split(held(15)), "top-right: D-pad right");
  assert.deepEqual(split((i, h) => { held(TOP_LEFT)(i, h); held(14)(i, h); }), dpadLeft, "with the D-pad the same way, one rate");
  assert.deepEqual(split((i, h) => { held(TOP_LEFT)(i, h); held(15)(i, h); }), split(() => {}), "against it, they cancel");
  // The D-pad still works on an Elite, with the paddles there and released.
  assert.ok(Math.abs(dpadLeft[69]! + 0.75) < 1e-9);
});

test("paddles, simulation: under the modifier the D-pad toes in and out while a paddle still turns the feet", () => {
  const r = elite("simulation", (i, h) => { if (i >= 10 && i < 70) { h.buttons[10] = 1; h.buttons[15] = 1; h.buttons[TOP_LEFT] = 1; } }, 80, 3);
  const last = r.inputs[79];
  assert.ok(Math.abs(last.toeOut! - 0.75) < 1e-9 && Math.abs(last.toeOutSplit! + 0.75) < 1e-9, `toes out ${last.toeOut}, turned ${last.toeOutSplit}`);
});

test("paddles, experimental: a free-leg paddle swings that leg at once, rests when released, and does nothing to the standing leg", () => {
  const free = elite("experimental", (i, h) => { onRight(i, h); if (i >= 20 && i < 60) h.buttons[BOTTOM_LEFT] = 1; }, 90);
  assert.equal(free.inputs[10].freeLeg, 0.5, "released: at rest");
  assert.equal(free.inputs[20].freeLeg, 1, "pressed: forward at once — no snap to wait out");
  assert.equal(free.inputs[59].freeLeg, 1);
  assert.equal(free.inputs[60].freeLeg, 0.5, "let go: at rest again");
  assert.ok(free.feet.slice(2).every(f => f === 1), "the weight never moves");
  assert.ok(free.inputs.every(x => !x.push), "and nothing pushes");
  const standing = elite("experimental", (i, h) => { onRight(i, h); if (i >= 20 && i < 60) h.buttons[BOTTOM_RIGHT] = 1; }, 90);
  assert.ok(standing.inputs.slice(2).every(x => x.freeLeg === 0.5), "the standing leg's paddle: the free leg rests");
  assert.ok(standing.feet.slice(2).every(f => f === 1), "and the weight stays");
  const shared = elite("experimental", (i, h) => { if (i < 2) h.buttons[1] = h.buttons[2] = 1; h.buttons[BOTTOM_LEFT] = 1; }, 30);
  assert.ok(shared.inputs.every(x => x.freeLeg === undefined), "both feet down: no free leg to swing");
});

test("paddles, experimental: the free leg's trigger still swings it, a snap on it is still a push, and with the paddle the stronger swing wins", () => {
  const half = (paddle: boolean) => elite("experimental", (i, h) => { onRight(i, h); if (i >= 20 && i < 70) { h.buttons[6] = 0.5; if (paddle && i >= 40) h.buttons[BOTTOM_LEFT] = 1; } }, 80);
  const trigger = half(false), both = half(true);
  const at = (0.5 - 0.05) / 0.95;
  assert.ok(Math.abs(trigger.inputs[39].freeLeg! - (0.5 + 0.5 * at)) < 1e-12, `LT at half: ${trigger.inputs[39].freeLeg}`);
  assert.equal(both.inputs[39].freeLeg, trigger.inputs[39].freeLeg, "before the paddle, the trigger's swing");
  assert.equal(both.inputs[50].freeLeg, 1, "the paddle's full swing is the stronger");
  // A snap of LT (the free leg's trigger) with the paddle held: the standing
  // leg pushes, as without it — at 3 m/s, under ONE_FOOT_SPEED, onto both feet
  // (before the two-feet rule, 2026-09-24: across to the left foot).
  const snap = elite("experimental", (i, h) => { onRight(i, h); if (i >= 20 && i < 26) h.buttons[6] = 1; if (i >= 15 && i < 30) h.buttons[BOTTOM_LEFT] = 1; }, 90);
  const pushes = snap.inputs.filter(x => x.push).map(x => `${x.pushFoot}@${x.pushPower!.toFixed(2)}`);
  assert.deepEqual(pushes, ["1@1.00"]);
  assert.equal(snap.feet.at(-1), 0.5);
});

test("paddles: a weight paddle selects and keeps a foot — X / B in Experimental (without the arms), LB / RB in Simulation", () => {
  const exp = withLayer("experimental", "weight");
  const left = elite("experimental", (i, h) => { if (i >= 10 && i < 16) h.buttons[BOTTOM_LEFT] = 1; }, 60, 3, exp);
  assert.equal(left.feet[59], 0, "weight left, and it stays");
  assert.ok(left.inputs.every(x => x.windup === 0), "the arms do not swing");
  const right = elite("experimental", (i, h) => { if (i >= 10 && i < 16) h.buttons[BOTTOM_RIGHT] = 1; }, 60, 3, exp);
  assert.equal(right.feet[59], 1);
  // Simulation's default: exactly LB / RB, every input field, tick for tick.
  for (const [paddle, bumper] of [[BOTTOM_LEFT, 4], [BOTTOM_RIGHT, 5]]) {
    const press = (b: number) => elite("simulation", (i, h) => { h.buttons[7] = 0.4; h.axes = [-0.3, 0, -0.3, 0]; if (i >= 30 && i < 36) h.buttons[b] = 1; }, 240).inputs;
    assert.deepEqual(press(paddle), press(bumper), `b${paddle} is ${bumper === 4 ? "LB" : "RB"}`);
  }
});

test("paddles: a toe-pick paddle is one toe pick, as L3 / R3 are in Experimental", () => {
  for (const setup of ["experimental", "simulation"] as const) for (const b of [BOTTOM_LEFT, BOTTOM_RIGHT]) {
    const r = elite(setup, (i, h) => { if (i >= 20 && i < 25) h.buttons[b] = 1; }, 30, 3, withLayer(setup, "toe"));
    assert.ok(r.inputs[20].toe && r.inputs.filter(x => x.toe).length === 1, `${setup}, b${b}: one pick`);
  }
  const l3 = elite("experimental", (i, h) => { if (i >= 20 && i < 25) h.buttons[10] = 1; }, 30).inputs;
  const toe = elite("experimental", (i, h) => { if (i >= 20 && i < 25) h.buttons[BOTTOM_LEFT] = 1; }, 30, 3, withLayer("experimental", "toe")).inputs;
  assert.deepEqual(toe, l3, "tick for tick what L3 asks");
});

/** The setup mapping's pad script (test/setup-script.ts), on the real solver, the pad reshaped by `shape`. */
function script(setup: Setup, shape: (h: ControllerHardware, i: number) => ControllerHardware) {
  const p = setupParams(setup, SCRIPT_ASSISTANCE), s = createState(p, SCRIPT_SPEED), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState(), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth), inputs: SkatingInput[] = [];
  for (let i = 0; i < SCRIPT_TICKS; i++) {
    const { input } = setupInput({ hardware: shape(pad(i), i) } as Controls, s, setup, st, p, profile, SCRIPT_ASSISTANCE);
    inputs.push({ ...input }); step(s, input, p, SIM_DT, [], ice);
  }
  return inputs;
}
const extend = (n: number) => (h: ControllerHardware) => ({ ...h, buttons: [...h.buttons, ...Array(n - h.buttons.length).fill(0)] });
/** Every paddle in turn, a quarter second each, over and over. */
const paddling = (h: ControllerHardware, i: number) => { const x = extend(22)(h); x.buttons[18 + Math.floor(i / 30) % 4] = 1; return x; };

test("paddles: a standard pad maps exactly as before — 16 or 17 buttons, or an Elite with its paddles released", () => {
  for (const { id } of SETUPS) {
    const standard = script(id, h => h);
    assert.deepEqual(script(id, extend(17)), standard, `${id}: 17 buttons`);
    assert.deepEqual(script(id, h => { const x = extend(17)(h); x.buttons[16] = 1; return x; }), standard, `${id}: the guide button held`);
    assert.deepEqual(script(id, extend(22)), standard, `${id}: paddles there, released`);
  }
});

test("paddles: Dig Gate, Blade Explorer and Full Repertoire ignore them; Experimental and Simulation read them", () => {
  for (const { id } of SETUPS) {
    const same = JSON.stringify(script(id, paddling)) === JSON.stringify(script(id, h => h));
    assert.equal(same, id !== "experimental" && id !== "simulation", id);
  }
});

test("paddles: a hockey-stop-style scrape — the thumbs hold both edges while a paddle turns the feet", () => {
  // MEASURED from 6 m/s, both feet down, knees 0.6, both sticks held at 0.6
  // throughout (the thumbs never leave them): straight feet glide to 5.05 m/s
  // at 4 s; the top-left paddle turning both feet anticlockwise (against the
  // curve) for a second scrapes to 4.04, standing, the edges the sticks' all
  // along. Turned the other way (top-right, into the curve) the blades catch
  // and the skater goes down (tick 141). A turn-and-scrape through the pad,
  // not a full stop: the stop proper needs the feet held square as the travel
  // swings (test/hockeystop.test.ts), which is the player's.
  const run = (setup: "experimental" | "simulation", b: number) => elite(setup, (i, h) => {
    if (i < 2) { const [l, r] = setup === "simulation" ? [4, 5] : [2, 1]; h.buttons[l] = h.buttons[r] = 1; }
    h.buttons[6] = h.buttons[7] = 0.6; h.axes = [0.6, 0, 0.6, 0];
    if (b > 0 && i >= 60 && i < 180) h.buttons[b] = 1;
  }, 480, 6);
  const v = (r: ReturnType<typeof run>) => Math.hypot(r.s.vel.x, r.s.vel.y);
  for (const setup of ["experimental", "simulation"] as const) {
    const glide = run(setup, -1), scrape = run(setup, TOP_LEFT), dpad = run(setup, 14), caught = run(setup, TOP_RIGHT);
    assert.equal(scrape.s.fallen, false, setup);
    const lean = scrape.inputs[2].lean;
    assert.ok(scrape.inputs.slice(2).every(x => x.lean === lean && x.leanSplit === 0), "the edges stay the sticks'");
    assert.equal(scrape.inputs[179].toeOutSplit, -1, "the feet turned to the end of their travel");
    assert.ok(Math.abs(v(glide) - 5.05) < 0.01 && Math.abs(v(scrape) - 4.04) < 0.01, `${setup}: glide ${v(glide).toFixed(3)}, scrape ${v(scrape).toFixed(3)}`);
    assert.deepEqual(scrape.inputs, dpad.inputs, "the same scrape as D-pad left");
    assert.equal(caught.s.fallen, true); assert.equal(caught.s.tick, 141);
  }
});
