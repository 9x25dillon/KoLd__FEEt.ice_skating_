// The body sways over a planted blade (comSwayMode, 2026-11-20): off by
// default and in every setup. Under the mode a weight shift moves the body
// over the blades instead of sliding the blades under it; the load follows a
// minimum-jerk curve (comSwayTransferTime, 0.35 s authored), and the legs'
// push is capped at what the blades' bite still holds, so the sway never
// skids a blade by itself. Measured on the Simulation setup's params with the
// mode switched on here; docs/reports/comsway-2026-11-20.md has the numbers.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, PRESETS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { SETUPS, setupParams } from "../game/setups.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { dot, perpLeft, sub } from "../sim/math.ts";
import { replayDigest } from "../sim/replay.ts";

const OFF: Params = setupParams("simulation");
const ON: Params = { ...OFF, comSwayMode: 1 };
const G = 9.81;
/** m/s²: the plan's own peak, a whole load (2 * stanceHalfWidth) over comSwayTransferTime, minimum jerk. */
const PLAN_PEAK = 5.7735 * 2 * ON.stanceHalfWidth / (ON.comSwayTransferTime ** 2);

interface Glide { speed: number; lean: number; weights: number[]; hold: number }
interface Measured {
  smearMax: number;   // m: the most a loaded blade moved across its own line in a tick
  sway: number;       // m: the body's sideways range, across the travel
  peak: number;       // m/s²: the body's sway acceleration (mode on)
  skids: number;      // SkidBegin events
  fallen: boolean;
  states: SkaterState[];
}

/** A glide on one weight, then each weight in turn for `hold` ticks: the pad's 0 / 0.5 / 1 steps. */
function glide(p: Params, g: Glide): Measured {
  const s = createState(p, g.speed, 0), states: SkaterState[] = [];
  const lean = g.lean, w = (x: number) => x;
  for (let i = 0; i < 90; i++) step(s, { ...NEUTRAL_INPUT, lean, weight: w(g.weights[0]), knee: 0.4 }, p, SIM_DT, []);
  let smearMax = 0, lat = 0, latMax = 0, latMin = 0, peak = 0, skids = 0;
  for (const weight of g.weights.slice(1)) for (let i = 0; i < g.hold; i++) {
    const before = s.blade.map(b => ({ c: { ...b.contact }, n: perpLeft(b.tangent), on: b.inContact }));
    const pos0 = { ...s.pos }, left = perpLeft(s.heading), sv0 = s.swayVel && { ...s.swayVel };
    const events: Parameters<typeof step>[4] = [];
    step(s, { ...NEUTRAL_INPUT, lean, weight: w(weight), knee: 0.4 }, p, SIM_DT, events);
    states.push(structuredClone(s));
    skids += events.filter(e => e.type === EVENT.SkidBegin).length;
    for (let k = 0; k < 2; k++) if (before[k].on && s.blade[k].inContact)
      smearMax = Math.max(smearMax, Math.abs(dot(sub(s.blade[k].contact, before[k].c), before[k].n)));
    lat += dot(sub(s.pos, pos0), left); latMax = Math.max(latMax, lat); latMin = Math.min(latMin, lat);
    if (sv0 && s.swayVel) peak = Math.max(peak, Math.hypot(s.swayVel.x - sv0.x, s.swayVel.y - sv0.y) / SIM_DT);
  }
  return { smearMax, sway: latMax - latMin, peak, skids, fallen: s.fallen, states };
}

const HALF = [0, 0.5, 1, 0.5, 0, 0.5, 1], WHOLE = [0, 1, 0, 1, 0];
const FLIPS = Array.from({ length: 16 }, (_, k) => k % 2);

test("comSwayMode is 0 by default, in every preset and in every setup, and validates", () => {
  assert.equal(DEFAULT_PARAMS.comSwayMode, 0);
  assert.equal(DEFAULT_PARAMS.comSwayTransferTime, 0.35);
  for (const [name, preset] of Object.entries(PRESETS)) assert.equal(preset.comSwayMode, 0, name);
  for (const { id } of SETUPS) assert.equal(setupParams(id).comSwayMode, 0, id);
  assert.equal(validate({ ...DEFAULT_PARAMS, comSwayMode: 1 }).length, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, comSwayMode: 2 }).length > 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, comSwayTransferTime: 0.05 }).length > 0);
});

