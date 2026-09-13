// The game layer on an Xbox pad — app/pad.ts, read through a fake gamepad.
//
// The stick clicks were the last two free buttons, so they carry the courses'
// two choices, and the D-pad's left and right became a step the lab
// interprets. A remap is exactly the kind of change that quietly takes a
// button away from something else, so the neighbours are checked too.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Pad } from "../app/pad.ts";

const A_ = 0, L3 = 10, R3 = 11, DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15;

let held: number[] = [];
const gamepad = (): unknown => ({
  connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
});

const g = globalThis as unknown as { window?: unknown; navigator: Record<string, unknown> };
if (g.window === undefined) g.window = { addEventListener: () => { /* no blur in a test */ } };
Object.defineProperty(g.navigator, "getGamepads", { value: () => [gamepad()], configurable: true });

const pad = new Pad({ addEventListener: () => { /* no keys in a test */ } } as unknown as HTMLElement);
const press = (...buttons: number[]) => { held = buttons; return pad.read(); };

test("clicking the left stick is the next course, the right stick the next ghost — once per click", () => {
  press();
  let c = press(L3);
  assert.equal(c.toggleGame, true);
  assert.equal(c.cycleGhost, false);
  c = press(L3);
  assert.equal(c.toggleGame, false, "held is not pressed again");
  press();
  c = press(R3);
  assert.equal(c.cycleGhost, true);
  assert.equal(c.toggleGame, false);
});

test("D-pad left and right are a step for the lab to read, not a zoom", () => {
  press();
  let c = press(DPAD_RIGHT);
  assert.equal(c.dpadStep, 1);
  assert.equal(c.zoom, 0, "zoom from the pad now goes through the lab, so the jump challenge can take it");
  press();
  c = press(DPAD_LEFT);
  assert.equal(c.dpadStep, -1);
  c = press(DPAD_LEFT);
  assert.equal(c.dpadStep, 0, "once per press");
});

test("nothing else moved: D-pad up is jump mode, down is the view, A is a stroke", () => {
  press();
  assert.equal(press(DPAD_UP).cycleJump, true);
  press();
  assert.equal(press(DPAD_DOWN).cycleView, true);
  press();
  const c = press(A_);
  assert.equal(c.push, true);
  assert.equal(c.toggleGame || c.cycleGhost || c.dpadStep !== 0, false);
});

test("with the moves on, B is the turn and a tap of LT the toe pick; LT held still brakes", () => {
  const B_ = 1, LT_ = 6;
  const read = (moves: boolean, ...buttons: number[]) => { held = buttons; return pad.read(moves); };
  read(true);
  let c = read(true, B_);
  assert.equal(c.turn, true, "B is the turn button");
  assert.equal(c.toe, false, "and no longer the pick");
  c = read(true, B_);
  assert.equal(c.turn, true, "held, so the solver can take the press");
  read(true);
  c = read(true, LT_);
  assert.equal(c.toe, true, "the pick strikes on the press of LT");
  assert.equal(c.brake, false, "a tap does not brake");
  for (let i = 0; i < 18; i++) c = read(true, LT_);
  assert.equal(c.toe, false, "once per press");
  assert.equal(c.brake, true, "held past 0.15 s it brakes");
  read(false);
  c = read(false, B_);
  assert.equal(c.toe, true, "with the moves off, B is the pick as it always was");
  assert.equal(c.turn, false);
  assert.equal(read(false, LT_).brake, true, "and LT brakes at once");
});
