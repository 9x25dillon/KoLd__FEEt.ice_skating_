// Edge and toe jumps from the entries skaters use (movesMode 1, jumpMode 2).
//
// The operator: "i am seeing skaters doing back crossovers right into the jump
// and we need to put that in the games engine for simulation realism". Two
// things make that true here. The moves reach every takeoff edge the way a
// skater does — back crossovers, three-turns, mohawks — and with the moves on
// part of a jump's lift is its approach turned upward (`jumpSpeedShare`),
// anchored per jump to data/entry-templates.json's entry speed for a triple, so
// the speed the crossovers build is height the jump uses. A toe jump vaults
// over its pick; miss the pick and there is nothing to vault over.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, codeToString } from "../sim/types.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { JUMP, JUMP_DEFS, ENTRY_SPEED, JUMP_PHASE } from "../sim/jump.ts";
import { len } from "../sim/math.ts";

type Phase = { ticks: number; input: (k: number) => Partial<SkatingInput> };

interface Takeoff { speed: number; code: string; vz: number; quality: number; struck: boolean }
interface Jumped { s: SkaterState; takeoff: Takeoff | null }

/**
 * Skate the phases one after another. The stick is mirrored at every frame flip,
 * as app/schemes.ts does for a player, and let go in the air.
 */
function skate(v0: number, phases: Phase[], extra: Partial<Params> = {}): Jumped {
  const p = { ...PRESETS.responsive, movesMode: 1, jumpMode: 2, ...extra };
  const s = createState(p, v0);
  let flips = 0, sign = 1, takeoff: Takeoff | null = null, toeTick = -1;
  for (const ph of phases) {
    for (let k = 0; k < ph.ticks; k++) {
      if (s.flips !== flips) { flips = s.flips; sign = -sign; }
      const inp = ph.input(k);
      const air = s.jump.phase === JUMP_PHASE.Air;
      const speed = len(s.vel), code = codeToString(s.blade[s.supportFoot].code);
      const ev: Array<{ type: number }> = [];
      step(s, { ...NEUTRAL_INPUT, ...inp, lean: air ? 0 : sign * (inp.lean ?? 0) }, p, SIM_DT, ev as never);
      if (inp.toe) toeTick = s.tick;
      if (ev.some((e) => e.type === EVENT.Takeoff)) {
        takeoff = { speed, code, vz: s.jump.vz, quality: s.jump.quality, struck: toeTick >= 0 && (s.tick - toeTick) * SIM_DT <= p.toeWindow };
      }
    }
  }
  return { s, takeoff };
}

// Back crossovers anticlockwise: backward, leaning to the right, two-footed, pushing.
const backXovers = (sec: number, lean = -0.3): Phase => ({ ticks: Math.round(sec * 120), input: () => ({ lean, weight: 0.5, knee: 0.9, push: true }) });
const settle = (sec: number, lean: number, weight: number): Phase => ({ ticks: Math.round(sec * 120), input: () => ({ lean, weight, knee: 0.45 }) });
/** Load 0.30 s, release, land on the right foot with a bent knee. */
const jump = (lean: number, weight: number, whip: number, opt: { toeAt?: number; turn?: boolean; mohawk?: boolean } = {}): Phase => ({
  ticks: 260,
  input: (k) => ({
    lean: k < 36 ? lean : 0,
    weight: opt.mohawk ? (k < 3 ? weight : k < 40 ? 1 - weight : 1) : k < 40 ? weight : 1,
    knee: k < 36 ? 0.95 : k < 39 ? 0 : 0.8,
    carriage: k <= 36 ? whip : 0,
    toe: opt.toeAt !== undefined && k === opt.toeAt,
    turn: (opt.turn ?? false) && k < 6,
  }),
});

test("each jump's entry speed is data/entry-templates.json's", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/entry-templates.json", import.meta.url), "utf8"));
  const ids = ["entry_toeloop", "entry_salchow", "entry_loop", "entry_flip", "entry_lutz", "entry_axel"];
  ids.forEach((id, k) => {
    assert.equal(ENTRY_SPEED[k], data.templates.find((t: { id: string }) => t.id === id).min_entry_speed_ms, id);
  });
});

