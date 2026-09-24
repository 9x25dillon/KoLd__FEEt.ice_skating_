// A backward jump entry on the Experimental setup, from play: skating
// backward at 7 m/s on the right back outside edge, wind up (B: weight right,
// arms swung right, against the counter-clockwise rotation) while loading the
// right leg (RT) with the heel dug in, release both together — the takeoff —
// then B again in the air to check the rotation before the ice. The physics
// names the jump off the takeoff (RBO, no pick: a loop) and calls the landing.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

function backJump(checkAt: number) {
  const p = setupParams("experimental"), s = createState(p, -7), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  let took = -1, L = 0, landed = false;
  for (let i = 0; i < 480 && !s.fallen && !landed; i++) {
    const t = i * SIM_DT;
    h.buttons.fill(0); h.axes = [0, 0, -0.6, 0];                  // right blade on its outside edge
    if (i < 2) h.buttons[1] = 1;                                  // B: weight on the right foot
    if (t >= 1 && t < 1.35) { h.buttons[7] = 1; h.axes[3] = 1; h.buttons[1] = 1; }    // load, heel, wind-up
    if (took >= 0) { h.axes = [0, 0, 0, 0]; h.buttons[7] = 0.7; h.buttons[1] = t - took >= checkAt ? 1 : 0; }
    const events: EdgeEvent[] = [];
    step(s, setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) { took = t; L = s.jump.angMomentum; }
    if (events.some(e => e.type === EVENT.Landing)) landed = true;
  }
  return { s, L, landed };
}

test("from backward speed: wind up, load, release, check — a double loop, landed", () => {
  // MEASURED (the pendulum with the arms, 2026-09-24): takeoff L 37.5
  // (mostly the arms' whip at takeoff; the heel dig adds a little — the ankle
  // has to lean the body onto the heel rather than put the contact there),
  // air 0.58 s; checked 0.40 s into the air: 2.01 revolutions, called clean,
  // standing. (The ankle alone: 37.2, 1.99; without the pendulum, since /34:
  // 38.7, 2.07; before: 37.0, 1.98.)
  const r = backJump(0.4);
  assert.ok(Math.abs(r.L - 37.54) < 0.1, `L ${r.L.toFixed(1)}`);
  assert.equal(r.landed, true);
  assert.equal(r.s.fallen, false);
  assert.equal(r.s.landed.kind, JUMP.Loop);
  assert.equal(r.s.landed.revolutions, 2);
  assert.ok(Math.abs(r.s.landed.turned - 2.01) < 0.01 && r.s.landed.rotationCall === 0, `turned ${r.s.landed.turned.toFixed(2)}`);
});

test("the check's timing is the skill: early is short, late over-turns into a triple that falls", () => {
  // MEASURED (the pendulum with the arms): at 0.35 s, 1.81 revolutions — a
  // quarter short, landed; at 0.45 s, 2.19 — called a downgraded triple, a
  // fall. (The ankle alone: 1.80, 2.17; without the pendulum: 1.87; 2.26, under-rotated.)
  const early = backJump(0.35), late = backJump(0.45);
  assert.ok(!early.s.fallen && Math.abs(early.s.landed.turned - 1.81) < 0.01 && early.s.landed.rotationCall === 1, `early ${early.s.landed.turned.toFixed(2)}`);
  assert.ok(late.s.fallen && late.s.landed.revolutions === 3, `late: ${late.s.landed.turned.toFixed(2)} turned`);
});
