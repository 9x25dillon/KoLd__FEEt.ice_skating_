// Turn invariants — every turn kind, from either foot, on either curve, on
// every preset, checked tick by tick (sim/moves.ts, movesMode 1).
//
// test/turns.test.ts pins each turn's own numbers from one entry. This sweeps
// the whole matrix — 7 kinds x 2 feet x 2 curve senses x 3 presets — for the
// properties that must hold for all of them: the gesture gets the kind it
// asks for, the exit edge follows the taxonomy (bible §2.3), the lean frame
// never jumps except by the exact mirror flipFrame makes, speed and position
// stay continuous, the lateral load never opposes the lean after the turn,
// and every run replays.
//
// Bounds are measured, then doubled or better (2026-09-22, replay /22): lean
// 0.0094 rad/tick at most off the flip, 0.0016 across it; speed 0.029 m/s per
// tick; yawRate 1.6 rad/s per tick inside a move. The pivot's own start and
// end step yawRate by pi/turnTime in one tick — the pivot sweeps at a set
// rate rather than being spun up by a torque — so those two ticks are
// checked for coinciding with the move changing, not for size.
//
// Measured, not asserted: some exits lay the blade flat for a moment
// (latAccel exactly 0, the lean held by internal authority) before the edge
// returns — about 3 ticks after an `assisted` rocker or counter, about 40
// after a `spec` loop, where internal authority sits at its clamp the whole
// time. Zero load does not oppose the lean, so the invariant below holds; the
// transient is recorded here, not tuned.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, TURN_KIND, TURN_NAME, FOOT, DIR, codeFoot, codeDir, codeSide, codeToString } from "../sim/types.ts";
import type { SkaterState, SkatingInput, EdgeEvent } from "../sim/types.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { len, dot } from "../sim/math.ts";

interface Recipe {
  kind: number;
  /** Bracket button rather than turn: against the curve. */
  against?: boolean;
  /** Held through the cusp (40 ticks) rather than tapped (10). */
  hold?: boolean;
  /** Stick pushed across the entry curve while held: a rocker's reversal. */
  reverse?: boolean;
  /** Weight to the other foot at the cusp. */
  changeFoot?: boolean;
  /** Exit, from the taxonomy: travel direction and whether the edge side changes. */
  exitBackward: boolean;
  sideChanges: boolean;
}

const RECIPES: Recipe[] = [
  { kind: TURN_KIND.ThreeTurn, exitBackward: true, sideChanges: true },
  { kind: TURN_KIND.Bracket, against: true, exitBackward: true, sideChanges: true },
  { kind: TURN_KIND.Mohawk, changeFoot: true, exitBackward: true, sideChanges: false },
  { kind: TURN_KIND.Loop, hold: true, exitBackward: false, sideChanges: false },
  { kind: TURN_KIND.Rocker, hold: true, reverse: true, exitBackward: false, sideChanges: true },
  { kind: TURN_KIND.Counter, against: true, hold: true, reverse: true, exitBackward: false, sideChanges: true },
  { kind: TURN_KIND.Choctaw, hold: true, reverse: true, changeFoot: true, exitBackward: true, sideChanges: true },
];

const MAX_LEAN_STEP = 0.02;      // rad per tick, off the flip
const MAX_FLIP_MISMATCH = 0.005; // rad, |lean + previous lean| on a flip tick
const MAX_SPEED_STEP = 0.06;     // m/s per tick
const MAX_YAW_STEP = 3.5;        // rad/s per tick, while the move is unchanged

interface Run {
  s: SkaterState;
  turns: EdgeEvent[];
  /** The support blade's code on the first tick after the pivot ended. */
  exitCode: number;
  problems: string[];
}

/**
 * Carve 2 s, then the recipe's gesture at tick 240, then glide out to 6 s —
 * test/turns.test.ts's driver, mirroring the held stick at each flip as
 * app/schemes.ts does, with every tick checked on the way.
 */
