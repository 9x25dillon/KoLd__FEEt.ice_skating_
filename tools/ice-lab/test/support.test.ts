// The weight transfer (weightTransferMode) and the support signal
// (sim/support.ts) every presentation poses from.
//
// The script is the one that found the problem on 2026-11-14: gliding forward
// at 3 m/s, the weight input stepped as a pad steps it — all on the left, then
// both, then all on the right.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { dot, perpLeft, sub } from "../sim/math.ts";
import { replayDigest } from "../sim/replay.ts";
import { supportSignal } from "../sim/support.ts";
import type { SupportSignal } from "../sim/support.ts";
import { SETUPS, setupParams } from "../game/setups.ts";

const asked = (t: number): number => t < 0.5 ? 0 : t < 1.0 ? 0.5 : 1;

interface Tick { t: number; s: SkaterState; signal: SupportSignal; across: [number, number] }

function glide(mode: number, seconds = 1.6): Tick[] {
  const p: Params = { ...DEFAULT_PARAMS, weightTransferMode: mode };
  const s = createState(p, 3, 0), out: Tick[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    const t = i * SIM_DT;
    step(s, { ...NEUTRAL_INPUT, weight: asked(t) }, p, SIM_DT, []);
    // Each blade across the body from the COM: the stance as the skater feels it.
    const across = s.blade.map(b => dot(sub(b.contact, s.pos), perpLeft(s.heading))) as [number, number];
    out.push({ t, s: structuredClone(s), signal: supportSignal(s), across });
  }
  return out;
}

const worst = (ticks: Tick[], f: (a: Tick, b: Tick) => number): number =>
  ticks.slice(1).reduce((m, b, i) => Math.max(m, f(ticks[i], b)), 0);

test("the mode is valid only as 0 or 1, and a transfer time inside 0.05–1 s", () => {
  assert.equal(validate({ ...DEFAULT_PARAMS, weightTransferMode: 1 }).length, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, weightTransferMode: 2 }).length > 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, weightTransferTime: 0 }).length > 0);
});

test("mode 0, as before: a stepped input moves the whole load in one tick and the stance jumps under it", () => {
  // MEASURED 2026-11-14: 100/0 to 50/50 in one tick, the left contact 12 cm sideways in the same tick.
  const ticks = glide(0);
  assert.ok(worst(ticks, (a, b) => Math.abs(b.s.blade[1].weight - a.s.blade[1].weight)) >= 0.5);
  assert.ok(worst(ticks, (a, b) => Math.abs(b.across[0] - a.across[0])) >= 0.11);
  assert.ok(ticks.every(k => k.signal.phase !== "shift" && k.signal.rate[1] === 0));
});

test("mode 1: the load moves over time, its rate continuous, and no contact jumps", () => {
  const ticks = glide(1);
  // A whole share step at weightTransferTime 0.25 s peaks near 0.09 per tick (omega / e).
  const dShare = worst(ticks, (a, b) => Math.abs(b.s.blade[1].weight - a.s.blade[1].weight));
  assert.ok(dShare < 0.1, `share moved ${dShare.toFixed(3)} in one tick`);
  const dRate = worst(ticks, (a, b) => Math.abs((b.s.loadRate ?? 0) - (a.s.loadRate ?? 0)));
  assert.ok(dRate < 8, `share rate jumped ${dRate.toFixed(2)} /s in one tick`);
  const dAcross = worst(ticks, (a, b) => Math.max(Math.abs(b.across[0] - a.across[0]), Math.abs(b.across[1] - a.across[1])));
  assert.ok(dAcross < 0.025, `a contact moved ${(dAcross * 100).toFixed(1)} cm across in one tick`);
  // Each step of the input is finished inside the transfer time.
  const at = (t: number) => ticks[Math.round(t / SIM_DT)].s;
  assert.equal(at(0.49).blade[0].weight, 1);
  assert.equal(at(0.99).blade[1].weight, 0.5);
  assert.equal(at(1.3).blade[1].weight, 1);
});

