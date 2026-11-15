// Element telemetry (game/elementstats.ts): the cards are read from the solver,
// so each number is checked here against the state the solver left, tick by tick.
// The style thresholds are authored; the tests pin how they are applied, not
// that the numbers are right.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT, MOVE } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { supportSignal } from "../sim/support.ts";
import { ElementRecorder, STYLE_RULES, styleOf } from "../game/elementstats.ts";

const LOAD_AT = 180, LOAD_TICKS = 36, RELEASE = LOAD_AT + LOAD_TICKS;

/** The jump.test.ts approach: skate, hold the knee deep 0.30 s, release, absorb. */
function jump(opts: { mode: number; speed: number; weight: number; lean: number; toe?: boolean; whip?: number; airCarriage?: number }) {
  const p = { ...PRESETS.responsive, jumpMode: opts.mode };
  const s = createState(p, opts.speed);
  const rec = new ElementRecorder();
  let airTicks = 0, maxZ = 0, peakOm = 0, takeoffPos = { x: 0, y: 0 }, takeoffSpeed = 0, prevSpeed = 0, takeoffVz = 0;
  let landSpeed = 0, landPos = { x: 0, y: 0 }, loadOne = 0;
  const seen = (i: number) => i;
  for (let i = 0; i < 600; i++) {
    seen(i);
    const loading = i >= LOAD_AT && i < RELEASE;
    const airborne = s.jump.phase === JUMP_PHASE.Air;
    const input: SkatingInput = {
      ...NEUTRAL_INPUT, lean: opts.lean, weight: opts.weight,
      knee: loading ? 0.95 : i >= RELEASE && i < RELEASE + 3 ? 0 : i >= RELEASE ? 0.8 : 0.35,
      carriage: i <= RELEASE ? (loading || i === RELEASE ? opts.whip ?? 0 : 0) : airborne ? opts.airCarriage ?? 0 : 0,
      toe: (opts.toe ?? false) && i === RELEASE - 2,
    };
    const ev: EdgeEvent[] = [];
    const wasAir = airborne;
    step(s, input, p, SIM_DT, ev);
    const g = supportSignal(s);
    if (s.jump.phase === JUMP_PHASE.Load && g.phase === "one" && airTicks === 0) loadOne++;
    if (s.jump.phase === JUMP_PHASE.Air) {
      if (!wasAir) { takeoffPos = { x: s.pos.x, y: s.pos.y }; takeoffSpeed = prevSpeed; takeoffVz = s.jump.vz; }
      airTicks++; maxZ = Math.max(maxZ, s.jump.z);
      peakOm = Math.max(peakOm, Math.abs(s.jump.angMomentum / s.jump.inertia) / (2 * Math.PI));
    }
    if (s.landed.tick === s.tick) { landSpeed = Math.hypot(s.vel.x, s.vel.y); landPos = { x: s.pos.x, y: s.pos.y }; }
    prevSpeed = Math.hypot(s.vel.x, s.vel.y);
    rec.sample(s, ev, g, SIM_DT);
  }
  return { s, rec, airTicks, maxZ, peakOm, takeoffPos, takeoffSpeed, takeoffVz, landSpeed, landPos, loadOne };
}

const TOE_DOUBLE = { mode: 2, speed: -5, weight: 1, lean: -0.25, toe: true, whip: 1 };

test("a jump's card reads the solver: height, air time, distance, speeds, rates", () => {
  const r = jump(TOE_DOUBLE);
  const cards = r.rec.cards.filter((c) => c.kind === "jump");
  assert.equal(cards.length, 1);
  const c = cards[0], st = c.stats, L = r.s.landed;
  assert.equal(c.tick, L.tick);
  assert.equal(st.revolutions, L.revolutions);
  assert.equal(st.height, Math.round(r.maxZ * 100) / 100);
  assert.ok(Math.abs((st.height as number) - L.height) < 0.011, `${st.height} vs landed ${L.height}`);
  assert.equal(st.airTime, Math.round(r.airTicks * SIM_DT * 100) / 100);
  assert.ok(Math.abs((st.airTime as number) - L.airTime) < 0.011, `${st.airTime} vs landed ${L.airTime}`);
  assert.equal(st.distance, Math.round(Math.hypot(r.landPos.x - r.takeoffPos.x, r.landPos.y - r.takeoffPos.y) * 100) / 100);
  assert.equal(st.entrySpeed, Math.round(r.takeoffSpeed * 100) / 100);
  assert.equal(st.exitSpeed, Math.round(r.landSpeed * 100) / 100);
  assert.equal(st.takeoffVz, Math.round(r.takeoffVz * 100) / 100);
  assert.equal(st.peakRate, Math.round(r.peakOm * 100) / 100);
  assert.ok((st.peakRate as number) >= (st.meanRate as number) - 0.011);
  assert.equal(st.turned, Math.round(L.turned * 100) / 100);
  assert.equal(st.speedKept, Math.round(100 * r.landSpeed / r.takeoffSpeed));
  assert.equal(st.loadOneFootSeconds, Math.round(r.loadOne * SIM_DT * 100) / 100);
  assert.ok((st.inertiaRatio as number) > 0 && (st.inertiaRatio as number) <= 1);
  assert.equal(c.rows.length, 11);
  assert.match(c.name, /LOOP|FLIP|LUTZ|SALCHOW|AXEL|HOP/);
});

