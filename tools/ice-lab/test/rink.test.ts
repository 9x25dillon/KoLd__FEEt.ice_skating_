// The rink's shape: a crown, a bowl, or a flat sheet, and what each does to a glide.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, PRESETS, RINKS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, run, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { len, v2 } from "../sim/math.ts";
import { rinkSlopeAccel } from "../sim/blade.ts";
import { parseReplay, replayDigest, ReplayRecorder } from "../sim/replay.ts";

const glide = { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 };

/** Speed after `ticks` of straight glide along +x from (x, y). */
function glideFrom(p: Params, x: number, y: number, ticks: number): number {
  const s = createState(p, 4.0, 0);
  s.pos = v2(x, y);
  run(s, glide, p, ticks);
  return len(s.vel);
}

test("every preset is a flat sheet", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.rinkRelief, 0, name);
  assert.equal(RINKS.flat, 0);
});

test("the pull is downhill: outward on a crown, toward centre ice in a bowl", () => {
  const crown = { ...DEFAULT_PARAMS, rinkRelief: RINKS.public };
  const bowl = { ...DEFAULT_PARAMS, rinkRelief: RINKS.barn };
  const at = v2(10, -5);
  const c = rinkSlopeAccel(at, crown), b = rinkSlopeAccel(at, bowl);
  assert.ok(c.x > 0 && c.y < 0, "a crown pulls away from centre");
  assert.ok(b.x < 0 && b.y > 0, "a bowl pulls toward it");
  const centre = rinkSlopeAccel(v2(0, 0), crown);
  assert.equal(centre.x, 0); assert.equal(centre.y, 0);
});

test("the pull is the closed form, and stops at the boards", () => {
  // a = 2 g relief (x / a^2, y / b^2): L0 for small slopes.
  const p = { ...DEFAULT_PARAMS, rinkRelief: 0.006 };
  const a = rinkSlopeAccel(v2(20, 12), p);
  assert.ok(Math.abs(a.x - 2 * p.gravity * 0.006 * 20 / 900) < 1e-15);
  assert.ok(Math.abs(a.y - 2 * p.gravity * 0.006 * 12 / 225) < 1e-15);
  const beyond = rinkSlopeAccel(v2(31, 16), p);
  assert.equal(beyond.x, 0, "flat past the end boards");
  assert.equal(beyond.y, 0, "flat past the side boards");
});

test("the named shapes are barely perceivable, as RINKS defines it", () => {
  // The pull at the side boards against flat-glide friction: 10% on a public
  // crown, 20% in a barn's bowl. L3 choices, held here so they stay what the
  // comment says they are.
  const p = DEFAULT_PARAMS;
  const friction = p.muGlide * p.gravity;
  const atSide = (relief: number): number => Math.abs(rinkSlopeAccel(v2(0, p.rinkHalfWidth), { ...p, rinkRelief: relief }).y);
  assert.ok(Math.abs(atSide(RINKS.public) / friction - 0.10) < 0.001);
  assert.ok(Math.abs(atSide(RINKS.barn) / friction - 0.20) < 0.001);
});

test("on a crown a glide outward keeps more speed than on flat ice, and a glide inward less", () => {
  const flat = DEFAULT_PARAMS;
  const crown = { ...DEFAULT_PARAMS, rinkRelief: RINKS.public };
  const ticks = 240;
  const vFlat = glideFrom(flat, 5, 0, ticks);
  const vOut = glideFrom(crown, 5, 0, ticks);     // x runs 5 -> ~12: downhill
  const vIn = glideFrom(crown, -12, 0, ticks);    // x runs -12 -> ~-5: uphill
  assert.ok(vOut > vFlat, `outward ${vOut} should beat flat ${vFlat}`);
  assert.ok(vIn < vFlat, `inward ${vIn} should trail flat ${vFlat}`);
  // Mirror-image paths on a symmetric crown: the gain and the loss match to
  // within the small difference drag makes between the two speeds.
  const gain = vOut - vFlat, loss = vFlat - vIn;
  assert.ok(Math.abs(gain - loss) < 0.1 * gain, `gain ${gain} against loss ${loss}`);
});

test("a paired glide averages the slope out and differences it in", () => {
  // The venue record's rule for glide cases, checked on the solver: outward and
  // inward along mirror-image paths, the mean speed loss is the flat loss.
  const bowl = { ...DEFAULT_PARAMS, rinkRelief: RINKS.barn };
  const ticks = 240;
  const flatLoss = 4.0 - glideFrom(DEFAULT_PARAMS, 5, 0, ticks);
  const outLoss = 4.0 - glideFrom(bowl, 5, 0, ticks);
  const inLoss = 4.0 - glideFrom(bowl, -12, 0, ticks);
  assert.ok(outLoss > flatLoss && inLoss < flatLoss, "a bowl is uphill outward");
  assert.ok(Math.abs((outLoss + inLoss) / 2 - flatLoss) < 0.02 * flatLoss,
    `mean ${(outLoss + inLoss) / 2} against flat ${flatLoss}`);
});

test("a skater standing still on a shaped rink stays still", () => {
  const p = { ...DEFAULT_PARAMS, rinkRelief: RINKS.barn };
  const s = createState(p, 0, 0);
  s.pos = v2(20, 10);
  run(s, glide, p, 600);
  assert.equal(len(s.vel), 0);
});

test("with no relief the rink's extent changes nothing, to the bit", () => {
  const a = createState(DEFAULT_PARAMS, 5, 0);
  const pb = { ...DEFAULT_PARAMS, rinkHalfLength: 3, rinkHalfWidth: 2 };
  const b = createState(pb, 5, 0);
  const input = { ...glide, lean: 0.3, weight: 1 };
  run(a, input, DEFAULT_PARAMS, 900);
  run(b, input, pb, 900);
  assert.equal(replayDigest(a, []), replayDigest(b, []));
});

test("validate bounds the rink, and a replay carries a bowl's negative relief", () => {
  assert.ok(validate({ ...DEFAULT_PARAMS, rinkRelief: 0.06 }).some((e) => e.includes("rinkRelief")));
  assert.ok(validate({ ...DEFAULT_PARAMS, rinkHalfWidth: 0 }).some((e) => e.includes("rinkHalfLength")));
  assert.deepEqual(validate({ ...DEFAULT_PARAMS, rinkRelief: RINKS.barn }), []);

  const p = { ...DEFAULT_PARAMS, rinkRelief: RINKS.barn };
  const rec = new ReplayRecorder(p, 3, 0);
  const s = createState(p, 3, 0);
  const events: EdgeEvent[] = [];
  step(s, glide, p, SIM_DT, events);
  rec.capture(glide, p, s, events);
  const clip = parseReplay(rec.toJson());
  assert.equal(clip.initial.params.rinkRelief, RINKS.barn);
  const tooDeep = JSON.parse(rec.toJson());
  tooDeep.initial.params.rinkRelief = -0.06;
  assert.throws(() => parseReplay(JSON.stringify(tooDeep)), /rinkRelief/);
});
