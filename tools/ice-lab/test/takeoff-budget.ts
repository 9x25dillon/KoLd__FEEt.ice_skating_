// The loop's takeoff, torque by torque: where the rotation a jump asks for
// goes between the shoulders and the ice.
//
//   node test/takeoff-budget.ts trace [pad|direct|held] [cap]   one attempt, a CSV row per tick
//   node test/takeoff-budget.ts balance [pad|direct|held]       the balance controller's terms, a row per tick
//   node test/takeoff-budget.ts transition [held|direct|pad] [--hook h] [--free-leg-at s]
//                                                           L by segment through glide, load, push
//   node test/takeoff-budget.ts hook [held|direct]          the hook's table, arc tightening 0-0.3
//   node test/takeoff-budget.ts free-leg [held|direct]      the free leg's table, swung at +0-0.5 s into the load
//   node test/takeoff-budget.ts sweep                       the shoulders' cap, 20-60 N m, one row each
//   ... --set pushOffMode=1                                 either, on a candidate's Params
//
// Two attempts at a backward double loop on the Experimental setup, the arms'
// whip through the edge (armsWhipMode) on:
//
//   pad     the Experimental pad through its own mapping: right back outside
//           edge on the right stick, B to wind the arms, RT to load, X to
//           swing the jump's way through the load, B again to check. The best
//           of the 2026-09-25 pad search (6 m/s, 0.5 s load, X 0.2 s in).
//   direct  SkatingInput straight into the solver: the same edge and load,
//           the arms eased from at rest to swung the jump's way across it.
//   held    the direct attempt with the arms still: a deep edge held and the
//           skating leg loaded, nothing else — where the edge goes by itself.
//
// The trace is the frame-by-frame budget (SkaterState.torqueBudget, filled
// by the trunk solve): the shoulders' torque asked and given, the trunk's and
// the free leg's, what the lower body needed from the ice to hold the carve,
// the most the edges can hold (pivotCapacity) and what the ice gave; the
// support blade's load, lateral force, bite, tilt, regime and contact; the
// knee and its rate; the lean and the fore-aft contact offset; the feet's
// yaw slip off the carve and their sideways slip; the body's spin and the
// angular momentum a takeoff now would read (sim/jump.ts bodyRate), and in
// the air L, omega, the inertia and the tuck.
//
// The sweep is the torque-budget table: per cap, the peak grip, the peak and
// integrated slip, the takeoff's omega and L, the air's peak omega, the
// revolutions a full tuck reaches, and the best landing any check timing
// gets. The useful cap is the highest at which a step up still adds more
// takeoff L than it adds integrated slip (both as a share of the previous
// step's); past it the extra torque grinds the blade sideways.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, NEUTRAL_INPUT } from "../sim/types.ts";
import type { BalanceBudget, EdgeEvent, SkaterState, SkatingInput, TorqueBudget } from "../sim/types.ts";
import { bodyRate, JUMP_PHASE, upperInertia } from "../sim/jump.ts";
import { dot, perpLeft } from "../sim/math.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import { overridden } from "./loop-comparison.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

export type Attempt = "pad" | "direct" | "held";

export interface Frame {
  tick: number; t: number; phase: number;
  budget: TorqueBudget | null;
  balance: BalanceBudget | null;
  /** m: the body's centre of mass from the support blade, across it (legLength sin lean) and along it (the pendulum's contact offset). */
  comAcross: number; comAlong: number;
  /** The free leg's swing, rad, and rate, rad/s (freeLegMode), and the body's twist rate. */
  freeSwing: number; freeSwingRate: number; twistRate: number;
  load: number; latForce: number; bite: number; tilt: number; regime: number; contactS: number; demand: number;
  knee: number; kneeRate: number; lean: number; pitchContact: number;
  yawSlip: number; latSlip: number; yawRate: number;
  /** kg m^2/s: on the ice, what a takeoff now would read (before quality); in the air, the jump's. */
  L: number; omega: number; inertia: number; carriage: number;
  /** On the ice, L split by segment (sums to L): see `segments`. */
  seg: Segments | null;
  /** The push-off (pushOffMode) under way. */
  pushing: boolean; heading: number;
}

export interface Outcome {
  frames: Frame[]; takeoff: number; contactLost: number; landed: boolean; fallen: boolean;
  L: number; turned: number; revolutions: number; call: number; kind: number;
}

