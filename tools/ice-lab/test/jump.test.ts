// Load, air, land — sim/jump.ts against the reference's load-bearing rules and
// against the data.
//
// Every number asserted here was printed first and then written down (hand-off
// §5 item 6). The approach is always the same: skate two seconds on an edge,
// hold the knee deep for 0.30 s — the resolver's ideal load — and release.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PRESETS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, FALL, EDGE, DIR, FOOT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import {
  JUMP, JUMP_NONE, JUMP_DEFS, JUMP_CODE, JUMP_PHASE, ROTATION_CALL, EDGE_CALL,
  identify, edgeMismatch, edgeCall, rotationCall, calledRevolutions,
} from "../sim/jump.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay } from "../sim/replay.ts";

const LOAD_AT = 180, LOAD_TICKS = 36;
const RELEASE = LOAD_AT + LOAD_TICKS;

interface Attempt {
  mode: number; speed: number; weight: number; lean: number;
  toe?: boolean; whip?: number; absorb?: number;
  /** Carriage while airborne: 0 is fully pulled in. */
  airCarriage?: number;
}

function attempt(a: Attempt, record?: ReplayRecorder): {
  s: SkaterState; p: Params; events: EdgeEvent[]; airTicks: number; L: number[];
} {
  const p = { ...PRESETS.responsive, jumpMode: a.mode };
  const s = createState(p, a.speed);
  const events: EdgeEvent[] = [], tickEvents: EdgeEvent[] = [];
  let airTicks = 0;
  const L: number[] = [];
  for (let i = 0; i < 600; i++) {
    const loading = i >= LOAD_AT && i < RELEASE;
    const airborne = s.jump.phase === JUMP_PHASE.Air;
    const input = {
      ...NEUTRAL_INPUT, lean: a.lean, weight: a.weight,
      knee: loading ? 0.95 : i >= RELEASE && i < RELEASE + 3 ? 0 : i >= RELEASE ? (a.absorb ?? 0.8) : 0.35,
      carriage: i <= RELEASE ? (loading || i === RELEASE ? a.whip ?? 0 : 0) : airborne ? a.airCarriage ?? 0 : 0,
      toe: (a.toe ?? false) && i === RELEASE - 2,
    };
    tickEvents.length = 0;
    step(s, input, p, SIM_DT, tickEvents);
    events.push(...tickEvents);
    record?.capture(input, p, s, tickEvents, "A");
    if (s.jump.phase === JUMP_PHASE.Air) { airTicks++; L.push(s.jump.angMomentum); }
  }
  return { s, p, events, airTicks, L };
}

test("the six jump definitions are the data file's, row for row", () => {
  const csv = readFileSync(new URL("../../../data/jump-definitions.csv", import.meta.url), "utf8")
    .trim().split("\n").map((l) => l.split(","));
  const head = csv[0];
  const col = (r: string[], k: string): string => r[head.indexOf(k)];
  assert.equal(csv.length - 1, JUMP_DEFS.length);
  csv.slice(1).forEach((r, k) => {
    const d = JUMP_DEFS[k];
    assert.equal(col(r, "code"), JUMP_CODE[k]);
    assert.equal(col(r, "takeoff_foot"), d.foot === FOOT.Left ? "left" : "right", JUMP_CODE[k]);
    assert.equal(col(r, "takeoff_edge"), d.side === EDGE.Outside ? "outside" : "inside", JUMP_CODE[k]);
    assert.equal(col(r, "takeoff_direction"), d.dir === DIR.Forward ? "forward" : "backward", JUMP_CODE[k]);
    assert.equal(col(r, "toe_assisted"), String(d.toe), JUMP_CODE[k]);
    assert.equal(col(r, "edge_callable"), String(d.edgeCallable), JUMP_CODE[k]);
  });
});