function skate(p: Params, r: Recipe, weight: number, lean: number, rec?: ReplayRecorder): Run {
  const s = createState(p, 6.8);
  const turns: EdgeEvent[] = [], problems: string[] = [];
  let flips = 0, sign = 1, exitCode = -1, pivotEnded = -1;
  let prev = { lean: s.lean, speed: len(s.vel), yaw: s.yawRate, x: s.pos.x, y: s.pos.y, move: s.move };
  const fail = (i: number, what: string): void => { if (problems.length < 5) problems.push(`tick ${i}: ${what}`); };
  for (let i = 0; i < 720; i++) {
    if (s.flips !== flips) { flips = s.flips; sign = -sign; }
    const held = r.hold ? i >= 240 && i < 280 : i >= 240 && i < 250;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, lean: sign * lean, knee: 0.45,
      weight: r.changeFoot && i >= 244 ? 1 - weight : weight,
      turn: held && !r.against, bracket: held && r.against === true,
      ...(r.reverse && i >= 240 && i < 280 ? { lean: -2 * lean } : {}),
    };
    const flipsBefore = s.flips;
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    for (const e of ev) if (e.type === EVENT.Turn) turns.push(e);
    if (prev.move === MOVE.Turn && s.move === MOVE.None) { pivotEnded = i; exitCode = s.blade[s.supportFoot].code; }

    const speed = len(s.vel);
    for (const [k, v] of Object.entries({ x: s.pos.x, y: s.pos.y, speed, lean: s.lean, yaw: s.yawRate, lat: s.latAccel })) {
      if (!Number.isFinite(v)) fail(i, `${k} is ${v}`);
    }
    const leanJump = s.flips !== flipsBefore ? Math.abs(s.lean + prev.lean) : Math.abs(s.lean - prev.lean);
    if (leanJump > (s.flips !== flipsBefore ? MAX_FLIP_MISMATCH : MAX_LEAN_STEP)) fail(i, `lean jumped ${leanJump.toFixed(4)} rad`);
    if (Math.abs(speed - prev.speed) > MAX_SPEED_STEP) fail(i, `speed jumped ${(speed - prev.speed).toFixed(4)} m/s`);
    const moved = Math.hypot(s.pos.x - prev.x, s.pos.y - prev.y);
    if (moved > Math.max(speed, prev.speed) * SIM_DT * 1.001 + 1e-9) fail(i, `moved ${moved.toFixed(4)} m in one tick at ${speed.toFixed(3)} m/s`);
    if (Math.abs(s.yawRate - prev.yaw) > MAX_YAW_STEP && s.move === prev.move) fail(i, `yawRate stepped ${(s.yawRate - prev.yaw).toFixed(3)} rad/s with no move change`);
    if (pivotEnded >= 0 && s.move === MOVE.None && s.supportMode === 1 && s.latAccel * s.lean < 0) {
      fail(i, `lateral load ${s.latAccel.toFixed(3)} opposes lean ${s.lean.toFixed(4)} after the turn`);
    }
    if (s.fallen) { fail(i, "fell"); break; }
    prev = { lean: s.lean, speed, yaw: s.yawRate, x: s.pos.x, y: s.pos.y, move: s.move };
  }
  return { s, turns, exitCode, problems };
}

for (const preset of ["spec", "responsive", "assisted"] as const) {
  const p: Params = { ...PRESETS[preset], movesMode: 1 };
  for (const r of RECIPES) {
    test(`${preset}: every ${TURN_NAME[r.kind]}, from either foot on either curve, exits on the taxonomy's edge and stays continuous`, () => {
      for (const weight of [0, 1]) for (const lean of [-0.3, 0.3]) {
        const at = `${preset} ${TURN_NAME[r.kind]}, foot ${weight}, lean ${lean}`;
        const run = skate(p, r, weight, lean);
        assert.deepEqual(run.problems, [], at);
        assert.equal(run.turns.length, 1, `${at}: one turn`);
        assert.equal(run.turns[0].value, r.kind, `${at}: classified ${TURN_NAME[run.turns[0].value]}`);

        const from = run.s.moveDone.fromCode, to = run.s.moveDone.toCode;
        const path = `${at}: ${codeToString(from)}>${codeToString(to)}`;
        const entryFoot = weight === 1 ? FOOT.Right : FOOT.Left;
        assert.equal(codeFoot(from), entryFoot, `${path}: entered on the weighted foot`);
        assert.equal(codeDir(from), DIR.Forward, `${path}: entered forward`);
        assert.equal(codeFoot(to), r.changeFoot ? 1 - entryFoot : entryFoot, `${path}: exit foot`);
        assert.equal(codeDir(to), r.exitBackward ? DIR.Backward : DIR.Forward, `${path}: exit direction`);
        assert.equal(codeSide(to) !== codeSide(from), r.sideChanges, `${path}: edge side`);
        assert.equal(codeToString(run.exitCode), codeToString(to), `${path}: the blade itself is on the reported exit edge`);
        assert.equal(dot(run.s.vel, run.s.heading) < 0, r.exitBackward, `${path}: still skating the exit direction 4 s later`);
      }
    });
  }
}

test("every turn kind, from either foot on either curve, replays tick for tick", () => {
  const p: Params = { ...PRESETS.responsive, movesMode: 1 };
  for (const r of RECIPES) for (const weight of [0, 1]) for (const lean of [-0.3, 0.3]) {
    const rec = new ReplayRecorder(p, 6.8);
    skate(p, r, weight, lean, rec);
    assert.equal(verifyReplay(parseReplay(rec.toJson())).divergence, null, `${TURN_NAME[r.kind]}, foot ${weight}, lean ${lean}`);
  }
});
