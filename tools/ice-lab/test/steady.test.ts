// The steadying hand (game/steady.ts): an assist on the input, never the physics.
// Its one rule was chosen by measuring a novice on the pad, played here the way
// the suite plays everything — a scripted pad through each setup's own mapping
// into the solver. Every number below was printed first, then written down.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { MOVE, FALL } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { resolveRinkCollision, RINK } from "../game/rink.ts";
import { SteadyHand, steadyDefault, steadyStrength, safeLean, STEADY_LEVELS } from "../game/steady.ts";

const A = 0, B = 1, LT = 6, RT = 7;
function mulberry32(a: number) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A novice on the pad. Every 0.4–1.2 s the thumbs pick somewhere new — half the
 * time slammed to one side ("jerky"; a tenth of the time, "calm") — and get there
 * at 6 (or 3) stick-widths a second; within 7 m of the boards they steer for the
 * middle. They push when under 2.5 m/s, and a second after a fall they get up.
 */
export function novice(setup: Setup, seed: number, strength: number, seconds = 60, style: "jerky" | "calm" = "jerky") {
  const rng = mulberry32(seed);
  const p = setupParams(setup), s = createState(p, 4.5), profile = defaultControllerProfile();
  const st = newSchemeState(), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth), hand = new SteadyHand(strength);
  const two = setup === "simulation" || setup === "experimental" || setup === "diggate";
  const exp = setup === "experimental" || setup === "diggate";
  let tx = 0, ty = 0, x = 0, y = 0, next = 0, falls = 0, was = false, down = 0, lastPush = -9, held = 0;
  const reasons: number[] = [];
  for (let k = 0; k < seconds / SIM_DT; k++) {
    const t = k * SIM_DT;
    if (t >= next) {
      next = t + 0.4 + rng() * 0.8;
      const slam = rng() < (style === "calm" ? 0.1 : 0.5);
      tx = slam ? (rng() < 0.5 ? -1 : 1) : (rng() * 1.4 - 0.7) * (style === "calm" ? 0.6 : 1);
      ty = rng() < 0.3 ? rng() - 0.5 : 0;
    }
    const wall = Math.min(s.pos.x - RINK.minX, RINK.maxX - s.pos.x, s.pos.y - RINK.minY, RINK.maxY - s.pos.y);
    if (wall < 7 && !s.fallen) {
      const cx = (RINK.minX + RINK.maxX) / 2 - s.pos.x, cy = (RINK.minY + RINK.maxY) / 2 - s.pos.y;
      tx = s.heading.x * cy - s.heading.y * cx > 0 ? -0.6 : 0.6; ty = 0;
    }
    const rate = (style === "calm" ? 3 : 6) * SIM_DT;
    x += clamp(tx - x, -rate, rate); y += clamp(ty - y, -rate, rate);
    const h: ControllerHardware = { axes: [x, -y, two ? x : 0, two ? -y : 0], buttons: Array(16).fill(0), keys: [], connected: true };
    const speed = Math.hypot(s.vel.x, s.vel.y);
    if (s.fallen) {
      down += SIM_DT;
      if (down > 1 && down < 1 + 3.5 * SIM_DT) h.buttons[exp ? RT : A] = 1;
    } else {
      down = 0;
      if (speed < 2.5 && t - lastPush > (exp ? 0.5 : 0.8)) lastPush = t;
      if (t - lastPush < 3 * SIM_DT) h.buttons[exp ? (Math.floor(t / 0.5) % 2 ? RT : LT) : A] = 1;
      if (exp && k < 2) h.buttons[B] = 1;
    }
    const input = hand.apply(setupInput({ hardware: h } as Controls, s, setup, st, p, profile).input, s, p);
    held += hand.held;
    const events: Parameters<typeof step>[4] = [];
    step(s, input, p, SIM_DT, events, ice);
    resolveRinkCollision(s, events);
    if (s.fallen && !was) { falls++; reasons.push(s.fallReason); }
    was = s.fallen;
  }
  return { falls, reasons, held: held / (seconds / SIM_DT) };
}

/** A pad held as given: the hardware frame the setups' mapping reads. */
const held = (axes: number[]): Controls => {
  const hardware: ControllerHardware = { axes, buttons: Array(16).fill(0), keys: [], connected: true };
  return { hardware } as Controls;
};
const total = (setup: Setup, strength: number, style: "jerky" | "calm" = "jerky") =>
  [1, 2, 3].reduce((n, seed) => n + novice(setup, seed, strength, 60, style).falls, 0);

test("off hands on the player's own input, untouched", () => {
  const p = setupParams("simulation"), s = createState(p, 4.5);
  const input = setupInput(held([1, 0, 1, 0]), s, "simulation", newSchemeState(), p, defaultControllerProfile()).input;
  const hand = new SteadyHand(0);
  assert.equal(hand.apply(input, s, p), input);
  assert.equal(hand.held, 0);
});

