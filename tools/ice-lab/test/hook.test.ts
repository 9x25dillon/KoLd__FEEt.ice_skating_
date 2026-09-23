// Speed into spin through the edge. The takeoff carries the curve's turning
// (jump.ts: jumpRotBias x yawRate), and a steady carve turns at g tan(lean) / v
// — so at one lean, faster turns slower. What speed buys is a deeper edge:
// leans that fall at 4-5 m/s hold at 7, and the deepest held edge takes off
// with the most spin. A late hook — deepening during the load — takes spin
// away: to lean further the body first steers out from under itself, and the
// curve eases at the very moment of takeoff. Loop edge (RBO), no arms.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { setupParams } from "../game/setups.ts";

/** Backward at `v` on the right outside edge at lean `base`; load 0.3 s while the lean goes to `hook`; release. */
function loop(v: number, base: number, hook = base) {
  const p = { ...setupParams("experimental"), jumpMode: 2 }, s = createState(p, -v, base * p.maxLean);
  for (let i = 0; i < 200 && !s.fallen; i++) {
    const lean = i >= 144 ? base + (hook - base) * Math.min(1, (i - 144) / 30) : base;
    const events: Parameters<typeof step>[4] = [];
    step(s, { ...NEUTRAL_INPUT, lean, weight: 1, knee: i < 144 ? 0.5 : i < 180 ? 0.95 : 0.2 }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) return { L: s.jump.angMomentum, kind: s.jump.kind, fell: false };
  }
  return { L: NaN, kind: -1, fell: s.fallen };
}
const near = (x: number, y: number) => Math.abs(x - y) < 0.01;

test("speed buys a deeper edge, and the deepest held edge takes off with the most spin", () => {
  // MEASURED at 7 m/s: lean 0.3 L 2.39, 0.5 4.19, 0.7 6.65, 0.9 10.24 (a loop).
  // Lean 0.9 falls at 5 and 6 m/s; 0.7 falls at 5.
  const at7 = [-0.3, -0.5, -0.7, -0.9].map(lean => loop(7, lean));
  assert.ok(at7.every(r => r.kind === JUMP.Loop));
  assert.deepEqual(at7.map(r => r.L.toFixed(2)), ["2.39", "4.19", "6.65", "10.24"]);
  assert.equal(loop(6, -0.9).fell, true);
  assert.equal(loop(5, -0.7).fell, true);
  // One lean, faster turns slower: g tan(lean) / v.
  assert.ok(near(loop(5, -0.5).L, 5.84) && near(loop(6, -0.5).L, 4.87));
});

test("a late hook — deepening the edge during the load — takes spin away", () => {
  // MEASURED at 7 m/s: held at 0.5, L 4.19; deepened to 0.9 during the load, 2.54.
  assert.ok(near(loop(7, -0.5, -0.9).L, 2.54), "the counter-steer lands on the takeoff");
});

test("near 8 m/s the edge starts to let go, and a skidding blade does not steer: less curve spin", () => {
  // MEASURED at lean 0.9: 7 m/s L 10.24, 8 m/s 6.16 (skid onset ~8.4 m/s).
  assert.ok(near(loop(8, -0.9).L, 6.16));
});
