// Scheme C's arms on L3, measured through the lab's real mapping.
//
// The operator played scheme C on an Xbox pad and every takeoff was a hop
// with no rotation (2026-09-24): C's arms were keyboard-only, and in this
// model the arms are most of a jump's turn. L3 held now lends the right stick
// to the arms (app/schemes.ts). These jumps go through everything the lab
// does to a pad — app/pad.ts's Pad.read on a fake gamepad, the radial
// deadzone and curve, applyScheme(C) — into the solver, so what is pinned is
// what a thumb would get, not what a scripted SkatingInput would.
//
// The script, so nothing in it is taken on trust: backward at 5 m/s (the jump
// challenge's start), RB for the right foot, both sticks eased to -0.35 over
// half a second (right backward outside — the loop's edge). At 1.3 s L3 goes
// down and the right stick goes straight up to `arms` (up, so there is no
// wind-up in it); the right blade keeps -0.35. RT full from 1.5 s to 1.8 s,
// then let go: the release is the takeoff. In the air RT is held at 0.7,
// the stick comes back (L3 still down: arms in) and at `open` seconds it goes
// full up again — the arms open to check the rotation.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { JUMP_CODE, JUMP_NONE } from "../sim/jump.ts";
import { applyScheme, newSchemeState, SCHEME } from "../app/schemes.ts";
import { Pad } from "../app/pad.ts";
import { hopHint } from "../app/hophint.ts";

let axes = [0, 0, 0, 0], held: number[] = [], rt = 0;
const g = globalThis as unknown as { window?: unknown; navigator: Record<string, unknown> };
if (g.window === undefined) g.window = { addEventListener: () => { /* no blur in a test */ } };
Object.defineProperty(g.navigator, "getGamepads", { configurable: true, value: () => [{
  connected: true, axes: [...axes],
  buttons: Array.from({ length: 17 }, (_, i) => i === 7 ? { pressed: rt > 0.5, value: rt }
    : { pressed: held.includes(i), value: held.includes(i) ? 1 : 0 }),
}] });
const pad = new Pad({ addEventListener: () => { /* no keys in a test */ } } as unknown as HTMLElement);

/** The raw deflection pad.ts shapes to `m`: its deadzone is 0.22 and its curve 1.35. */
const raw = (m: number): number => m === 0 ? 0 : Math.sign(m) * (0.22 + 0.78 * Math.pow(Math.abs(m), 1 / 1.35));
const RB = 5, L3 = 10;

interface Jump { took: string; L: number; lean: number; landed: string; turned: number; lq: number; fall: boolean; stepOut: boolean; hint: string[]; s: SkaterState; landTick: number }

/** `arms` 0 with `l3` false is the operator's session: no arms at all. `rtAt` overrides RT on one tick. */
function loop(preset: string, arms: number, open: number, l3 = true, rtAt?: { tick: number; value: number }): Jump {
  const p: Params = { ...PRESETS[preset], jumpMode: 2, movesMode: 1 };
  const s = createState(p, -5, 0);
  const st = newSchemeState();
  let took = -1;
  const out = { took: "", L: 0, lean: 0 } as Jump;
  for (let i = 0; i < Math.round(5 / SIM_DT); i++) {
    const t = i * SIM_DT, air = took >= 0;
    const lean = Math.min(1, t / 0.5) * -0.35;
    const armsOn = l3 && t >= 1.3;
    const up = !air ? (t >= 1.3 ? arms : 0) : (t - took >= open ? 1 : 0);
    axes = [raw(air ? 0 : lean), 0, raw(armsOn ? 0 : air ? 0 : lean), -raw(armsOn ? up : 0)];
    held = [RB, ...(armsOn ? [L3] : [])];
    rt = rtAt && rtAt.tick === i ? rtAt.value : !air && t >= 1.5 && t < 1.8 ? 1 : air ? 0.7 : 0;
    const it = applyScheme(SCHEME.C, pad.read(true), s.heading, s.vel, s.yawRate, p, st, s.flips);
    const ev: EdgeEvent[] = [];
    step(s, it, p, SIM_DT, ev);
    if (ev.some((e) => e.type === EVENT.Takeoff)) {
      took = t;
      Object.assign(out, { took: s.jump.kind === JUMP_NONE ? "none" : JUMP_CODE[s.jump.kind], L: s.jump.angMomentum, lean: it.lean });
    }
    if (ev.some((e) => e.type === EVENT.Landing)) {
      const l = s.landed;
      return Object.assign(out, {
        landed: l.kind === JUMP_NONE ? "hop" : `${l.revolutions}${JUMP_CODE[l.kind]}`, turned: l.turned,
        lq: l.landingQuality, fall: l.fall, stepOut: l.stepOut, s, landTick: i,
        hint: hopHint(l, { kind: s.jump.kind, code: s.jump.takeoffCode }, p.jumpMode, it.knee),
      });
    }
  }
  throw Error("no landing in 5 s");
}