/**
 * kg m^2/s about the vertical, counter-clockwise positive: sim/jump.ts
 * bodyRate x inertiaOpen, term by term. carve: the whole body carried round
 * on the blade's own arc (yawRate less the feet's pivot off it); lower: both
 * bodies' pivot off the carve (yawDev); twist: the upper body's twist on the
 * hips; freeLeg: the free leg's swing; arms: the arms' whip (armsL); carry:
 * a turn's or a dig's winding (spinCarry).
 */
export interface Segments { carve: number; lower: number; twist: number; freeLeg: number; arms: number; carry: number }

export function segments(s: SkaterState, p: Params, carriage: number): Segments {
  const seg: Segments = { carve: p.inertiaOpen * p.jumpRotBias * s.yawRate, lower: 0, twist: 0, freeLeg: 0, arms: 0, carry: p.inertiaOpen * s.spinCarry };
  if (s.twistRate !== undefined) {
    const dev = s.yawDev ?? 0, Iu = upperInertia(p, carriage);
    seg.carve = p.inertiaOpen * p.jumpRotBias * (s.yawRate - dev);
    seg.lower = (p.lowerBodyInertia + Iu) * dev;
    seg.twist = Iu * s.twistRate;
    if (s.freeSwingRate !== undefined) seg.freeLeg = p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach * (dev + s.freeSwingRate);
    if (s.armsL !== undefined) seg.arms = s.armsL;
  }
  return seg;
}

const blankBalance = (): BalanceBudget => ({
  leanCmd: 0, lean: 0, leanRate: 0, gTan: 0, kp: 0, kd: 0, noise: 0, aCmd: 0, v2: 0, kappa: 0, kappaMax: 0, rho: 0,
  fromKappa: 0, afterScrape: 0, afterAngulation: 0, target: 0, tiltCmd: 0, clamps: 0,
});

const blankBudget = (): TorqueBudget =>
  ({ armsAsked: 0, arms: 0, trunk: 0, leg: 0, need: 0, cap: 0, ice: 0, pivoting: false, Il: 0, Iu: 0 });

/** The Experimental setup with the shoulders capped at `cap` N m (default: the setup's own). */
export function budgetParams(cap?: number, base: Params = setupParams("experimental")): Params {
  const p = { ...base };
  if (cap !== undefined) p.armsWhipTorque = cap;
  return p;
}

const LOAD_AT = 1, LOAD_S = 0.5, SWING_AT = 0.2, SPEED = 6;

/**
 * One attempt. `check` is when, after takeoff, the arms open to stop the
 * rotation (Infinity: tucked to the ice). Frames are kept from 0.2 s before
 * the load to the landing.
 */
/**
 * Variations on the direct and held attempts. hook: the lean asked deepens by
 * this much (toward -1) over the last HOOK_S of the load and through the
 * push — the arc tightening into the takeoff. freeLegAt: s after the load
 * begins that the free leg swings to freeLegTo (1 forward, the default; 0
 * back); otherwise it rests (0.5).
 */
export interface Variation { hook?: number; freeLegAt?: number; freeLegTo?: number }
const HOOK_S = 0.15;

