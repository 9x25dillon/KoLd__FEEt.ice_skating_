// The wind-up and the jump assist it arms: a flick against the rotation before
// the release, and then the arms partly flown by the jump's own geometry.
//
// Every number here was printed first and then written down. The attempt is
// jump.test.ts's: two seconds backward on the right foot, 0.30 s of deep knee,
// release, a toe pick two ticks before it, knee 0.8 to land. The flick, when
// there is one, is held for six ticks starting 30 ticks before the release.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PRESETS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { JUMP_CODE, JUMP_PHASE, ROTATION_CALL } from "../sim/jump.ts";
import { ReplayRecorder, parseReplay, replayDigest, verifyReplay } from "../sim/replay.ts";

const LOAD_AT = 180, RELEASE = 216;

interface Attempt {
  preset: string; whip: number; lean?: number;
  /** Ticks before the release the flick starts, or null for none. */
  flick?: number | null;
  flickDir?: number;
  /** The skater's own arms in the air: 0 tucked. */
  airCarriage?: number;
  assist?: number;
}

function attempt(a: Attempt, record?: ReplayRecorder): { s: SkaterState; L: number[] } {
  const p = { ...PRESETS[a.preset], jumpMode: 2, ...(a.assist === undefined ? {} : { jumpAssist: a.assist }) };
  const s = createState(p, -5);
  const events: EdgeEvent[] = [];
  const L: number[] = [];
  const flick = a.flick ?? null;
  for (let i = 0; i < 600; i++) {
    const loading = i >= LOAD_AT && i < RELEASE, air = s.jump.phase === JUMP_PHASE.Air;
    const input = {
      ...NEUTRAL_INPUT, lean: a.lean ?? -0.25, weight: 1,
      knee: loading ? 0.95 : i >= RELEASE && i < RELEASE + 3 ? 0 : i >= RELEASE ? 0.8 : 0.35,
      carriage: i <= RELEASE ? (loading || i === RELEASE ? a.whip : 0) : air ? a.airCarriage ?? 0 : 0,
      windup: flick !== null && i >= RELEASE - flick && i < RELEASE - flick + 6 ? a.flickDir ?? 1 : 0,
      toe: i === RELEASE - 2,
    };
    events.length = 0;
    step(s, input, p, SIM_DT, events);
    record?.capture(input, p, s, events, "A");
    if (s.jump.phase === JUMP_PHASE.Air) L.push(s.jump.angMomentum);
  }
  return { s, L };
}

const name = (s: SkaterState): string => `${s.landed.revolutions}${JUMP_CODE[s.landed.kind]}`;

test("with no wind-up the assist never runs, whatever it is set to", () => {
  const off = attempt({ preset: "assisted", whip: 0.5, assist: 0 });
  const full = attempt({ preset: "assisted", whip: 0.5, assist: 1 });
  assert.equal(replayDigest(off.s, []), replayDigest(full.s, []));
  assert.equal(full.s.landed.armed, false);
});

test("the flick has to be against the rotation, and inside the window", () => {
  const manual = attempt({ preset: "assisted", whip: 0.5 });
  const wrongWay = attempt({ preset: "assisted", whip: 0.5, flick: 30, flickDir: -1 });
  const tooEarly = attempt({ preset: "assisted", whip: 0.5, flick: 120 });   // 1.0 s, past the 0.6 s window
  for (const r of [wrongWay, tooEarly]) {
    assert.equal(r.s.landed.armed, false);
    assert.equal(r.s.landed.turned, manual.s.landed.turned);
  }
  const wound = attempt({ preset: "assisted", whip: 0.5, flick: 30 });
  assert.equal(wound.s.landed.armed, true);
});

test("the assist moves the arms only: flight and angular momentum are the takeoff's", () => {
  const manual = attempt({ preset: "responsive", whip: 1 });
  const wound = attempt({ preset: "responsive", whip: 1, flick: 30 });
  assert.equal(wound.s.landed.airTime, manual.s.landed.airTime);
  assert.equal(wound.s.landed.height, manual.s.landed.height);
  assert.equal(wound.L[0], manual.L[0], "a full manual whip already exceeds the assist's floor");
  assert.ok(wound.L.every((l) => l === wound.L[0]), "L moved in the air");
});

