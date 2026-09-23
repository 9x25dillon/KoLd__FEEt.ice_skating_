// Stage A, two-blade steering: each blade has its own heel/toe.
//
// `pitchSplit` sets the two blades' contact points on the rocker apart, as
// `leanSplit` does their tilts. Absent, it is 0 and nothing changes; present,
// the loaded blade's own point is the one that carves, and an unloaded blade's
// point is carried but moves nothing.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import { createState, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, FOOT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { ReplayRecorder, parseReplay } from "../sim/replay.ts";
import { SIM_DT } from "../sim/params.ts";
import { step } from "../sim/solver.ts";

const glide = (over: Partial<SkatingInput>, ticks = 240): SkaterState =>
  run(createState(DEFAULT_PARAMS, 5), { ...NEUTRAL_INPUT, lean: 0.3, ...over }, DEFAULT_PARAMS, ticks);

const body = (s: SkaterState): number[] =>
  [s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.heading.x, s.heading.y, s.lean, s.yawRate];

test("an absent pitchSplit is exactly a zero one", () => {
  for (const pitch of [-0.6, 0, 0.6]) for (const weight of [0, 0.5, 1]) {
    const absent = glide({ pitch, weight }), zero = glide({ pitch, weight, pitchSplit: 0 });
    assert.deepEqual(body(zero), body(absent), `pitch ${pitch}, weight ${weight}`);
    assert.deepEqual(zero.blade.map(b => b.contactS), absent.blade.map(b => b.contactS));
  }
});

test("the split puts each blade at its own point on the rocker: left at pitch − split, right at pitch + split", () => {
  const s = glide({ pitch: 0.2, pitchSplit: 0.6, weight: 0.5 }, 2);
  assert.ok(Math.abs(s.blade[FOOT.Left].contactS - 0.3) < 1e-12, "left toward the heel");
  assert.ok(Math.abs(s.blade[FOOT.Right].contactS - 0.9) < 1e-12, "right up on the toe");
  const clamped = glide({ pitch: 0.8, pitchSplit: 0.8, weight: 0.5 }, 2);
  assert.equal(clamped.blade[FOOT.Right].contactS, 1, "no further forward than the toe pick");
});

test("only the loaded blade's heel/toe carves: the free foot's is carried, not felt", () => {
  // On the right foot, the right blade's point is pitch + split. Reach the
  // same right point two ways, with the free left blade at heel or toe.
  const heelFree = glide({ weight: 1, pitch: 0, pitchSplit: 0.4 });
  const toeFree = glide({ weight: 1, pitch: 0.4, pitchSplit: 0 });
  assert.notEqual(heelFree.blade[FOOT.Left].contactS, toeFree.blade[FOOT.Left].contactS);
  assert.deepEqual(body(heelFree), body(toeFree), "the free foot moved nothing");
});

test("rocking the loaded foot onto its toe carves tighter: the front of the rocker is shorter", () => {
  // MEASURED (DEFAULT_PARAMS, 5 m/s, lean 0.3 on the right foot, heading turned
  // over ticks 240-480): heel-side split 0.6293 rad/s, identical to none, since
  // the rocker only shortens past rockerToeOnset; toe split 0.8145 rad/s.
  const turnRate = (pitchSplit: number): number => {
    const input = { ...NEUTRAL_INPUT, lean: 0.3, weight: 1, pitchSplit };
    const s = run(createState(DEFAULT_PARAMS, 5), input, DEFAULT_PARAMS, 240);
    let turned = 0, prev = Math.atan2(s.heading.y, s.heading.x);
    for (let i = 0; i < 240; i++) {
      run(s, input, DEFAULT_PARAMS, 1);
      const h = Math.atan2(s.heading.y, s.heading.x), d = h - prev;
      turned += Math.atan2(Math.sin(d), Math.cos(d)); prev = h;
    }
    assert.equal(s.fallen, false);
    return turned / (240 * SIM_DT);
  };
  const heel = turnRate(-0.8), flat = turnRate(0), toe = turnRate(0.8);
  assert.equal(heel, flat, "the heel half of the rocker is one arc");
  assert.ok(toe > 1.2 * flat, `toe ${toe.toFixed(4)} vs flat ${flat.toFixed(4)} rad/s`);
});

test("a replay with pitchSplit round-trips, and one without it still parses", () => {
  const p = DEFAULT_PARAMS, s = createState(p, 5), rec = new ReplayRecorder(p, 5);
  for (let i = 0; i < 4; i++) {
    const input = { ...NEUTRAL_INPUT, lean: 0.3, pitchSplit: i % 2 ? 0.5 : -0.5 };
    step(s, input, p, SIM_DT, []);
    rec.capture(input, p, s, []);
  }
  const clip = parseReplay(rec.toJson());
  assert.equal(clip.frames[1].input.pitchSplit, 0.5);
  const bare = JSON.parse(rec.toJson());
  for (const f of bare.frames) delete f.input.pitchSplit;
  assert.doesNotThrow(() => parseReplay(JSON.stringify(bare)));
  const bad = JSON.parse(rec.toJson());
  bad.frames[0].input.pitchSplit = 2;
  assert.throws(() => parseReplay(JSON.stringify(bad)), /pitchSplit/);
});
