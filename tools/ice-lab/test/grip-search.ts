// Does winding the shoulders against the hips add angular momentum to a jump,
// because the ice is holding the feet? A research sweep, not a test: nothing
// here changes the sim, and every number is the sim's own. Findings:
// docs/grip-search.md.
//
//   node test/grip-search.ts prior                    the earlier fixed toe-jump recipe, reproduced
//   node test/grip-search.ts coarse <seconds> <out>   random wound/unwound pairs, top pairs to <out> (JSON)
//   node test/grip-search.ts refine <in> <seconds> <out>   hill-climb each setup x jump under three objectives
//   node test/grip-search.ts report <in>              robustness, landings, the ice's books, the best unwound on that edge
//   node test/grip-search.ts fair <in> <seconds>      climbs unwound takeoffs as hard as the wound ones, on each rescue and total edge
//   node test/grip-search.ts padcheck '<pad case>'    one pad recipe under 60 jitters, against the same X with no B
//   node test/grip-search.ts map                      one plain recipe, wound against unwound, over lean, carriage and release time
//   node test/grip-search.ts trace '<case json>'      one pair, tick by tick
//   node test/grip-search.ts pad                      Experimental through the pad's own mapping (B then X)
//
// Every comparison is a PAIR: the same takeoff with SkatingInput.windup zero
// throughout, every other input identical, tick for tick. Deterministic: a
// seeded generator, and the sim reseeds its own noise from the tick count.

import { readFileSync, writeFileSync } from "node:fs";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { DIR, EDGE, EVENT, FOOT, NEUTRAL_INPUT, REGIME } from "../sim/types.ts";
import type { EdgeEvent, SkaterState, SkatingInput, TorqueBudget } from "../sim/types.ts";
import { bodyRate, JUMP_CODE, JUMP_DEFS, JUMP_NONE, upperInertia } from "../sim/jump.ts";
import { setupInput, setupParams } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

const SETUPS = ["experimental", "simulation", "explorer"] as const;
type SetupId = typeof SETUPS[number];
const PARAMS: Record<SetupId, Params> = {
  experimental: setupParams("experimental"), simulation: setupParams("simulation"), explorer: setupParams("explorer"),
};

/**
 * Everything but the wind. leanFrac is the depth asked, 0..1 of maxLean; its
 * sign comes from the jump (its foot, direction and edge, data/jump-definitions.csv).
 * Carriage is constant from the first tick: stepping it on the release tick
 * would change bodyRate's upper inertia for free (see `carriageStepProbe`).
 */
export interface Base {
  setup: SetupId; kind: number; speed: number; leanFrac: number; entryKnee: number;
  kneeLoad: number; loadS: number; carriage: number; pitch: number;
  /** s: the arms eased from 0 to `carriage` over this long before the blade leaves. Only the unwound comparison uses it (`bestUnwound`). */
  ease?: number;
}

/**
 * The wind, as times before the blade leaves: starts tStart before it, reaches
 * w0 over tRamp, begins to let go tRel before it and reaches w1 over dRel
 * (smoothstep each). tRel - dRel < 0 means the blade leaves mid-swing. windup
 * is clockwise-positive: w0 > 0 winds against the jump's rotation.
 */
export interface Wind { w0: number; tStart: number; tRamp: number; tRel: number; dRel: number; w1: number }

export interface Case { base: Base; wind: Wind }

const PREROLL = 1.8;  // s from the start of the attempt to the blade leaving
const ss = (x: number): number => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

export function windAt(w: Wind, tau: number): number {
  const up = ss((w.tStart - tau) / Math.max(w.tRamp, 1e-6));
  const rel = ss((w.tRel - tau) / Math.max(w.dRel, 1e-6));
  return w.w0 * up * (1 - rel) + w.w1 * rel;
}

const NO_WIND: Wind = { w0: 0, tStart: 0, tRamp: 1, tRel: 0, dRel: 1, w1: 0 };

function groundInput(b: Base, windup: number, tau: number, loadTicks: number): SkatingInput {
  const def = JUMP_DEFS[b.kind];
  const weight = def.foot === FOOT.Right ? 1 : 0;
  // The left foot leaning left is on its outside edge (sim/jump.ts outsideness). So the
  // backward entries but the lutz curve counter-clockwise, and the lutz clockwise, on purpose.
  const sideOutside = def.foot === FOOT.Right ? -1 : 1;
  const lean = (def.side === EDGE.Outside ? sideOutside : -sideOutside) * b.leanFrac;
  const ticksLeft = Math.round(tau / SIM_DT);
  return {
    ...NEUTRAL_INPUT, lean, weight, pitch: b.pitch, windup,
    carriage: b.ease ? b.carriage * Math.min(1, Math.max(0, 1 - tau / b.ease)) : b.carriage,
    knee: ticksLeft <= 0 ? 0.2 : ticksLeft <= loadTicks ? b.kneeLoad : b.entryKnee,
    toe: def.toe && ticksLeft > 0 && ticksLeft * SIM_DT <= 0.04,
  };
}

const blank = (): TorqueBudget => ({ armsAsked: 0, arms: 0, trunk: 0, leg: 0, need: 0, cap: 0, ice: 0, pivoting: false, Il: 0, Iu: 0 });

export interface Takeoff {
  ok: boolean; L: number; rawRate: number; q: number; kind: number; height: number; vz: number; speedOut: number;
  yawRate: number; yawDev: number; twist: number; twistRate: number; freeSwingRate: number; armsL: number; spinCarry: number;
  /** kg m²/s of each term at takeoff, before the quality factor. */
  termCarve: number; termLower: number; termTwist: number; termFree: number; termArms: number; termCarry: number;
  /** The tick before blade-off (loseContact clears the blade on the takeoff tick). */
  regimeBefore: number; latSlipBefore: number; pivotingAtTakeoff: boolean; capAtTakeoff: number; needAtTakeoff: number;
  /** Over the last 0.1 s on the ice and over the load: ticks the feet pivoted, ticks the blade skidded. */
  pivotLast: number; skidLast: number; pivotLoad: number; skidLoad: number; peakAbsDev: number;
  /** N m s: the ice's torque integrated over the load; and over the last 0.2 s. */
  iceLoad: number; iceLast: number; trunkPeak: number;
  /** N m s: the ice's torque on the body over the whole attempt, from the trunk solve: what the feet held, in the end. */
  iceAll: number;
}

export interface Flown extends Takeoff { state: SkaterState | null; trace?: string[] }

