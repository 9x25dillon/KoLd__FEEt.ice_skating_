// The Tutorial (game/tutorial.ts): balance, edges, travel, scrape & dig, air. Its
// pass conditions read only solver state, so each step is played here the way
// the suite plays everything — a scripted pad through the setup's own mapping
// into the solver — and the time it passed is pinned. Every number below was
// printed first, then written down.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { Tutorial, STEPS, STAGES, SETTLE_S, tutorialGhost, insideBoards, CHECKPOINTS, TOUCH_BOARDS } from "../game/tutorial.ts";
import type { HowContext } from "../game/tutorial.ts";
import type { SkaterState } from "../sim/types.ts";
import { TRICKS } from "../game/ghost.ts";

let SPIN_LOAD = 0.35;
const A = 0, B = 1, X = 2, LB = 4, RB = 5, LT = 6, RT = 7, L3 = 10, UP = 12, LEFT = 14, RIGHT = 15;
type Pad = "simulation" | "experimental";
const released = (): ControllerHardware => ({ axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true });
/**
 * Press the pad for tick `k` of the step; `h` arrives released. The travel steps
 * steer by what they see — the skater, the tutorial's targets — and keep what
 * they need between ticks in `memo`.
 */
type Script = (h: ControllerHardware, k: number, setup: Pad, s: SkaterState, tut: Tutorial, memo: Record<string, number>) => void;

/**
 * A pilot for the travel steps: both sticks follow the bearing to (x, y). MEASURED: a
 * stick pushed right curves the skater anticlockwise, so the stick goes the way the
 * target lies, anticlockwise positive.
 */
function steer(h: ControllerHardware, s: SkaterState, x: number, y: number, gain = 1.4, max = 0.55) {
  const v = Math.hypot(s.vel.x, s.vel.y);
  const d = v > 0.5 ? { x: s.vel.x / v, y: s.vel.y / v } : s.heading;
  const tx = x - s.pos.x, ty = y - s.pos.y;
  const stick = Math.max(-max, Math.min(max, gain * Math.atan2(d.x * ty - d.y * tx, d.x * tx + d.y * ty)));
  h.axes[0] = h.axes[2] = stick;
}
/** Keeps the speed above `under`: Simulation taps A; Experimental, on its right foot, snaps LT and RT in turn. */
function keepSpeed(h: ControllerHardware, k: number, setup: Pad, s: SkaterState, memo: Record<string, number>, under: number) {
  if (setup === "experimental" && k < 2) h.buttons[B] = 1;
  const v = Math.hypot(s.vel.x, s.vel.y), since = k - (memo.push ?? -999);
  if (v < under && since >= 60) { memo.push = k; memo.side = (memo.side ?? 0) + 1; }
  const at = k - (memo.push ?? -999);
  if (setup === "simulation" && at < 3) h.buttons[A] = 1;
  if (setup === "experimental" && at >= 10 && at < 18) h.buttons[(memo.side ?? 0) % 2 ? LT : RT] = 1;
}

/**
 * Each step's script, and the speed it starts from (m/s, negative backward):
 * what the step's own words ask the player to do, on each setup's pad.
 */
