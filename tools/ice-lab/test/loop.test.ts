import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FixedStep } from "../app/loop.ts";

test("fixed ticks are display-rate independent, bounded on stalls, and stop on pause", (t) => {
  t.mock.method(performance, "now", () => 0);
  const old = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  let callback: FrameRequestCallback = () => {};
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true, value: (fn: FrameRequestCallback) => { callback = fn; return 0; },
  });
  try {
    for (const hz of [30, 60, 144]) {
      let ticks = 0;
      const clock = new FixedStep(() => ticks++, () => {});
      clock.start();
      for (let i = 1; i <= hz * 10; i++) callback(i * 1000 / hz + 1e-7);
      assert.equal(ticks, 1200, `${hz} Hz must simulate ten seconds at 120 Hz`);
      assert.ok(clock.alpha >= 0 && clock.alpha < 1);
    }
    let ticks = 0, draws = 0;
    const clock = new FixedStep(() => { ticks++; clock.paused = true; }, () => draws++);
    clock.start(); callback(100);
    assert.equal(ticks, 1, "pausing in a tick must abort the remaining catch-up steps");
    callback(200);
    assert.equal(ticks, 1);
    assert.equal(clock.lastSteps, 0);
    assert.equal(draws, 2, "presentation/input polling still runs while paused");
    clock.paused = false; callback(209);
    assert.equal(ticks, 2, "paused time must not become a catch-up backlog");
    let stalledTicks = 0;
    const stalled = new FixedStep(() => stalledTicks++, () => {});
    stalled.start(); callback(-1); callback(NaN); callback(0); callback(10_000);
    assert.equal(stalledTicks, 8, "a stall drops time instead of changing the physics step");
    assert.equal(stalled.alpha, 0);
  } finally {
    if (old) Object.defineProperty(globalThis, "requestAnimationFrame", old);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  }
});