test("it never writes the skater: same state before and after, whatever it does to the input", () => {
  const p = setupParams("explorer"), s = createState(p, 1.2);
  const before = JSON.stringify(s);
  const hand = new SteadyHand(1);
  const input = { ...setupInput(held([1, 0, 0, 0]), s, "explorer", newSchemeState(), p, defaultControllerProfile()).input };
  const out = hand.apply(input, s, p);
  assert.equal(JSON.stringify(s), before);
  assert.ok(Math.abs(out.lean) < Math.abs(input.lean), "a full stick at 1.2 m/s is held back");
  assert.ok(hand.held > 0.5);
});

test("it holds the lean to what the edge can carry: Firm the safe lean, Light 1.25 times it", () => {
  const p = setupParams("simulation");
  for (const speed of [1, 2, 3.7, 5]) {
    const s = createState(p, speed);
    const firm = new SteadyHand(steadyStrength("firm")), light = new SteadyHand(steadyStrength("light"));
    const asked = setupInput(held([1, 0, 1, 0]), s, "simulation", newSchemeState(), p, defaultControllerProfile()).input;
    const f = firm.apply(asked, s, p).lean, l = light.apply(asked, s, p).lean;
    assert.ok(Math.abs(f - safeLean(s, p)) < 1e-12, `firm at ${speed}`);
    assert.ok(Math.abs(l - 1.25 * safeLean(s, p)) < 1e-12 || l === asked.lean, `light at ${speed}`);
  }
  // MEASURED: the safe lean, as a share of maxLean, at 1, 2, 3.7 and 5 m/s.
  const at = (v: number) => +safeLean(createState(p, v), p).toFixed(3);
  assert.deepEqual([1, 2, 3.7, 5].map(at), [0.03, 0.118, 0.366, 0.56]);
});

test("it stays out of the way in a move, in the air, loading a jump, and down", () => {
  const p = setupParams("repertoire"), hand = new SteadyHand(1);
  const base = createState(p, 0.8);
  const input = { ...setupInput(held([1, 0, 0, 0]), base, "repertoire", newSchemeState(), p, defaultControllerProfile()).input, lean: 1 };
  for (const change of [
    (s: typeof base) => { s.fallen = true; },
    (s: typeof base) => { s.jump.phase = JUMP_PHASE.Air; },
    (s: typeof base) => { s.jump.phase = JUMP_PHASE.Load; },
    (s: typeof base) => { s.move = MOVE.Spin; },
  ]) {
    const s = structuredClone(base);
    change(s);
    assert.equal(hand.apply(input, s, p), input);
  }
  for (const key of ["turn", "bracket", "spin", "twizzle", "inaBauer"] as const) assert.equal(hand.apply({ ...input, [key]: true }, base, p).lean, 1, key);
});

test("the defaults are the owner's pick: off where the setup promises minimal assistance, light elsewhere", () => {
  assert.deepEqual((["simulation", "experimental", "diggate", "explorer", "repertoire", null] as const).map(steadyDefault),
    ["off", "off", "off", "light", "light", "light"]);
  assert.deepEqual(STEADY_LEVELS.map(l => l.strength), [0, 0.5, 1]);
});

// MEASURED 2026-11-05: falls in three novice minutes (seeds 1-3, 60 s each), Off / Light / Firm.
// The hand cuts them where the cause is too much lean for the speed; Experimental's
// falls come at a standstill, where no lean limit reaches, and it barely moves them.
const FALLS: Record<string, { jerky: number[]; calm: number[] }> = {
  simulation: { jerky: [19, 5, 3], calm: [10, 4, 1] },
  // Re-measured 2026-11-14 with Explorer's default push knee (game/setups.ts EXPLORER_PUSH_KNEE),
  // the owner's pick: [7, 4, 2] and [6, 2, 0] before. Harder pushes, more falls past the lean
  // limit; 0.5 measured no better ([11, 9, 6], [6, 4, 3]).
  explorer: { jerky: [10, 8, 5], calm: [11, 6, 6] },
  repertoire: { jerky: [16, 5, 3], calm: [14, 4, 3] },
  experimental: { jerky: [29, 21, 14], calm: [24, 24, 16] },
};
for (const setup of Object.keys(FALLS) as Setup[]) test(`${setup}: a novice falls less with the hand`, () => {
  for (const style of ["jerky", "calm"] as const) {
    const got = [0, 0.5, 1].map(k => total(setup, k, style));
    assert.deepEqual(got, FALLS[setup][style], `${setup} ${style}`);
    if (setup !== "experimental") {
      assert.ok(got[1] < got[0], `${setup} ${style}: light < off`);
      assert.ok(got[2] <= got[1], `${setup} ${style}: firm <= light`);
    }
  }
});

test("the novice's falls are lean, not the timer: why the hand limits the lean", () => {
  const reasons = [1, 2, 3].flatMap(seed => novice("simulation", seed, 0, 60).reasons);
  const lean = reasons.filter(r => r === FALL.LeanExceeded).length;
  assert.ok(lean / reasons.length > 0.9, `${lean} of ${reasons.length}`);
});
