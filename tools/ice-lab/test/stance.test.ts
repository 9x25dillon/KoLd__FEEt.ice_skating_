// The two-footed stance: its rate term and its aim (copRateGain, copCommandShare).
//
// As the package has it, the centre-of-pressure term is proportional on the
// balance error and aims for the lean the edge alone balances. Two-footed it
// pulls against the lean controller, and entering a lean from upright its
// undamped push runs the body past anything the edge can hold: the blade pins
// at maxTilt and the skater goes down. One-footed there is no stance term and
// none of this happens. The fix is the rate half of the stance's PD, as the
// arms got theirs (finding 5), and an aim at the lean the skater commands as
// far as the edge could carry the stance's load at this speed — so standing
// still, where the edge carries nothing, is exactly what it was.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";

const deg = (r: number): number => r * 180 / Math.PI;

/**
 * `responsive` without the stance's two levers, built by ADDING to `spec` —
 * never by subtracting from a preset, which rots the day the preset moves.
 */
const packageStance: Params = {
  ...DEFAULT_PARAMS, balanceKd: 16.0, angulationLimit: 0.70,
  internalRateGain: 2.0, internalWashout: 1.5, fallAuthorityCredit: 1.0,
};
const fixed = PRESETS.responsive;

interface Run { final: number; max: number; overshoot: number; pinned: number; fellAt: number; settledAt: number }

/** Skate with a lean command in degrees (a function of the tick, for a slalom). */
function lean(p: Params, speed: number, cmd: (i: number) => number, weight: number, secs: number): Run {
  const s = createState(p, speed);
  let max = 0, overshoot = 0, pinned = 0, fellAt = -1, settledAt = -1;
  for (let i = 0; i < secs * 120; i++) {
    const c = cmd(i);
    step(s, { ...NEUTRAL_INPUT, lean: c / deg(p.maxLean), knee: 0.45, weight }, p, SIM_DT, []);
    max = Math.max(max, Math.abs(deg(s.lean)));
    if (i > 60) overshoot = Math.max(overshoot, Math.abs(deg(s.lean)) - Math.abs(c));
    if (Math.abs(s.tiltCmd) > p.maxTilt - 0.01) pinned++;
    const settled = Math.abs(deg(s.lean) - c) < 1 && Math.abs(deg(s.leanRate)) < 2;
    if (settled && settledAt < 0) settledAt = i / 120; else if (!settled) settledAt = -1;
    if (s.fallen) { fellAt = i / 120; break; }
  }
  return { final: deg(s.lean), max, overshoot, pinned, fellAt, settledAt };
}

test("spec keeps the stance as the package has it, and the stance levers validate", () => {
  assert.equal(DEFAULT_PARAMS.copRateGain, 0);
  assert.equal(DEFAULT_PARAMS.copCommandShare, 0);
  for (const name of ["responsive", "assisted"]) {
    assert.ok(PRESETS[name].copRateGain > 0 && PRESETS[name].copCommandShare === 1, name);
  }
  assert.ok(validate({ ...DEFAULT_PARAMS, copRateGain: -1 }).some((e) => e.includes("copRateGain")));
  assert.ok(validate({ ...DEFAULT_PARAMS, copCommandShare: 1.5 }).some((e) => e.includes("copCommandShare")));
});

test("both feet down, 20 degrees asked for at 4 m/s: the lean arrives and holds, as it does on one foot", () => {
  // Measured with the package's stance: the blade pinned at maxTilt for 229
  // ticks and the skater down at 3.4 s. With the stance fixed: 20.0 degrees,
  // no overshoot, settled in 1.30 s — one-footed takes 1.63.
  const before = lean(packageStance, 4, () => 20, 0.5, 6);
  assert.ok(before.fellAt > 0 && before.pinned > 150, `package stance: pinned ${before.pinned}, down at ${before.fellAt} s`);
  const two = lean(fixed, 4, () => 20, 0.5, 6), one = lean(fixed, 4, () => 20, 1, 6);
  assert.equal(two.fellAt, -1);
  assert.equal(two.pinned, 0);
  assert.ok(Math.abs(two.final - 20) < 0.3, `two-footed settles at ${two.final.toFixed(2)}`);
  assert.ok(two.max < 20.5, `and never past ${two.max.toFixed(2)}`);
  assert.ok(two.settledAt > 0 && two.settledAt < one.settledAt, `settled in ${two.settledAt} s, one-footed ${one.settledAt} s`);
});

test("every two-footed lean the edge can hold is held, at every speed", () => {
  // The package's stance fell at 4 m/s on 20 and 25 degrees and settled 15..22
  // degrees for 20 at 5 and 6 m/s. At 3 m/s 20 degrees is beyond the edge for
  // one foot as well as two — speed buys depth — so it is not in the table.
  for (const [speed, cmd] of [[3, 13], [4, 13], [4, 20], [4, 25], [5, 13], [5, 20], [5, 25], [6, 13], [6, 20], [6, 25]]) {
    const r = lean(fixed, speed, () => cmd, 0.5, 6);
    assert.equal(r.fellAt, -1, `${cmd} degrees at ${speed} m/s`);
    assert.ok(Math.abs(r.final - cmd) < 0.5, `${cmd} degrees at ${speed} m/s settles at ${r.final.toFixed(2)}`);
    assert.ok(r.overshoot < 0.5, `${cmd} degrees at ${speed} m/s overshoots ${r.overshoot.toFixed(2)}`);
  }
});

test("a two-footed slalom that used to fall, or overshoot nine degrees, now tracks", () => {
  const slalom = (amp: number, period: number) => (i: number): number =>
    (Math.floor(i / (period * 120)) % 2 === 0 ? amp : -amp);
  // Measured with the package's stance: down at 7.1 s on the first, 9.0
  // degrees over on the second. Fixed: 0.1 and 0.0.
  assert.ok(lean(packageStance, 5, slalom(20, 2), 0.5, 8).fellAt > 0);
  assert.ok(lean(packageStance, 4, slalom(13, 1), 0.5, 8).overshoot > 5);
  const a = lean(fixed, 5, slalom(20, 2), 0.5, 8), b = lean(fixed, 4, slalom(13, 1), 0.5, 8);
  assert.equal(a.fellAt, -1);
  assert.ok(a.overshoot < 0.5 && b.overshoot < 0.5, `overshoot ${a.overshoot.toFixed(2)} and ${b.overshoot.toFixed(2)}`);
});

test("standing still is exactly what it was, and one foot is untouched", () => {
  for (const cmd of [0, 5, 10]) {
    const s1 = createState(packageStance, 0), s2 = createState(fixed, 0);
    for (let i = 0; i < 600; i++) {
      const input = { ...NEUTRAL_INPUT, lean: cmd / deg(fixed.maxLean), weight: 0.5 };
      step(s1, input, packageStance, SIM_DT, []);
      step(s2, input, fixed, SIM_DT, []);
    }
    assert.deepEqual(s2, s1, `standing with ${cmd} degrees asked for`);
  }
  // No stance term on one foot, so nothing about it can have moved.
  const one1 = createState(packageStance, 5), one2 = createState(fixed, 5);
  for (let i = 0; i < 720; i++) {
    const input = { ...NEUTRAL_INPUT, lean: 0.3 * Math.sin(i * 0.02), knee: 0.45, weight: 1 };
    step(one1, input, packageStance, SIM_DT, []);
    step(one2, input, fixed, SIM_DT, []);
  }
  assert.deepEqual(one2, one1);
});