const SCRIPTS: Record<string, { speed: number; pad: Script }> = {
  // The game starts every run at 4.5 m/s. Hands off.
  glide: { speed: 4.5, pad: () => {} },
  // What the glide leaves: about 3.7 m/s.
  push: { speed: 3.7, pad: (h, k, s) => {
    if (s === "simulation") { if (k < 180 && k % 60 < 3) h.buttons[A] = 1; return; }
    if (k >= 2 && k < 4) h.buttons[B] = 1;
    if (k >= 10 && k < 190 && (k - 10) % 60 < 8) h.buttons[Math.floor((k - 10) / 60) % 2 ? RT : LT] = 1;
    if (k >= 200 && k < 204) h.buttons[X] = h.buttons[B] = 1;   // both feet under you
  } },
  knees: { speed: 3.7, pad: (h, k, s) => {
    if (s === "experimental" && k < 2) h.buttons[X] = h.buttons[B] = 1;
    h.buttons[LT] = h.buttons[RT] = 0.55;
  } },
  edge: { speed: 3.7, pad: h => { h.axes = [0.5, 0, 0.5, 0]; } },
  other: { speed: 3.7, pad: h => { h.axes = [-0.5, 0, -0.5, 0]; } },
  // A curve, the turn tapped at 1 s, the sticks eased back.
  turn: { speed: 3.7, pad: (h, k, s) => {
    h.axes = k < 144 ? [0.5, 0, 0.5, 0] : [0, 0, 0, 0];
    if (k >= 120 && k < 124) h.buttons[s === "simulation" ? B : A] = 1;
  } },
  // Travel: steer for the target, keeping above 3 m/s.
  marker: { speed: 3.7, pad: (h, k, s, st, tut, memo) => {
    const t = tut.target; if (t) steer(h, st, t.x, t.y);
    keepSpeed(h, k, s, st, memo, 3);
  } },
  // Round the cone: hold the curve that keeps it inside (the side it lies on), and keep the speed.
  cone: { speed: 3.7, pad: (h, k, s, st, tut, memo) => {
    const c = tut.targets[0];
    if (c) { const side = Math.sign(st.heading.x * (c.y - st.pos.y) - st.heading.y * (c.x - st.pos.x)) || 1; memo.side0 ??= side; h.axes[0] = h.axes[2] = 0.5 * memo.side0; }
    keepSpeed(h, k, s, st, memo, 3.2);
  } },
  cross: { speed: 3.7, pad: (h, k, s, st, tut, memo) => {
    const t = tut.target; if (t) steer(h, st, t.x, t.y);
    keepSpeed(h, k, s, st, memo, 3.5);
  } },
  // Experimental's corner is gentler, and it pushes only on the straights: a snap mid-curve put it down.
  lap: { speed: 3.7, pad: (h, k, s, st, tut, memo) => {
    const t = tut.target; if (t) steer(h, st, t.x, t.y, 1.4, s === "experimental" ? LAP_MAX : 0.55);
    if (s === "simulation" || Math.abs(h.axes[0]) < 0.25) keepSpeed(h, k, s, st, memo, 3.5);
  } },
  // Steer for the mark; inside STOP_AT m of it, the step before's snowplow, from its first tick.
  spot: { speed: 3.7, pad: (h, k, s, st, tut, memo) => {
    const t = tut.target;
    if (!t) return;
    const d = Math.hypot(t.x - st.pos.x, t.y - st.pos.y);
    if (memo.plow === undefined && d < STOP_AT[s]) memo.plow = k;
    if (memo.plow === undefined) { steer(h, st, t.x, t.y); return; }
    SCRIPTS.plow.pad(h, k - memo.plow, s, st, tut, memo);
  } },
  // test/setups.test.ts's pad snowplow, on each setup's buttons.
  plow: { speed: 4.5, pad: (h, k, s) => {
    const feet = s === "simulation" ? [LB, RB] : [X, B], toes = s === "simulation" ? L3 : LB;
    if (k < 2) h.buttons[feet[0]] = h.buttons[feet[1]] = 1;
    if (k < 120) h.buttons[toes] = h.buttons[LEFT] = 1;
    h.buttons[LT] = h.buttons[RT] = 0.5;
    const m = k < 120 ? 0 : Math.min(1, (k - 119) / 18);
    h.axes = [-m, 0, m, 0];
  } },
  // Backward on a gentle curve, the toes eased in, the feet turned across toward the lean for 0.5 s, then straightened.
  dig: { speed: -4, pad: (h, k, s) => {
    const t = k * SIM_DT;
    if (k < 2) { const f = s === "simulation" ? [LB, RB] : [X, B]; h.buttons[f[0]] = h.buttons[f[1]] = 1; }
    const toe = 0.5 * Math.min(1, Math.max(0, (t - 0.25) / 0.5)) * (t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2)));
    h.axes = [0.3, -toe, 0.3, -toe];
    if (t >= 1.5 && t < 2) h.buttons[RIGHT] = 1;
    if (t >= 2.5 && t < 2.6) h.buttons[UP] = 1;
  } },
  hop: { speed: 4.5, pad: (h, k, s) => {
    const t = k * SIM_DT;
    if (s === "experimental" && k >= 2 && k < 4) h.buttons[B] = 1;
    if (t >= 1 && t < 1.35) { h.buttons[RT] = 0.95; if (s === "simulation") h.buttons[LT] = 0.95; }
  } },
  spin: { speed: 4.5, pad: (h, k, s) => {
    const t = k * SIM_DT;
    if (s === "simulation") {
      // A curve, sticks 0.5. L3 + the right stick 0.5 (the arms) through a 0.3 s load, everything let go, soft knees 0.5.
      const load = t >= 1 && t < 1.3;
      h.axes[0] = t < 1.3 ? 0.5 : 0;
      h.axes[2] = t < 1 ? 0.5 : load ? 0.5 : 0;
      if (load) { h.buttons[L3] = 1; h.buttons[LT] = h.buttons[RT] = 1; }
      else if (t >= 1.4) h.buttons[LT] = h.buttons[RT] = 0.5;
      return;
    }
    // Full lean on the right foot, B + RT for 0.35 s, everything let go, soft knees 0.7.
    const end = 1 + SPIN_LOAD;
    h.axes[0] = h.axes[2] = t < end ? 1 : 0;
    if (t < 0.1 || (t >= 1 && t < end)) h.buttons[B] = 1;
    if (t >= 1 && t < end) h.buttons[RT] = 1;
    if (t >= end + 0.1) h.buttons[RT] = 0.7;
  } },
};

