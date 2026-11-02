// game/padcourse.ts: every course step, and every career element, played the
// way a player plays it: a scripted pad through the setup's own mapping into the
// solver. A step whose words do not work on its pad fails here.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { setupParams, setupInput, SETUPS } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { FeetLayout, GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { Tutorial } from "../game/tutorial.ts";
import { COURSES, courseById, courseSteps, howContext, elementHow, recoverHow } from "../game/padcourse.ts";
import { Choreography, ELEMENTS } from "../game/career.ts";
import type { ElementId } from "../game/career.ts";

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, L3 = 10, UP = 12, LEFT = 14;
const P_TOP_RIGHT = 18, P_BOTTOM_RIGHT = 19, P_TOP_LEFT = 20, P_BOTTOM_LEFT = 21;
const isExp = (s: Setup) => s === "experimental" || s === "diggate";
const twoSticks = (s: Setup) => s === "simulation" || isExp(s);
type H = ControllerHardware;
const lean = (h: H, s: Setup, v: number) => { h.axes[0] = v; if (twoSticks(s)) h.axes[2] = v; };
const bothFeet = (h: H, s: Setup) => { if (isExp(s)) h.buttons[X] = h.buttons[B] = 1; else h.buttons[LB] = h.buttons[RB] = 1; };
const modifier = (h: H, s: Setup) => { h.buttons[isExp(s) ? RB : L3] = 1; };

/** Each step's script: what its own words ask, on each setup. `speed` is where the step starts. */
type Script = { speed: number; pad: (h: H, k: number, s: Setup, feet: FeetLayout) => void };
const SCRIPTS: Record<string, Script> = {
  edge: { speed: 3.7, pad: (h, _k, s) => lean(h, s, 0.5) },
  other: { speed: 3.7, pad: (h, _k, s) => lean(h, s, -0.5) },
  push: { speed: 3.7, pad: (h, k, s) => {
    if (!isExp(s)) { if (k < 180 && k % 60 < 3) h.buttons[A] = 1; return; }
    if (k >= 2 && k < 4) h.buttons[B] = 1;
    if (k >= 10 && k < 190 && (k - 10) % 60 < 8) h.buttons[Math.floor((k - 10) / 60) % 2 ? RT : LT] = 1;
    if (k >= 200 && k < 204) h.buttons[X] = h.buttons[B] = 1;
  } },
  knees: { speed: 3.7, pad: (h, k, s) => { if (isExp(s) && k < 2) h.buttons[X] = h.buttons[B] = 1; h.buttons[LT] = h.buttons[RT] = 0.55; } },
  turn: { speed: 3.7, pad: (h, k, s) => { lean(h, s, k < 144 ? 0.5 : 0); if (k >= 120 && k < 124) h.buttons[isExp(s) ? A : B] = 1; } },
  plow: { speed: 4.5, pad: (h, k, s) => {
    if (s === "explorer") { h.buttons[LT] = 1; return; }
    if (k < 2) bothFeet(h, s);
    if (k < 120) { h.buttons[isExp(s) ? LB : L3] = 1; h.buttons[LEFT] = 1; }
    h.buttons[LT] = h.buttons[RT] = 0.5;
    const m = k < 120 ? 0 : Math.min(1, (k - 119) / 18);
    h.axes[0] = -m; h.axes[2] = m;
  } },
  dig: { speed: -4, pad: (h, k) => { h.axes[0] = h.axes[2] = 0.3; if (k >= 30 && k < 400) h.buttons[LB] = h.buttons[RB] = 1; } },
  hop: { speed: 4.5, pad: (h, k, s) => {
    const t = k * SIM_DT;
    if (isExp(s) && k >= 2 && k < 4) h.buttons[B] = 1;
    if (t >= 1 && t < 1.35) { h.buttons[RT] = 0.95; if (s === "simulation") h.buttons[LT] = 0.95; }
  } },
  arms: { speed: 3.7, pad: (h, k, s) => {
    if (isExp(s)) { if (k < 180) h.buttons[B] = 1; return; }
    if (k < 180) { if (s === "simulation") h.buttons[L3] = 1; h.axes[2] = 0.45; }
  } },
  weight: { speed: 3.7, pad: (h, k, s) => { h.buttons[k < 120 ? (isExp(s) ? X : LB) : (isExp(s) ? B : RB)] = 1; } },
  oneblade: { speed: 3.7, pad: h => { h.axes[0] = 0.6; } },
  stroke: { speed: 3.7, pad: (h, k) => {
    if (k < 2) h.buttons[B] = 1;
    // Bottom to top in a quarter of a second; right stick first, a second apart.
    const c = (k - 10) % 120;
    if (k >= 10 && k < 250) h.axes[Math.floor((k - 10) / 120) % 2 ? 1 : 3] = c < 8 ? 0.95 : c < 16 ? -0.95 : 0;
  } },
  feet: { speed: 4.5, pad: (h, k, s, feet) => {
    const on = k >= 4 && k < 124;
    if (k < 2) bothFeet(h, s);
    const hold = isExp(s) ? LB : L3;
    if (feet === "stickY") { if (on) { h.axes[1] = 0.8; h.axes[3] = 0.8; } return; }
    if (feet === "modifier") {
      if (on) { h.buttons[hold] = 1; h.axes[1] = 0.8; }
      else if (k >= 124 && k < 124 + 120) { h.buttons[hold] = 1; h.axes[1] = -0.8; }
      return;
    }
    if (on) { h.buttons[hold] = 1; h.buttons[LEFT] = 1; }
    if (k >= 130 && k < 134) h.buttons[UP] = 1;
  } },
  spiral: { speed: 4.5, pad: (h, k, s) => { lean(h, s, 0.4); if (k > 120 && k < 720) { h.buttons[Y] = 1; modifier(h, s); } } },
  twizzle: { speed: 4.5, pad: (h, k, s) => { lean(h, s, 0.4); if (k > 120 && k < 240) { if (isExp(s)) { h.buttons[Y] = h.buttons[LB] = 1; } else h.buttons[X] = 1; } } },
  spinhold: { speed: 4.5, pad: (h, k, s) => { lean(h, s, 0.5); if (k > 120) h.buttons[Y] = 1; } },
  paddlefeet: { speed: 4.5, pad: (h, k, s) => {
    if (k < 2) bothFeet(h, s);
    if (k >= 4 && k < 64) h.buttons[P_TOP_RIGHT] = 1;
    if (k >= 70 && k < 74) h.buttons[UP] = 1;
    if (k >= 80 && k < 140) h.buttons[P_TOP_LEFT] = 1;
  } },
  paddleleg: { speed: 3.7, pad: (h, k) => { if (k < 4) h.buttons[B] = 1; if (k >= 60 && k < 240) h.buttons[P_BOTTOM_LEFT] = 1; } },
  paddleweight: { speed: 3.7, pad: (h, k) => { h.buttons[k < 120 ? P_BOTTOM_LEFT : P_BOTTOM_RIGHT] = 1; } },
};