test("a tucked jump reads a smaller inertia ratio than an open one", () => {
  const open = jump({ ...TOE_DOUBLE, airCarriage: 1 }).rec.cards[0];
  const tucked = jump({ ...TOE_DOUBLE, airCarriage: 0 }).rec.cards[0];
  assert.ok((tucked.stats.inertiaRatio as number) < (open.stats.inertiaRatio as number),
    `${tucked.stats.inertiaRatio} vs ${open.stats.inertiaRatio}`);
});

test("the same replay gives the same cards", () => {
  const a = jump(TOE_DOUBLE).rec.cards, b = jump(TOE_DOUBLE).rec.cards;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("a spin's card carries the sim's own moveDone", () => {
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const s = createState(p, 5);
  const rec = new ElementRecorder();
  let peak = 0, ends = 0;
  for (let i = 0; i < 240 + 400 + 240; i++) {
    const t = i - 240;
    const input: SkatingInput = { ...NEUTRAL_INPUT, weight: 0, lean: i < 240 ? 0.3 : 0, knee: 0.45, spin: t >= 0 && t < 400 };
    const ev: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, ev);
    if (s.move === MOVE.Spin) peak = Math.max(peak, Math.abs(s.spin.omega) / (2 * Math.PI));
    for (const e of ev) if (e.type === EVENT.Spin) ends++;
    rec.sample(s, ev, supportSignal(s), SIM_DT);
  }
  const cards = rec.cards.filter((c) => c.kind === "spin");
  assert.equal(ends, 1);
  assert.equal(cards.length, 1);
  const st = cards[0].stats, d = s.moveDone;
  assert.equal(st.revolutions, Math.round(d.revolutions * 100) / 100);
  assert.equal(st.travel, Math.round(d.travel * 100) / 100);
  assert.equal(st.seconds, Math.round(d.seconds * 100) / 100);
  assert.equal(st.peakRate, Math.round(peak * 100) / 100);
  assert.ok((st.meanRate as number) > 0 && (st.meanRate as number) <= (st.peakRate as number) + 0.011);
  assert.ok(cards[0].rows.some((r) => r[0] === "CENTERING"));
});

test("the style words apply the authored table, and only to their own kind", () => {
  assert.deepEqual(styleOf("jump", { height: 0.5, peakRate: 3.5, peakAt: 0.7, inertiaRatio: 0.9, speedKept: 90, distance: 2 }),
    ["BIG AIR", "FAST ROTATION", "DELAYED ROTATION", "FLOWING EXIT"]);
  assert.deepEqual(styleOf("spin", { height: 0.5 }), []);
  assert.deepEqual(styleOf("spin", { travel: 0.1, meanRate: 5, revolutions: 9 }), ["FAST SPIN", "CENTRED", "LONG SPIN"]);
  for (const r of STYLE_RULES) assert.ok(r.note.length > 0 && Number.isFinite(r.value));
});

test("a skater that does nothing earns no cards, and a restart clears the run", () => {
  const p = PRESETS.responsive, s = createState(p, 4), rec = new ElementRecorder();
  for (let i = 0; i < 300; i++) { const ev: EdgeEvent[] = []; step(s, NEUTRAL_INPUT, p, SIM_DT, ev); rec.sample(s, ev, supportSignal(s), SIM_DT); }
  assert.equal(rec.cards.length, 0);
});