/** Runs to the blade leaving (or a fall). The state is left at takeoff for `fly`. */
export function runToTakeoff(c: Case, wound: boolean, trace = false): Flown {
  const b = c.base, p = PARAMS[b.setup], def = JUMP_DEFS[b.kind];
  const dir = def.dir === DIR.Backward ? -1 : 1;
  const s = createState(p, dir * b.speed, 0);
  const T = Math.round(PREROLL / SIM_DT), loadTicks = Math.round(b.loadS / SIM_DT);
  s.torqueBudget = blank();
  const rows: string[] = [];
  let regimeBefore = REGIME.Unloaded as number, latSlipBefore = 0, armsBefore = 0;
  let pivotLast = 0, skidLast = 0, pivotLoad = 0, skidLoad = 0, peakAbsDev = 0, iceLoad = 0, iceLast = 0, trunkPeak = 0, iceAll = 0;
  const events: EdgeEvent[] = [];
  for (let i = 0; i <= T + 2; i++) {
    const tau = (T - i) * SIM_DT;
    const windup = wound ? windAt(c.wind, tau) : 0;
    const input = groundInput(b, windup, tau, loadTicks);
    s.torqueBudget = blank();
    events.length = 0;
    armsBefore = s.armsL ?? 0;
    step(s, input, p, SIM_DT, events);
    const B = s.torqueBudget!;
    if (s.fallen) return { ...emptyTakeoff(), state: null };
    const took = events.some(e => e.type === EVENT.Takeoff);
    if (trace) rows.push([i, tau.toFixed(4), windup.toFixed(3), input.knee, s.knee.toFixed(3), (s.twist ?? 0).toFixed(3), (s.twistRate ?? 0).toFixed(3), (s.yawDev ?? 0).toFixed(3), s.yawRate.toFixed(3),
      (s.armsL ?? 0).toFixed(2), B.trunk.toFixed(1), B.need.toFixed(1), B.cap.toFixed(1), B.ice.toFixed(1), Number(B.pivoting), s.blade[s.supportFoot].regime, s.blade[s.supportFoot].latSlipAccel.toFixed(2), (p.inertiaOpen * bodyRate(s, p, b.carriage)).toFixed(2)].join(","));
    const inLoad = tau < b.loadS;
    iceAll += B.ice * SIM_DT;
    if (B.pivoting && inLoad) pivotLoad++;
    if (B.pivoting && tau <= 0.1) pivotLast++;
    if (inLoad) { iceLoad += B.ice * SIM_DT; peakAbsDev = Math.max(peakAbsDev, Math.abs(s.yawDev ?? 0)); trunkPeak = Math.max(trunkPeak, Math.abs(B.trunk)); }
    if (tau <= 0.2) iceLast += B.ice * SIM_DT;
    if (took) {
      const J = s.jump, Iu = upperInertia(p, b.carriage), dev = s.yawDev ?? 0;
      const armsL = armsBefore + B.arms * SIM_DT;   // the takeoff zeroes s.armsL after reading it
      const If = p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach;
      const rate = p.jumpRotBias * (s.yawRate - dev) + ((p.lowerBodyInertia + Iu) * dev + Iu * (s.twistRate ?? 0)) / p.inertiaOpen
        + (s.freeSwingRate !== undefined ? If * (dev + s.freeSwingRate) / p.inertiaOpen : 0) + armsL / p.inertiaOpen;
      return {
        state: s, trace: rows, ok: true, L: J.angMomentum, rawRate: rate + s.spinCarry, q: J.quality, kind: J.kind, height: J.height, vz: J.vz,
        speedOut: Math.hypot(s.vel.x, s.vel.y),
        yawRate: s.yawRate, yawDev: dev, twist: s.twist ?? 0, twistRate: s.twistRate ?? 0, freeSwingRate: s.freeSwingRate ?? 0, armsL, spinCarry: s.spinCarry,
        termCarve: p.inertiaOpen * p.jumpRotBias * (s.yawRate - dev), termLower: (p.lowerBodyInertia + Iu) * dev, termTwist: Iu * (s.twistRate ?? 0),
        termFree: s.freeSwingRate !== undefined ? If * (dev + s.freeSwingRate) : 0, termArms: armsL, termCarry: p.inertiaOpen * s.spinCarry,
        regimeBefore, latSlipBefore, pivotingAtTakeoff: B.pivoting, capAtTakeoff: B.cap, needAtTakeoff: B.need,
        pivotLast, skidLast, pivotLoad, skidLoad, peakAbsDev, iceLoad, iceLast, trunkPeak, iceAll,
      };
    }
    const blade = s.blade[s.supportFoot];
    regimeBefore = blade.regime; latSlipBefore = blade.latSlipAccel;
    if (blade.regime === REGIME.Skid && inLoad) skidLoad++;
    if (blade.regime === REGIME.Skid && tau <= 0.1) skidLast++;
  }
  return { ...emptyTakeoff(), state: null };
}

function emptyTakeoff(): Takeoff {
  return { ok: false, L: 0, rawRate: 0, q: 0, kind: JUMP_NONE, height: 0, vz: 0, speedOut: 0, yawRate: 0, yawDev: 0, twist: 0, twistRate: 0, freeSwingRate: 0, armsL: 0, spinCarry: 0,
    termCarve: 0, termLower: 0, termTwist: 0, termFree: 0, termArms: 0, termCarry: 0, regimeBefore: 0, latSlipBefore: 0, pivotingAtTakeoff: false, capAtTakeoff: 0, needAtTakeoff: 0,
    pivotLast: 0, skidLast: 0, pivotLoad: 0, skidLoad: 0, peakAbsDev: 0, iceLoad: 0, iceLast: 0, trunkPeak: 0, iceAll: 0 };
}

export interface Landing { landed: boolean; turned: number; revolutions: number; fall: boolean; call: number; kind: string; landingQ: number; height: number; standing: boolean; check: number }