test("the call thresholds are the data file's, and validate() keeps them ordered", () => {
  const csv = readFileSync(new URL("../../../data/calls-and-deductions.csv", import.meta.url), "utf8");
  const p = PRESETS.spec;
  const trig = (code: string): number[] => {
    const line = csv.split("\n").find((l) => l.split(",")[1] === code)!;
    return [...line.split(",")[3].matchAll(/\d+\.\d+/g)].map((m) => Number(m[0]));
  };
  assert.deepEqual(trig("q"), [p.callQuarter, p.callUnder]);
  assert.deepEqual(trig("<"), [p.callUnder, p.callDowngrade]);
  assert.deepEqual(trig("<<"), [p.callDowngrade]);
  assert.deepEqual(trig("!"), [p.callEdgeUnclear, p.callEdgeWrong]);
  assert.deepEqual(trig("e"), [p.callEdgeWrong]);
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ ...p, jumpReleaseKnee: 0.8 }).some((e) => e.includes("jumpReleaseKnee")));
  assert.ok(validate({ ...p, callUnder: 0.6 }).some((e) => e.includes("rotation call")));
});

test("the panel reads a takeoff by foot, direction, edge and toe", () => {
  JUMP_DEFS.forEach((d, k) => assert.equal(identify(d.foot, d.dir, d.side, d.toe), k, JUMP_CODE[k]));
  // Only the axel leaves forwards, and nothing leaves a right forward edge.
  assert.equal(identify(FOOT.Right, DIR.Forward, EDGE.Outside, false), JUMP_NONE);
  assert.equal(identify(FOOT.Left, DIR.Forward, EDGE.Inside, false), JUMP_NONE);
  // A toe-assisted takeoff from the salchow's edge is a flip, and one from the
  // loop's edge is a toe loop: the pick is the difference the panel sees.
  assert.equal(identify(FOOT.Left, DIR.Backward, EDGE.Inside, true), JUMP.Flip);
  assert.equal(identify(FOOT.Right, DIR.Backward, EDGE.Outside, true), JUMP.Toeloop);
});

test("edge calls: a lutz rolled onto its inside edge is an e, a flat one is a !", () => {
  const p = PRESETS.spec;
  assert.equal(edgeCall(edgeMismatch(1, true), p), EDGE_CALL.Clean);
  assert.equal(edgeCall(edgeMismatch(0, true), p), EDGE_CALL.Unclear);
  assert.equal(edgeCall(edgeMismatch(-1, true), p), EDGE_CALL.Wrong);
  assert.equal(edgeCall(edgeMismatch(1, false), p), EDGE_CALL.Wrong, "a lip: the flip went outside");
});

test("rotation calls infer the attempt from the next revolution up", () => {
  const p = PRESETS.spec;
  const call = (turned: number, kind: number) => {
    const { revolutions, shortBy } = calledRevolutions(turned, kind, p);
    return [revolutions, rotationCall(shortBy, p)];
  };
  assert.deepEqual(call(3.04, JUMP.Toeloop), [3, ROTATION_CALL.Clean]);
  assert.deepEqual(call(2.8, JUMP.Toeloop), [3, ROTATION_CALL.Quarter]);
  assert.deepEqual(call(2.65, JUMP.Toeloop), [3, ROTATION_CALL.UnderRotated]);
  assert.deepEqual(call(2.4, JUMP.Toeloop), [3, ROTATION_CALL.Downgraded]);
  // An axel carries an extra half: 2.45 turned is a double axel, just short.
  assert.deepEqual(call(2.45, JUMP.Axel), [2, ROTATION_CALL.Clean]);
  assert.deepEqual(call(3.04, JUMP.Axel), [3, ROTATION_CALL.UnderRotated]);
});

test("with jumps off, a load and release is only a deep knee", () => {
  const { s, events } = attempt({ mode: 0, speed: 5, weight: 0.5, lean: 0, whip: 1 });
  assert.ok(!events.some((e) => e.type === EVENT.Takeoff));
  assert.equal(s.jump.phase, JUMP_PHASE.None);
  assert.equal(s.landed.tick, -1);
});

test("the hop: 2.94 m/s up, 0.44 m, 0.59 s, no rotation and no element", () => {
  const { s, events, airTicks } = attempt({ mode: 1, speed: 5, weight: 0.5, lean: 0, whip: 1 });
  const off = events.findIndex((e) => e.type === EVENT.Takeoff);
  assert.equal(events[off].tick, RELEASE + 1, "the release tick is the takeoff");
  assert.ok(Math.abs(events[off].value - 2.94) < 1e-9, "a perfect load gives the full impulse");
  assert.equal(airTicks, 71);
  assert.ok(Math.abs(s.landed.height - 0.44) < 0.005);
  assert.ok(Math.abs(s.landed.airTime - 2 * 2.94 / 9.81) < 0.01, `air ${s.landed.airTime}`);
  assert.equal(s.landed.kind, JUMP_NONE);
  assert.equal(s.landed.turned, 0, "mode 1 is the plan's hop: the whip does nothing");
  assert.ok(!s.fallen);
});