test("comSwayMode 0: replay digests are byte-identical, whatever comSwayTransferTime says", () => {
  const digests = (p: Params) => glide(p, { speed: 3, lean: 0.25, weights: HALF, hold: 60 }).states.map(s => replayDigest(s, []));
  assert.deepEqual(digests({ ...OFF, comSwayMode: 0, comSwayTransferTime: 0.9 }), digests(OFF));
});

test("straight on flat blades: the bite caps the sway — part of it, gently, and no skid", () => {
  // MEASURED 2026-11-20: half-load shifts sway the body 15 cm (of a planned
  // 24) at 0.13 g; whole-load shifts 12 cm. A flat blade's sideways bite is
  // small, so the cap holds the rest back and the blades still slide by it.
  for (const [weights, sway] of [[HALF, 0.15], [WHOLE, 0.12]] as const) {
    const off = glide(OFF, { speed: 3, lean: 0, weights, hold: 60 }), on = glide(ON, { speed: 3, lean: 0, weights, hold: 60 });
    assert.equal(off.sway, 0);
    assert.ok(Math.abs(on.sway - sway) < 0.01, `sway ${on.sway.toFixed(3)}`);
    assert.ok(on.peak < 0.15 * G, `peak ${(on.peak / G).toFixed(2)} g`);
    assert.ok(on.smearMax < off.smearMax, `smear ${on.smearMax} vs ${off.smearMax}`);
    assert.equal(on.skids, 0);
    assert.equal(on.fallen, false);
  }
});

test("on an edge the blades stay planted and the body sways over them, both ways round, with no skid", () => {
  // MEASURED 2026-11-20 (blade across its line per tick, max; body sway):
  // +14° 0.11 cm, 27 cm; -14° 0.08 cm, 31 cm (mode off: 1.19 and 1.25 cm, 7 cm).
  for (const [lean, sway] of [[0.25, 0.27], [-0.25, 0.31]] as const) {
    const off = glide(OFF, { speed: 3, lean, weights: HALF, hold: 60 }), on = glide(ON, { speed: 3, lean, weights: HALF, hold: 60 });
    assert.ok(off.smearMax > 0.011, `off smear ${off.smearMax}`);
    assert.ok(on.smearMax < 0.0015, `smear ${(on.smearMax * 100).toFixed(3)} cm`);
    assert.ok(Math.abs(on.sway - sway) < 0.02, `sway ${on.sway.toFixed(3)}`);
    assert.ok(on.peak <= 0.6 * G, `peak ${(on.peak / G).toFixed(2)} g`);
    assert.equal(on.skids, 0);
    assert.equal(on.fallen, false);
  }
});

test("a deep curve at speed: whole-load shifts and rapid flips stay planted, at no more than the plan's peak", () => {
  // MEASURED 2026-11-20, 34° at 6 m/s: whole-load 0.18 cm, 35 cm sway; flips
  // every 0.1 s 0.21 cm, 12 cm. Mode off: 2.37 and 2.17 cm. Peak 1.15 g, the
  // plan's own (the old critically damped start would have needed 21.6 g).
  for (const [weights, hold, sway] of [[WHOLE, 60, 0.35], [FLIPS, 12, 0.12]] as const) {
    const on = glide(ON, { speed: 6, lean: 0.6, weights, hold });
    assert.ok(on.smearMax < 0.0025, `smear ${(on.smearMax * 100).toFixed(3)} cm`);
    assert.ok(Math.abs(on.sway - sway) < 0.02, `sway ${on.sway.toFixed(3)}`);
    assert.ok(on.peak <= PLAN_PEAK * 1.001, `peak ${on.peak.toFixed(2)} vs ${PLAN_PEAK.toFixed(2)}`);
    assert.ok(PLAN_PEAK < 1.2 * G);
    assert.equal(on.skids, 0);
    assert.equal(on.fallen, false);
  }
});

// No exact-mirror test here: on this glide script the solver isn't
// mirror-exact with the mode off either (measured 2026-11-20: the clockwise
// run parts from the counter-clockwise one at tick 21, 5 mm by the end), so
// the claim would be the solver's, not the sway's.
