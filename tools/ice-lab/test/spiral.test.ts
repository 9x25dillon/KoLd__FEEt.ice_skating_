// The Spiral (sim/moves.ts and the carve, movesMode 1).
//
// One blade down, the free leg extended, any direction. data/motion-
// primitives.json: "spiral", pre.forward "any", -0.9 m/s over 7 m, held
// 2.0 s at the least, NEGATIVE leg stamina — "a spiral is rest". Reached
// through the same button as the Ina Bauer (solver.ts's HELD.InaBauer):
// weight shared near evenly reaches the two-footed Ina Bauer; weight clearly
// on one foot reaches this instead.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, FOOT, codeToString } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";

const moves = (): Params => ({ ...PRESETS.responsive, movesMode: 1 });

interface Glide { s: SkaterState; codes: Set<string>; ends: EdgeEvent[] }

/**
 * Carve two-footed at `speed` with weight held at `weight` (0/1 = fully on
 * one foot, 0.5 = shared), press the shared Ina-Bauer/Spiral button at 2 s
 * and hold it `hold` ticks.
 */
function glide(speed: number, weight: number, hold: number, rec?: ReplayRecorder): Glide {
  const p = moves();
  const s = createState(p, speed);
  const codes = new Set<string>(), ends: EdgeEvent[] = [];
  for (let i = 0; i < 240 + hold + 120; i++) {
    const input = { ...NEUTRAL_INPUT, weight, knee: 0.45, lean: 0.15, inaBauer: i >= 240 && i < 240 + hold };
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    if (s.move === MOVE.Spiral) for (const b of s.blade) if (b.inContact) codes.add(codeToString(b.code));
    for (const e of ev) if (e.type === EVENT.Spiral) ends.push(e);
  }
  return { s, codes, ends };
}

test("every preset skates without a Spiral, and its levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, spiralDrag: 0.5 }).some((e) => e.includes("spiralDrag")));
  assert.ok(validate({ ...DEFAULT_PARAMS, spiralWeightBand: 0.5 }).some((e) => e.includes("spiralWeightBand")));
});

test("weight clearly on one foot reaches a Spiral, not an Ina Bauer", () => {
  const g = glide(6.4, 0.95, 216);
  assert.equal(g.s.moveDone.kind, MOVE.Spiral);
  assert.equal(g.s.moveDone.detail, FOOT.Right, "weight 0.95: right foot carries it");
});

test("weight fully on one foot: the free leg is genuinely unloaded, one blade only", () => {
  const g = glide(6.4, 1, 216);
  assert.equal([...g.codes].length, 1, `one blade only, got ${[...g.codes].join(",")}`);
});

test("weight shared near evenly still reaches the Ina Bauer, unchanged", () => {
  const g = glide(6.4, 0.5, 216);
  assert.equal(g.s.moveDone.kind, MOVE.InaBauer);
});

test("a Spiral is entered backward too, unlike the forward-only Ina Bauer", () => {
  const g = glide(-6.4, 0.1, 216);
  assert.equal(g.s.moveDone.kind, MOVE.Spiral);
  assert.equal(g.ends.length, 1);
});

test("it costs about what the motion data says", () => {
  // data: -0.9 m/s over 7 m at some reference speed; measure at 1 s held.
  const g = glide(6.4, 0.9, 120);
  assert.ok(g.s.moveDone.speedLost > 0, `must lose some speed, got ${g.s.moveDone.speedLost.toFixed(3)}`);
  assert.ok(g.s.moveDone.speedLost < 1.5, `should not lose more than the two-footed Ina Bauer does, got ${g.s.moveDone.speedLost.toFixed(3)}`);
});

test("held the data's 2.0 s, the curve holds and the skater stays up", () => {
  const g = glide(6.4, 0.9, 240);
  assert.ok(g.s.moveDone.seconds > 2.0 - 1e-9, `held ${g.s.moveDone.seconds} s`);
  assert.equal(g.s.fallen, false);
});

test("letting go ends it, and the free foot's own blade returns to load", () => {
  const g = glide(6.4, 0.9, 120);
  assert.equal(g.ends.length, 1);
  assert.equal(g.s.move, MOVE.None);
});

test("too slow to hold, no Spiral", () => {
  assert.equal(glide(1.0, 0.9, 120).ends.length, 0);
});

test("a Spiral replays tick for tick", () => {
  const p = moves();
  const rec = new ReplayRecorder(p, 6.4);
  glide(6.4, 0.9, 200, rec);
  assert.equal(verifyReplay(parseReplay(rec.toJson())).divergence, null);
});
