// The Ina Bauer (sim/moves.ts and the carve, movesMode 1).
//
// Both feet down on parallel tracks, the lead forward and the trailing foot
// backward. data/motion-primitives.json: entered forward, exits on an outside
// edge, -1.1 m/s over 6 m at 6 m/s, held 1.8 s at the least.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, FOOT, DIR, codeToString, codeDir } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";

const moves = (): Params => ({ ...PRESETS.responsive, movesMode: 1 });

interface Glide { s: SkaterState; codes: Set<string>; ends: EdgeEvent[]; leanIn: number; leanOut: number; yawIn: number; yawOut: number }

/**
 * Lean into a curve two-footed from the start at `speed`, press the Ina Bauer
 * at 2 s and hold it `hold` ticks, then a second more.
 */
function glide(speed: number, lean: number, hold: number, rec?: ReplayRecorder): Glide {
  const p = moves();
  const s = createState(p, speed);
  const codes = new Set<string>(), ends: EdgeEvent[] = [];
  let leanIn = 0, leanOut = 0, yawIn = 0, yawOut = 0;
  for (let i = 0; i < 240 + hold + 120; i++) {
    const input = { ...NEUTRAL_INPUT, weight: 0.5, knee: 0.45, lean, inaBauer: i >= 240 && i < 240 + hold };
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    if (i === 239) { leanIn = s.lean; yawIn = s.yawRate; }
    if (s.move === MOVE.InaBauer) {
      for (const b of s.blade) if (b.inContact) codes.add(codeToString(b.code));
      leanOut = s.lean; yawOut = s.yawRate;
    }
    for (const e of ev) if (e.type === EVENT.InaBauer) ends.push(e);
  }
  return { s, codes, ends, leanIn, leanOut, yawIn, yawOut };
}

test("every preset skates without an Ina Bauer, and its levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, inaBauerDrag: 0.5 }).some((e) => e.includes("inaBauerDrag")));
});

test("leaning left, the left foot leads and both blades are on outside edges: LFO and RBO", () => {
  const g = glide(6.4, 0.25, 216);
  assert.deepEqual([...g.codes].sort(), ["LFO", "RBO"]);
  assert.equal(g.s.moveDone.kind, MOVE.InaBauer);
  assert.equal(g.s.moveDone.detail, FOOT.Left);
  assert.equal(g.s.fallen, false);
});

test("leaning right mirrors it: RFO leads, LBO trails", () => {
  const g = glide(6.4, -0.25, 216);
  assert.deepEqual([...g.codes].sort(), ["LBO", "RFO"]);
  assert.equal(g.s.moveDone.detail, FOOT.Right);
});

test("it costs about what the motion data says", () => {
  // Measured: 1.03 m/s in one second from 5.85 m/s, 5.3 m of ice. The data:
  // 1.1 over 6 m at 6 m/s.
  const g = glide(6.4, 0.25, 120);
  assert.ok(g.s.moveDone.speedLost > 0.9 && g.s.moveDone.speedLost < 1.2, `lost ${g.s.moveDone.speedLost.toFixed(3)} m/s`);
  assert.ok(Math.abs(g.s.moveDone.seconds - 1) < 1.5 * SIM_DT);
});

test("held the data's 1.8 s, the body keeps its lean and the curve its direction", () => {
  const g = glide(6.4, 0.25, 216);
  assert.ok(Math.abs(g.leanOut - g.leanIn) < 2 * Math.PI / 180, `lean ${(g.leanIn * 57.3).toFixed(1)} to ${(g.leanOut * 57.3).toFixed(1)} deg`);
  assert.ok(Math.sign(g.yawOut) === Math.sign(g.yawIn) && g.yawOut !== 0, "still curving the same way");
  assert.ok(g.s.moveDone.seconds > 1.8 - 1e-9, `held ${g.s.moveDone.seconds} s`);
});

test("letting go brings the trailing foot back forward", () => {
  const g = glide(6.4, 0.25, 120);
  assert.equal(g.ends.length, 1);
  for (const b of g.s.blade) if (b.inContact) assert.equal(codeDir(b.code), DIR.Forward, codeToString(b.code));
});

test("it is entered skating forward, with some speed", () => {
  assert.equal(glide(-6.4, 0.25, 120).ends.length, 0, "not backward");
  assert.equal(glide(1.5, 0.25, 120).ends.length, 0, "not at a crawl");
});

test("an Ina Bauer replays tick for tick", () => {
  const p = moves();
  const rec = new ReplayRecorder(p, 6.4);
  glide(6.4, -0.3, 200, rec);
  assert.equal(verifyReplay(parseReplay(rec.toJson())).divergence, null);
});
