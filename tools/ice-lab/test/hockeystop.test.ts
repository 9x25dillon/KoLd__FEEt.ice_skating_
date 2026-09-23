// The hockey stop, from play. No stop button and no stop code: a skater on
// Simulation's inputs — lean, knee, weight, wind-up, the feet in the hips —
// carves, rises, releases the shoulders into the turn with the feet turned,
// sinks, and scrapes to a standstill. The physics is stages B1 (slip, the
// scrape), B2 (the feet) and C1/C2 (the trunk); the skill is the bot's.
//
// What the skill is, measured: a scraping blade short of square lets the
// travel slide along it and swing into line (the scrape resists across the
// blade, only glide along it), so the blades must be HELD square — the feet
// first, the hips (the trunk) when the feet reach the end of their turnout.
// (Until /34 the entry lean also had to stay inside what a scrape can hold; with
// engagement read from the whole load, entries to 0.5 now stop and stand.)

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { len } from "../sim/math.ts";
import { setupParams } from "../game/setups.ts";

const P = { ...setupParams("simulation"), slipMode: 1, footMode: 1, torqueMode: 1 };

/**
 * From 6 m/s: carve 1.5 s at lean `entry` on both feet, leading the shoulders
 * counter-clockwise; rise 0.15 s releasing them clockwise with the feet turned
 * (left out, right in); then sink and stop, leaning `stopLean` into it and
 * easing off as the speed goes (full at 3 m/s and above), while holding the
 * blades square — feet by integral feedback, hips by proportional. Once below
 * 0.3 m/s, stand (knee 0.5, no lean) for 1.5 s.
 */
function hockeyStop(entry: number, stopLean = 0.3) {
  const s = createState(P, 6), events: EdgeEvent[] = [];
  let t = 0, dist = 0, split = -1, stopped = -1, squareFrom2 = 90;
  while (t < 8 && !s.fallen && (stopped < 0 || t < stopped + 1.5)) {
    const v = len(s.vel), b = s.blade[0].tangent;
    const across = Math.atan2(s.vel.x * b.y - s.vel.y * b.x, s.vel.x * b.x + s.vel.y * b.y) * 180 / Math.PI;
    let input;
    if (stopped >= 0) input = { knee: 0.5, weight: 0.5 };
    else if (t < 1.5) input = { lean: entry, knee: 0.6, weight: 0.5, windup: -Math.min(1, Math.max(0, (t - 0.8) / 0.6)) };
    else if (t < 1.65) input = { lean: entry, knee: 0, weight: 0.5, windup: 1, toeOutSplit: -1 };
    else {
      split = Math.max(-1, Math.min(1, split - 0.02 * (90 - across)));
      input = { lean: stopLean * Math.min(1, v / 3), knee: 0.7, weight: 0.5, toeOutSplit: split,
        windup: Math.max(-1, Math.min(1, 0.1 * (90 - across))) };
      if (v > 2) squareFrom2 = Math.min(squareFrom2, Math.abs(across));
    }
    step(s, { ...NEUTRAL_INPUT, ...input }, P, SIM_DT, events);
    t += SIM_DT; dist += len(s.vel) * SIM_DT;
    if (stopped < 0 && t > 1.65 && len(s.vel) < 0.3) stopped = t;
  }
  return { s, stopped: stopped < 0 ? -1 : stopped - 1.5, dist, squareFrom2, events };
}

test("a hockey stop from play: rise, turn the blades square, scrape to a standstill, stand", () => {
  // MEASURED (since /34: load- and edge-dependent contact, engagement from the
  // whole load on the ice): entry lean 0.4, stop lean 0.3 — standstill 4.31 s
  // after the rise, 15.4 m from the start of the carve, the blades held 63° or
  // more across until 2 m/s, and standing (lean 0.02) 1.5 s later. (Before:
  // 2.99 s, 14.1 m, 72°.)
  const r = hockeyStop(0.4);
  assert.equal(r.s.fallen, false, "standing");
  assert.ok(Math.abs(r.stopped - 4.31) < 0.05, `stopped ${r.stopped.toFixed(2)} s after the rise`);
  assert.ok(Math.abs(r.dist - 15.4) < 0.2, `${r.dist.toFixed(1)} m`);
  assert.ok(Math.abs(r.squareFrom2 - 62.6) < 2, `blades held across: ${r.squareFrom2.toFixed(0)}° at the least above 2 m/s`);
  assert.ok(Math.abs(r.s.lean) < 0.1, `upright after (${r.s.lean.toFixed(2)})`);
  assert.ok(r.events.some(e => e.type === EVENT.SkidBegin), "and it was a skid all the way");
});

test("from any entry lean up to 0.5 the stop holds: a forgiving stop, slower the deeper the entry", () => {
  // MEASURED (since /34): entry 0.3 3.82 s, 0.35 4.00, 0.45 4.81, 0.5 3.88 —
  // all standing. Before engagement read the whole load on the ice, a skater on
  // two feet counted as half-unweighted and entry 0.5 fell every time.
  for (const [entry, time] of [[0.3, 3.82], [0.35, 4.0], [0.45, 4.81], [0.5, 3.88]]) {
    const r = hockeyStop(entry);
    assert.ok(!r.s.fallen && Math.abs(r.stopped - time) < 0.05, `entry ${entry}: ${r.stopped.toFixed(2)} s, fallen ${r.s.fallen}`);
  }
});