test("the lift: legs, plus the approach turned upward — a toe jump only over its pick", () => {
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const lift = (r: Jumped, kind: number): number => {
    const t = r.takeoff!, full = p.jumpImpulse * (0.62 + 0.38 * t.quality);
    const vault = !JUMP_DEFS[kind].toe || t.struck ? t.speed / ENTRY_SPEED[kind] : 0;
    return full * (1 - p.jumpSpeedShare) + full * p.jumpSpeedShare * vault;
  };
  const loop = skate(-5, [settle(2, -0.3, 1), jump(-0.3, 1, 0.9)]);
  assert.equal(loop.s.landed.kind, JUMP.Loop);
  // The speed is read the tick before the release; one tick of glide is a few mm/s.
  assert.ok(Math.abs(loop.takeoff!.vz - lift(loop, JUMP.Loop)) < 2e-3, `${loop.takeoff!.vz} against ${lift(loop, JUMP.Loop)}`);
  const early = skate(-5, [backXovers(3), settle(0.6, -0.3, 1), jump(-0.3, 1, 0.9, { toeAt: 2 })]);
  assert.equal(early.s.landed.kind, JUMP.Toeloop);
  assert.equal(early.takeoff!.struck, false);
  assert.ok(Math.abs(early.takeoff!.vz - lift(early, JUMP.Toeloop)) < 2e-3, "a missed pick: no vault");
  // With the moves off the lift is the reference's, whatever the approach.
  const off = skate(-5, [settle(2, -0.3, 1), jump(-0.3, 1, 0.9)], { movesMode: 0 });
  assert.ok(Math.abs(off.takeoff!.vz - p.jumpImpulse * (0.62 + 0.38 * off.takeoff!.quality)) < 1e-12);
});

test("back crossovers right into a loop: the speed they build is the height the loop needs", () => {
  // Measured from 5 m/s backward, the same whip: no crossovers, off at 4.6 m/s,
  // 2.61 revolutions and down; three seconds of back crossovers, off at 7.4,
  // 2.83 and landed.
  const plain = skate(-5, [settle(2, -0.3, 1), jump(-0.3, 1, 0.9)]);
  const built = skate(-5, [backXovers(3), settle(0.6, -0.3, 1), jump(-0.3, 1, 0.9)]);
  assert.equal(plain.s.landed.kind, JUMP.Loop);
  assert.equal(built.s.landed.kind, JUMP.Loop);
  assert.ok(built.takeoff!.speed > plain.takeoff!.speed + 2, `off at ${built.takeoff!.speed.toFixed(2)} against ${plain.takeoff!.speed.toFixed(2)} m/s`);
  assert.ok(built.takeoff!.vz > plain.takeoff!.vz, "higher");
  assert.ok(built.s.landed.turned > plain.s.landed.turned + 0.15,
    `${built.s.landed.turned.toFixed(2)} revolutions against ${plain.s.landed.turned.toFixed(2)}`);
  assert.equal(plain.s.landed.fall, true);
  assert.equal(built.s.landed.fall, false);
});

test("a toe loop off the crossovers: in the pick's window it lands, too early it has nothing to vault over", () => {
  const good = skate(-5, [backXovers(3), settle(0.6, -0.3, 1), jump(-0.3, 1, 0.9, { toeAt: 34 })]);
  const early = skate(-5, [backXovers(3), settle(0.6, -0.3, 1), jump(-0.3, 1, 0.9, { toeAt: 2 })]);
  assert.equal(good.s.landed.kind, JUMP.Toeloop);
  assert.equal(good.s.landed.fall, false);
  assert.ok(early.takeoff!.vz < 0.7 * good.takeoff!.vz, `${early.takeoff!.vz.toFixed(2)} against ${good.takeoff!.vz.toFixed(2)} m/s up`);
  assert.equal(early.s.landed.fall, true);
});

test("off a LFO three-turn onto LBI: with the right toe's pick a flip, without it a salchow", () => {
  const fwdXovers: Phase = { ticks: 300, input: () => ({ lean: 0.3, weight: 0.5, knee: 0.9, push: true }) };
  const flip = skate(5, [fwdXovers, settle(0.5, 0.3, 0), jump(0.3, 0, 0.9, { turn: true, toeAt: 34 })]);
  const salchow = skate(5, [fwdXovers, settle(0.5, 0.3, 0), jump(0.3, 0, 0.9, { turn: true })]);
  assert.equal(flip.takeoff!.code, "LBI");
  assert.equal(flip.s.landed.kind, JUMP.Flip);
  assert.equal(salchow.s.landed.kind, JUMP.Salchow);
  assert.equal(salchow.s.landed.fall, false, "measured: a clean 3S, 2.89 revolutions");
});

test("a lutz off clockwise back crossovers and a long back outside edge, read off its setup", () => {
  // Measured: the edge flattens at the release (LB-), and the setup over the
  // load still says outside — a lutz, called ! for the unclear edge, not e.
  const cwXovers = backXovers(3, 0.3);
  const lutz = skate(-5, [cwXovers, settle(1, 0.15, 0), jump(0.15, 0, 1, { toeAt: 34 })]);
  assert.equal(lutz.s.landed.kind, JUMP.Lutz);
  assert.notEqual(lutz.s.landed.edgeCall, 2, "not a flutz");
});

test("an axel: back crossovers, an outside mohawk onto LFO, and straight up out of it", () => {
  const axel = skate(-5, [backXovers(3), settle(0.5, -0.3, 1), jump(-0.3, 1, 1, { mohawk: true, turn: true })]);
  assert.equal(axel.takeoff!.code, "LFO", "the one forward takeoff");
  assert.equal(axel.s.landed.kind, JUMP.Axel);
  assert.ok(axel.s.landed.turned > 3, `${axel.s.landed.turned.toFixed(2)} revolutions, the mohawk's rotation carried in`);
});
