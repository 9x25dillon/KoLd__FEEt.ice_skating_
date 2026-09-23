// Stage B2, the feet (footMode, with slipMode): each foot turns in its hip —
// out as far as the skater's turnout, in as far as hipInternal — and each
// blade grips or scrapes against its own sideways travel. The stops and the
// spread eagle are not moves: they are feet and edges.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { len, rotate, dot } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

// The Simulation athlete with stages B/C and the fore-aft pendulum switched off: each test switches on what it measures.
const SIM = { ...setupParams("simulation"), slipMode: 0, torqueMode: 0, footMode: 0, pitchMode: 0 };
const FEET = { ...SIM, slipMode: 1, footMode: 1 };

/** Skate from `speed` until stopped (0.3 m/s), fallen or 6 s. */
function skate(p: Params, at: (t: number) => Partial<SkatingInput>, speed = 5, setup?: (s: SkaterState) => void) {
  const s = createState(p, speed);
  setup?.(s);
  const h0 = Math.atan2(s.heading.y, s.heading.x);
  let t = 0, dist = 0, across = 0;
  while (t < 6 && !s.fallen && len(s.vel) > 0.3) {
    step(s, { ...NEUTRAL_INPUT, ...at(t) }, p, SIM_DT, []);
    t += SIM_DT; dist += len(s.vel) * SIM_DT;
    for (const b of s.blade) if (b.inContact && len(s.vel) > 0.5)
      across = Math.max(across, Math.acos(Math.min(1, Math.abs(dot(b.tangent, s.vel)) / len(s.vel))) * 180 / Math.PI);
  }
  const turned = (Math.atan2(s.heading.y, s.heading.x) - h0) * 180 / Math.PI;
  return { s, t, dist, turned, across };
}

test("footMode is 0 by default, needs slipMode, and with the feet straight changes nothing", () => {
  assert.equal(DEFAULT_PARAMS.footMode, 0);
  assert.equal(DEFAULT_PARAMS.turnout, 0.5);
  assert.deepEqual(validate(FEET), []);
  assert.ok(validate({ ...SIM, footMode: 1 }).some(e => /slipMode/.test(e)));
  for (const lean of [0.2, 0.5]) {
    const [slip, feet] = [0, 1].map((footMode) => {
      const p = { ...SIM, slipMode: 1, footMode }, s = createState(p, 5);
      for (let i = 0; i < 600; i++) step(s, { ...NEUTRAL_INPUT, lean, weight: 1 }, p, SIM_DT, []);
      return s;
    });
    assert.deepEqual([feet.pos, feet.vel], [slip.pos, slip.vel], `lean ${lean}`);
  }
});

test("a snowplow: toes in, inside edges, both blades scrape and the sideways halves cancel", () => {
  // MEASURED from 5 m/s (glide alone: 3.95 m/s after 6 s): toe-in -0.5 on
  // inside edges 0.3 keeps 2.80; -1 and 0.6 stops in 5.42 s over 14.1 m, dead
  // straight. Flat blades toed in barely brake (3.56). The gentlest stop.
  const mild = skate(FEET, () => ({ knee: 0.5, toeOut: -0.5, leanSplit: 0.3 }));
  const full = skate(FEET, () => ({ knee: 0.5, toeOut: -1, leanSplit: 0.6 }));
  const flat = skate(FEET, () => ({ knee: 0.5, toeOut: -1 }));
  assert.ok(Math.abs(len(mild.s.vel) - 2.80) < 0.05, `mild ${len(mild.s.vel).toFixed(2)}`);
  assert.ok(Math.abs(full.t - 5.42) < 0.05 && Math.abs(full.dist - 14.1) < 0.2, `full ${full.t.toFixed(2)} s / ${full.dist.toFixed(1)} m`);
  assert.ok(len(flat.s.vel) > 3.4, `flat ${len(flat.s.vel).toFixed(2)}`);
  for (const r of [mild, full]) {
    assert.equal(r.s.fallen, false);
    assert.ok(Math.abs(r.turned) < 1 && Math.abs(r.s.pos.y) < 0.05, "straight: the two scrapes' sideways halves cancel");
  }
  assert.deepEqual(full.s.footAngle!.map(a => Math.round(a * 180 / Math.PI)), [-34, -34], "toes in as far as hipInternal");
});

