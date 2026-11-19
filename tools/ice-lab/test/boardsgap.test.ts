import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createState, step } from "../sim/solver.ts";
import { DEFAULT_PARAMS, PRESETS, SIM_DT, validate } from "../sim/params.ts";
import { parseReplay, replayDigest, verifyReplay, REPLAY_SOLVER } from "../sim/replay.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { resolveRinkCollision, rinkHit } from "../game/rink.ts";
import { auditReplay, OutsideMeter, OUTSIDE_EPS } from "../bench/boardsgap.ts";

function outside(vx = 0, vy = -2) {
  const s = createState(PRESETS.assisted, 0);
  s.pos = { x: 0, y: 46.001 }; s.vel = { x: vx, y: vy }; return s;
}

test("boards flag defaults off without changing the strict /39 parameter keys", () => {
  assert.equal(Object.hasOwn(DEFAULT_PARAMS, "boardsSnapInbound"), false);
  assert.equal(REPLAY_SOLVER, "ice-lab-f64/39");
  for (const boardsSnapInbound of [undefined, 0, 1])
    assert.ok(!validate({ ...DEFAULT_PARAMS, boardsSnapInbound }).some(e => e.includes("boardsSnapInbound")));
  for (const boardsSnapInbound of [-1, 0.5, 2, NaN, Infinity])
    assert.ok(validate({ ...DEFAULT_PARAMS, boardsSnapInbound }).some(e => e.includes("boardsSnapInbound")));
});

test("omitted and explicit zero leave inward and tangent states byte-identical", () => {
  for (const vy of [-2, 0]) {
    const a = outside(1, vy), b = outside(1, vy), expected = replayDigest(a, []);
    resolveRinkCollision(a, []); resolveRinkCollision(b, [], { boardsSnapInbound: 0 });
    assert.equal(replayDigest(a, []), expected); assert.equal(replayDigest(b, []), expected);
  }
});

test("inbound snap changes only position, without changing velocity or events", () => {
  const s = outside(), before = structuredClone(s), events: EdgeEvent[] = [];
  resolveRinkCollision(s, events, { boardsSnapInbound: 1 });
  assert.equal(s.pos.y, 46); assert.equal(rinkHit(s.pos.x, s.pos.y), null);
  assert.deepEqual({ ...s, pos: before.pos }, before); assert.deepEqual(events, []);
});

test("tangent and stationary standing skaters snap too", () => {
  for (const vx of [0, 2]) {
    const s = outside(vx, 0);
    resolveRinkCollision(s, [], { boardsSnapInbound: 1 });
    assert.equal(s.pos.y, 46); assert.deepEqual(s.vel, { x: vx, y: 0 });
  }
});

test("rounded-corner projection follows the normal and is idempotent within roundoff", () => {
  const s = outside(-1, -1); s.pos = { x: 27, y: 45 };
  const hit = rinkHit(s.pos.x, s.pos.y)!;
  resolveRinkCollision(s, [], { boardsSnapInbound: 1 });
  assert.ok((rinkHit(s.pos.x, s.pos.y)?.penetration ?? 0) < OUTSIDE_EPS);
  assert.ok(Math.abs(Math.hypot(s.pos.x - 27, s.pos.y - 45) - hit.penetration) < 1e-12);
  const once = { ...s.pos };
  resolveRinkCollision(s, [], { boardsSnapInbound: 1 });
  assert.ok(Math.hypot(s.pos.x - once.x, s.pos.y - once.y) < 1e-12);
  assert.deepEqual(s.vel, { x: -1, y: -1 });
});

test("outward bounce and crash paths are exactly unchanged", () => {
  for (const speed of [2, 5]) {
    const off = outside(0, speed), on = outside(0, speed), a: EdgeEvent[] = [], b: EdgeEvent[] = [];
    resolveRinkCollision(off, a); resolveRinkCollision(on, b, { boardsSnapInbound: 1 });
    assert.deepEqual(on, off); assert.deepEqual(b, a);
  }
});

test("fallen skaters and interior states remain untouched with the flag on", () => {
  const down = outside(); down.fallen = true;
  const inside = createState(PRESETS.assisted, 2);
  for (const s of [down, inside]) {
    const before = replayDigest(s, []);
    resolveRinkCollision(s, [], { boardsSnapInbound: 1 });
    assert.equal(replayDigest(s, []), before);
  }
});

test("the recorder sees the snap on the next tick despite recording before collision", () => {
  const off = outside(), on = outside();
  assert.equal(replayDigest(off, []), replayDigest(on, []));
  resolveRinkCollision(off, []); resolveRinkCollision(on, [], { boardsSnapInbound: 1 });
  const a: EdgeEvent[] = [], b: EdgeEvent[] = [];
  step(off, NEUTRAL_INPUT, PRESETS.assisted, SIM_DT, a);
  step(on, NEUTRAL_INPUT, PRESETS.assisted, SIM_DT, b);
  assert.notEqual(replayDigest(off, a), replayDigest(on, b));
});

test("outside meter counts contiguous intervals, directions, fallen ticks and roundoff separately", () => {
  const meter = new OutsideMeter(), s = outside();
  s.tick = 1; meter.sample(s);
  s.tick = 2; s.vel.y = 2; s.fallen = true; meter.sample(s);
  s.tick = 3; s.pos.y = 46; meter.sample(s);
  s.tick = 4; s.pos.y = 46.002; s.vel.y = 0; s.fallen = false; meter.sample(s);
  s.tick = 5; s.pos.y = 46 + OUTSIDE_EPS / 2; meter.sample(s);
  const r = meter.result();
  assert.equal(r.outsideTicks, 3); assert.equal(r.rawPositiveTicks, 4);
  assert.equal(r.inbound, 1); assert.equal(r.outbound, 1); assert.equal(r.tangent, 1); assert.equal(r.fallen, 1);
  assert.equal(r.seconds, 3 * SIM_DT); assert.equal(r.longestSeconds, 2 * SIM_DT);
  assert.deepEqual(r.spans.map(s => [s.firstTick, s.lastTick]), [[1, 2], [4, 4]]);
});

test("committed replay still parses and verifies; both audit modes are deterministic", () => {
  const clip = parseReplay(readFileSync(new URL("./fixtures/replay-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(verifyReplay(clip), { ticks: 240, divergence: null });
  const off = auditReplay(clip), on = auditReplay(clip, true);
  assert.equal(off.firstRecordedMismatch, null);
  assert.deepEqual(off.digests, clip.frames.map(f => f.digest));
  assert.deepEqual(on.digests, off.digests);
  assert.deepEqual(auditReplay(clip), off); assert.deepEqual(auditReplay(clip, true), on);
});