test("ballistics are fixed at takeoff: the arms change the rotation, never the flight", () => {
  const open = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1, airCarriage: 1 });
  const tucked = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1, airCarriage: 0 });
  assert.equal(open.airTicks, tucked.airTicks);
  assert.equal(open.s.landed.airTime, tucked.s.landed.airTime);
  assert.equal(open.s.landed.height, tucked.s.landed.height);
  // Angular momentum is set once and conserved to the landing, both ways.
  for (const r of [open, tucked]) assert.ok(r.L.every((l) => l === r.L[0]), "L moved in the air");
  assert.equal(open.L[0], tucked.L[0]);
  // Drawn in, the same L spins about four times as fast: I 4.0 -> 0.95.
  const ratio = tucked.s.landed.peakOmega / open.s.landed.peakOmega;
  assert.ok(Math.abs(ratio - 4.0 / 0.95) < 1e-6, `ratio ${ratio}`);
  assert.ok(tucked.s.landed.turned > 3 * open.s.landed.turned);
});

test("a perfect toe loop with a full whip and a tuck is a clean triple", () => {
  // The bible's own numbers: v_y 2.94, 0.60 s, and a tuck that reaches
  // ~6.9 rev/s. A triple is exactly what a perfect takeoff buys.
  const { s, events } = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1 });
  const L = s.landed;
  assert.equal(JUMP_CODE[L.kind], "T");
  assert.equal(L.revolutions, 3);
  assert.ok(Math.abs(L.turned - 3.04) < 0.01, `turned ${L.turned}`);
  assert.equal(L.rotationCall, ROTATION_CALL.Clean);
  assert.ok(L.toe);
  assert.ok(Math.abs(L.takeoffQuality - 1) < 1e-9, `TQ ${L.takeoffQuality}`);
  assert.ok(!L.fall && !s.fallen);
  const land = events.find((e) => e.type === EVENT.Landing)!;
  assert.equal(land.value, L.turned);
});

test("half a whip comes down a revolution short, facing forward, and goes down", () => {
  const { s, events } = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, whip: 0.5 });
  const L = s.landed;
  assert.equal(JUMP_CODE[L.kind], "Lo", "no pick from RBO is a loop");
  assert.equal(L.revolutions, 2);
  assert.equal(L.rotationCall, ROTATION_CALL.UnderRotated);
  assert.ok(L.fall && s.fallen);
  assert.equal(s.fallReason, FALL.Landing);
  assert.equal(events.filter((e) => e.type === EVENT.Fall).length, 1, "one fall, latched");
});

test("landing on a straight leg is a fall even when the rotation is clean", () => {
  const { s } = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1, absorb: 0 });
  assert.equal(s.landed.rotationCall, ROTATION_CALL.Clean);
  assert.ok(s.landed.fall && s.fallen);
});

test("a fallen jumper stands up with the landing still on record", () => {
  const { s, p } = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, whip: 0.5 });
  const landed = s.landed;
  const events: EdgeEvent[] = [];
  step(s, { ...NEUTRAL_INPUT }, p, SIM_DT, events);
  step(s, { ...NEUTRAL_INPUT, push: true }, p, SIM_DT, events);
  assert.ok(!s.fallen);
  assert.equal(s.landed, landed);
  assert.equal(s.jump.phase, JUMP_PHASE.None);
});

test("a jump replays tick for tick, air phase included", () => {
  const p = { ...PRESETS.responsive, jumpMode: 2 };
  const rec = new ReplayRecorder(p, -5);
  const { s } = attempt({ mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1 }, rec);
  const player = new ReplayPlayer(parseReplay(rec.toJson()));
  while (!player.done) player.advance();
  assert.equal(player.divergence, null);
  assert.deepEqual(player.state, s);
});
