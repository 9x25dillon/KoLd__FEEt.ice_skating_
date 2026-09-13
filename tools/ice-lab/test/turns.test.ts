// Turns — the three-turn and the mohawk (sim/moves.ts, movesMode 1).
//
// How a skater gets backward, and so how most jumps are reached: five of the
// six take off backward (data/jump-definitions.csv), and the salchow's entry
// template is "a forward outside three turn onto the back inside edge"
// (data/entry-templates.json). Costs are data/motion-primitives.json's: a
// three-turn -0.45 m/s and a mohawk -0.40 at 6 m/s.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE, TURN_KIND, codeToString } from "../sim/types.ts";
import type { SkaterState, SkatingInput, EdgeEvent } from "../sim/types.ts";
import { JUMP, ROTATION_CALL } from "../sim/jump.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { latchTurns, newSchemeState, SCHEME } from "../app/schemes.ts";
import { len, dot } from "../sim/math.ts";

const moves = (extra: Partial<Params> = {}): Params => ({ ...PRESETS.responsive, movesMode: 1, ...extra });

interface Run { s: SkaterState; turns: EdgeEvent[]; takeoffTick: number; pivotEndTick: number; speedAtPress: number }

/**
 * Carve for 2 s, press B for a few ticks, carry on. `weight` 1 is the right
 * foot and 0 the left; `lean` is toward the skater's left. The driver does by
 * hand what app/schemes.ts does for a player: it mirrors the held stick at a
 * turn's cusp, so the body keeps its circle.
 */
function drive(p: Params, speed: number, weight: number, lean: number,
  opt: { mohawkAt?: number; pitch?: number; ticks?: number; each?: (i: number, s: SkaterState) => Partial<SkatingInput> } = {},
  rec?: ReplayRecorder): Run {
  const s = createState(p, speed);
  let flips = 0, sign = 1, w = weight, takeoffTick = -1, pivotEndTick = -1, speedAtPress = 0;
  const turns: EdgeEvent[] = [];
  for (let i = 0; i < (opt.ticks ?? 720); i++) {
    if (s.flips !== flips) { flips = s.flips; sign = -sign; }
    if (opt.mohawkAt !== undefined && i >= opt.mohawkAt) w = 1 - weight;
    if (i === 240) speedAtPress = len(s.vel);
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, lean: sign * lean, weight: w, knee: 0.45,
      pitch: i >= 230 && i < 280 ? (opt.pitch ?? 0) : 0, turn: i >= 240 && i < 250,
      ...(opt.each?.(i, s) ?? {}),
    };
    const wasTurning = s.move === MOVE.Turn;
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    rec?.capture(input, p, s, ev, "A");
    if (wasTurning && s.move === MOVE.None) pivotEndTick = s.tick;
    for (const e of ev) {
      if (e.type === EVENT.Turn) turns.push(e);
      if (e.type === EVENT.Takeoff) takeoffTick = s.tick;
    }
    if (s.fallen) break;
  }
  return { s, turns, takeoffTick, pivotEndTick, speedAtPress };
}

test("every preset skates without turns, and the turn levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, turnTime: 2 * SIM_DT }).some((e) => e.includes("turnTime")));
  assert.ok(validate({ ...DEFAULT_PARAMS, turnCarry: 1.5 }).some((e) => e.includes("turnCarry")));
  assert.ok(validate({ ...DEFAULT_PARAMS, turnCarryTime: 0 }).some((e) => e.includes("turnCarryTime")));
});

test("with the moves off, the turn button does nothing at all", () => {
  const r = drive({ ...PRESETS.responsive }, 6.8, 1, -0.3);
  assert.equal(r.turns.length, 0);
  assert.equal(r.s.flips, 0);
  assert.ok(dot(r.s.vel, r.s.heading) > 0, "still skating forward");
});

test("a three-turn: RFO becomes RBI on the same circle, for what the data says it costs", () => {
  const before = drive(moves(), 6.8, 1, -0.3, { ticks: 239 }).s.yawRate;
  const r = drive(moves(), 6.8, 1, -0.3);
  assert.equal(r.turns.length, 1);
  const t = r.turns[0];
  assert.equal(t.value, TURN_KIND.ThreeTurn);
  assert.equal(codeToString(t.prevCode), "RFO");
  assert.equal(codeToString(t.newCode), "RBI");
  assert.equal(r.s.fallen, false, "four seconds of backward skating after it");
  assert.ok(dot(r.s.vel, r.s.heading) < 0, "skating backward");
  assert.ok(Math.sign(r.s.yawRate) === Math.sign(before), "the same way round the same circle");
  // Measured: 0.456 m/s from 6.19. The data: 0.45 at 6.
  const lost = r.s.moveDone.speedLost;
  assert.ok(lost > 0.40 && lost < 0.50, `three-turn cost ${lost.toFixed(3)} m/s`);
});

test("LFO three-turn onto LBI, the salchow's entry, is the mirror image", () => {
  const r = drive(moves(), 6.8, 0, 0.3);
  assert.equal(r.turns.length, 1);
  assert.equal(`${codeToString(r.turns[0].prevCode)}>${codeToString(r.turns[0].newCode)}`, "LFO>LBI");
  assert.ok(r.s.yawRate > 0, "anticlockwise: the way data/jump-definitions.csv's jumps rotate");
  assert.equal(r.s.fallen, false);
});

