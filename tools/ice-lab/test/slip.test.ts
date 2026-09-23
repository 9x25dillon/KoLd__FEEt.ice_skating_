// Stage B1, slip (slipMode): the travel and the blades are separate.
//
// With it off, every tick carries the travel round with the blades, so a
// blade can never point across its path; the committed fixture's digests are
// unchanged by its arrival (replay.ts, /23). With it on, an edge that holds
// carves exactly as before, and a blade across its travel scrapes at the
// bible's muSkid instead of sliding sideways for free.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, REGIME } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { rotate, len, dot } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

const SIM = setupParams("simulation");
const slipDeg = (s: SkaterState): number =>
  Math.acos(Math.min(1, Math.abs(dot(s.vel, s.heading)) / Math.max(len(s.vel), 1e-9))) * 180 / Math.PI;

/** A skater whose blades meet the ice `deg` across their travel, as off an unaligned landing. */
function across(p: Params, deg: number, speed = 5): SkaterState {
  const s = createState(p, speed), a = deg * Math.PI / 180;
  s.heading = rotate(s.heading, a);
  for (const b of s.blade) b.tangent = rotate(b.tangent, a);
  return s;
}

test("slipMode is 0 by default and validated as 0 or 1", () => {
  assert.equal(DEFAULT_PARAMS.slipMode, 0);
  assert.deepEqual(validate({ ...DEFAULT_PARAMS, slipMode: 1 }), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, slipMode: 2 }).some(e => /slipMode/.test(e)));
});

test("an edge that holds carves as it did: slip on and off agree to rounding", () => {
  // MEASURED: 5 s on the right foot at 5 m/s, lean 0.2 and 0.5 — positions
  // agree to 1e-14 m and the slip angle stays 0.
  for (const lean of [0.2, 0.5]) {
    const [off, on] = [0, 1].map((slipMode) => {
      const p = { ...SIM, slipMode }, s = createState(p, 5);
      for (let i = 0; i < 600; i++) step(s, { ...NEUTRAL_INPUT, lean, weight: 1 }, p, SIM_DT, []);
      return s;
    });
    assert.ok(Math.hypot(off.pos.x - on.pos.x, off.pos.y - on.pos.y) < 1e-9, `lean ${lean}`);
    assert.ok(slipDeg(on) < 1e-6);
  }
});

test("a blade across its travel scrapes at muSkid·g with slip on, and slides almost free without it", () => {
  // MEASURED at 90°, 5 m/s, knee 0.5, lean 0.3 into the scrape: slip off 4.80
  // m/s after 0.5 s, still 90° across; slip on 3.22 m/s — 3.56 m/s², muSkid·g
  // (3.43) plus glide and air.
  const half = (slipMode: number) => {
    const p = { ...SIM, slipMode }, s = across(p, 90), events: EdgeEvent[] = [];
    for (let i = 0; i < 60; i++) step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5 }, p, SIM_DT, events);
    return { s, events };
  };
  const off = half(0), on = half(1);
  const decel = (5 - len(on.s.vel)) / 0.5, muG = SIM.muSkid * SIM.gravity;
  assert.ok(decel > 0.95 * muG && decel < 1.15 * muG, `on: ${decel.toFixed(2)} m/s² vs muSkid·g ${muG.toFixed(2)}`);
  assert.ok(len(off.s.vel) > 4.6, "off: the old model lets a crosswise blade slide");
  assert.ok(slipDeg(off.s) > 89);
  assert.ok(on.events.some(e => e.type === EVENT.SkidBegin), "the scrape is a skid");
  assert.ok(on.s.blade.every(b => b.regime === REGIME.Skid && b.latSlipAccel > 0), "and throws snow (ice.ts, audio.ts read latSlipAccel)");
});

test("part-way across, the scrape takes the sideways travel out and the edge grips again", () => {
  // MEASURED: 30° is lined up again by 1 s, 60° by 2 s (20° left at 1 s).
  for (const deg of [30, 60]) {
    const p = { ...SIM, slipMode: 1 }, s = across(p, deg), events: EdgeEvent[] = [];
    for (let i = 0; i < 240 && !s.fallen; i++) step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5 }, p, SIM_DT, events);
    assert.equal(s.fallen, false, `${deg}°`);
    assert.ok(slipDeg(s) < 1, `${deg}°: travel lined up with the blades (${slipDeg(s).toFixed(2)}°)`);
    assert.ok(events.some(e => e.type === EVENT.SkidEnd), `${deg}°: the edge took hold again`);
    assert.ok(len(s.vel) < 4.5, `${deg}°: and the scrape cost speed`);
  }
});
