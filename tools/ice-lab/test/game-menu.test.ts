import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MenuInput } from "../game/menu.ts";
import type { ControllerHardware } from "../app/pad.ts";

function hardware(buttons: number[] = [], axes = [0, 0, 0, 0]): ControllerHardware {
  return { connected: true, keys: [], axes, buttons: Array.from({ length: 17 }, (_, i) => buttons.includes(i) ? 1 : 0) };
}

test("menu A, B and Menu activate once per press, including after reconnect", () => {
  const input = new MenuInput();
  let action = input.read(hardware([0, 1, 9]), 0);
  assert.ok(action.accept && action.back && action.start);
  action = input.read(hardware([0, 1, 9]), 16);
  assert.ok(!action.accept && !action.back && !action.start);
  assert.equal(input.read(undefined, 32).disconnected, true);
  assert.equal(input.read(undefined, 48).disconnected, false);
  assert.equal(input.read(hardware([0]), 64).accept, true);
});

test("menu repeat has an initial delay then repeats at a controlled rate", () => {
  const input = new MenuInput();
  assert.equal(input.read(hardware([13]), 0).vertical, 1);
  assert.equal(input.read(hardware([13]), 399).vertical, 0);
  assert.equal(input.read(hardware([13]), 400).vertical, 1);
  assert.equal(input.read(hardware([13]), 539).vertical, 0);
  assert.equal(input.read(hardware([13]), 540).vertical, 1);
  assert.equal(input.read(hardware([12]), 550).vertical, -1);
});

test("stick drift cannot navigate and diagonal input has one direction", () => {
  const input = new MenuInput();
  let action = input.read(hardware([], [0.4, -0.5]), 0);
  assert.equal(action.horizontal, 0); assert.equal(action.vertical, 0);
  action = input.read(hardware([], [1, -1]), 16);
  assert.equal(action.horizontal, 0); assert.equal(action.vertical, -1);
  input.read(hardware(), 32);
  assert.equal(input.read(hardware([], [1, 0]), 48).horizontal, 1);
});

test("stale disconnected hardware cannot activate a menu", () => {
  const input = new MenuInput();
  const stale = { ...hardware([0, 9, 13], [1, 1]), connected: false };
  assert.deepEqual(input.read(stale, 0), { accept: false, back: false, start: false,
    horizontal: 0, vertical: 0, disconnected: false });
});