/**
 * Experimental's lap pilot steers at most 0.35 of a stick: the narrowest travel step, like its turning
 * jump. MEASURED: at 0.3 the corner runs wide past its checkpoint; at 0.4 and 0.45 it falls once.
 */
const LAP_MAX = 0.35;
/** m from the mark the spot step's pilot starts its snowplow, per setup: MEASURED, the plow's own run-out. */
// From 3.7 m/s the snowplow runs out about 8.8 m: plowing from 8 to 10 m out stops inside the 2 m ring.
const STOP_AT: Record<Pad, number> = { simulation: 9, experimental: 9 };
/** Play one step from its script's entry speed; when it passed (s, or -1) and what the solver did. */
function play(setup: Pad, id: string, T = 15, side = 1, entry?: number) {
  const { pad } = SCRIPTS[id], speed = entry ?? SCRIPTS[id].speed;
  const p = setupParams(setup), s = createState(p, speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const at = STEPS.findIndex(x => x.id === id), tut = new Tutorial(setup, at);
  tut.side = side;
  let k = 0, maxWind = 0;
  const memo: Record<string, number> = {};
  for (; k < T / SIM_DT && tut.index === at; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    pad(h, k, setup, s, tut, memo);
    step(s, setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, p, SIM_DT, [], ice);
    tut.sample(s, SIM_DT);
    maxWind = Math.max(maxWind, Math.abs(tut.memory.wind));
  }
  return { passed: tut.index > at ? +(k * SIM_DT).toFixed(3) : -1, s, tut, maxWind, v: Math.hypot(s.vel.x, s.vel.y) };
}

// Re-pinned 2026-11-09, deliberately: jumpDirMode on in every setup (the owner's
// ask) makes a two-foot glide at exactly equal weight stay on the foot it was on,
// instead of always the right, so a clockwise skater is the counter-clockwise
// one's mirror. Every stage still passes without a fall; four times moved:
// simulation push 5.0 -> 5.217, cross 11.508 -> 11.633, lap 13.3 -> 13.083;
// experimental lap 15.65 -> 15.383.
// Re-pinned 2026-11-05, deliberately: the Travel stage (the owner's ask) sits between Edges and
// Scrape & dig, and "Stop on the mark" follows the snowplow it uses; the words are found by id now.
test("five stages in order — balance, edges, travel, scrape & dig, air — and the steps follow them", () => {
  assert.deepEqual(STAGES.map(g => g.id), ["balance", "edges", "travel", "scrape", "air"]);
  assert.deepEqual(STEPS.map(x => x.id), ["glide", "push", "knees", "edge", "other", "turn", "marker", "cone", "cross", "lap", "plow", "spot", "dig", "hop", "spin"]);
  const order = STEPS.map(x => STAGES.findIndex(g => g.id === x.stage));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "a stage never comes back");
  for (const g of STAGES) assert.ok(STEPS.some(x => x.stage === g.id), `${g.id} has steps`);
  // Stability first: every balance step is a hold of at least 2 s.
  for (const x of STEPS.filter(x => x.stage === "balance")) assert.ok(x.hold >= 2, x.id);
  // Each step has words for Simulation and Experimental, and they differ where the pads differ.
  const c = (setup: Setup | null): HowContext => ({ setup, push: "A / Cross", three: "B / Circle", modifier: "L3", feet: "dpad" });
  for (const x of STEPS) for (const setup of ["simulation", "experimental", "diggate", "explorer", "repertoire", null] as const) assert.ok(x.how(c(setup)).length > 20, `${x.id} ${setup}`);
  const step = (id: string) => STEPS.find(x => x.id === id)!;
  assert.match(step("push").how(c("simulation")), /Tap A \/ Cross three times/);
  assert.match(step("push").how(c("experimental")), /Snap LT, then RT/);
  assert.match(step("turn").how(c("experimental")), /tap A: a three-turn/);
  assert.match(step("turn").how(c("simulation")), /tap B \/ Circle: a three-turn/);
  assert.match(step("plow").how(c("simulation")), /hold L3 \+ D-pad ←/);
  assert.match(step("plow").how(c("experimental")), /X \+ B \(both feet\), hold LB \+ D-pad ←/);
  assert.match(step("dig").how(c("diggate")), /hold LB \+ RB/);
  // Travel speaks each pad's own push, and never names a side: a stick right curves her left (measured).
  assert.match(step("marker").how(c("simulation")), /tap A \/ Cross to push/);
  assert.match(step("cross").how(c("experimental")), /Snap LT, then RT, to push/);
  assert.match(step("spot").how(c("explorer")), /hold LT to brake/);
  assert.match(step("spot").how(c("simulation")), /snowplow/);
  for (const id of ["marker", "cone", "cross", "lap"]) for (const setup of ["simulation", "explorer"] as const) assert.doesNotMatch(step(id).how(c(setup)), /\b(left|right) (curve|turn)/i, id);
});

