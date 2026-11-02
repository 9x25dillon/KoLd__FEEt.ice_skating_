// game/training.ts: rust through a real solver, on real takeoffs.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { RustGate } from "../game/training.ts";
import type { Rust } from "../game/training.ts";

const LT = 6, RT = 7, L3 = 10, R3 = 11;
const pad = (): ControllerHardware => ({ axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true });

/** One takeoff on Simulation's technique (test/tutorial.test.ts). `pick` taps the toe late in a load, with the arms left alone. */
function jump(rust: Rust, o: { speed?: number; lean?: number; load?: number; arm?: number; soft?: number; pick?: boolean } = {}) {
  const { speed = 4.5, lean = 0.5, load = 0.3, arm = 0.5, soft = 0.5, pick = false } = o;
  const p = setupParams("simulation"), s = createState(p, speed), st = newSchemeState(), profile = defaultControllerProfile();
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth), gate = new RustGate(rust), h = pad();
  let toeInLoad = false, fell = false;
  for (let k = 0; k < 5 / SIM_DT; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    const t = k * SIM_DT, end = 1 + load, inLoad = t >= 1 && t < end;
    h.axes[0] = t < end ? lean : 0;
    h.axes[2] = pick ? (t < end ? lean : 0) : t < 1 ? lean : inLoad ? arm : 0;
    if (inLoad) { h.buttons[LT] = h.buttons[RT] = 1; if (!pick) h.buttons[L3] = 1; }
    else if (t >= end + 0.1) h.buttons[LT] = h.buttons[RT] = soft;
    if (pick && t >= end - 0.06 && t < end - 0.04) h.buttons[R3] = 1;
    step(s, gate.apply(setupInput({ hardware: h } as Controls, s, "simulation", st, p, profile).input, s), p, SIM_DT, [], ice);
    toeInLoad ||= s.jump.toeInLoad;
    fell ||= s.fallen;
  }
  return { turned: Math.abs(s.landed.turned), clean: s.landed.tick >= 0 && !s.landed.fall && !s.landed.stepOut && !fell, toeInLoad };
}
const SHARP: Rust = { toe: 0, edge: 0 };

test("no rust changes nothing at all: the gate is the identity", () => {
  const a = jump(SHARP), s = createState(setupParams("simulation"), 4.5);
  assert.ok(a.clean && a.turned >= 0.5, `the sharp jump lands: ${a.turned}`);
  const h = pad(); h.axes = [0.5, 0, 0.5, 0];
  const input = { ...setupInput({ hardware: h } as Controls, s, "simulation", newSchemeState(), setupParams("simulation"), defaultControllerProfile()).input };
  assert.deepEqual(new RustGate(SHARP).apply(input, s), input);
});

test("edge rust makes turning takeoffs harder to land, and more so the rustier", () => {
  const good = (edge: number) => {
    let n = 0;
    for (const speed of [3, 4.5, 5.5]) for (const lean of [0.3, 0.5, 0.7]) for (const load of [0.25, 0.3, 0.35, 0.4]) for (const arm of [0.3, 0.5, 0.7]) for (const soft of [0.3, 0.5, 0.7]) {
      const r = jump({ toe: 0, edge }, { speed, lean, load, arm, soft });
      if (r.clean && r.turned >= 0.5) n++;
    }
    return n;
  };
  const sharp = good(0), half = good(0.5), full = good(1);
  assert.ok(full < half && half < sharp, `of 324: sharp ${sharp}, half ${half}, full ${full}`);
  assert.ok(full > 0, "harder, never closed: a rusty jump can still be landed");
});

test("toe rust makes a late pick miss the load, and leaves a jump with no pick alone", () => {
  assert.equal(jump(SHARP, { pick: true }).toeInLoad, true, "sharp: the pick is in the load");
  assert.equal(jump({ toe: 1, edge: 0 }, { pick: true }).toeInLoad, false, "rusty: the same tap comes too late");
  assert.deepEqual(jump({ toe: 1, edge: 0 }), jump(SHARP), "toe rust does not touch a jump with no pick");
});