test("weight on the other foot at the cusp makes it a mohawk: LFI onto RBI, a little cheaper", () => {
  const r = drive(moves(), 6.8, 0, -0.3, { mohawkAt: 244 });
  assert.equal(r.turns.length, 1);
  assert.equal(r.turns[0].value, TURN_KIND.Mohawk);
  assert.equal(`${codeToString(r.turns[0].prevCode)}>${codeToString(r.turns[0].newCode)}`, "LFI>RBI");
  assert.equal(r.s.fallen, false);
  // Measured: 0.421 m/s. The data: 0.40.
  const lost = r.s.moveDone.speedLost;
  assert.ok(lost > 0.36 && lost < 0.46, `mohawk cost ${lost.toFixed(3)} m/s`);
});

test("on the front of the rocker a turn is quicker and cheaper: turns are made on the rocker", () => {
  const flat = drive(moves(), 6.8, 1, -0.3);
  const toe = drive(moves(), 6.8, 1, -0.3, { pitch: 0.9 });
  assert.ok(toe.s.moveDone.speedLost < 0.7 * flat.s.moveDone.speedLost,
    `toe ${toe.s.moveDone.speedLost.toFixed(3)} against ${flat.s.moveDone.speedLost.toFixed(3)} m/s`);
  assert.ok(toe.turns[0].prevDwell < flat.turns[0].prevDwell, "and reaches its cusp sooner");
});

test("a turn needs an edge under it and some speed", () => {
  assert.equal(drive(moves(), 6.8, 1, 0).turns.length, 0, "a flat blade has no edge to turn on");
  assert.equal(drive(moves(), 0.9, 1, -0.3).turns.length, 0, "below turnMinSpeed there is nothing to pivot on");
});

test("the release of a jump waits for the exit edge, and a salchow off a three-turn takes the turn with it", () => {
  // Half a whip, a 0.30 s load, the knee let go as the turn ends. From a
  // steady LBI that is a fall a revolution short; out of a three-turn it is a
  // clean double. Measured: 1.62 revolutions against 1.93.
  const jump = (viaTurn: boolean): Run => {
    const p = moves({ jumpMode: 2 });
    return drive(p, viaTurn ? 6.3 : -6.3, 0, viaTurn ? 0.3 : -0.3, {
      ticks: 900,
      each: (i, s) => {
        const loading = i >= 240 && i < 276;
        return {
          turn: viaTurn && i >= 240 && i < 246,
          knee: loading ? 0.95 : i >= 276 && i < 279 ? 0 : i >= 276 ? 0.8 : 0.45,
          carriage: i <= 276 && (loading || i === 276) ? 0.5 : 0,
          weight: i < 280 ? 0 : 1,
          ...(s.jump.phase === 2 ? { lean: 0 } : {}),
        };
      },
    });
  };
  const steady = jump(false), turned = jump(true);
  assert.ok(turned.takeoffTick >= turned.pivotEndTick && turned.pivotEndTick > 0, "no takeoff mid-pivot");
  assert.equal(turned.s.landed.kind, JUMP.Salchow);
  assert.equal(steady.s.landed.kind, JUMP.Salchow);
  assert.ok(turned.s.landed.turned > steady.s.landed.turned + 0.25,
    `${turned.s.landed.turned.toFixed(2)} revolutions out of the turn, ${steady.s.landed.turned.toFixed(2)} without`);
  assert.equal(turned.s.landed.revolutions, 2);
  assert.equal(turned.s.landed.rotationCall, ROTATION_CALL.Clean);
  assert.equal(turned.s.landed.fall, false);
  assert.equal(steady.s.landed.fall, true);
});

test("a held stick keeps its side of the ice through a turn; letting it go ends the mirror", () => {
  const st = newSchemeState();
  const it = (lean: number) => ({ ...NEUTRAL_INPUT, lean });
  assert.equal(latchTurns(SCHEME.A, it(0.8), st, 0).lean, 0.8);
  assert.equal(latchTurns(SCHEME.A, it(0.8), st, 1).lean, -0.8, "the cusp mirrors a held stick");
  assert.equal(latchTurns(SCHEME.A, it(0.7), st, 1).lean, -0.7, "for as long as it is held");
  assert.equal(latchTurns(SCHEME.A, it(0.05), st, 1).lean, 0.05, "back toward centre, the mirror lets go");
  assert.equal(latchTurns(SCHEME.A, it(0.8), st, 1).lean, 0.8, "and the next lean is the new frame's");
  const b = newSchemeState();
  assert.equal(latchTurns(SCHEME.B, it(0.8), b, 1).lean, 0.8, "B steers on the ice, which a turn does not move");
});

test("turns replay tick for tick", () => {
  const p = moves();
  const rec = new ReplayRecorder(p, 6.8);
  const r = drive(p, 6.8, 0, -0.3, { mohawkAt: 244 }, rec);
  assert.equal(r.turns.length, 1);
  assert.deepEqual(verifyReplay(parseReplay(rec.toJson())), { ticks: 720, divergence: null });
});