test("the steps run in order: passing one starts the next, with a trust message", () => {
  const r = play("simulation", "glide");
  assert.equal(r.tut.index, 1);
  assert.equal(r.tut.step!.id, "push");
  assert.equal(r.tut.message, STEPS[0].trust);
  assert.ok(r.tut.toast > 3);
  assert.equal(r.tut.progress, 0, "the next step starts from nothing");
  const t = new Tutorial("simulation");
  for (let i = 0; i < STEPS.length; i++) { assert.equal(t.index, i); t.skip(); }
  assert.equal(t.done, true); assert.equal(t.step, null); assert.equal(t.fraction, 1);
});

test("a fall wipes the step's progress, and it counts again only after standing still a moment", () => {
  const p = setupParams("simulation"), s = createState(p, 4.5), t = new Tutorial("simulation");
  const glide = (ticks: number) => { for (let i = 0; i < ticks; i++) { step(s, { ...NEUTRAL }, p, SIM_DT, []); t.sample(s, SIM_DT); } };
  const NEUTRAL = setupInput({ hardware: released() } as Controls, s, "simulation", newSchemeState(), p, defaultControllerProfile()).input;
  glide(360);
  assert.ok(Math.abs(t.progress - 3) < 0.02, `3 s held (${t.progress.toFixed(2)})`);
  s.fallen = true; t.sample(s, SIM_DT); t.sample(s, SIM_DT);
  assert.equal(t.progress, 0); assert.equal(t.falls, 1, "one fall, counted once");
  assert.match(t.status, /Get up/);
  s.fallen = false;
  glide(Math.round(SETTLE_S / SIM_DT) - 2);
  assert.equal(t.progress, 0, "still settling");
  assert.match(t.status, /Stand still a moment/);
  glide(3);
  assert.ok(t.settle === 0 && t.progress > 0, "settled: the step counts again");
  glide(Math.round(4 / SIM_DT));
  assert.equal(t.index, 1, "and passes after its full hold");
});

test("settling needs steadiness: leaning or moving on resets the settle", () => {
  const t = new Tutorial("experimental"), s = createState(setupParams("experimental"), 3);
  s.fallen = true; t.sample(s, SIM_DT); s.fallen = false;
  for (let i = 0; i < 100; i++) t.sample(s, SIM_DT);
  assert.ok(t.settle < SETTLE_S);
  s.lean = 0.4; t.sample(s, SIM_DT);
  assert.equal(t.settle, SETTLE_S, "a big lean starts the settle over");
});

// ── every step, played on the pad ───────────────────────────────────────────

