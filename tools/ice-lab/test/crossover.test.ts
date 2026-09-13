// Crossovers — the moves' first piece (movesMode 1).
//
// "A straight stroke on a flat, a crossover on a curve" (bible §2.1). On a
// curve the outside foot pushes out on its inside edge and the inside foot
// pushes UNDER on its outside edge, so both reactions point at the centre:
// the push supplies part of the arc's centripetal force instead of weaving the
// skater off it. data/motion-primitives.json: "back crossovers build speed
// while already travelling backward" — the standard approach to most jumps.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EDGE, FOOT, DIR, codeSide, codeDir } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { len } from "../sim/math.ts";

const deg = (r: number): number => r * 180 / Math.PI;
const moves = (on: number): Params => ({ ...PRESETS.responsive, movesMode: on });

/** Lean into a curve two-footed for 2 s, then hold push for 6 s, deep knee. */
function curve(p: Params, speed: number, each: (s: SkaterState) => void = () => {}): SkaterState {
  const s = createState(p, speed);
  for (let i = 0; i < 960; i++) {
    step(s, { ...NEUTRAL_INPUT, lean: 0.35, knee: 0.9, weight: 0.5, push: i >= 240 }, p, SIM_DT, []);
    if (i >= 240) each(s);
    if (s.fallen) break;
  }
  return s;
}

test("every preset skates with the moves off, and the moves' levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.movesMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, movesMode: 2 }).some((e) => e.includes("movesMode")));
  assert.ok(validate({ ...DEFAULT_PARAMS, crossoverLean: 0.01 }).some((e) => e.includes("crossoverLean")));
  assert.ok(validate({ ...DEFAULT_PARAMS, backPushScale: 1.2 }).some((e) => e.includes("backPushScale")));
});

test("with the moves off a push on a curve is the stroke it always was", () => {
  let crossovers = 0;
  curve(moves(0), 5, (s) => { if (s.crossover) crossovers++; });
  assert.equal(crossovers, 0);
});

test("on a straight line a push is still a stroke, onto the pushing foot's inside edge", () => {
  const p = moves(1), s = createState(p, 3);
  step(s, { ...NEUTRAL_INPUT, knee: 0.8, weight: 0.5, push: true }, p, SIM_DT, []);
  assert.ok(s.strokeTime > 0);
  assert.equal(s.crossover, false);
  assert.equal(codeSide(s.blade[s.strokeFoot].code), EDGE.Inside);
});

test("leaning into a curve, the inside foot pushes under on its outside edge", () => {
  let under = 0, out = 0, wrong = 0, crossovers = 0, strokes = 0;
  const p = moves(1);
  curve(p, 5, (s) => {
    if (s.strokeTime > p.strokeDuration - 1.5 * SIM_DT) { if (s.crossover) crossovers++; else strokes++; }
    if (s.strokeTime <= 0 || !s.crossover) return;
    const inside = s.crossSide > 0 ? FOOT.Left : FOOT.Right;
    const side = codeSide(s.blade[s.strokeFoot].code);
    if (s.strokeFoot === inside && side === EDGE.Outside) under++;
    else if (s.strokeFoot !== inside && side === EDGE.Inside) out++;
    else wrong++;
  });
  // Measured: all 20 pushes crossovers, 350 ticks of each push, none wrong.
  assert.equal(strokes, 0);
  assert.ok(crossovers >= 18, `${crossovers} crossovers`);
  assert.ok(under > 300 && out > 300, `under ${under}, out ${out}`);
  assert.equal(wrong, 0);
});

test("a crossover keeps the body's lateral support whole; a stroke on a curve halves it", () => {
  // The defect a straight stroke carries onto a curve: the pushing leg's share
  // of the body gets no centripetal force for the push, so the equilibrium
  // lean halves and every push rocks the body. Measured, 5 m/s, 20 degrees
  // commanded: strokes 51% short of the arc and the lean rocking over 22.5..28.7
  // degrees; crossovers within 0.3% and holding 22.4..22.7.
  const run = (on: number): { worst: number; lo: number; hi: number; fell: boolean } => {
    let worst = 0, lo = 99, hi = -99;
    const s = curve(moves(on), 5, (st) => {
      lo = Math.min(lo, deg(st.lean)); hi = Math.max(hi, deg(st.lean));
      if (st.strokeTime <= 0) return;
      const arc = len(st.vel) * Math.abs(st.yawRate);
      if (arc > 0.5) worst = Math.max(worst, Math.abs(Math.abs(st.latAccel) - arc) / arc);
    });
    return { worst, lo, hi, fell: s.fallen };
  };
  const stroke = run(0), cross = run(1);
  assert.ok(stroke.worst > 0.4, `strokes short of the arc by ${stroke.worst.toFixed(3)}`);
  assert.ok(stroke.hi - stroke.lo > 4, `stroke lean ${stroke.lo.toFixed(1)}..${stroke.hi.toFixed(1)}`);
  assert.ok(cross.worst < 0.01, `crossovers short of the arc by ${cross.worst.toFixed(3)}`);
  assert.ok(cross.hi - cross.lo < 1, `crossover lean ${cross.lo.toFixed(1)}..${cross.hi.toFixed(1)}`);
  assert.equal(cross.fell, false);
});

test("back crossovers are forward ones mirrored, on backward edges", () => {
  const p = moves(1);
  const fwd = curve(p, 5), back = curve(p, -5);
  assert.ok(Math.abs(len(fwd.vel) - len(back.vel)) < 0.2, "same speed either way at the same effort, give or take the backward push");
  assert.ok(fwd.yawRate > 0 && back.yawRate < 0, "the same lean curves the other way round backward");
  for (const b of back.blade) if (b.inContact) assert.equal(codeDir(b.code), DIR.Backward);
});

test("one crossover gains about what the motion data says, and a little less backward", () => {
  // data/motion-primitives.json at 6 m/s: forward crossover +1.15 m/s, back
  // +1.05. Measured here from 5.7 m/s, full knee, two pushes against the same
  // glide: +1.01 forward, +0.92 backward — the rig's push is the bible's
  // semi-analytic one, 12% short of the data, and backward is backPushScale of it.
  const gain = (dir: number): number => {
    const p = moves(1), a = createState(p, dir * 6.5), b = createState(p, dir * 6.5);
    const hold = { ...NEUTRAL_INPUT, lean: 0.35, knee: 0.9, weight: 0.5 };
    for (let i = 0; i < 360; i++) { step(a, hold, p, SIM_DT, []); step(b, hold, p, SIM_DT, []); }
    for (let i = 0; i < 96; i++) {
      step(a, { ...hold, push: i === 0 || i === 37 }, p, SIM_DT, []);
      step(b, hold, p, SIM_DT, []);
    }
    return len(a.vel) - len(b.vel);
  };
  const fwd = gain(1), back = gain(-1);
  assert.ok(fwd > 0.95 && fwd < 1.07, `forward crossover +${fwd.toFixed(2)} m/s`);
  assert.ok(back > 0.86 && back < 0.98, `back crossover +${back.toFixed(2)} m/s`);
  assert.ok(Math.abs(back / fwd - PRESETS.responsive.backPushScale) < 0.01, `ratio ${(back / fwd).toFixed(3)}`);
});