function play(setup: Setup, id: string, feet: FeetLayout = "dpad", T = 15) {
  const course = COURSES.flatMap(c => c.steps).find(x => x.id === id)!;
  const p = setupParams(setup), { speed, pad } = SCRIPTS[id], s = createState(p, speed);
  const profile = { ...defaultControllerProfile(), feet }, st: GameControlState = newSchemeState();
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const h: H = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  const tut = new Tutorial(setup, 0, [course]);
  tut.side = -Math.sign(id === "other" ? -1 : 1) || 1;
  let k = 0;
  for (; k < T / SIM_DT && !tut.done; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    pad(h, k, setup, feet);
    step(s, setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, p, SIM_DT, [], ice);
    tut.sample(s, SIM_DT);
  }
  return { passed: tut.done ? +(k * SIM_DT).toFixed(3) : -1, falls: tut.falls, s };
}

for (const course of COURSES) for (const setup of course.setups) for (const x of courseSteps(course, setup)) {
  const layouts: FeetLayout[] = x.id === "feet" ? ["dpad", "stickY", "modifier"] : ["dpad"];
  for (const feet of layouts) test(`${course.id} on ${setup}: "${x.title}" (${x.id}${x.id === "feet" ? `, ${feet}` : ""}) passes on the pad, standing`, () => {
    const r = play(setup, x.id, feet);
    assert.ok(r.passed > 0, `never passed; fallen ${r.s.fallen}, moved ${r.s.move}`);
    assert.equal(r.falls, 0, "without a fall");
  });
}

test("every setup has a course, its words differ, and they name the bindings in use", () => {
  for (const s of SETUPS) assert.ok(COURSES.some(c => c.setups.includes(s.id)), s.id);
  const profile = defaultControllerProfile();
  for (const course of COURSES) for (const setup of course.setups) for (const x of courseSteps(course, setup))
    assert.ok(x.how(howContext(setup, profile)).length > 20, `${course.id} ${x.id}`);
  const moved = { ...profile, bindings: { ...profile.bindings, push: { button: 3, modified: false } } };
  assert.match(courseById("explorer")!.steps.find(x => x.id === "push")!.how(howContext("explorer", moved)), /Y \/ Triangle/);
  assert.match(courseSteps(courseById("paddles")!, "experimental")[1].how(howContext("experimental", profile)), /bottom-left paddle/);
  // The paddle course fits the body: Experimental has the free leg, Simulation the weight.
  assert.deepEqual(courseSteps(courseById("paddles")!, "experimental").map(x => x.id), ["paddlefeet", "paddleleg"]);
  assert.deepEqual(courseSteps(courseById("paddles")!, "simulation").map(x => x.id), ["paddlefeet", "paddleweight"]);
});