// MEASURED (2026-09-24), s from the step's start to its pass; identical on the two
// setups wherever their pads ask the same of the body:
//   glide  4.008  hands off from 4.5 m/s: lean 0.000.
//   push   Simulation 5.000 (A three times a second apart, then glide);
//          Experimental 3.450 (B, snaps LT RT LT, then X + B at 1.67 s and glide). Left
//          on one foot after the strokes, the Experimental skater drifts off balance
//          and is down at 3.82 s (balance timeout) — so the step says X + B.
//   knees  3.092  both triggers 0.55: knee 0.53.
//   edge / other  3.542  both sticks 0.5: lean ±0.20, turning 0.50 rad/s.
//   turn   3.308  a three-turn tapped at 1 s: backward, 2.92 m/s.
//   plow   5.933  from 4.5 m/s: toes in (34°), inside edges, under 1 m/s at 4.4 s, standing.
//   dig    2.967  backward at 4 m/s, toes 0.5, the feet turned toward the lean for 0.5 s.
//   hop    3.933  a 0.35 s load: 0.41 m, landed clean.
//   spin   Re-scripted 2026-11-01: these were written the day before armsWhipMode, and a straight
//          glide gives the arms no edge to pull against (best 0.06 rev). Now from a curve; see SCRIPTS.spin.
const PASS: Record<string, Record<Pad, number>> = {
  glide: { simulation: 4.008, experimental: 4.008 },
  push: { simulation: 5.217, experimental: 3.45 },
  knees: { simulation: 3.092, experimental: 3.092 },
  edge: { simulation: 3.542, experimental: 3.542 },
  other: { simulation: 3.542, experimental: 3.542 },
  turn: { simulation: 3.308, experimental: 3.308 },
  marker: { simulation: 4.033, experimental: 4.033 },
  cone: { simulation: 8.4, experimental: 8.375 },
  cross: { simulation: 11.633, experimental: 11.4 },
  lap: { simulation: 13.083, experimental: 15.383 },
  plow: { simulation: 5.933, experimental: 5.933 },
  spot: { simulation: 5.408, experimental: 5.408 },
  dig: { simulation: 2.967, experimental: 2.967 },
  hop: { simulation: 3.933, experimental: 3.933 },
  spin: { simulation: 3.9, experimental: 3.933 },
};

for (const setup of ["simulation", "experimental"] as const) for (const x of STEPS) test(`${setup}: "${x.title}" passes on the pad`, () => {
  const r = play(setup, x.id, 40);
  assert.equal(r.tut.falls, 0, "without a fall");
  assert.ok(Math.abs(r.passed - PASS[x.id][setup]) < 0.02, `${x.id}: passed at ${r.passed} s (pinned ${PASS[x.id][setup]})`);
});

test("the conditions are the physics': the dig winds, the snowplow does not, and the air steps need a clean landing", () => {
  // The dig's scrape winds the body 1.1+ N m s; a symmetric snowplow's winds nothing.
  for (const setup of ["simulation", "experimental"] as const) {
    assert.ok(play(setup, "dig").maxWind >= 0.5, setup);
    const plowed = play(setup, "plow", 7);
    assert.ok(plowed.maxWind < 1e-6, `${setup}: snowplow wound ${plowed.maxWind}`);
  }
  // Hands off, nothing but the glide: no step past the first passes.
  for (const id of ["push", "edge", "turn", "plow", "dig", "hop", "spin"]) {
    const s = createState(setupParams("simulation"), id === "dig" ? -4 : 4.5), p = setupParams("simulation");
    const at = STEPS.findIndex(x => x.id === id), t = new Tutorial("simulation", at);
    const input = setupInput({ hardware: released() } as Controls, s, "simulation", newSchemeState(), p, defaultControllerProfile()).input;
    for (let i = 0; i < 1200; i++) { step(s, input, p, SIM_DT, []); t.sample(s, SIM_DT); }
    assert.equal(t.index, at, `${id} does not pass on its own`);
  }
  // A plain hop does not pass the turning jump.
  const hop = SCRIPTS.hop, saved = SCRIPTS.spin;
  SCRIPTS.spin = hop;
  try { assert.equal(play("simulation", "spin", 6).passed, -1, "a hop turns 0 revolutions"); } finally { SCRIPTS.spin = saved; }
});

test("the turning jumps are not a one-tick fluke: entry speed, and Experimental's load, can vary", () => {
  // MEASURED 2026-11-01 (armsWhipMode on): Simulation's technique holds at every speed tried.
  // Experimental's is real but narrow, and this pins that narrowness rather than hiding it:
  // near 4.5 m/s it lands, away from there it does not. A wider technique should change this test.
  for (const v of [3, 4.5, 5.5]) assert.ok(play("simulation", "spin", 8, 1, v).passed > 0, `simulation from ${v}`);
  assert.ok(play("experimental", "spin", 8, 1, 4.5).passed > 0, "experimental near its starting speed");
  for (const v of [3, 5.5]) assert.equal(play("experimental", "spin", 8, 1, v).passed, -1, `experimental from ${v} does not land yet`);
});