test("a takeoff with rotation to spare checks out on its revolution, not past it", () => {
  // spec 0.25: the manual triple over-rotates to 3.107; wound, 3.002.
  const specManual = attempt({ preset: "spec", whip: 1, lean: -0.3 });
  const specWound = attempt({ preset: "spec", whip: 1, lean: -0.3, flick: 30 });
  assert.equal(name(specManual.s), "3T");
  assert.ok(Math.abs(specManual.s.landed.turned - 3.107) < 0.001, `${specManual.s.landed.turned}`);
  assert.equal(name(specWound.s), "3T");
  assert.ok(Math.abs(specWound.s.landed.turned - 3.002) < 0.001, `${specWound.s.landed.turned}`);
  assert.ok(specWound.s.landed.landingQuality > specManual.s.landed.landingQuality + 0.15);

  // responsive 0.5: 3.041 manual, 3.000 wound, and the landing is the better for it.
  const manual = attempt({ preset: "responsive", whip: 1 });
  const wound = attempt({ preset: "responsive", whip: 1, flick: 30 });
  assert.ok(Math.abs(manual.s.landed.turned - 3.041) < 0.001);
  assert.ok(Math.abs(wound.s.landed.turned - 3.000) < 0.002, `${wound.s.landed.turned}`);
  assert.equal(wound.s.landed.rotationCall, ROTATION_CALL.Clean);
  assert.ok(wound.s.landed.landingQuality > manual.s.landed.landingQuality);
});

test("on assisted, the flick is the whip: half a whip, or none, lands a clean double", () => {
  const manual = attempt({ preset: "assisted", whip: 0.5 });
  assert.equal(manual.s.landed.rotationCall, ROTATION_CALL.UnderRotated);
  assert.ok(manual.s.landed.fall);
  for (const whip of [0.5, 0]) {
    const wound = attempt({ preset: "assisted", whip, flick: 30 });
    assert.equal(name(wound.s), "2T", `whip ${whip}`);
    assert.ok(Math.abs(wound.s.landed.turned - 2.000) < 0.002, `${wound.s.landed.turned}`);
    assert.equal(wound.s.landed.rotationCall, ROTATION_CALL.Clean);
    assert.ok(!wound.s.landed.fall);
  }
});

test("the assist never finds rotation the takeoff did not buy", () => {
  // spec, a shallower takeoff: 2.812 manual with a full tuck. The target is the
  // nearest revolution, three, which cannot be reached, so the assist tucks as
  // fully and as early as the skater already did, and it comes down q as before.
  const manual = attempt({ preset: "spec", whip: 1, lean: -0.1 });
  const wound = attempt({ preset: "spec", whip: 1, lean: -0.1, flick: 30 });
  assert.ok(Math.abs(manual.s.landed.turned - 2.812) < 0.001);
  assert.equal(wound.s.landed.turned, manual.s.landed.turned);
  assert.equal(wound.s.landed.rotationCall, ROTATION_CALL.Quarter);
});

test("a skater who holds the arms out against the assist still comes down short", () => {
  const fought = attempt({ preset: "responsive", whip: 1, flick: 30, airCarriage: 1 });
  assert.ok(fought.s.landed.turned < 2, `${fought.s.landed.turned}`);
  assert.ok(fought.s.landed.fall);
});

test("an assisted jump replays tick for tick", () => {
  const p = { ...PRESETS.assisted, jumpMode: 2 };
  const rec = new ReplayRecorder(p, -5, 0);
  const { s } = attempt({ preset: "assisted", whip: 0.5, flick: 30 }, rec);
  assert.equal(s.landed.armed, true);
  assert.deepEqual(verifyReplay(parseReplay(rec.toJson())), { ticks: 600, divergence: null });
});

test("validate bounds the wind-up and the assist", () => {
  const p = PRESETS.spec;
  assert.equal(p.jumpAssist, 0.25);
  assert.equal(PRESETS.responsive.jumpAssist, 0.5);
  assert.equal(PRESETS.assisted.jumpAssist, 0.8);
  assert.ok(validate({ ...p, jumpAssist: 1.5 }).some((e) => e.includes("jumpAssist")));
  assert.ok(validate({ ...p, windupThreshold: 0 }).some((e) => e.includes("windupThreshold")));
  assert.ok(validate({ ...p, windupWindow: 0 }).some((e) => e.includes("windupWindow")));
});