/** Flies a fresh run of the case: tucked until `check` s into the air, then open; lands on the right foot, knee 0.7; then 1 s of riding out. */
export function fly(c: Case, wound: boolean, check: number): Landing {
  const r = runToTakeoff(c, wound);
  const none: Landing = { landed: false, turned: 0, revolutions: 0, fall: true, call: 0, kind: "-", landingQ: 0, height: 0, standing: false, check };
  if (!r.state) return none;
  const s = r.state, p = PARAMS[c.base.setup];
  const events: EdgeEvent[] = [];
  let landedAt = -1;
  for (let i = 1; i < 720; i++) {
    const t = i * SIM_DT;
    events.length = 0;
    const open = t >= check;
    const input: SkatingInput = landedAt >= 0
      ? { ...NEUTRAL_INPUT, lean: 0, knee: 0.35, weight: 1, carriage: 1 }
      : { ...NEUTRAL_INPUT, knee: 0.7, weight: 1, carriage: open ? 1 : 0 };
    step(s, input, p, SIM_DT, events);
    if (landedAt < 0 && events.some(e => e.type === EVENT.Landing)) landedAt = t;
    if (s.fallen || (landedAt >= 0 && t - landedAt > 1)) break;
  }
  const R = s.landed;
  return {
    landed: landedAt >= 0, turned: R.turned, revolutions: R.revolutions, fall: R.fall, call: R.rotationCall,
    kind: R.kind === JUMP_NONE ? "none" : JUMP_CODE[R.kind], landingQ: R.landingQuality, height: R.height, standing: landedAt >= 0 && !s.fallen, check,
  };
}

/** Best landing any check timing gets: standing first, then the most revolutions cleanly called, then turned. */
export function bestLanding(c: Case, wound: boolean): { tucked: Landing; best: Landing } {
  const tucked = fly(c, wound, 99);
  let best = tucked;
  const score = (l: Landing) => (l.landed ? 100 : 0) + (l.standing ? 50 : 0) + (l.fall ? 0 : 25) + (l.call === 0 ? l.revolutions * 3 : 0) + l.landingQ;
  for (let check = 0.05; check <= 1.0; check += 0.0125) {
    const l = fly(c, wound, check);
    if (score(l) > score(best)) best = l;
  }
  return { tucked, best };
}

// ── through the pad ─────────────────────────────────────────────────────────

/**
 * Experimental through its own mapping (game/full-controls.ts), where windup
 * and carriage are one thing: X / B ease `arms` at 3/s, windup = 0.7 arms,
 * carriage = |arms|. The right back outside edge on the right stick, the weight
 * set right with a tap of B, RT to load. bFrom..xFrom: B held, winding against
 * the rotation (bFrom 0: no wind). xFrom: X held to the blade leaving (0: none).
 */
export interface PadCase { speed: number; stick: number; heel: number; loadS: number; bFrom: number; xFrom: number }