test("the second edge must be the other side", () => {
  const same = play("simulation", "other", 6, -1);   // the first edge leaned the way the script leans again
  assert.equal(same.passed, -1);
});

test("setups whose blades cannot dig skip the dig; the brake stops them, not Simulation", () => {
  // The dig is SkaterState.digL, present only with the fore-aft pendulum (pitchMode).
  for (const setup of ["explorer", "repertoire", null] as const) {
    const t = new Tutorial(setup, STEPS.findIndex(x => x.id === "dig"));
    assert.equal(t.step!.id, "hop", `${setup}: dig skipped`);
    assert.deepEqual(t.skipped, ["dig"]);
  }
  for (const setup of ["simulation", "experimental", "diggate"] as const) assert.equal(new Tutorial(setup, STEPS.findIndex(x => x.id === "dig")).step!.id, "dig");
  // The snowplow step, braked to a stop: Blade Explorer's LT is its stop and passes;
  // Simulation's keyboard X still brakes, but its stops come from the feet, so it does not.
  const brake = (setup: "explorer" | "simulation") => {
    const p = setupParams(setup), s = createState(p, 4.5), st: GameControlState = newSchemeState(), profile = defaultControllerProfile();
    const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: setup === "simulation" ? ["x"] : [], connected: true };
    if (setup === "explorer") h.buttons[LT] = 1;
    const at = STEPS.findIndex(x => x.id === "plow"), t = new Tutorial(setup, at);
    let k = 0;
    for (; k < 1200 && t.index === at; k++) { step(s, setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, p, SIM_DT, []); t.sample(s, SIM_DT); }
    return { passed: t.index > at ? +(k * SIM_DT).toFixed(3) : -1, v: Math.hypot(s.vel.x, s.vel.y) };
  };
  const explorer = brake("explorer"), sim = brake("simulation");
  // MEASURED: Explorer, LT held from 4.5 m/s, passes at 2.533 s; Simulation, X held, stops dead and never passes.
  assert.ok(Math.abs(explorer.passed - 2.533) < 0.02, `explorer: LT to a stop passes (${explorer.passed})`);
  assert.ok(sim.passed < 0 && sim.v < 1, `simulation: braked to ${sim.v.toFixed(2)} m/s, not a scrape`);
});

test("the ghost shows the step's trick, keeps it on a loop, and stays away where there is none", () => {
  const player = createState(setupParams("experimental"), 3);
  player.pos = { x: 0, y: 18 };
  const trick = (id: string) => STEPS.find(x => x.id === id)!;
  assert.deepEqual(STEPS.filter(x => x.ghost).map(x => [x.id, x.ghost]), [["push", "strokes"], ["plow", "snowplow"], ["dig", "dig"], ["spin", "loop"]]);
  for (const x of STEPS) if (x.ghost) assert.ok(TRICKS.some(t => t.id === x.ghost), `${x.ghost} is a ghost trick`);
  assert.equal(tutorialGhost(trick("glide"), null, player, true), null, "no trick, no ghost");
  const g = tutorialGhost(trick("plow"), null, player, true)!;
  assert.equal(g.trick.id, "snowplow");
  assert.equal(tutorialGhost(trick("plow"), g, player, true), g, "the same ghost while it shows the trick");
  assert.equal(tutorialGhost(trick("plow"), g, player, false), null, "the ghost switched off");
  // It moves on to its next trick by itself; the tutorial puts the step's back.
  for (let i = 0; i < Math.round((g.trick.duration + 1.3) / SIM_DT); i++) g.tick(player);
  assert.notEqual(g.trick.id, "snowplow");
  const again = tutorialGhost(trick("plow"), g, player, true)!;
  assert.ok(again !== g && again.trick.id === "snowplow");
});


// ── Travel ─────────────────────────────────────────────────────────────────

const TRAVEL = ["marker", "cone", "cross", "lap", "spot"];
/** A state at (x, y) going `speed` m/s along `angle` (rad, anticlockwise from +x). */
function at(x: number, y: number, angle: number, speed = 3.5): SkaterState {
  const s = createState(setupParams("simulation"), speed);
  s.pos = { x, y };
  s.heading = { x: Math.cos(angle), y: Math.sin(angle) };
  s.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  return s;
}