test("mode 1: a blade leaves the ice when its share reaches zero, not when the input changes", () => {
  const ticks = glide(1);
  const asksRight = ticks.findIndex(k => k.t >= 1.0);
  const leaves = ticks.findIndex((k, i) => i > asksRight && !k.s.blade[0].inContact);
  const seconds = (leaves - asksRight) * SIM_DT;
  assert.ok(seconds > 0.15 && seconds <= 0.25, `the left blade left ${seconds.toFixed(3)} s after the ask`);
  assert.ok(ticks.slice(asksRight, leaves).every(k => k.s.blade[0].inContact && k.s.supportMode === 2));
});

test("mode 1, the signal: both, then a shift toward the right with the right taking, then one foot carrying", () => {
  const ticks = glide(1);
  const phases = ticks.filter(k => k.t >= 0.9).map(k => k.signal.phase)
    .filter((ph, i, all) => i === 0 || all[i - 1] !== ph);
  assert.deepEqual(phases, ["both", "shift", "one"]);
  const mid = ticks.find(k => k.t >= 1.08)!.signal;
  assert.equal(mid.toward, 1);
  assert.deepEqual(mid.role, ["giving", "taking"]);
  assert.ok(mid.rate[1] > 0 && mid.rate[0] === -mid.rate[1]);
  const end = ticks.at(-1)!;
  assert.deepEqual(end.signal.role, ["free", "carrying"]);
  assert.deepEqual(end.signal.share, [0, 1]);
  // On one foot the pressure is at that blade, and the COM is over it.
  assert.ok(Math.hypot(end.signal.cop.x - end.s.blade[1].contact.x, end.signal.cop.y - end.s.blade[1].contact.y) < 1e-9);
  assert.ok(Math.abs(end.signal.comOver.across) < 0.01);
});

test("mode 1: the centre of pressure stays under the COM while the stance moves round it", () => {
  // The pendulum's base is the centre of pressure, at every share: upright and
  // straight, the body is over it throughout a shift.
  for (const k of glide(1)) {
    assert.ok(Math.abs(k.signal.comOver.across) < 0.01, `t ${k.t.toFixed(3)}: COM ${k.signal.comOver.across.toFixed(3)} m across the pressure`);
    assert.ok(Math.abs(k.signal.share[0] + k.signal.share[1] - 1) < 1e-12);
  }
});

test("the signal is read-only: computing it changes no digest", () => {
  const p: Params = { ...DEFAULT_PARAMS, weightTransferMode: 1 };
  const s = createState(p, 3, 0);
  for (let i = 0; i < 150; i++) {
    step(s, { ...NEUTRAL_INPUT, weight: asked(i * SIM_DT) }, p, SIM_DT, []);
    const before = replayDigest(s, []);
    supportSignal(s);
    assert.equal(replayDigest(s, []), before);
  }
});

test("the setups: the transfer is on where the feet are (Simulation, Experimental, Dig Gate), off elsewhere", () => {
  // The owner's word, 2026-11-14: "turn it on and re-tune them". On, 51 pinned
  // tests moved and were re-measured or re-searched (docs/support-signal.md).
  const on = new Set(["simulation", "experimental", "diggate"]);
  for (const setup of SETUPS) assert.equal(setupParams(setup.id).weightTransferMode, on.has(setup.id) ? 1 : 0, setup.id);
});

test("the mirror is exact through a transfer: the bias about the even split negates exactly", () => {
  const p: Params = { ...DEFAULT_PARAMS, weightTransferMode: 1 };
  const a = createState(p, 3, 0), b = createState(p, 3, 0);
  for (let i = 0; i < 192; i++) {
    const w = asked(i * SIM_DT);
    step(a, { ...NEUTRAL_INPUT, weight: w }, p, SIM_DT, []);
    step(b, { ...NEUTRAL_INPUT, weight: 1 - w }, p, SIM_DT, []);
    // === rather than Object.is: 0 and -0 are the same place.
    assert.ok(a.loadBias === -b.loadBias!, `tick ${i}: bias ${a.loadBias} / ${b.loadBias}`);
    assert.ok(a.blade[0].weight === b.blade[1].weight, `tick ${i}: shares`);
    assert.ok(a.pos.y === -b.pos.y && a.pos.x === b.pos.x, `tick ${i}: position`);
  }
});
