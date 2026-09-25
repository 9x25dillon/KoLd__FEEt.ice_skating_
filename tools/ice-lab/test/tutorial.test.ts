// The Tutorial (game/tutorial.ts): balance, edges, scrape & dig, air. Its
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
import { Tutorial, STEPS, STAGES, SETTLE_S, tutorialGhost } from "../game/tutorial.ts";
import type { HowContext } from "../game/tutorial.ts";
import { TRICKS } from "../game/ghost.ts";

let SPIN_LOAD = 0.3;
const A = 0, B = 1, X = 2, LB = 4, RB = 5, LT = 6, RT = 7, L3 = 10, UP = 12, LEFT = 14, RIGHT = 15;
type Pad = "simulation" | "experimental";
const released = (): ControllerHardware => ({ axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true });
/** Press the pad for tick `k` of the step; `h` arrives released. */
type Script = (h: ControllerHardware, k: number, setup: Pad) => void;

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
      // L3 + the right stick 0.7 (the arms open) through the release, 0.5 in the
      // air, soft knees (0.3) to land, the arms eased in over 1 s from 2.5 s.
      const arm = t >= 0.5 && t < 1.37 ? 0.7 : t < 2.5 ? (t >= 1.37 ? 0.5 : 0) : t < 3.5 ? 0.5 * (3.5 - t) : 0;
      if (t >= 1 && t < 1.35) h.buttons[LT] = h.buttons[RT] = 1;
      else if (t >= 1.4) h.buttons[LT] = h.buttons[RT] = 0.3;
      if (arm > 0.001) { h.buttons[L3] = 1; h.axes[2] = arm; }
      return;
    }
    // B (the right foot, the arms swinging right) and RT together for 0.3 s, both let
    // go; soft knees (RT 0.3) in the air.
    if (k < 2) h.buttons[B] = 1;
    if (t >= 1 && t < 1 + SPIN_LOAD) h.buttons[RT] = h.buttons[B] = 1;
    else if (t >= 1.4) h.buttons[RT] = 0.3;
  } },
};

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
  for (; k < T / SIM_DT && tut.index === at; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    pad(h, k, setup);
    step(s, setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, p, SIM_DT, [], ice);
    tut.sample(s, SIM_DT);
    maxWind = Math.max(maxWind, Math.abs(tut.memory.wind));
  }
  return { passed: tut.index > at ? +(k * SIM_DT).toFixed(3) : -1, s, tut, maxWind, v: Math.hypot(s.vel.x, s.vel.y) };
}

test("four stages in order — balance, edges, scrape & dig, air — and the steps follow them", () => {
  assert.deepEqual(STAGES.map(g => g.id), ["balance", "edges", "scrape", "air"]);
  assert.deepEqual(STEPS.map(x => x.id), ["glide", "push", "knees", "edge", "other", "turn", "plow", "dig", "hop", "spin"]);
  const order = STEPS.map(x => STAGES.findIndex(g => g.id === x.stage));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "a stage never comes back");
  for (const g of STAGES) assert.ok(STEPS.some(x => x.stage === g.id), `${g.id} has steps`);
  // Stability first: every balance step is a hold of at least 2 s.
  for (const x of STEPS.filter(x => x.stage === "balance")) assert.ok(x.hold >= 2, x.id);
  // Each step has words for Simulation and Experimental, and they differ where the pads differ.
  const c = (setup: Setup | null): HowContext => ({ setup, push: "A / Cross", three: "B / Circle", modifier: "L3", feet: "dpad" });
  for (const x of STEPS) for (const setup of ["simulation", "experimental", "diggate", "explorer", "repertoire", null] as const) assert.ok(x.how(c(setup)).length > 20, `${x.id} ${setup}`);
  assert.match(STEPS[1].how(c("simulation")), /Tap A \/ Cross three times/);
  assert.match(STEPS[1].how(c("experimental")), /Snap LT, then RT/);
  assert.match(STEPS[5].how(c("experimental")), /tap A: a three-turn/);
  assert.match(STEPS[5].how(c("simulation")), /tap B \/ Circle: a three-turn/);
  assert.match(STEPS[6].how(c("simulation")), /hold L3 \+ D-pad ←/);
  assert.match(STEPS[6].how(c("experimental")), /X \+ B \(both feet\), hold LB \+ D-pad ←/);
  assert.match(STEPS[7].how(c("diggate")), /hold LB \+ RB/);
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
//   spin   Simulation 3.933 (L3 + right stick 0.7 through the release, 0.5 in the air,
//          soft knees: 0.89 rev, clean; with straight legs in the air, a step-out; the arms
//          snapped in after landing instead of eased, a fall 1.7 s later). Experimental 3.900
//          (B + RT together 0.3 s, soft knees in the air: 2.42 rev, clean; held 0.4 s, 2.17
//          and a step-out, a fall — the takeoff's timing is the skill).
const PASS: Record<string, Record<Pad, number>> = {
  glide: { simulation: 4.008, experimental: 4.008 },
  push: { simulation: 5.0, experimental: 3.45 },
  knees: { simulation: 3.092, experimental: 3.092 },
  edge: { simulation: 3.542, experimental: 3.542 },
  other: { simulation: 3.542, experimental: 3.542 },
  turn: { simulation: 3.308, experimental: 3.308 },
  plow: { simulation: 5.933, experimental: 5.933 },
  dig: { simulation: 2.967, experimental: 2.967 },
  hop: { simulation: 3.933, experimental: 3.933 },
  spin: { simulation: 3.933, experimental: 3.9 },
};

for (const setup of ["simulation", "experimental"] as const) for (const x of STEPS) test(`${setup}: "${x.title}" passes on the pad`, () => {
  const r = play(setup, x.id);
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
  // MEASURED: Simulation from 3.5, 4.5, 5.5 m/s: 0.89 rev every time, clean.
  // Experimental from the same, loaded 0.25 or 0.3 s: 1.93-1.95 or 2.42-2.44 rev, clean.
  for (const v of [3.5, 4.5, 5.5]) {
    assert.ok(play("simulation", "spin", 8, 1, v).passed > 0, `simulation from ${v}`);
    for (const load of [0.25, 0.3]) {
      SPIN_LOAD = load;
      try { assert.ok(play("experimental", "spin", 8, 1, v).passed > 0, `experimental from ${v}, loaded ${load} s`); } finally { SPIN_LOAD = 0.3; }
    }
  }
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
  for (const setup of ["simulation", "experimental", "diggate"] as const) assert.equal(new Tutorial(setup, 7).step!.id, "dig");
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