export function padRun(c: PadCase, check = 99): (Takeoff & { landing: Landing | null }) | null {
  const p = PARAMS.experimental, s = createState(p, -c.speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  const T = Math.round(PREROLL / SIM_DT), events: EdgeEvent[] = [];
  let took: Takeoff | null = null, tookAt = -1, armsBefore = 0, landedAt = -1;
  for (let i = 0; i < T + 720; i++) {
    const tau = (T - i) * SIM_DT;
    h.buttons.fill(0);
    if (tookAt < 0) {
      h.axes = [0, 0, -c.stick, c.heel];
      if (i < 3) h.buttons[1] = 1;
      if (c.bFrom > 0 && tau <= c.bFrom && (c.xFrom <= 0 || tau > c.xFrom)) h.buttons[1] = 1;
      if (c.xFrom > 0 && tau <= c.xFrom && tau > 0) h.buttons[2] = 1;
      if (tau <= c.loadS && tau > 0) h.buttons[7] = 1;
    } else {
      h.axes = [0, 0, 0, 0];
      h.buttons[7] = 0.7;
      if ((i - tookAt) * SIM_DT >= check && landedAt < 0) h.buttons[1] = 1;
    }
    const mapped = setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input;
    s.torqueBudget = blank();
    armsBefore = s.armsL ?? 0;
    events.length = 0;
    step(s, mapped, p, SIM_DT, events);
    if (s.fallen && !took) return null;
    if (events.some(e => e.type === EVENT.Takeoff)) {
      const B = s.torqueBudget!, J = s.jump, Iu = upperInertia(p, mapped.carriage), dev = s.yawDev ?? 0, armsL = armsBefore + B.arms * SIM_DT;
      const If = p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach;
      took = { ...emptyTakeoff(), ok: true, L: J.angMomentum, q: J.quality, kind: J.kind, height: J.height, vz: J.vz, speedOut: Math.hypot(s.vel.x, s.vel.y),
        yawRate: s.yawRate, yawDev: dev, twist: s.twist ?? 0, twistRate: s.twistRate ?? 0, freeSwingRate: s.freeSwingRate ?? 0, armsL, spinCarry: s.spinCarry,
        termCarve: p.inertiaOpen * p.jumpRotBias * (s.yawRate - dev), termLower: (p.lowerBodyInertia + Iu) * dev, termTwist: Iu * (s.twistRate ?? 0),
        termFree: s.freeSwingRate !== undefined ? If * (dev + s.freeSwingRate) : 0, termArms: armsL, termCarry: p.inertiaOpen * s.spinCarry,
        pivotingAtTakeoff: B.pivoting, capAtTakeoff: B.cap, needAtTakeoff: B.need };
      tookAt = i;
    }
    if (landedAt < 0 && events.some(e => e.type === EVENT.Landing)) landedAt = i;
    if (s.fallen || (landedAt >= 0 && i - landedAt > 120)) break;
  }
  if (!took) return null;
  const R = s.landed;
  return { ...took, landing: landedAt < 0 ? null : { landed: true, turned: R.turned, revolutions: R.revolutions, fall: R.fall, call: R.rotationCall,
    kind: R.kind === JUMP_NONE ? "none" : JUMP_CODE[R.kind], landingQ: R.landingQuality, height: R.height, standing: !s.fallen, check } };
}

function padSweep(): void {
  type Row = { c: PadCase; gainVsNoWind: number; gainVsNothing: number; Lw: number; L0: number; Lx: number; w: Takeoff };
  const rows: Row[] = [];
  let n = 0;
  for (const speed of [5, 6, 7, 8]) for (const stick of [0.5, 0.7, 0.85, 1]) for (const heel of [-1, 0, 1]) for (const loadS of [0.25, 0.35, 0.45]) {
    const nothing = padRun({ speed, stick, heel, loadS, bFrom: 0, xFrom: 0 });
    for (const xFrom of [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) {
      const armsOnly = padRun({ speed, stick, heel, loadS, bFrom: 0, xFrom });
      for (const hold of [0.1, 0.2, 0.33, 0.5, 0.8]) {
        const c = { speed, stick, heel, loadS, bFrom: xFrom + hold, xFrom }, w = padRun(c);
        n++;
        if (!w || !armsOnly || !nothing) continue;
        rows.push({ c, gainVsNoWind: w.L - armsOnly.L, gainVsNothing: w.L - nothing.L, Lw: w.L, L0: nothing.L, Lx: armsOnly.L, w });
      }
    }
  }
  rows.sort((a, b) => b.gainVsNoWind - a.gainVsNoWind);
  const line = (r: Row) => `${r.c.speed} ${r.c.stick} ${r.c.heel} ${r.c.loadS} ${f(r.c.bFrom)} ${r.c.xFrom} | ${f(r.Lw)} | ${f(r.Lx)} | ${f(r.L0)} | ${f(r.gainVsNoWind)} | ${f(r.w.termTwist)} ${f(r.w.termArms)} ${f(r.w.yawDev)} ${r.w.pivotingAtTakeoff} ${f(r.w.needAtTakeoff, 0)}/${f(r.w.capAtTakeoff, 0)}`;
  console.log(`pad sweep: ${n} wound runs, ${rows.length} with takeoffs on all three`);
  console.log("speed stick heel load bFrom xFrom | L wound (B then X) | L same X, no B | L neither | gain vs same X | twist term, arms term, yawDev, pivoting, need/cap");
  for (const r of rows.slice(0, 15)) console.log(line(r));
  const held = rows.filter(r => !r.w.pivotingAtTakeoff);
  console.log(`of those, feet held at the takeoff tick: ${held.length}; best gain vs same X among them ${held[0] ? f(held[0].gainVsNoWind) : "-"}`);
  for (const r of held.slice(0, 8)) console.log(line(r));
  const bestX = [...rows].sort((a, b) => b.Lx - a.Lx)[0], bestW = [...rows].sort((a, b) => b.Lw - a.Lw)[0];
  console.log(`highest L with any wind ${f(bestW.Lw)} (${JSON.stringify(bestW.c)}); highest L with no wind ${f(bestX.Lx)} (${JSON.stringify({ ...bestX.c, bFrom: 0 })})`);
  const rank = (l: Landing) => (l.standing ? 100 : 0) + (l.call === 0 ? l.revolutions * 3 : 0) + l.landingQ;
  for (const r of [rows[0], ...held.slice(0, 1)]) {
    if (!r) continue;
    for (const [name, c] of [["wound", r.c], ["same X, no B", { ...r.c, bFrom: 0 }]] as const) {
      let best: Landing | null = null;
      for (let check = 0.05; check < 1; check += 0.0125) { const l = padRun(c, check)?.landing; if (l && (!best || rank(l) > rank(best))) best = l; }
      console.log(`${name} ${JSON.stringify(c)}: best landing ${best ? `turned ${f(best.turned)} revs ${best.revolutions} call ${best.call} standing ${best.standing} check ${f(best.check, 3)} h ${f(best.height, 3)}` : "none"}`);
    }
  }
}

// ── the search ──────────────────────────────────────────────────────────────

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const uni = (r: () => number, a: number, b: number): number => a + (b - a) * r();

const GRID = {
  speed: [3, 4.5, 6, 7.5, 9], leanFrac: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9], entryKnee: [0.35, 0.55],
  kneeLoad: [0.75, 0.9, 1], loadS: [0.15, 0.25, 0.35, 0.45], carriage: [0, 0.25, 0.5, 0.75, 1], pitch: [-0.8, -0.3, 0, 0.3, 0.8],
};

function randomBase(r: () => number): Base {
  return { setup: pick(r, SETUPS), kind: Math.floor(r() * JUMP_DEFS.length), speed: pick(r, GRID.speed), leanFrac: pick(r, GRID.leanFrac), entryKnee: pick(r, GRID.entryKnee),
    kneeLoad: pick(r, GRID.kneeLoad), loadS: pick(r, GRID.loadS), carriage: pick(r, GRID.carriage), pitch: pick(r, GRID.pitch) };
}

/** Wound against the rotation and let go, wound and held, wound with it, or only swung through. */
function randomWind(r: () => number, b: Base): Wind {
  const family = r();
  const tStart = uni(r, b.loadS * 0.5, 1.5), tRamp = uni(r, 0.1, 0.8);
  if (family < 0.55) {  // against the rotation, then let go, possibly through to the other side
    const dRel = uni(r, 0.05, 0.6), end = uni(r, -0.1, dRel * 0.6);
    return { w0: uni(r, 0.15, 1), tStart, tRamp, tRel: end + dRel, dRel, w1: r() < 0.4 ? 0 : -uni(r, 0, 1) };
  }
  if (family < 0.7) return { w0: uni(r, 0.15, 1), tStart, tRamp, tRel: -0.01, dRel: 1, w1: 0 };  // wound and held through the release
  if (family < 0.85) {  // no wind first: a swing the jump's way through the load
    const dRel = uni(r, 0.05, 0.8), end = uni(r, -0.1, dRel * 0.6);
    return { w0: 0, tStart: 2, tRamp: 0.1, tRel: end + dRel, dRel, w1: -uni(r, 0.1, 1) };
  }
  const dRel = uni(r, 0.05, 0.6), end = uni(r, -0.1, dRel * 0.6);  // the wrong sign: led with the rotation, then swung back
  return { w0: -uni(r, 0.15, 1), tStart, tRamp, tRel: end + dRel, dRel, w1: r() < 0.5 ? 0 : uni(r, 0, 1) };
}

interface Pair { c: Case; gain: number; rawGain: number; L0: number; Lw: number; wound: Takeoff; bare: Takeoff }

const strip = (t: Flown): Takeoff => { const { state: _s, trace: _t, ...rest } = t; return rest; };

function pairOf(c: Case, cache?: Map<string, Takeoff>): Pair | null {
  const key = JSON.stringify(c.base);
  let bare = cache?.get(key);
  if (!bare) { bare = strip(runToTakeoff(c, false)); cache?.set(key, bare); }
  const wound = strip(runToTakeoff(c, true));
  if (!bare.ok || !wound.ok) return null;
  return { c, gain: wound.L - bare.L, rawGain: wound.rawRate * 4 - bare.rawRate * 4, L0: bare.L, Lw: wound.L, wound, bare };
}

const groupKey = (b: Base): string => `${b.setup} ${JUMP_CODE[b.kind]}`;

function coarse(seconds: number, out: string): void {
  const r = mulberry(0x51ED27), start = Date.now(), cache = new Map<string, Takeoff>();
  const top = new Map<string, Pair[]>();
  const stats = new Map<string, { n: number; failed: number; gainOver1: number; heldOver1: number; maxGain: number; maxBare: number; sumGain: number }>();
  let n = 0;
  while ((Date.now() - start) / 1000 < seconds) {
    const b = randomBase(r), c = { base: b, wind: randomWind(r, b) };
    n++;
    const k = groupKey(b);
    const st = stats.get(k) ?? { n: 0, failed: 0, gainOver1: 0, heldOver1: 0, maxGain: -Infinity, maxBare: 0, sumGain: 0 };
    stats.set(k, st);
    st.n++;
    const pr = pairOf(c, cache);
    if (!pr) { st.failed++; continue; }
    st.maxGain = Math.max(st.maxGain, pr.gain); st.maxBare = Math.max(st.maxBare, pr.L0); st.sumGain += pr.gain;
    if (pr.gain > 1) { st.gainOver1++; if (pr.wound.pivotLast === 0) st.heldOver1++; }
    const list = top.get(k) ?? [];
    list.push(pr); list.sort((a, c2) => c2.gain - a.gain);
    if (list.length > 12) list.pop();
    top.set(k, list);
  }
  console.log(`coarse: ${n} pairs, ${cache.size} distinct unwound takeoffs, ${((Date.now() - start) / 1000).toFixed(0)} s`);
  console.log("group, pairs, no-takeoff, gain>1, of those feet held last 0.1 s, mean gain, max gain, best unwound L in sample");
  for (const k of [...stats.keys()].sort()) { const s = stats.get(k)!;
    console.log([k, s.n, s.failed, s.gainOver1, s.heldOver1, (s.sumGain / Math.max(1, s.n - s.failed)).toFixed(2), s.maxGain.toFixed(2), s.maxBare.toFixed(2)].join(", ")); }
  writeFileSync(out, JSON.stringify([...top.values()].flat()));
}

function mutate(r: () => number, c: Case, scale: number): Case {
  const g = (sd: number) => (r() + r() + r() - 1.5) * 1.15 * sd * scale;
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  const b = c.base, w = c.wind;
  return {
    base: { ...b, speed: clamp(b.speed + g(1), 2, 10), leanFrac: clamp(b.leanFrac + g(0.1), 0.05, 1), entryKnee: clamp(b.entryKnee + g(0.08), 0.2, 0.65),
      kneeLoad: clamp(b.kneeLoad + g(0.08), 0.72, 1), loadS: clamp(b.loadS + g(0.05), 0.1, 0.47), carriage: clamp(b.carriage + g(0.15), 0, 1), pitch: clamp(b.pitch + g(0.25), -1, 1) },
    wind: { w0: clamp(w.w0 + g(0.15), -1, 1), tStart: clamp(w.tStart + g(0.15), 0.05, 1.7), tRamp: clamp(w.tRamp + g(0.1), 0.02, 1), tRel: clamp(w.tRel + g(0.05), -0.2, 1.2), dRel: clamp(w.dRel + g(0.05), 0.02, 1.2), w1: clamp(w.w1 + g(0.15), -1, 1) },
  };
}

/** The feet held through the whole load and off the blade: no tick pivoting, no tick skidding, not a skid at the last tick. */
const heldThrough = (t: Takeoff): boolean => t.pivotLoad === 0 && t.skidLoad === 0 && t.regimeBefore !== REGIME.Skid;

/**
 * What the climb maximises, -Infinity if the pair is outside the class.
 * twist: both held, so the pair differs only by the shoulders on an edge that never let go.
 * rescue: the wound takeoff held; the unwound one may have pivoted. Scored by the pair's gain.
 * total: the wound takeoff held. Scored by its L alone, to compare with the best unwound on the edge.
 */
type Objective = "twist" | "rescue" | "total";
function objective(pr: Pair | null, o: Objective): number {
  if (!pr || !heldThrough(pr.wound)) return -Infinity;
  if (o === "twist") return heldThrough(pr.bare) ? pr.gain : -Infinity;
  return o === "rescue" ? pr.gain : pr.Lw;
}

/**
 * Scored by the worst of a pair and five small timing and depth jitters, so
 * the climb cannot settle on a one-tick fluke: the earlier 3.28 may be one.
 */
function robustGain(c: Case, r: () => number, o: Objective): number {
  let worst = objective(pairOf(c), o);
  for (let i = 0; i < 5 && worst > -Infinity; i++) worst = Math.min(worst, objective(pairOf(jitter(c, r)), o));
  return worst;
}

function jitter(c: Case, r: () => number): Case {
  const u = (a: number) => uni(r, -a, a), clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  const ticks = 2 * SIM_DT;
  return {
    base: { ...c.base, speed: c.base.speed + u(0.15), leanFrac: clamp(c.base.leanFrac + u(0.02), 0.02, 1), kneeLoad: clamp(c.base.kneeLoad + u(0.02), 0.71, 1), loadS: clamp(c.base.loadS + u(ticks), 0.05, 0.47), pitch: clamp(c.base.pitch + u(0.03), -1, 1), carriage: clamp(c.base.carriage + u(0.02), 0, 1) },
    wind: { ...c.wind, w0: clamp(c.wind.w0 * (1 + u(0.05)), -1, 1), w1: clamp(c.wind.w1 * (1 + u(0.05)), -1, 1), tStart: c.wind.tStart + u(ticks), tRel: c.wind.tRel + u(ticks), dRel: Math.max(0.01, c.wind.dRel + u(ticks)) },
  };
}

function refine(input: string, seconds: number, out: string): void {
  const pairs = JSON.parse(readFileSync(input, "utf8")) as Pair[];
  const r = mulberry(0xC0FFEE);
  const groups = new Map<string, Pair[]>();
  for (const p of pairs) { const k = groupKey(p.c.base); groups.set(k, [...(groups.get(k) ?? []), p]); }
  const objectives: Objective[] = ["twist", "rescue", "total"];
  const perRun = seconds / (groups.size * objectives.length);
  const results: unknown[] = [];
  for (const [k, list] of [...groups].sort()) for (const o of objectives) {
    const start = Date.now();
    const [setup, code] = k.split(" ");
    const kind = JUMP_CODE.indexOf(code as typeof JUMP_CODE[number]);
    // Seeds: the coarse pairs that qualify, else fresh random ones until one does.
    let scored = list.map(p => ({ c: p.c, score: robustGain(p.c, r, o) })).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score);
    let tries = 0;
    while (scored.length < 6 && (Date.now() - start) / 1000 < perRun * 0.4) {
      const b = { ...randomBase(r), setup: setup as SetupId, kind }, c = { base: b, wind: randomWind(r, b) };
      tries++;
      const score = robustGain(c, r, o);
      if (score > -Infinity) scored.push({ c, score });
    }
    scored = scored.sort((a, b) => b.score - a.score).slice(0, 6);
    if (!scored.length) { console.log(`${k} ${o}: nothing qualified in ${tries} tries`); continue; }
    let cur = scored[0], scale = 1, steps = 0, seedI = 0;
    const bests = [cur];
    while ((Date.now() - start) / 1000 < perRun) {
      steps++;
      const next = mutate(r, cur.c, scale), score = robustGain(next, r, o);
      if (score > cur.score) cur = { c: next, score };
      else if (steps % 40 === 0) scale = Math.max(0.15, scale * 0.8);
      if (steps % 300 === 0) { bests.push(cur); seedI = (seedI + 1) % scored.length; cur = scored[seedI]; scale = 1; }
    }
    bests.push(cur);
    const best = bests.sort((a, b) => b.score - a.score)[0];
    console.log(`${k} ${o}: ${steps} steps, worst-of-jitter score ${best.score.toFixed(2)}`);
    results.push({ group: k, objective: o, score: best.score, c: best.c });
  }
  writeFileSync(out, JSON.stringify(results));
}

