// Twizzles — a travelling rotation on one foot (sim/moves.ts, movesMode 1).
//
// Bible §2.1: "hold to sustain, stick to steer". data/motion-primitives.json:
// two revolutions over 4.5 m at 6 m/s for -1.0 m/s, and "the exit direction
// is solver-selectable" — here it is the skater's choice of when to let go.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, codeToString } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { len, dot } from "../sim/math.ts";

const moves = (extra: Partial<Params> = {}): Params => ({ ...PRESETS.responsive, movesMode: 1, ...extra });

interface Twizzle { s: SkaterState; ends: EdgeEvent[]; codes: Set<string>; turned: number }

/**
 * On the right foot at 6.3 m/s, hold the twizzle button from 2 s for `hold`
 * ticks. The stick is mirrored at each cusp, as app/schemes.ts does, so a held
 * steer means one side of the ice throughout.
 */
function twizzle(hold: number, opt: { lean?: number; steer?: number; carriage?: number } = {},
  rec?: ReplayRecorder): Twizzle {
  const p = moves();
  const s = createState(p, 6.3);
  let flips = 0, sign = 1, first: number | null = null, last = 0;
  const ends: EdgeEvent[] = [], codes = new Set<string>();
  for (let i = 0; i < 600; i++) {
    if (s.flips !== flips) { flips = s.flips; sign = -sign; }
    const input = {
      ...NEUTRAL_INPUT, weight: 1, knee: 0.45, carriage: opt.carriage ?? 0,
      lean: sign * (i >= 240 && opt.steer !== undefined ? opt.steer : opt.lean ?? 0),
      twizzle: i >= 240 && i < 240 + hold,
    };
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    if (s.move === MOVE.Twizzle) {
      for (const b of s.blade) if (b.inContact) codes.add(codeToString(b.code));
      const a = Math.atan2(s.vel.y, s.vel.x);
      if (first === null) first = a;
      last = a;
    }
    for (const e of ev) if (e.type === EVENT.Twizzle) ends.push(e);
    if (s.fallen) break;
  }
  return { s, ends, codes, turned: (last - (first ?? 0)) * 180 / Math.PI };
}

test("every preset skates without twizzles, and the twizzle levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, twizzleRate: 200 }).some((e) => e.includes("twizzleRate")));
  assert.ok(validate({ ...DEFAULT_PARAMS, twizzleArmsOut: 1 }).some((e) => e.includes("twizzleArmsOut")));
});

test("two revolutions cost about what the motion data says", () => {
  // Measured: 2.00 revolutions in 0.84 s from 5.76 m/s, 0.96 m/s lost with glide
  // and drag. The data: -1.0 m/s for 720 degrees at 6 m/s.
  const t = twizzle(84, { lean: -0.25 });
  assert.equal(t.ends.length, 1);
  assert.equal(t.s.moveDone.kind, MOVE.Twizzle);
  assert.ok(Math.abs(t.s.moveDone.revolutions - 2) < 1e-9, `${t.s.moveDone.revolutions} revolutions`);
  assert.ok(t.s.moveDone.speedLost > 0.85 && t.s.moveDone.speedLost < 1.05,
    `twizzle cost ${t.s.moveDone.speedLost.toFixed(3)} m/s`);
  assert.equal(t.s.fallen, false);
});

test("the edge alternates every half revolution, and when you let go picks the way out", () => {
  const whole = twizzle(84, { lean: -0.25 }), half = twizzle(60, { lean: -0.25 });
  assert.deepEqual([...whole.codes].sort(), ["RBI", "RFO"], "clockwise on the right foot: forward outside, back inside");
  assert.ok(Math.abs(half.s.moveDone.revolutions - 1.5) < 1e-9);
  assert.equal(codeToString(whole.s.moveDone.toCode), "RFO");
  assert.equal(codeToString(half.s.moveDone.toCode), "RBI");
  assert.ok(dot(whole.s.vel, whole.s.heading) > 0, "a whole number of revolutions comes out forward");
  assert.ok(dot(half.s.vel, half.s.heading) < 0, "a half more comes out backward");
  assert.equal(whole.ends[0].value, 2, "the event carries the revolutions");
});

test("arms out spins slower: fewer revolutions for the same hold", () => {
  const tucked = twizzle(84), open = twizzle(84, { carriage: 1 });
  assert.ok(open.s.moveDone.revolutions < tucked.s.moveDone.revolutions,
    `${open.s.moveDone.revolutions} open against ${tucked.s.moveDone.revolutions} tucked`);
});

test("stick to steer: a held lean bends the path, either way, and none leaves it straight", () => {
  // Measured over a 1 s twizzle from a straight line: +39, 0 and -39 degrees.
  const left = twizzle(120, { steer: 0.4 }), none = twizzle(120, { steer: 0 }), right = twizzle(120, { steer: -0.4 });
  assert.ok(left.turned > 30, `left ${left.turned.toFixed(1)}`);
  assert.ok(right.turned < -30, `right ${right.turned.toFixed(1)}`);
  assert.ok(Math.abs(none.turned) < 1, `straight ${none.turned.toFixed(2)}`);
  assert.ok(Math.abs(left.turned + right.turned) < 1, "and symmetrically");
  assert.ok(len(left.s.vel) > 0 && !left.s.fallen);
});

test("twizzles replay tick for tick", () => {
  const p = moves();
  const rec = new ReplayRecorder(p, 6.3);
  const t = twizzle(100, { steer: 0.3, carriage: 0.4 }, rec);
  assert.equal(t.ends.length, 1);
  assert.deepEqual(verifyReplay(parseReplay(rec.toJson())), { ticks: 600, divergence: null });
});
