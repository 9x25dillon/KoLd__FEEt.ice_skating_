// A backward jump entry on the Experimental setup: skating backward at 7 m/s
// on a deep back outside edge, RT half to hold the knee, then RT full with B
// (the arms wound against the rotation) and X (swung with it) until the blade
// leaves, then B again in the air to check the rotation before the ice. The
// physics names the jump off the takeoff (RBO, no pick: a loop) and calls the
// landing.
//
// Re-scripted 2026-11-02. These tests came from play on 2026-09-23: B and heel
// held all through the load, on the right stick alone. Since armsWhipMode
// (2026-09-25) arms held wound swing against the jump, so that script now
// leaves with no spin at all; the last test here keeps it as the proof. The new
// script is a measured search result (2 clean doubles in 10,080 tries, both
// from 7 m/s at full lean). It says a script can land the double, not that a
// player can.

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

const LOAD_AT = 1.5, LOAD = 0.5, SWING_AT = 0.1;
/** Ticks of run-out after the touchdown: "landed" means still standing after 1.2 s. */
const RUN_OUT = 144;

function run(pad: (h: ControllerHardware, t: number, i: number, took: number) => void) {
  const p = setupParams("experimental"), s = createState(p, -7), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  let took = -1, L = 0, landed = false;
  const tick = (press: () => void, events: EdgeEvent[] = []) => {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    press();
    step(s, setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input, p, SIM_DT, events);
    return events;
  };
  for (let i = 0; i < 480 && !s.fallen && !landed; i++) {
    const t = i * SIM_DT, events = tick(() => pad(h, t, i, took));
    if (took < 0 && events.some(e => e.type === EVENT.Takeoff)) { took = t; L = s.jump.angMomentum; }
    if (events.some(e => e.type === EVENT.Landing)) landed = true;
  }
  if (landed) for (let i = 0; i < RUN_OUT && !s.fallen; i++) tick(() => {
    h.buttons[7] = 0.5; h.buttons[1] = 1;
    if (i >= 18) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
  });
  return { s, L, landed };
}

function backJump(checkAt: number) {
  return run((h, t, i, took) => {
    if (took >= 0) { h.buttons[7] = 0.7; h.buttons[1] = t - took >= checkAt ? 1 : 0; return; }
    if (i < 2) h.buttons[1] = 1;                                 // B: weight on the right foot
    h.axes[0] = h.axes[2] = -Math.min(1, t / 0.5);               // both sticks: the deep edge
    if (t < LOAD_AT) h.buttons[7] = 0.5;                         // RT half: the knee held
    if (t >= LOAD_AT && t < LOAD_AT + LOAD) {
      h.buttons[7] = 1;                                          // RT full: load
      h.buttons[t - LOAD_AT < SWING_AT ? 1 : 2] = 1;             // B wound, then X swung with the jump
    }
  });
}

test("from backward speed: load with the arms swung the jump's way, release, check — a clean double loop, standing after", () => {
  // MEASURED 2026-11-02: takeoff L 28.65, checked 0.40 s into the air: 1.994
  // revolutions, called clean, standing through a 1.2 s run-out.
  const r = backJump(0.4);
  assert.ok(Math.abs(r.L - 28.65) < 0.1, `L ${r.L.toFixed(2)}`);
  assert.equal(r.landed, true);
  assert.equal(r.s.fallen, false);
  assert.equal(r.s.landed.kind, JUMP.Loop);
  assert.equal(r.s.landed.revolutions, 2);
  assert.ok(Math.abs(r.s.landed.turned - 1.994) < 0.01 && r.s.landed.rotationCall === 0, `turned ${r.s.landed.turned.toFixed(3)}`);
});

test("the check's timing is the skill: early is short and falls, late over-turns and falls", () => {
  // MEASURED 2026-11-02: at 0.35 s, 1.66 revolutions; at 0.45 s, 2.20. Both
  // fall. Only the 0.40 s check stands.
  const early = backJump(0.35), late = backJump(0.45);
  assert.ok(early.s.fallen && Math.abs(early.s.landed.turned - 1.66) < 0.01, `early ${early.s.landed.turned.toFixed(3)}`);
  assert.ok(late.s.fallen && Math.abs(late.s.landed.turned - 2.20) < 0.01, `late ${late.s.landed.turned.toFixed(3)}`);
});

test("arms held wound against the jump all through the load turn it the other way, a little", () => {
  // The script these tests used until 2026-11-02, from play on 2026-09-23.
  // Negative control: L was 37.5 before armsWhipMode, then no spin at all.
  // Since jumpDirMode (2026-11-09) the arms' clockwise swing is not thrown
  // away: MEASURED L -1.05, a faint clockwise turn.
  const r = run((h, t, i, took) => {
    h.axes = [0, 0, -0.6, 0];
    if (i < 2) h.buttons[1] = 1;
    if (t >= 1 && t < 1.35) { h.buttons[7] = 1; h.axes[3] = 1; h.buttons[1] = 1; }
    if (took >= 0) { h.axes = [0, 0, 0, 0]; h.buttons[7] = 0.7; }
  });
  assert.ok(Math.abs(r.L + 1.05) < 0.01, `L ${r.L.toFixed(2)}`);
});
