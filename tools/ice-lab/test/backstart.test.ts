// Backward skating from a stop (the owner, 2026-11-27): stick back + A from rest pushes backward,
// the solver's own C-cut at its measured strength; moving, the travel decides as before.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupParams } from "../game/setups.ts";
import { BACK_START_PITCH, isBackStart, withBackStart } from "../game/backstart.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay, replayDigest, verifyReplay } from "../sim/replay.ts";
import { IceGrid } from "../sim/ice.ts";

const along = (s: SkaterState) => s.vel.x * s.heading.x + s.vel.y * s.heading.y;
/** Two seconds of fresh pushes every 0.35 s from rest, each with `extra`. */
function skate(p: Params, extra: Partial<SkatingInput>, speed = 0, rec?: ReplayRecorder): SkaterState {
  const s = createState(p, speed), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  for (let k = 0; k < 240; k++) {
    const input = { ...NEUTRAL_INPUT, push: k % 42 === 0, ...(k % 42 === 0 ? extra : {}) };
    const ev: never[] = [];
    step(s, input, p, SIM_DT, ev, ice);
    rec?.capture(input, p, s, ev);
  }
  return s;
}

for (const setup of ["simulation", "explorer", "experimental"] as const) {
  test(`${setup}: from a stop, pushBack drives backward at backPushScale of a forward start`, () => {
    // The backward stroke's own share, so without the standing start blended over both (startPushMode).
    const p = { ...setupParams(setup), startPushMode: 0 };
    const fwd = along(skate(p, {})), back = along(skate(p, { pushBack: true, pitch: -1 }));
    assert.ok(fwd > 0.5 && back < -0.5, `forward ${fwd}, backward ${back}`);
    // The backward stroke's measured share (data/motion-primitives.json), not a new number.
    assert.ok(Math.abs(-back / fwd - p.backPushScale) < 0.03, `ratio ${-back / fwd} vs backPushScale ${p.backPushScale}`);
  });
}

test("with the standing start, a backward start is quick too: the same running start, backward", () => {
  const on = setupParams("simulation"), off = { ...on, startPushMode: 0 };
  assert.equal(on.startPushMode, 1);
  const fast = along(skate(on, { pushBack: true, pitch: -1 })), slow = along(skate(off, { pushBack: true, pitch: -1 }));
  assert.ok(fast < slow - 0.3, `backward after 2 s: ${fast.toFixed(2)} with the start, ${slow.toFixed(2)} without`);
});

test("moving, pushBack is ignored: the travel decides, so it cannot flip direction mid-skate", () => {
  const p = setupParams("simulation");
  const a = skate(p, {}, 2), b = skate(p, { pushBack: true }, 2);
  assert.equal(replayDigest(a, []), replayDigest(b, []));
});

test("absent or false, a run is byte-identical to one before pushBack existed", () => {
  const p = setupParams("simulation");
  const a = skate(p, {}), b = skate(p, { pushBack: false });
  assert.equal(replayDigest(a, []), replayDigest(b, []));
  assert.equal(Object.hasOwn(a, "strokeBack"), false);
});

test("the mapping: stick at least halfway back, a push, at a stop, upright", () => {
  const p = setupParams("simulation"), s = createState(p, 0);
  const ask = (pitch: number, st = s) => isBackStart({ ...NEUTRAL_INPUT, push: true, pitch }, st, p);
  assert.equal(ask(BACK_START_PITCH), true);
  assert.equal(ask(-1), true);
  assert.equal(ask(BACK_START_PITCH + 0.01), false, "a resting thumb is not a backward start");
  assert.equal(isBackStart({ ...NEUTRAL_INPUT, push: false, pitch: -1 }, s, p), false);
  assert.equal(ask(-1, createState(p, 2)), false, "moving: not a start");
  assert.equal(ask(-1, { ...s, fallen: true }), false, "down: the press is the get-up");
  const mapped = withBackStart({ input: { ...NEUTRAL_INPUT, push: true, pitch: -1 } }, s, p);
  assert.equal(mapped.input.pushBack, true);
  const plain = withBackStart({ input: { ...NEUTRAL_INPUT, push: true } }, s, p);
  assert.equal(Object.hasOwn(plain.input, "pushBack"), false);
});

test("a backward start records and replays: pushBack survives the /39 parser", () => {
  const p = setupParams("simulation"), rec = new ReplayRecorder(p, 0);
  skate(p, { pushBack: true, pitch: -1 }, 0, rec);
  const clip = parseReplay(rec.toJson());
  assert.deepEqual(verifyReplay(clip).divergence, null);
  const player = new ReplayPlayer(clip);
  while (!player.done) player.advance();
  assert.ok(along(player.state) < -0.5);
});