export function attempt(kind: Attempt, p: Params, check = Infinity, v: Variation = {}): Outcome {
  const s: SkaterState = createState(p, -SPEED);
  s.torqueBudget = blankBudget();
  const profile = defaultControllerProfile(), st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [], connected: true };
  const frames: Frame[] = [];
  let takeoff = -1, contactLost = -1, landed = false, L = 0;
  for (let i = 0; i < 600 && !s.fallen && !landed; i++) {
    const t = i * SIM_DT, air = takeoff >= 0, sinceTakeoff = air ? t - takeoff : 0;
    let input: SkatingInput;
    if (kind === "pad") {
      h.buttons.fill(0); h.axes = air ? [0, 0, 0, 0] : [0, 0, -1, 0];
      if (!air && (t < 0.02 || (t >= LOAD_AT && t < LOAD_AT + SWING_AT))) h.buttons[1] = 1;   // B: the weight right, the arms wound
      if (!air && t >= LOAD_AT && t < LOAD_AT + LOAD_S) h.buttons[7] = 1;                     // RT: load the right knee
      if (!air && t >= LOAD_AT + SWING_AT) h.buttons[2] = 1;                                     // X: swing the jump's way, until the blade leaves
      if (air) { h.buttons[7] = 0.7; h.buttons[1] = sinceTakeoff >= check ? 1 : 0; }
      input = setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input;
    } else {
      // At rest to swung the jump's way (windup -0.7) across the load, eased.
      const u = Math.min(1, Math.max(0, (t - LOAD_AT) / LOAD_S)), windup = kind === "held" ? 0 : -0.7 * u;
      const hooking = t >= LOAD_AT + LOAD_S - HOOK_S ? Math.min(1, (t - (LOAD_AT + LOAD_S - HOOK_S)) / HOOK_S) : 0;
      const lean = Math.max(-1, -0.8 - (v.hook ?? 0) * hooking);
      const freeLeg = v.freeLegAt !== undefined && t >= LOAD_AT + v.freeLegAt ? v.freeLegTo ?? 1 : 0.5;
      input = air
        ? { ...NEUTRAL_INPUT, knee: 0.35, weight: 1, carriage: sinceTakeoff >= check ? 1 : 0 }
        : { ...NEUTRAL_INPUT, lean, weight: 1, knee: t >= LOAD_AT && t < LOAD_AT + LOAD_S ? 1 : 0.35, freeLeg,
            windup: t >= LOAD_AT ? windup : 0, carriage: t >= LOAD_AT ? Math.abs(windup) / 0.7 : 0 };
    }
    const events: EdgeEvent[] = [];
    const kneeBefore = s.knee;
    s.torqueBudget = blankBudget();
    s.balanceBudget = blankBalance();
    step(s, input, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) { takeoff = t; L = s.jump.angMomentum; }
    if (events.some(e => e.type === EVENT.EdgeLost) && takeoff >= 0 && contactLost < 0) contactLost = t;
    if (events.some(e => e.type === EVENT.Landing)) landed = true;
    if (t < LOAD_AT - 0.2) continue;
    const b = s.blade[s.supportFoot], inAir = s.jump.phase === JUMP_PHASE.Air;
    const budget = s.torqueBudget.Il > 0 ? { ...s.torqueBudget } : null;
    const balance = s.balanceBudget.v2 > 0 ? { ...s.balanceBudget } : null;
    const carriage = input.carriage ?? 0;
    frames.push({
      tick: s.tick, t, phase: s.jump.phase, budget, balance,
      comAcross: s.legLength * Math.sin(s.lean), comAlong: s.pitchContact ?? 0,
      freeSwing: s.freeSwing ?? 0, freeSwingRate: s.freeSwingRate ?? 0, twistRate: s.twistRate ?? 0,
      load: b.normalLoad, latForce: b.latForce, bite: b.biteCapacity, tilt: b.tilt, regime: b.regime,
      contactS: b.contactS, demand: b.demandRatio,
      knee: s.knee, kneeRate: (s.knee - kneeBefore) / SIM_DT, lean: s.lean, pitchContact: s.pitchContact ?? 0,
      yawSlip: s.yawDev ?? 0, latSlip: b.inContact ? dot(s.vel, perpLeft(b.tangent)) : 0, yawRate: s.yawRate,
      L: inAir ? s.jump.angMomentum : p.inertiaOpen * bodyRate(s, p, carriage),
      omega: inAir ? s.jump.angMomentum / s.jump.inertia : bodyRate(s, p, carriage),
      inertia: inAir ? s.jump.inertia : p.inertiaOpen, carriage,
      seg: inAir ? null : segments(s, p, carriage), pushing: s.jump.pushFrom !== undefined,
      heading: Math.atan2(s.heading.y, s.heading.x),
    });
  }
  return {
    frames, takeoff, contactLost, landed, fallen: s.fallen, L,
    turned: s.landed.turned, revolutions: s.landed.revolutions, call: s.landed.rotationCall, kind: s.landed.kind,
  };
}