/** The most L any unwound takeoff gets on this edge (setup, jump, speed, depth): arms, easing, load, heel/toe all free, feet held or not. */
function bestUnwound(b: Base): { L: number; base: Base; held: boolean; heldL: number } {
  let best = { L: -1, base: b, held: false }, heldL = -1;
  for (const carriage of [0, 0.1, 0.25, 0.5, 0.75, 1]) for (const ease of [0, 0.2, 0.4]) for (const loadS of [0.15, 0.25, 0.35, 0.45]) for (const pitch of [-0.8, -0.3, 0, 0.3, 0.8]) for (const kneeLoad of [0.75, 0.9, 1]) for (const entryKnee of [0.35, 0.55]) {
    if (carriage === 0 && ease !== 0) continue;
    const base = { ...b, carriage, ease, loadS, pitch, kneeLoad, entryKnee };
    const t = runToTakeoff({ base, wind: NO_WIND }, false);
    if (!t.ok) continue;
    const held = heldThrough(t);
    if (held) heldL = Math.max(heldL, t.L);
    if (t.L > best.L) best = { L: t.L, base, held };
  }
  return { ...best, heldL };
}

const REGIME_NAME = Object.fromEntries(Object.entries(REGIME).map(([k, v]) => [v as number, k]));
const f = (v: number, d = 2) => v.toFixed(d);