test("every travel target is on the ice, inside the boards, wherever its step begins", () => {
  // Margins the steps ask for: markers 5 m in, the cone 9 m (its curve stays on the ice), the far marker 6 m.
  const margin: Record<string, number> = { marker: 5, cone: 9, cross: 6, spot: 5, lap: 12 };
  let placed = 0;
  for (const id of TRAVEL) {
    const x = STEPS.find(s => s.id === id)!;
    for (let px = -26; px <= 26; px += 4) for (let py = -8; py <= 44; py += 4) for (let a = 0; a < 8; a++) {
      if (insideBoards(px, py) < 1) continue;
      const s = at(px, py, a * Math.PI / 4), targets = x.place!(s, new Tutorial("simulation"));
      assert.ok(targets.length >= 1, id);
      for (const t of targets) {
        assert.ok(insideBoards(t.x, t.y) >= margin[id] - 1e-9, `${id} from (${px}, ${py}) heading ${a}: (${t.x.toFixed(2)}, ${t.y.toFixed(2)}) is ${insideBoards(t.x, t.y).toFixed(2)} m in`);
        placed++;
      }
      if (id === "marker" || id === "spot") assert.ok(Math.hypot(targets[0].x - px, targets[0].y - py) >= 7 - 1e-9, `${id} not on top of the skater`);
      if (id === "cross") assert.ok(Math.hypot(targets[0].x - px, targets[0].y - py) >= 12, "across means across");
    }
  }
  assert.ok(placed > 1000, `${placed}`);
});

test("the half lap goes the way the skater is already going round, two checkpoints in order", () => {
  const lap = STEPS.find(s => s.id === "lap")!;
  // At the bottom of the sheet heading +x is anticlockwise round the middle: the bottom-right, then the top-right.
  assert.deepEqual(lap.place!(at(0, 0, 0), new Tutorial("simulation")).map(t => [t.x, t.y]), [[CHECKPOINTS[0].x, CHECKPOINTS[0].y], [CHECKPOINTS[1].x, CHECKPOINTS[1].y]]);
  // Heading -x there is clockwise: the bottom-left, then the top-left.
  assert.deepEqual(lap.place!(at(0, 0, Math.PI), new Tutorial("simulation")).map(t => [t.x, t.y]), [[CHECKPOINTS[3].x, CHECKPOINTS[3].y], [CHECKPOINTS[2].x, CHECKPOINTS[2].y]]);
});

test("targets are placed as the step begins and kept through a fall; the step's progress is not", () => {
  const tut = new Tutorial("simulation", STEPS.findIndex(x => x.id === "lap"));
  const s = at(0, 0, 0);
  tut.sample(s, SIM_DT);
  const placed = JSON.stringify(tut.targets);
  assert.equal(tut.targets.length, 2);
  assert.equal(tut.target, tut.targets[0]);
  // Through the first checkpoint: the second is next.
  s.pos = { ...CHECKPOINTS[0] };
  tut.sample(s, SIM_DT);
  assert.equal(tut.memory.reached, 1);
  assert.equal(tut.target, tut.targets[1]);
  assert.match(tut.status, /1 \/ 2 checkpoints/);
  s.fallen = true;
  tut.sample(s, SIM_DT);
  assert.equal(JSON.stringify(tut.targets), placed, "the checkpoints stay where they were");
  assert.equal(tut.memory.reached, 0, "a fall starts the half lap again");
  // Passing a step clears its targets for the next.
  tut.skip();
  assert.deepEqual(tut.targets, []);
});

test("touching the boards starts the half lap again", () => {
  const tut = new Tutorial("simulation", STEPS.findIndex(x => x.id === "lap"));
  const s = at(0, 0, 0);
  tut.sample(s, SIM_DT);
  s.pos = { ...CHECKPOINTS[0] };
  tut.sample(s, SIM_DT);
  assert.equal(tut.memory.reached, 1);
  s.pos = { x: 27.7, y: 18 };   // 0.3 m off the side boards
  assert.ok(insideBoards(s.pos.x, s.pos.y) < TOUCH_BOARDS);
  tut.sample(s, SIM_DT);
  assert.equal(tut.memory.reached, 0);
});

