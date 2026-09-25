// The loop's takeoff, torque by torque: where the rotation a jump asks for
// goes between the shoulders and the ice.
//
//   node test/takeoff-budget.ts trace [pad|direct] [cap]   one attempt, a CSV row per tick
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
import type { EdgeEvent, SkaterState, SkatingInput, TorqueBudget } from "../sim/types.ts";
import { bodyRate, JUMP_PHASE } from "../sim/jump.ts";
import { dot, perpLeft } from "../sim/math.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import { overridden } from "./loop-comparison.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

export type Attempt = "pad" | "direct";

export interface Frame {
  tick: number; t: number; phase: number;
  budget: TorqueBudget | null;
  load: number; latForce: number; bite: number; tilt: number; regime: number; contactS: number; demand: number;
  knee: number; kneeRate: number; lean: number; pitchContact: number;
  yawSlip: number; latSlip: number; yawRate: number;
  /** kg m^2/s: on the ice, what a takeoff now would read (before quality); in the air, the jump's. */
  L: number; omega: number; inertia: number; carriage: number;
}

export interface Outcome {
  frames: Frame[]; takeoff: number; contactLost: number; landed: boolean; fallen: boolean;
  L: number; turned: number; revolutions: number; call: number; kind: number;
}

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
export function attempt(kind: Attempt, p: Params, check = Infinity): Outcome {
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
      const u = Math.min(1, Math.max(0, (t - LOAD_AT) / LOAD_S)), windup = -0.7 * u;
      input = air
        ? { ...NEUTRAL_INPUT, knee: 0.35, weight: 1, carriage: sinceTakeoff >= check ? 1 : 0 }
        : { ...NEUTRAL_INPUT, lean: -0.8, weight: 1, knee: t >= LOAD_AT && t < LOAD_AT + LOAD_S ? 1 : 0.35,
            windup: t >= LOAD_AT ? windup : 0, carriage: t >= LOAD_AT ? Math.abs(windup) / 0.7 : 0 };
    }
    const events: EdgeEvent[] = [];
    const kneeBefore = s.knee;
    s.torqueBudget = blankBudget();
    step(s, input, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Takeoff)) { takeoff = t; L = s.jump.angMomentum; }
    if (events.some(e => e.type === EVENT.EdgeLost) && takeoff >= 0 && contactLost < 0) contactLost = t;
    if (events.some(e => e.type === EVENT.Landing)) landed = true;
    if (t < LOAD_AT - 0.2) continue;
    const b = s.blade[s.supportFoot], inAir = s.jump.phase === JUMP_PHASE.Air;
    const budget = s.torqueBudget.Il > 0 ? { ...s.torqueBudget } : null;
    const carriage = input.carriage ?? 0;
    frames.push({
      tick: s.tick, t, phase: s.jump.phase, budget,
      load: b.normalLoad, latForce: b.latForce, bite: b.biteCapacity, tilt: b.tilt, regime: b.regime,
      contactS: b.contactS, demand: b.demandRatio,
      knee: s.knee, kneeRate: (s.knee - kneeBefore) / SIM_DT, lean: s.lean, pitchContact: s.pitchContact ?? 0,
      yawSlip: s.yawDev ?? 0, latSlip: b.inContact ? dot(s.vel, perpLeft(b.tangent)) : 0, yawRate: s.yawRate,
      L: inAir ? s.jump.angMomentum : p.inertiaOpen * bodyRate(s, p, carriage),
      omega: inAir ? s.jump.angMomentum / s.jump.inertia : bodyRate(s, p, carriage),
      inertia: inAir ? s.jump.inertia : p.inertiaOpen, carriage,
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
  const [mode, kind, cap] = args.filter((a, i) => a !== "--set" && args[i - 1] !== "--set");
  if (mode === "trace") printTrace((kind as Attempt) ?? "pad", cap === undefined ? undefined : Number(cap), base);
  else printSweep(base);
}