function robustness(c: Case, trials: number): { min: number; median: number; max: number; failed: number } {
  const r = mulberry(0xBEEF), gains: number[] = [];
  let failed = 0;
  for (let i = 0; i < trials; i++) { const pr = pairOf(jitter(c, r)); if (pr) gains.push(pr.gain); else failed++; }
  gains.sort((a, b) => a - b);
  return { min: gains[0] ?? NaN, median: gains[gains.length >> 1] ?? NaN, max: gains[gains.length - 1] ?? NaN, failed };
}

function report(input: string): void {
  const rows = JSON.parse(readFileSync(input, "utf8")) as { group: string; objective: string; score: number; c: Case }[];
  const out: string[] = [];
  const order = ["twist", "rescue", "total"];
  rows.sort((a, b) => order.indexOf(a.objective) - order.indexOf(b.objective) || b.score - a.score);
  const shown = new Map<string, number>();
  for (const row of rows) {
    const c = row.c, pr = pairOf(c);
    if (!pr) { console.log(`${row.group} ${row.objective}: no takeoff`); continue; }
    // The summary lists all of them; the full workup, landings and best unwound, only the top four of each objective.
    const seen = shown.get(row.objective) ?? 0; shown.set(row.objective, seen + 1);
    const rb = robustness(c, 60);
    const iceGain = pr.wound.iceAll - pr.bare.iceAll;
    out.push(`${row.objective}\t${row.group}\tL0 ${f(pr.L0)}\tLw ${f(pr.Lw)}\tgain ${f(pr.gain)}\tjit ${f(rb.min)}/${f(rb.median)}/${f(rb.max)} fail ${rb.failed}\ttwistTerm ${f(pr.wound.termTwist)}\tyawDev ${f(pr.wound.yawDev)}\ttwistRate ${f(pr.wound.twistRate)}\tdIce ${f(iceGain)}\tbareHeld ${heldThrough(pr.bare)}\tc ${f(c.base.carriage)}\tv ${f(c.base.speed)} lean ${f(c.base.leanFrac)}`);
    if (seen >= 4) continue;
    const t = (x: Takeoff) => `L ${f(x.L)} raw ${f(x.rawRate * 4)} q ${f(x.q)} | carve ${f(x.termCarve)} lower ${f(x.termLower)} twist ${f(x.termTwist)} free ${f(x.termFree)} arms ${f(x.termArms)} carry ${f(x.termCarry)}`
      + ` | yawDev ${f(x.yawDev)} twistRate ${f(x.twistRate)} twist ${f(x.twist)} | ${REGIME_NAME[x.regimeBefore]} latSlip ${f(x.latSlipBefore)} pivot@TO ${x.pivotingAtTakeoff} need ${f(x.needAtTakeoff, 0)} cap ${f(x.capAtTakeoff, 0)} pivotLast ${x.pivotLast} pivotLoad ${x.pivotLoad} skidLast ${x.skidLast} skidLoad ${x.skidLoad} | iceAll ${f(x.iceAll)} iceLoad ${f(x.iceLoad)} trunkPk ${f(x.trunkPeak, 0)} | h ${f(x.height, 3)} vOut ${f(x.speedOut)} kind ${x.kind === JUMP_NONE ? "none" : JUMP_CODE[x.kind]}`;
    const l = (x: Landing) => `turned ${f(x.turned)} revs ${x.revolutions} kind ${x.kind} call ${x.call} fall ${x.fall} standing ${x.standing} landQ ${f(x.landingQ)} check ${f(x.check, 3)}`;
    const w = bestLanding(c, true), u = bestLanding(c, false), U = bestUnwound(c.base);
    console.log(`\n=== ${row.objective} ${row.group}: gain ${f(pr.gain)} (worst-of-jitter climb score ${f(row.score)}), jitter min/med/max ${f(rb.min)}/${f(rb.median)}/${f(rb.max)}, no-takeoff ${rb.failed}/60`);
    console.log(`case ${JSON.stringify(c)}`);
    console.log(`  wound ${t(pr.wound)}`);
    console.log(`  bare  ${t(pr.bare)}`);
    console.log(`  wound tucked ${l(w.tucked)}\n        best   ${l(w.best)}`);
    console.log(`  bare  tucked ${l(u.tucked)}\n        best   ${l(u.best)}`);
    console.log(`  best unwound on this edge: L ${f(U.L)} (held ${U.held}), best held unwound L ${f(U.heldL)}; ${JSON.stringify(U.base)}`);
    // Which part of the wind pays: the same case with pieces taken out.
    const variant = (name: string, wind: Wind) => { const v = pairOf({ base: c.base, wind }); console.log(`  variant ${name}: ${v ? `L ${f(v.Lw)} gain ${f(v.gain)} held ${heldThrough(v.wound)}` : "no takeoff"}`); };
    variant("no wind against, swing only (w0 0)", { ...c.wind, w0: 0 });
    variant("no swing past neutral (w1 0)", { ...c.wind, w1: 0 });
    variant("wound and held, never let go", { ...c.wind, tRel: -0.01, dRel: 1, w1: 0 });
    variant("let go 2 ticks later", { ...c.wind, tRel: c.wind.tRel - 2 * SIM_DT });
    variant("let go 2 ticks earlier", { ...c.wind, tRel: c.wind.tRel + 2 * SIM_DT });
    variant("half the release time", { ...c.wind, dRel: c.wind.dRel / 2 });
    variant("half the wind", { ...c.wind, w0: c.wind.w0 / 2, w1: c.wind.w1 / 2 });
  }
  console.log("\nSUMMARY"); for (const line of out) console.log(line);
}