/** The sweep's row for one cap. */
export function sweepRow(kind: Attempt, cap: number, base?: Params) {
  const p = budgetParams(cap, base);
  const tucked = attempt(kind, p);
  const ice = tucked.frames.filter(f => f.phase !== JUMP_PHASE.Air && f.budget);
  const peakGrip = Math.max(0, ...ice.map(f => f.budget!.cap));
  const peakSlip = Math.max(0, ...ice.map(f => Math.abs(f.yawSlip)));
  const slipAngle = ice.reduce((a, f) => a + Math.abs(f.yawSlip) * SIM_DT, 0);
  const airFrames = tucked.frames.filter(f => f.phase === JUMP_PHASE.Air);
  const peakAirOmega = Math.max(0, ...airFrames.map(f => f.omega));
  // The best landing any check timing gets: clean nearest two, else the most turned.
  let best: Outcome | null = null;
  for (let check = 0.1; check <= 0.9; check += 0.025) {
    const r = attempt(kind, p, check);
    const score = (o: Outcome) => (!o.fallen && o.call === 0 ? 10 : 0) + o.revolutions - Math.abs(2 - o.turned);
    if (!best || score(r) > score(best)) best = r;
  }
  return {
    cap, peakGrip, peakSlip, slipAngle, takeoffOmega: tucked.L / p.inertiaOpen, takeoffL: tucked.L, peakAirOmega,
    tuckedTurns: tucked.turned, best: best!,
  };
}

const fx = (v: number, d = 2) => v.toFixed(d);

function printTrace(kind: Attempt, cap: number | undefined, base: Params): void {
  const r = attempt(kind, budgetParams(cap, base));
  const cols = ["t", "phase", "armsAsked", "arms", "trunk", "leg", "need", "cap", "ice", "pivoting",
    "load", "latForce", "bite", "tilt", "regime", "contactS", "demand", "knee", "kneeRate", "lean", "pitchContact",
    "yawSlip", "latSlip", "yawRate", "L", "omega", "inertia", "carriage"];
  console.log(cols.join(","));
  for (const f of r.frames) {
    const b = f.budget;
    console.log([fx(f.t, 3), f.phase, ...(b ? [b.armsAsked, b.arms, b.trunk, b.leg, b.need, b.cap, b.ice].map(v => fx(v, 1)) : ["", "", "", "", "", "", ""]),
      b ? Number(b.pivoting) : "", fx(f.load, 0), fx(f.latForce, 0), fx(f.bite, 0), fx(f.tilt), f.regime, fx(f.contactS), fx(f.demand),
      fx(f.knee), fx(f.kneeRate), fx(f.lean), fx(f.pitchContact, 3), fx(f.yawSlip), fx(f.latSlip), fx(f.yawRate),
      fx(f.L, 1), fx(f.omega), fx(f.inertia), fx(f.carriage)].join(","));
  }
  console.log(`# takeoff ${fx(r.takeoff, 3)} s, L ${fx(r.L, 1)}; landed ${r.landed}, fallen ${r.fallen}, turned ${fx(r.turned)} (${r.revolutions} rev, call ${r.call}, kind ${r.kind})`);
}

function printBalance(kind: Attempt, base: Params): void {
  const r = attempt(kind, base);
  const cols = ["t", "phase", "leanCmd", "lean", "leanRate", "gTan", "kp", "kd", "aCmd", "v2", "kappa", "kappaMax", "rho",
    "fromKappa", "afterScrape", "afterAngulation", "target", "tiltCmd", "tilt", "clamps", "regime", "knee", "kneeRate", "load",
    "contactS", "latForce", "comAcross", "comAlong", "yawSlip", "ice", "freeSwing", "freeSwingRate", "twistRate", "L"];
  console.log(cols.join(","));
  for (const f of r.frames) {
    const b = f.balance;
    console.log([fx(f.t, 3), f.phase,
      ...(b ? [b.leanCmd, b.lean, b.leanRate, b.gTan, b.kp, b.kd, b.aCmd, b.v2, b.kappa, b.kappaMax, b.rho,
        b.fromKappa, b.afterScrape, b.afterAngulation, b.target, b.tiltCmd].map(v => fx(v, 3)) : Array(16).fill("")),
      fx(f.tilt, 3), b ? b.clamps : "", f.regime, fx(f.knee), fx(f.kneeRate), fx(f.load, 0), fx(f.contactS, 3), fx(f.latForce, 0),
      fx(f.comAcross, 3), fx(f.comAlong, 3), fx(f.yawSlip), f.budget ? fx(f.budget.ice, 1) : "",
      fx(f.freeSwing, 3), fx(f.freeSwingRate), fx(f.twistRate), fx(f.L, 1)].join(","));
  }
  console.log(`# takeoff ${fx(r.takeoff, 3)} s, L ${fx(r.L, 1)}; landed ${r.landed}, fallen ${r.fallen}, turned ${fx(r.turned)}`);
}