const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.005, `${what}: ${a.toFixed(3)}, measured ${b}`);

test("without the arms, C on a pad hops — the operator's session, reproduced", () => {
  // Measured 2026-09-24, responsive (the lab's boot preset), full jumps with
  // the moves: the takeoff reads as a loop, leaves with L 5.20, turns 0.355
  // rev — short of the 0.375 a jump needs — and comes down a hop.
  const j = loop("responsive", 0, 99, false);
  assert.equal(j.took, "Lo");
  near(j.L, 5.20, "angular momentum");
  assert.equal(j.landed, "hop");
  near(j.turned, 0.355, "turned");
  assert.match(j.hint[0], /^a loop takeoff, but 0\.36 rev is too little to count — arms out/,
    "and the HUD says why, in words");
});

test("with L3 and the right stick, C lands named jumps; the right blade holds its edge throughout", () => {
  // Measured 2026-09-24 through Pad.read -> applyScheme(C), responsive:
  //   arms 0.5, opened at 0.30 s: single loop, 1.055 rev, LQ 0.365, L 24.20
  //   arms 1.0, opened at 0.30 s: double loop, 1.883 rev, LQ 0.253 (a step-out), L 43.20
  //   arms 1.0, never opened:     triple loop, 2.955 rev, LQ 0.383, L 43.20
  // and on spec, as the earlier investigation measured with a scripted
  // carriage (1.08 rev, 0.59):
  //   arms 0.2, never opened:     single loop, 1.079 rev, LQ 0.591
  const cases: Array<[string, number, number, string, number, number, number]> = [
    ["responsive", 0.5, 0.30, "1Lo", 1.055, 0.365, 24.20],
    ["responsive", 1.0, 0.30, "2Lo", 1.883, 0.253, 43.20],
    ["responsive", 1.0, 99, "3Lo", 2.955, 0.383, 43.20],
    ["spec", 0.2, 99, "1Lo", 1.079, 0.591, 15.77],
  ];
  for (const [preset, arms, open, name, turned, lq, L] of cases) {
    const j = loop(preset, arms, open);
    const what = `${preset} arms ${arms} open ${open}`;
    assert.equal(j.took, "Lo", `${what}: took off as a loop`);
    near(j.lean, -0.35, `${what}: the right blade kept its -0.35 under L3, so the lean at takeoff`);
    near(j.L, L, `${what}: angular momentum`);
    assert.equal(j.landed, name, what);
    near(j.turned, turned, `${what}: turned`);
    near(j.lq, lq, `${what}: landing quality`);
    assert.equal(j.fall, false, `${what}: on its feet`);
    assert.equal(j.hint.length, 0, `${what}: a named jump landed with RT at 0.7 needs no hint`);
  }
});

test("the knee's share of the landing is what app/hophint.ts says it is", () => {
  // hophint.ts restates sim/jump.ts's 0.5 x (1 - knee) because the solver
  // keeps only the sum. Land the same jump twice, changing RT on the
  // touchdown tick alone: the difference is exactly that share.
  const held = loop("spec", 0.2, 99);
  const tick = held.landTick;
  const let_go = loop("spec", 0.2, 99, true, { tick, value: 0.2 });
  near(held.lq - let_go.lq, 0.5 * (0.7 - 0.2), "the landing quality RT cost");
  assert.equal(let_go.landed, "1Lo");
  assert.match(let_go.hint[0], /^knee 0\.20 at touchdown cost 0\.40 of landing quality — keep RT \(Shift\) pulled as you land$/);
});