/**
 * The wound takeoffs were climbed and bestUnwound only gridded, which flatters
 * them. So: the same climb and the same worst-of-jitter score, windup zero, on
 * the same edge (speed and depth fixed), feet held, from the grid's best held.
 */
function fair(input: string, seconds: number): void {
  const rows = (JSON.parse(readFileSync(input, "utf8")) as { group: string; objective: string; score: number; c: Case }[])
    .filter(x => (x.objective === "rescue" || x.objective === "total") && x.score > 15);
  const r = mulberry(0xFA1F), perRun = seconds / rows.length;
  console.log("objective, group, wound held L (worst of jitter), unwound held L (worst of jitter, same climb), wound - unwound, steps");
  for (const row of rows) {
    const edge = row.c.base;
    const score = (b: Base): number => {
      let worst = Infinity;
      for (let i = 0; i < 6 && worst > -Infinity; i++) {
        const c = { base: b, wind: NO_WIND }, t = runToTakeoff(i === 0 ? c : { base: jitter(c, r).base, wind: NO_WIND }, false);
        worst = Math.min(worst, t.ok && heldThrough(t) ? t.L : -Infinity);
      }
      return worst;
    };
    let cur = { b: edge, s: -Infinity }, best = cur;
    for (const carriage of [0.1, 0.25, 0.5, 0.75, 1]) for (const loadS of [0.25, 0.35, 0.45]) for (const pitch of [-0.8, -0.3, 0, 0.3, 0.8]) for (const kneeLoad of [0.75, 0.9]) {
      const b = { ...edge, carriage, loadS, pitch, kneeLoad }, sc = score(b);
      if (sc > best.s) best = { b, s: sc };
    }
    cur = best;
    const start = Date.now();
    let steps = 0, scale = 1;
    while ((Date.now() - start) / 1000 < perRun) {
      steps++;
      const m = mutate(r, { base: cur.b, wind: NO_WIND }, scale).base, b = { ...m, speed: edge.speed, leanFrac: edge.leanFrac }, sc = score(b);
      if (sc > cur.s) cur = { b, s: sc };
      else if (steps % 40 === 0) scale = Math.max(0.15, scale * 0.8);
    }
    console.log([row.objective, row.group, f(row.score), f(cur.s), f(row.score - cur.s), steps, JSON.stringify(cur.b)].join(", "));
  }
}

function padCheck(json: string): void {
  const c = JSON.parse(json) as PadCase, r = mulberry(0xABBA);
  const go = padRun(c), bare = padRun({ ...c, bFrom: 0 }), none = padRun({ ...c, bFrom: 0, xFrom: 0 });
  console.log(`pad case ${json}: wound L ${go ? f(go.L) : "fell"}, same X no B ${bare ? f(bare.L) : "fell"}, neither ${none ? f(none.L) : "fell"}; twist ${go ? f(go.termTwist) : "-"} arms ${go ? f(go.termArms) : "-"} yawDev ${go ? f(go.yawDev) : "-"}`);
  const gains: number[] = []; let fell = 0;
  for (let i = 0; i < 60; i++) {
    const u = (a: number) => uni(r, -a, a), v = { ...c, speed: c.speed + u(0.15), stick: Math.min(1, c.stick + u(0.02)), loadS: c.loadS + u(2 * SIM_DT), bFrom: c.bFrom + u(2 * SIM_DT), xFrom: c.xFrom + u(2 * SIM_DT) };
    const a = padRun(v), b = padRun({ ...v, bFrom: 0 });
    if (a && b) gains.push(a.L - b.L); else fell++;
  }
  gains.sort((a, b) => a - b);
  console.log(`jitter (2 ticks, speed 0.15, stick 0.02): gain min/med/max ${f(gains[0])}/${f(gains[gains.length >> 1])}/${f(gains[gains.length - 1])}, fell ${fell}/60`);
}