const SEGS: (keyof Segments)[] = ["carve", "lower", "twist", "freeLeg", "arms", "carry"];

/** L by segment at the end of each phase, and each phase's change: glide, load, push, then the takeoff's. */
export function transition(kind: Attempt, base: Params, v: Variation = {}) {
  const r = attempt(kind, base, Infinity, v);
  const ice = r.frames.filter(f => f.seg);
  const phaseOf = (f: Frame) => f.phase === JUMP_PHASE.None ? "glide" : f.pushing ? "push" : "load";
  const ends: { phase: string; t: number; seg: Segments; L: number; tilt: number; yawRate: number; heading: number; load: number }[] = [];
  for (let i = 0; i < ice.length; i++) {
    const f = ice[i], next = ice[i + 1];
    if (!next || phaseOf(next) !== phaseOf(f)) ends.push({ phase: phaseOf(f), t: f.t, seg: f.seg!, L: f.L, tilt: f.tilt, yawRate: f.yawRate, heading: f.heading, load: f.load });
  }
  return { r, ends };
}

function printTransition(kind: Attempt, base: Params, v: Variation): void {
  const { r, ends } = transition(kind, base, v);
  console.log(`${kind}${v.hook ? ` hook ${v.hook}` : ""}${v.freeLegAt !== undefined ? ` free leg at +${v.freeLegAt} s` : ""}: phase end | t | ${SEGS.join(" | ")} | L | tilt | yaw rate | load N`);
  let prev: Segments | null = null, prevL = 0;
  for (const e of ends) {
    const d = (k: keyof Segments) => prev ? `${fx(e.seg[k], 1)} (${e.seg[k] - prev[k] >= 0 ? "+" : ""}${fx(e.seg[k] - prev[k], 1)})` : fx(e.seg[k], 1);
    console.log(`${e.phase} | ${fx(e.t, 3)} | ${SEGS.map(d).join(" | ")} | ${fx(e.L, 1)}${prev ? ` (${e.L - prevL >= 0 ? "+" : ""}${fx(e.L - prevL, 1)})` : ""} | ${fx(e.tilt)} | ${fx(e.yawRate)} | ${fx(e.load, 0)}`);
    prev = e.seg; prevL = e.L;
  }
  console.log(`takeoff L ${fx(r.L, 1)} (after the takeoff's quality); ${r.fallen && r.takeoff < 0 ? "fell on the ice" : r.takeoff < 0 ? "no takeoff" : `tucked to the ice: ${fx(r.turned)} rev`}`);
}

/** The frames on the ice up to the takeoff: the approach, the load and the push. */
const onIce = (r: Outcome): Frame[] => r.frames.filter(f => f.seg && (r.takeoff < 0 || f.t < r.takeoff));

/** The hook's table: identical held jumps, the arc tightened by `hook` over its last HOOK_S. */
export function hookRow(base: Params, hook: number, kind: Attempt = "held") {
  const r = attempt(kind, base, Infinity, { hook });
  const ice = onIce(r);
  const start = LOAD_AT + LOAD_S - HOOK_S;
  const inHook = ice.filter(f => f.t >= start);
  const entering = ice.filter(f => f.t < start).at(-1), leaving = ice.at(-1);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    hook, Lin: entering?.L ?? 0, Lout: leaving?.L ?? 0,
    heading: entering && leaving ? wrap(leaving.heading - entering.heading) : 0,
    vertical: base.pushOffMode >= 1 ? base.mass * base.jumpImpulse : 0,
    tilt: leaving?.tilt ?? 0, maxSlip: Math.max(0, ...inHook.map(f => Math.abs(f.yawSlip))), skidTicks: inHook.filter(f => f.regime === 4).length,
    omega: r.L / base.inertiaOpen, L: r.L, fell: r.fallen && r.takeoff < 0, turned: r.turned,
  };
}

/** The free leg's table: the same held jump, the free leg swung forward at +s into the load (never: at rest). */
export function freeLegRow(base: Params, at: number | undefined, kind: Attempt = "held", to = 1) {
  const r = attempt(kind, base, Infinity, { freeLegAt: at, freeLegTo: to });
  const ice = onIce(r), last = ice.at(-1);
  return {
    at, to, freeLegL: last?.seg?.freeLeg ?? 0, peakFreeLegL: Math.max(...ice.map(f => Math.abs(f.seg!.freeLeg))), lowerL: last?.seg?.lower ?? 0,
    carveL: last?.seg?.carve ?? 0, Lout: last?.L ?? 0, L: r.L, maxSlip: Math.max(0, ...ice.map(f => Math.abs(f.yawSlip))),
    fell: r.fallen && r.takeoff < 0, turned: r.turned,
  };
}