test("the cone counts going round it, not going past it", () => {
  const cone = STEPS.findIndex(x => x.id === "cone");
  // A straight glide past the cone sweeps under half a turn round it.
  const tut = new Tutorial("simulation", cone), s = at(0, 0, 0);
  for (let k = 0; k < 600; k++) { s.pos = { x: -8 + k * 0.03, y: 0 }; tut.sample(s, SIM_DT); }
  assert.equal(tut.index, cone);
  assert.ok(Math.abs(tut.memory.swept) < Math.PI, `swept ${tut.memory.swept}`);
  // Round it, three quarters and more: passed.
  const round = new Tutorial("simulation", cone), r = at(0, 0, 0);
  round.sample(r, SIM_DT);
  const c = round.targets[0];
  for (let k = 0; k <= 700 && round.index === cone; k++) {
    const a = -Math.PI / 2 + k * 0.012;
    r.pos = { x: c.x + 6 * Math.cos(a), y: c.y + 6 * Math.sin(a) };
    r.vel = { x: -Math.sin(a) * 3.5, y: Math.cos(a) * 3.5 };
    round.sample(r, SIM_DT);
  }
  assert.equal(round.index, cone + 1);
});

// ── Travel on the one-stick pads ────────────────────────────────────────────

type OneStick = "explorer" | "repertoire";
/**
 * MEASURED: held from 3.7 m/s, LT stops both one-stick pads inside the 2 m ring when held from 2 to 3 m
 * out; from 4 m on they stop short. Repertoire's pilot steers at most 0.4 of a stick: at 0.55 and 0.7
 * it loses the far marker and skates away; Explorer's holds 0.55.
 */
const BRAKE_AT: Record<OneStick, number> = { explorer: 2.5, repertoire: 2.5 };
const STEER_MAX: Record<OneStick, number> = { explorer: 0.55, repertoire: 0.4 };
/**
 * Blade Explorer's and Full Repertoire's pads, playing a travel step as its words say: the left stick
 * alone steers (the right one is the arms), A pushes, LT brakes.
 */
function playOne(setup: OneStick, id: string, T = 40) {
  const p = setupParams(setup), s = createState(p, 3.7), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState(), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const at = STEPS.findIndex(x => x.id === id), tut = new Tutorial(setup, at);
  const memo: Record<string, number> = {};
  let k = 0;
  for (; k < T / SIM_DT && tut.index === at; k++) {
    const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
    const t = tut.target, v = Math.hypot(s.vel.x, s.vel.y);
    if (t && id === "cone") {
      memo.side ??= Math.sign(s.heading.x * (t.y - s.pos.y) - s.heading.y * (t.x - s.pos.x)) || 1;
      h.axes[0] = 0.5 * memo.side;
    } else if (t) {
      const d = v > 0.5 ? { x: s.vel.x / v, y: s.vel.y / v } : s.heading;
      const tx = t.x - s.pos.x, ty = t.y - s.pos.y;
      h.axes[0] = Math.max(-STEER_MAX[setup], Math.min(STEER_MAX[setup], 1.4 * Math.atan2(d.x * ty - d.y * tx, d.x * tx + d.y * ty)));
      if (id === "spot" && (memo.brake !== undefined || Math.hypot(tx, ty) < BRAKE_AT[setup])) { memo.brake ??= k; h.axes[0] = 0; h.buttons[LT] = 1; }
    }
    if (id !== "spot" && v < 3.2 && k - (memo.push ?? -999) >= 60) memo.push = k;
    if (k - (memo.push ?? -999) < 3) h.buttons[A] = 1;
    step(s, setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, p, SIM_DT, [], ice);
    tut.sample(s, SIM_DT);
  }
  return { passed: tut.index > at ? +(k * SIM_DT).toFixed(3) : -1, tut, s };
}

const ONE_STICK_PASS: Record<OneStick, Record<string, number>> = {
  explorer: { marker: 4.233, cone: 8.3, cross: 12.842, lap: 13.2, spot: 4.383 },
  repertoire: { marker: 3.825, cone: 11.942, cross: 17.967, lap: 14.067, spot: 4.383 },
};
for (const setup of ["explorer", "repertoire"] as const) for (const id of TRAVEL) test(`${setup}: "${STEPS.find(x => x.id === id)!.title}" passes on the pad`, () => {
  const r = playOne(setup, id);
  assert.equal(r.tut.falls, 0, "without a fall");
  assert.ok(Math.abs(r.passed - ONE_STICK_PASS[setup][id]) < 0.02, `${id}: passed at ${r.passed} s (pinned ${ONE_STICK_PASS[setup][id]})`);
});