/** One plain recipe: loop entry, wound fully over 0.5 s from 1 s out, let go to zero (or through to -1) ending at the blade leaving. */
function map(): void {
  console.log("setup, lean, carriage, release s, end, L unwound, L wound, gain, twist term, yawDev, pivot ticks in load (wound/unwound), skid ticks, ice wound-unwound");
  for (const setup of SETUPS) for (const leanFrac of [0.3, 0.5, 0.7, 0.9]) for (const carriage of [0, 0.25, 0.5, 1]) for (const dRel of [0.1, 0.2, 0.3, 0.5]) for (const w1 of [0, -1]) {
    const c: Case = { base: { setup, kind: 2, speed: 6, leanFrac, entryKnee: 0.55, kneeLoad: 0.9, loadS: 0.3, carriage, pitch: 0 },
      wind: { w0: 1, tStart: 1.3, tRamp: 0.5, tRel: dRel, dRel, w1 } };
    const pr = pairOf(c);
    console.log([setup, leanFrac, carriage, dRel, w1, ...(pr ? [f(pr.L0), f(pr.Lw), f(pr.gain), f(pr.wound.termTwist), f(pr.wound.yawDev), `${pr.wound.pivotLoad}/${pr.bare.pivotLoad}`, `${pr.wound.skidLoad}/${pr.bare.skidLoad}`, f(pr.wound.iceAll - pr.bare.iceAll)] : ["no takeoff"])].join(", "));
  }
}

function prior(): void {
  // The earlier fixed recipe: createState(p,-6.8), 240 ticks of edge, 36 of load at knee .95,
  // toe at load tick 34, windup held from 40 ticks before the load through the release.
  console.log("setup, lean, weight, windup, L, unwound L, gain, twistRate, yawDev");
  for (const setup of SETUPS) for (const lean of [-0.25, 0.25]) for (const weight of [0, 1]) {
    const go = (w: number, from = 200, through = true) => {
      const p = PARAMS[setup], s = createState(p, -6.8);
      const events: EdgeEvent[] = [];
      for (let i = 0; i < 280; i++) {
        events.length = 0;
        const load = i >= 240 && i < 276;
        step(s, { ...NEUTRAL_INPUT, lean, weight, knee: i < 240 ? 0.35 : load ? 0.95 : 0.2, toe: i === 274,
          windup: i >= from && (through || i < 276) ? w : 0 }, p, SIM_DT, events);
        if (s.fallen) return null;
        if (events.some(e => e.type === EVENT.Takeoff)) return { L: s.jump.angMomentum, tr: s.twistRate ?? 0, dev: s.yawDev ?? 0 };
      }
      return null;
    };
    const base = go(0);
    for (const w of [-0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
      const a = go(w);
      console.log([setup, lean, weight, w, a ? f(a.L) : "fell", base ? f(base.L) : "fell", a && base ? f(a.L - base.L) : "-", a ? f(a.tr) : "-", a ? f(a.dev) : "-"].join(", "));
    }
    // The hold's onset, around the one 3.28 in the earlier sweep.
    if (setup === "experimental") for (const from of [190, 196, 198, 199, 200, 201, 202, 204, 210]) { const a = go(0.5, from); console.log(`  hold 0.5 from tick ${from}: L ${a ? f(a.L) : "fell"}`); }
  }
}

/** bodyRate reads the release tick's carriage for the upper inertia: what a step on that one tick reads as. Not a technique. */
function carriageStepProbe(c: Case): void {
  const b = c.base, p = PARAMS[b.setup], def = JUMP_DEFS[b.kind];
  const s = createState(p, (def.dir === DIR.Backward ? -1 : 1) * b.speed, 0), T = Math.round(PREROLL / SIM_DT), lt = Math.round(b.loadS / SIM_DT);
  const events: EdgeEvent[] = [];
  for (let i = 0; i <= T; i++) {
    const tau = (T - i) * SIM_DT, input = groundInput(b, windAt(c.wind, tau), tau, lt);
    if (i === T) input.carriage = 1;
    events.length = 0; step(s, input, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) { console.log(`carriage stepped to 1 on the release tick: L ${f(s.jump.angMomentum)} (constant carriage: see pair)`); return; }
  }
  console.log("carriage step: no takeoff");
}

function traceCase(json: string): void {
  const c = JSON.parse(json) as Case;
  console.log("i,tau,windup,kneeIn,knee,twist,twistRate,yawDev,yawRate,armsL,trunk,need,cap,ice,pivoting,regime,latSlip,bodyL");
  const w = runToTakeoff(c, true, true), u = runToTakeoff(c, false, true);
  const n = Math.round(Math.max(c.base.loadS, c.wind.dRel, 0.3) / SIM_DT) + 12;
  console.log("-- wound"); for (const row of (w.trace ?? []).slice(-n)) console.log(row);
  console.log("-- unwound"); for (const row of (u.trace ?? []).slice(-n)) console.log(row);
  console.log(`wound L ${f(w.L)} unwound L ${f(u.L)} gain ${f(w.L - u.L)}; ice over load ${f(w.iceLoad)} vs ${f(u.iceLoad)}, last 0.2 s ${f(w.iceLast)} vs ${f(u.iceLast)}`);
  carriageStepProbe(c);
}

if (process.argv[1]?.endsWith("grip-search.ts")) {
  const [mode, a, b, d] = process.argv.slice(2);
  if (mode === "prior") prior();
  else if (mode === "coarse") coarse(Number(a), b);
  else if (mode === "refine") refine(a, Number(b), d);
  else if (mode === "report") report(a);
  else if (mode === "trace") traceCase(a);
  else if (mode === "pad") padSweep();
  else if (mode === "map") map();
  else if (mode === "fair") fair(a, Number(b));
  else if (mode === "padcheck") padCheck(a);
  else if (mode === "known") {
    // Harness check: one hand-set smooth release, each setup, right back outside (loop).
    for (const setup of SETUPS) for (const leanFrac of [0.3, 0.5, 0.7, 0.9]) for (const carriage of [0, 1]) {
      const c: Case = { base: { setup, kind: 2, speed: 6, leanFrac, entryKnee: 0.5, kneeLoad: 0.9, loadS: 0.3, carriage, pitch: 0 },
        wind: { w0: 1, tStart: 1, tRamp: 0.5, tRel: 0.2, dRel: 0.2, w1: 0 } };
      const pr = pairOf(c);
      console.log(setup, leanFrac, carriage, pr ? `L ${f(pr.L0)} -> ${f(pr.Lw)} twist ${f(pr.wound.termTwist)} dev ${f(pr.wound.yawDev)} arms ${f(pr.bare.termArms)}->${f(pr.wound.termArms)} pivotLast ${pr.wound.pivotLast} kind ${pr.wound.kind} cap ${f(pr.wound.capAtTakeoff, 0)} need ${f(pr.wound.needAtTakeoff, 0)}` : "no takeoff");
    }
  } else { console.error("modes: prior, coarse, refine, report, trace, pad, padcheck, fair, map, known"); process.exit(1); }
}