test("toe-in words follow the feet layout", () => {
  const x = courseById("simulation")!.steps.find(s => s.id === "feet")!, base = defaultControllerProfile();
  const how = (feet: FeetLayout) => x.how(howContext("simulation", { ...base, feet }));
  assert.match(how("dpad"), /D-pad ←/);
  assert.match(how("stickY"), /pull both sticks down/);
  assert.match(how("modifier"), /pull the left stick down/);
});

// ── a fall: the words for getting up must work ──────────────────────────────

for (const s of SETUPS) test(`${s.id}: the fall prompt's words get the skater up`, () => {
  const p = setupParams(s.id), state = createState(p, 3), st: GameControlState = newSchemeState(), profile = defaultControllerProfile();
  const h: H = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  state.fallen = true;
  const exp = isExp(s.id);
  assert.match(recoverHow(howContext(s.id, profile)), exp ? /Snap a trigger/ : /A \/ Cross/);
  let k = 0;
  for (; k < 240 && state.fallen; k++) {
    h.buttons.fill(0);
    if (k >= 30 && k < 36) h.buttons[exp ? RT : A] = 1;
    step(state, setupInput({ hardware: h } as Controls, state, s.id, st, p, profile).input, p, SIM_DT, []);
  }
  assert.equal(state.fallen, false, "still down after the prompt's input");
});

// ── the career: every element, on every setup, by its own words ─────────────

/** What elementHow says for the elements the ladder uses, as a pad. Elements settle from a glide at 4.5 m/s. */
const ELEMENT_PADS: Partial<Record<ElementId, (h: H, k: number, s: Setup) => void>> = {
  glide: (h, k, s) => { if (isExp(s) ? false : k % 240 === 30) h.buttons[A] = 1; if (isExp(s) && k > 2 && k < 240 && k % 60 < 8) h.buttons[Math.floor(k / 60) % 2 ? RT : LT] = 1; },
  edge: (h, _k, s) => lean(h, s, 0.5),
  crossover: (h, k, s) => {
    if (isExp(s)) {
      // A three-turn to backward, then deeper with soft knees: test/setups.test.ts's automatic crossovers.
      lean(h, s, k < 240 ? 0.5 : 0.65);
      if (k >= 120 && k < 124) h.buttons[A] = 1;
      if (k >= 240) h.buttons[LT] = h.buttons[RT] = 0.6;
      return;
    }
    lean(h, s, 0.6);
    if (k > 60 && k % 90 < 3) h.buttons[A] = 1;
  },
  jump: SCRIPTS.hop.pad as (h: H, k: number, s: Setup) => void,
  spin: (h, k, s) => { lean(h, s, 0.5); if (k > 120) h.buttons[Y] = 1; },
  pose: (h, k, s) => { if (k > 30) { h.buttons[A] = 1; modifier(h, s); } },
};

for (const s of SETUPS) for (const id of Object.keys(ELEMENT_PADS) as ElementId[]) test(`career on ${s.id}: "${ELEMENTS[id].title}" is done by its own words`, () => {
  const p = setupParams(s.id), state = createState(p, 4.5), st: GameControlState = newSchemeState(), profile = defaultControllerProfile();
  const h: H = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  const routine = new Choreography({ id: "t", title: "t", venue: "t", seconds: 30, routine: [id] });
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  let k = 0;
  for (; k < 30 / SIM_DT && !routine.done; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    ELEMENT_PADS[id]!(h, k, s.id);
    const events: never[] = [];
    const mapped = setupInput({ hardware: h } as Controls, state, s.id, st, p, profile);
    step(state, mapped.input, p, SIM_DT, events, ice);
    routine.sample(state, mapped.cantilever, SIM_DT, events);
  }
  assert.ok(routine.complete, `not done in 30 s; ${routine.falls} falls, fallen ${state.fallen}`);
  assert.ok(elementHow(id, howContext(s.id, profile)).length > 20);
});

test("the career's words name the setup's pad, and no setup is told a button it does not have", () => {
  const profile = defaultControllerProfile(), how = (id: ElementId, s: Setup) => elementHow(id, howContext(s, profile));
  assert.match(how("glide", "experimental"), /Snap LT and RT/);
  assert.match(how("glide", "explorer"), /A \/ Cross/);
  assert.match(how("edge", "simulation"), /both sticks/);
  assert.match(how("edge", "explorer"), /the left stick/);
  assert.match(how("pose", "experimental"), /RB \+ A/);
  assert.match(how("pose", "simulation"), /L3 \+ A/);
  for (const id of Object.keys(ELEMENTS) as ElementId[]) for (const s of SETUPS) {
    const words = how(id, s.id);
    assert.doesNotMatch(words, /Space|Beginner|D-pad up/, `${id} on ${s.id}: keyboard or legacy words`);
    assert.ok(words.length > 20);
  }
});