test("a spread eagle: body sideways, feet turned out — how cleanly depends on the skater's turnout", () => {
  // MEASURED from 5 m/s, body 90° to the travel, toeOut +1: turnout 1 glides
  // like a glide (3.94 m/s after 6 s); 0.75, 68° a foot, scrapes to 3.68; 0.5,
  // 45°, to 3.46. data/motion-primitives.json's spread eagle asks 0.75.
  const sideways = (s: SkaterState) => {
    s.heading = rotate(s.heading, Math.PI / 2);
    for (const b of s.blade) b.tangent = rotate(b.tangent, Math.PI / 2);
  };
  const v = [1, 0.75, 0.5].map((turnout) => {
    const r = skate({ ...FEET, turnout }, () => ({ knee: 0.5, toeOut: 1 }), 5, sideways);
    assert.equal(r.s.fallen, false, `turnout ${turnout}`);
    return len(r.s.vel);
  });
  assert.ok(Math.abs(v[0] - 3.94) < 0.03 && Math.abs(v[1] - 3.68) < 0.03 && Math.abs(v[2] - 3.46) < 0.03, v.map(x => x.toFixed(2)).join(" / "));
});

test("a T-stop: glide on one foot, drag the other at right angles on its outside edge", () => {
  // MEASURED, turnout 1, left foot out 90° behind, right straight: with 30% of
  // the weight on the drag and a full outside edge, stopped in 3.54 s over
  // 10.1 m; at 15% it keeps 0.65 m/s after 6 s. The drag's INSIDE edge faces
  // the travel and catches (full bite). At turnout 0.5 the foot reaches only 45°.
  const drag = (weight: number, leanSplit: number, turnout = 1) =>
    skate({ ...FEET, turnout }, () => ({ knee: 0.5, weight, toeOut: 0.5, toeOutSplit: -0.5, leanSplit }));
  const firm = drag(0.7, -1), light = drag(0.85, -1), narrow = drag(0.7, -1, 0.5);
  assert.equal(firm.s.fallen, false);
  assert.ok(Math.abs(firm.t - 3.54) < 0.05 && Math.abs(firm.dist - 10.1) < 0.2, `firm ${firm.t.toFixed(2)} s`);
  assert.ok(Math.abs(len(light.s.vel) - 0.65) < 0.05, `light ${len(light.s.vel).toFixed(2)}`);
  assert.ok(Math.abs(firm.across - 90) < 1 && Math.abs(narrow.across - 45) < 1, `90° vs ${narrow.across.toFixed(0)}°`);
  assert.ok(Math.abs(firm.turned) < 3, "and it stays straight");
});

test("with the feet turned in the hips, rising off a carve brings the blades most of the way across", () => {
  // MEASURED (torqueMode too, 6 m/s, lean 0.5, shoulders led then released on
  // a 0.15 s rise): feet straight 32° across; feet turned (left out, right in)
  // 77° (since /34: load- and edge-dependent contact; engagement from the whole
  // load on the ice), the scraping feet checking the body's spin. The skater still falls
  // as the stop runs out (the lean outlasts the scrape), so this pins only how
  // far across the blades come.
  const T = { ...FEET, torqueMode: 1 };
  const play = (feet: boolean) => skate(T, (t) => t < 1.5
    ? { lean: 0.5, knee: 0.6, weight: 0.5, windup: -Math.min(1, Math.max(0, (t - 0.8) / 0.6)) }
    : { lean: 0.5, knee: t < 1.65 ? 0 : 0.7, weight: 0.5, windup: t < 1.65 ? 1 : 0, toeOutSplit: feet ? -1 : 0 }, 6);
  const straight = play(false), turned = play(true);
  assert.ok(Math.abs(straight.across - 32) < 2, `straight ${straight.across.toFixed(0)}°`);
  assert.ok(Math.abs(turned.across - 77) < 2, `turned ${turned.across.toFixed(0)}°`);
});