function printHook(base: Params, kind: Attempt): void {
  console.log(`hook (${kind}) | L entering | L leaving | ΔL in the hook | vertical impulse N s | heading change rad | edge at takeoff | max slip rad/s | skid ticks | takeoff ω | takeoff L | result`);
  for (const h of [0, 0.05, 0.1, 0.15, 0.2, 0.3]) {
    const r = hookRow(base, h, kind);
    console.log(`${h} | ${fx(r.Lin, 1)} | ${fx(r.Lout, 1)} | ${r.Lout - r.Lin >= 0 ? "+" : ""}${fx(r.Lout - r.Lin, 1)} | ${fx(r.vertical, 0)} | ${fx(r.heading, 3)} | ${fx(r.tilt)} | ${fx(r.maxSlip)} | ${r.skidTicks} | ${fx(r.omega)} | ${fx(r.L, 1)} | ${r.fell ? "fell on the ice" : `${fx(r.turned)} rev tucked`}`);
  }
}

function printFreeLeg(base: Params, kind: Attempt): void {
  for (const to of [1, 0]) {
  console.log(`free leg (${kind}) swung ${to ? "forward" : "back"} at +s | its L at release | its peak L | lower body L | carve L | L leaving | takeoff L | max slip | result`);
  for (const at of [undefined, 0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
    const r = freeLegRow(base, at, kind, to);
    console.log(`${at === undefined ? "never" : at} | ${fx(r.freeLegL, 2)} | ${fx(r.peakFreeLegL, 2)} | ${fx(r.lowerL, 2)} | ${fx(r.carveL, 1)} | ${fx(r.Lout, 1)} | ${fx(r.L, 1)} | ${fx(r.maxSlip)} | ${r.fell ? "fell on the ice" : `${fx(r.turned)} rev tucked`}`);
  }
  }
}

function printSweep(base: Params): void {
  for (const kind of ["direct", "pad"] as Attempt[]) {
    console.log(`\n${kind}: cap N m | peak grip N m | peak slip rad/s | slip rad | takeoff ω rad/s | takeoff L | air ω peak | tucked rev | best landing`);
    const rows = [20, 25, 30, 35, 40, 45, 50, 55, 60].map(cap => sweepRow(kind, cap, base));
    for (const r of rows) {
      const b = r.best;
      console.log(`${r.cap} | ${fx(r.peakGrip, 1)} | ${fx(r.peakSlip)} | ${fx(r.slipAngle, 3)} | ${fx(r.takeoffOmega)} | ${fx(r.takeoffL, 1)} | ${fx(r.peakAirOmega, 1)} | ${fx(r.tuckedTurns)} | ${fx(b.turned)} ${b.fallen ? "fell" : b.call === 0 ? "clean" : `call ${b.call}`}`);
    }
    let useful = rows[0].cap;
    for (let i = 1; i < rows.length; i++) {
      const dL = (rows[i].takeoffL - rows[i - 1].takeoffL) / Math.max(rows[i - 1].takeoffL, 1e-6);
      const dSlip = (rows[i].slipAngle - rows[i - 1].slipAngle) / Math.max(rows[i - 1].slipAngle, 1e-6);
      if (dL > 0 && dL > dSlip) useful = rows[i].cap;
    }
    console.log(`${kind}: the useful cap — the highest step that still adds more takeoff L than slip — ${useful} N m`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2), base = overridden(args);
  const [mode, kind, cap] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const num = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined; };
  if (mode === "hook") printHook(base, (kind as Attempt) ?? "held");
  else if (mode === "free-leg") printFreeLeg(base, (kind as Attempt) ?? "held");
  else if (mode === "transition") printTransition((kind as Attempt) ?? "held", base, { hook: num("--hook"), freeLegAt: num("--free-leg-at") });
  else if (mode === "balance") printBalance((kind as Attempt) ?? "held", base);
  else if (mode === "trace") printTrace((kind as Attempt) ?? "pad", cap === undefined ? undefined : Number(cap), base);
  else printSweep(base);
}
