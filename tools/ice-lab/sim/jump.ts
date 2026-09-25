// tools/ice-lab/sim/jump.ts — load, air, land. src/reference/JumpResolver.cpp
// in the rig.
//
// THERE IS NO JUMP BUTTON (bible §2.1, design keystone). A jump is: arrive on
// an edge, compress the knee, release it. The release is the takeoff, and
// everything after that instant is already decided — vertical velocity, air
// time and angular momentum are set once, here, and never touched again. The
// air has exactly one lever, the moment of inertia, because that is the only
// lever a real skater has. The reference README calls that property
// load-bearing; test/jump.test.ts holds it.
//
// WHICH JUMP IT WAS is read off the takeoff the way a technical panel reads it:
// foot, direction, the edge the setup was held on, and whether the free toe
// picked. Nothing is declared in advance, so a lutz that rolls onto its inside
// edge at the last moment is still a lutz — with an `e` — because the setup
// said lutz. The edge-call and rotation-call thresholds are Params, checked
// against data/calls-and-deductions.csv, since they are the balance levers
// that file says they are.
//
// SCOPE. pre-production-plan.md §1 refuses jumps in the prototype and admits
// only a rotation-free load-release hop from week 9, so that "an exciting jump
// cannot rescue a boring foundation". The operator overrode that for this rig
// on 2026-09-10. The override is contained rather than hidden: `jumpMode` is 0
// in every preset, `?playtest=1` forces it off, and mode 1 is exactly the
// plan's hop — no rotation, no element, no call.
//
// Rotation is counter-clockwise, the direction data/jump-definitions.csv is
// written for (about 85% of skaters). A clockwise skater mirrors the table and
// the sign; that mirror is not modelled.

import { EDGE, DIR, FOOT, EDGE_CODE_NONE, REGIME, EVENT, FALL, MOVE, makeCode, codeDir } from "./types.ts";
import type { SkaterState, SkatingInput, EdgeEvent, JumpState, JumpResult, Foot, Edge, Dir } from "./types.ts";
import type { Params } from "./params.ts";
import { clamp, saturate, lerp, moveToward, rotate, normalizeOr, wrapPi, dot, mul, len, add, perpLeft, sin, atan2 } from "./math.ts";

export const JUMP_MODE = { Off: 0, Hop: 1, Full: 2 } as const;

/**
 * kg m². The upper body's share of the whole (torqueMode, sim/solver.ts's
 * trunkTorque): the body's inertia at this carriage less the lower body's.
 */
export function upperInertia(p: Params, carriage: number): number {
  return Math.max(0.1, lerp(p.inertiaTucked, p.inertiaOpen, clamp(carriage, 0, 1)) - p.lowerBodyInertia);
}
export const JUMP_PHASE = { None: 0, Load: 1, Air: 2 } as const;

/** The six jumps, in data/jump-definitions.csv's row order. */
export const JUMP = { Toeloop: 0, Salchow: 1, Loop: 2, Flip: 3, Lutz: 4, Axel: 5 } as const;
export const JUMP_NONE = 255;
export const JUMP_CODE = ["T", "S", "Lo", "F", "Lz", "A"] as const;

export const ROTATION_CALL = { Clean: 0, Quarter: 1, UnderRotated: 2, Downgraded: 3 } as const;
export const ROTATION_MARK = ["", "q", "<", "<<"] as const;
export const EDGE_CALL = { Clean: 0, Unclear: 1, Wrong: 2 } as const;
export const EDGE_MARK = ["", "!", "e"] as const;

export interface JumpDef { foot: Foot; side: Edge; dir: Dir; toe: boolean; edgeCallable: boolean }

/**
 * Transcribed from data/jump-definitions.csv, because sim/ cannot read a file
 * and still run in a browser and in C++. test/jump.test.ts compares every row
 * against the CSV, so the day they disagree the data wins loudly.
 */
export const JUMP_DEFS: readonly JumpDef[] = [
  { foot: FOOT.Right, side: EDGE.Outside, dir: DIR.Backward, toe: true, edgeCallable: false },  // T
  { foot: FOOT.Left, side: EDGE.Inside, dir: DIR.Backward, toe: false, edgeCallable: false },   // S
  { foot: FOOT.Right, side: EDGE.Outside, dir: DIR.Backward, toe: false, edgeCallable: false }, // Lo
  { foot: FOOT.Left, side: EDGE.Inside, dir: DIR.Backward, toe: true, edgeCallable: true },     // F
  { foot: FOOT.Left, side: EDGE.Outside, dir: DIR.Backward, toe: true, edgeCallable: true },    // Lz
  { foot: FOOT.Left, side: EDGE.Outside, dir: DIR.Forward, toe: false, edgeCallable: false },   // A
];

/**
 * m/s: data/entry-templates.json's min_entry_speed_ms for each jump's triple,
 * in JUMP order — T, S, Lo, F, Lz, A. With the moves on, a jump taken off at
 * its own speed rises as jumpImpulse says (`jumpSpeedShare`). Transcribed, as
 * JUMP_DEFS is; test/entries.test.ts holds them to the file.
 */
export const ENTRY_SPEED = [6.8, 6.6, 6.4, 7.0, 7.5, 7.8] as const;

// JumpResolver.cpp's own constants, carried verbatim. They shape quality
// rather than deciding a call, which is why they are not on the panel.
const IDEAL_LOAD = 0.30;           // s
const PRE_ROTATION_RATE = 2.2;     // per s past 1.6 x the ideal load
const PEAK_KNEE_FULL = 0.85;
/** Mean outside-ness over the load below which the setup reads as flat. */
const SETUP_FLAT = 0.15;
/** Below this many revolutions (axel's half aside) it was a hop, not a jump. */
const MIN_JUMP_REVS = 0.375;
const TWO_FOOT_PENALTY = 0.15;

export function newJump(p: Params): JumpState {
  return {
    phase: JUMP_PHASE.None, t: 0, peakKnee: 0, preRotation: 0, setup: 0,
    toeTick: -1, toeInLoad: false, windupTick: -1, windupPeak: 0, armed: false, target: 0,
    takeoffCode: EDGE_CODE_NONE, kind: JUMP_NONE,
    edgeError: 0, quality: 0, z: 0, vz: 0, height: 0, airTime: 0,
    angMomentum: 0, inertia: p.inertiaOpen, rotation: 0, peakOmega: 0,
  };
}

export function noResult(): JumpResult {
  return {
    tick: -1, kind: JUMP_NONE, revolutions: 0, turned: 0, shortBy: 0,
    rotationCall: ROTATION_CALL.Clean, edgeCall: EDGE_CALL.Clean, toe: false,
    takeoffQuality: 0, landingQuality: 0, height: 0, airTime: 0, peakOmega: 0,
    twoFoot: false, stepOut: false, fall: false, armed: false,
  };
}

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/**
 * How far onto its outside edge a blade is, -1 (well onto the inside) .. +1.
 * Saturates at the shallow-edge depth: past that, the call is not in doubt.
 * Same rule as classify.ts — the left foot leaning left is on its outside.
 */
export function outsideness(foot: Foot, tilt: number, p: Params): number {
  const toward = foot === FOOT.Left ? tilt : -tilt;
  return clamp(toward / Math.max(p.depthShallow, 1e-6), -1, 1);
}

/** 0 on the edge wanted, 0.5 flat, 1 on the other one. */
export function edgeMismatch(outside: number, wantOutside: boolean): number {
  return saturate(wantOutside ? (1 - outside) / 2 : (1 + outside) / 2);
}

/** The panel's reading of a takeoff. JUMP_NONE when no jump leaves that way. */
export function identify(foot: Foot, dir: Dir, side: Edge, toe: boolean): number {
  for (let k = 0; k < JUMP_DEFS.length; k++) {
    const d = JUMP_DEFS[k];
    if (d.foot === foot && d.dir === dir && d.side === side && d.toe === toe) return k;
  }
  return JUMP_NONE;
}

/** The rotation call for a shortfall in revolutions, against the Params thresholds. */
export function rotationCall(shortBy: number, p: Params): number {
  if (shortBy > p.callDowngrade) return ROTATION_CALL.Downgraded;
  if (shortBy > p.callUnder) return ROTATION_CALL.UnderRotated;
  if (shortBy > p.callQuarter) return ROTATION_CALL.Quarter;
  return ROTATION_CALL.Clean;
}

export function edgeCall(error: number, p: Params): number {
  if (error > p.callEdgeWrong) return EDGE_CALL.Wrong;
  if (error > p.callEdgeUnclear) return EDGE_CALL.Unclear;
  return EDGE_CALL.Clean;
}

/**
 * Which jump the rotation was an attempt at, and how far short of it.
 *
 * There is no program sheet in the rig, so "attempted" has to be inferred, and
 * the inference is the next revolution above what was cleanly turned: 2.8 is
 * a triple a fifth short (q), 2.4 is a triple downgraded to a double (<<).
 * That leans toward calling the harder jump, which is how a panel with the
 * planned layout in front of it would see most of them.
 */
export function calledRevolutions(turned: number, kind: number, p: Params): {
  revolutions: number; shortBy: number;
} {
  const extra = kind === JUMP.Axel ? 0.5 : 0;
  const r = turned - extra;
  const n = clamp(Math.ceil(r - p.callQuarter), 1, 4);
  return { revolutions: n, shortBy: n - r };
}

function loseContact(s: SkaterState, events: EdgeEvent[]): void {
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (b.code !== EDGE_CODE_NONE) {
      events.push({
        tick: s.tick, type: EVENT.EdgeLost, foot: i as Foot,
        prevCode: b.code, newCode: EDGE_CODE_NONE, prevDwell: b.dwell, value: b.tilt,
      });
    }
    b.code = EDGE_CODE_NONE; b.dwell = 0; b.depth = 0;
    b.inContact = false; b.regime = REGIME.Unloaded; b.normalLoad = 0;
    b.latForce = 0; b.latSlipAccel = 0; b.demandRatio = 0; b.biteCapacity = 0;
    b.turnRadius = Infinity; b.longSpeed = 0;
  }
}

/**
 * The arms' whip, 0..1 of a full one: the carriage, and with a wound-up
 * jump armed at least jumpAssist of the flick. With armsWhipMode 1 it is
 * signed, -1..1: arms wound against the rotation (SkatingInput.windup
 * clockwise, at windupThreshold or past) swing the other way, arms swung the
 * jump's way or simply out swing with it.
 */
export function armsWhip(J: JumpState, input: SkatingInput, p: Params, tick: number, dt: number, signed: boolean): number {
  let whip = saturate(finite(input.carriage, 0));
  if (signed) whip *= clamp(1 - 2 * finite(input.windup, 0) / p.windupThreshold, -1, 1);
  const armed = p.jumpMode >= JUMP_MODE.Full && J.windupTick >= 0 && (tick - J.windupTick) * dt <= p.windupWindow;
  if (armed) whip = Math.max(whip, p.jumpAssist * J.windupPeak);
  return whip;
}

/** The load's own quality, 0..1: its timing and depth, less its pre-rotation — the takeoff's before the edge and the pick. */
function legQuality(J: JumpState): number {
  const timingQ = saturate(1 - Math.abs(J.t - IDEAL_LOAD) / IDEAL_LOAD);
  const depthQ = saturate(J.peakKnee / PEAK_KNEE_FULL);
  return saturate(0.55 * timingQ + 0.45 * depthQ) * (1 - 0.40 * saturate(J.preRotation));
}

/**
 * rad/s: the body's spin about the vertical at inertiaOpen — what a takeoff
 * now would leave with before the whip, the turn's carry and the quality —
 * from the carve's rate and, with the trunk (torqueMode), each body's own
 * spin past it, the free leg's and the arms' swing.
 */
export function bodyRate(s: SkaterState, p: Params, carriage: number): number {
  let rate = p.jumpRotBias * s.yawRate;
  if (s.twistRate !== undefined) {
    const dev = s.yawDev ?? 0, Iu = upperInertia(p, carriage);
    rate = p.jumpRotBias * (s.yawRate - dev) + ((p.lowerBodyInertia + Iu) * dev + Iu * s.twistRate) / p.inertiaOpen;
    // The free leg (freeLegMode) leaves with its own swing too.
    if (s.freeSwingRate !== undefined) {
      const If = p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach;
      rate += If * (dev + s.freeSwingRate) / p.inertiaOpen;
    }
    // And the arms (armsWhipMode) with what they swung up on the ice.
    if (s.armsL !== undefined) rate += s.armsL / p.inertiaOpen;
  }
  return rate;
}

/**
 * On the ice, once per tick, after the carve solve: is the knee loading, and
 * has it just been released? A no-op unless jumpMode is on, so every recorded
 * measurement taken with it off still measures the same thing.
 */
export function jumpGround(
  s: SkaterState, input: SkatingInput, p: Params, dt: number, events: EdgeEvent[],
): void {
  const J = s.jump;
  if (p.jumpMode <= JUMP_MODE.Off) return;
  if (s.fallen || s.supportMode === 0) {
    J.phase = JUMP_PHASE.None;
    if (J.pushFrom !== undefined) J.pushFrom = J.pushLoad = undefined;
    if (J.pushAccel !== undefined) J.pushLeg0 = J.pushLegRate0 = J.pushAccel = J.pushLift = undefined;
    if (J.entryHeading !== undefined) J.entryHeading = J.takeoffPivot = undefined;
    return;
  }

  const kneeIn = finite(input.knee, 0.35);
  if (input.toe) J.toeTick = s.tick;
  // The wind-up: a flick against the rotation commits to the jump, a flick with
  // it takes the commitment back. Flicks still inside the window add up to the
  // furthest one; an expired flick starts over.
  const w = finite(input.windup, 0);
  if (w >= p.windupThreshold) {
    if (J.windupTick < 0 || (s.tick - J.windupTick) * dt > p.windupWindow) J.windupPeak = 0;
    J.windupTick = s.tick;
    J.windupPeak = Math.max(J.windupPeak, saturate(w));
  } else if (w <= -p.windupThreshold) {
    J.windupTick = -1;
    J.windupPeak = 0;
  }
  const b = s.blade[s.supportFoot];
  const o = outsideness(s.supportFoot, b.tilt, p);

  if (J.phase === JUMP_PHASE.None) {
    if (kneeIn >= p.jumpLoadKnee) {
      J.phase = JUMP_PHASE.Load;
      J.t = 0; J.peakKnee = s.knee; J.preRotation = 0; J.setup = 0; J.toeInLoad = false;
      // rotationCallMode: the takeoff's reference — where the body faces as the load begins.
      if (p.rotationCallMode >= 1) { J.entryHeading = atan2(s.heading.y, s.heading.x); J.takeoffPivot = 0; }
    }
    return;
  }

  // ── LOAD ──────────────────────────────────────────────────────────────────
  // Knee compression sets the vertical impulse. Hold too long and the edge
  // rotates underneath you before you leave the ice: pre-rotation.
  // rotationCallMode: of the body's turn through the takeoff, what the feet
  // pivoted off the carve (yawDev) — the rest is the takeoff edge's own curve.
  if (J.takeoffPivot !== undefined) J.takeoffPivot += (s.yawDev ?? 0) * dt / (2 * Math.PI);
  if (J.pushFrom === undefined) {
    J.t += dt;
    J.peakKnee = Math.max(J.peakKnee, s.knee);
    J.setup += o * dt;
    if (input.toe) J.toeInLoad = true;
    if (J.t > IDEAL_LOAD * 1.6) J.preRotation += PRE_ROTATION_RATE * dt;
    if (J.t > p.jumpLoadMax) { J.phase = JUMP_PHASE.None; if (J.entryHeading !== undefined) J.entryHeading = J.takeoffPivot = undefined; return; }
    if (kneeIn >= p.jumpReleaseKnee) return;
    // Mid-move the blade is not on an edge to leave from: the release waits for
    // the exit edge, and takes off from it (sim/moves.ts).
    if (s.move !== MOVE.None) return;
    // THE PUSH-OFF (pushOffMode). The release is the leg beginning to
    // drive the body up, not the blade leaving: for pushOffTime it stays on
    // the ice, and the upward speed the takeoff leaves with — the legs'
    // share, from this load's timing and depth — comes through it, m v / T
    // on top of the body's weight (sim/solver.ts, legs -> normal load). That
    // load is the grip the swing has to work against while it finishes. The
    // load's timing, depth and toe are the release's.
    if (p.pushOffMode >= 1) {
      if (p.pushMechanicsMode >= 1) {
        // pushMechanicsMode: the push drives the leg straight at a constant
        // force over its whole ticks (the takeoff below leaves on the first
        // tick at or past pushOffTime); sim/solver.ts moves the leg by it.
        let n = 1;
        while (n * dt < p.pushOffTime - 1e-9) n++;
        const T = n * dt, travel = Math.max(0, p.comHeight - s.legLength);
        J.pushFrom = s.tick;
        J.pushLeg0 = s.legLength; J.pushLegRate0 = s.legRate;
        J.pushAccel = 2 * (travel - s.legRate * T) / (T * T);
        J.pushLift = s.legRate + J.pushAccel * T;
        return;
      }
      const legs = p.jumpImpulse * (0.62 + 0.38 * legQuality(J)) * (p.movesMode >= 1 ? 1 - p.jumpSpeedShare : 1);
      J.pushFrom = s.tick; J.pushLoad = p.mass * legs / p.pushOffTime;
      return;
    }
  } else if ((s.tick - J.pushFrom) * dt < p.pushOffTime - 1e-9) return;
  const released = J.pushFrom ?? s.tick;
  if (J.pushFrom !== undefined) J.pushFrom = J.pushLoad = undefined;
  // pushMechanicsMode: the legs' lift is the leg's own speed as it straightens.
  const legLift = J.pushLift;
  if (J.pushAccel !== undefined) J.pushLeg0 = J.pushLegRate0 = J.pushAccel = J.pushLift = undefined;

  // ── TAKEOFF ───────────────────────────────────────────────────────────────
  const foot = s.supportFoot;
  const dir = b.code === EDGE_CODE_NONE ? DIR.Stationary : codeDir(b.code);
  const mean = J.setup / Math.max(J.t, dt);
  const side = (Math.abs(mean) >= SETUP_FLAT ? mean : o) >= 0 ? EDGE.Outside : EDGE.Inside;
  const toe = J.toeInLoad;
  const struck = toe && J.toeTick >= 0 && (released - J.toeTick) * dt <= p.toeWindow;

  J.kind = p.jumpMode >= JUMP_MODE.Full ? identify(foot, dir, side, toe) : JUMP_NONE;
  J.edgeError = J.kind !== JUMP_NONE && JUMP_DEFS[J.kind].edgeCallable
    ? edgeMismatch(o, JUMP_DEFS[J.kind].side === EDGE.Outside) : 0;

  const timingQ = saturate(1 - Math.abs(J.t - IDEAL_LOAD) / IDEAL_LOAD);
  const depthQ = saturate(J.peakKnee / PEAK_KNEE_FULL);
  let q = saturate(0.55 * timingQ + 0.45 * depthQ)
    * (1 - 0.35 * J.edgeError)
    * (1 - 0.40 * saturate(J.preRotation));
  // Toe jumps need the pick planted inside the window.
  if (toe && !struck) q *= 0.45;
  J.quality = q;

  // Ballistics are fixed HERE and cannot be changed in the air.
  J.vz = p.jumpImpulse * (0.62 + 0.38 * q);
  // With the moves on, part of the lift is the approach turned upward: blocked
  // by the takeoff edge, or vaulted over the pick — so a toe jump that missed
  // its pick has nothing to vault over. What goes up comes out of the travel.
  let vaultSpin = 0;
  if (p.movesMode >= 1 && J.kind !== JUMP_NONE) {
    const vh = len(s.vel), before = s.vel;
    const vault = !JUMP_DEFS[J.kind].toe || struck ? vh / ENTRY_SPEED[J.kind] : 0;
    const legs = legLift ?? J.vz * (1 - p.jumpSpeedShare);
    J.vz = legs + J.vz * p.jumpSpeedShare * vault;
    const left = vh * vh - (J.vz * J.vz - legs * legs);
    if (vh > 1e-6) s.vel = mul(s.vel, Math.sqrt(Math.max(0, left)) / vh);
    // Speed into spin (speedSpinMode): the block acts at the blade, which the
    // lean holds leg length x sin(lean) to the side of the centre of mass.
    if (p.speedSpinMode >= 1) {
      const r = mul(perpLeft(s.heading), -s.legLength * sin(s.lean));
      const dp = mul(add(s.vel, mul(before, -1)), p.mass);
      vaultSpin = r.x * dp.y - r.y * dp.x;
    }
  } else if (legLift !== undefined) J.vz = legLift;
  J.airTime = 2 * J.vz / p.gravity;
  J.height = J.vz * J.vz / (2 * p.gravity);

  // Angular momentum: the entry curve, whatever a turn just before it left in
  // the body (spinCarry, zero without the moves), plus the whip of the free
  // side — and after this instant L never changes. A counter-clockwise skater cannot
  // spin clockwise off a bad entry, so a net negative is no rotation at all.
  //
  // A wound-up release whips at least jumpAssist of the flick: the shoulders
  // unwinding is the whip, and the assist is how much of it happens for you.
  J.armed = p.jumpMode >= JUMP_MODE.Full && J.windupTick >= 0
    && (s.tick - J.windupTick) * dt <= p.windupWindow;
  // With armsWhipMode 1 the whip is not put in here: the arms have already
  // swung it up through the edge during the load (s.armsL, sim/solver.ts).
  const whip = s.armsL === undefined ? armsWhip(J, input, p, s.tick, dt, false) : 0;
  // With the trunk modelled (torqueMode) the body is two, each with its own
  // spin past the carve: the lower's yawDev, the upper's yawDev + twistRate,
  // each at its own inertia. A twist cannot make spin by itself — only the
  // ice holding the feet while the shoulders swing can — so a release that
  // pivots the feet instead leaves with nothing.
  const rate = bodyRate(s, p, finite(input.carriage, 0));
  J.angMomentum = p.jumpMode >= JUMP_MODE.Full
    ? p.inertiaOpen * Math.max(0, rate + s.spinCarry + vaultSpin / p.inertiaOpen + p.jumpWhip * whip) * (0.80 + 0.20 * q)
    : 0;
  J.windupTick = -1;
  J.windupPeak = 0;
  if (s.armsL !== undefined) s.armsL = 0;
  J.inertia = p.inertiaOpen;
  J.rotation = 0; J.peakOmega = 0; J.z = 0;
  J.takeoffCode = b.code;
  // What the assist flies to: the nearest whole revolution — half, for an
  // axel — to what this takeoff turns with the arms pulled in from the first
  // tick of the air, at their real rate, until the ice. Nearest, not safest,
  // on purpose: a takeoff a little short of a triple still goes for it and
  // comes down short; one a little past a double lands the double.
  J.target = 0;
  if (J.armed && J.kind !== JUMP_NONE && J.angMomentum > 0) {
    J.t = dt;
    const extra = J.kind === JUMP.Axel ? 0.5 : 0;
    const reach = rotationToLand(J, p, dt, 0) / (2 * Math.PI);
    J.target = 2 * Math.PI * (Math.max(1, Math.round(reach - extra)) + extra);
  }

  // rotationCallMode: the turn made on the ice through the takeoff, from the
  // load's reference to the blade leaving, counter-clockwise positive (the
  // jumps' rotation). Under half a turn, so the wrap is unambiguous.
  if (J.entryHeading !== undefined) {
    J.takeoffTurn = wrapPi(atan2(s.heading.y, s.heading.x) - J.entryHeading) / (2 * Math.PI);
    J.entryHeading = undefined;
  }
  events.push({
    tick: s.tick, type: EVENT.Takeoff, foot,
    prevCode: b.code, newCode: EDGE_CODE_NONE, prevDwell: J.t, value: J.vz,
  });
  J.phase = JUMP_PHASE.Air;
  J.t = 0;
  loseContact(s, events);
  s.strokeTime = 0;
  s.legRate = 0;
  if (p.airPostureMode >= 1) {
    // Blade-off ends the ground's balance state; the body's own motion goes
    // on. The lean's rate and the pitch's are the roll and pitch the takeoff
    // launched — kept. What only the ice gives (lateral force, the edge's
    // equilibrium, the arms' held share, the fall timers) is gone, and the
    // takeoff's balance error survives only as a diagnostic.
    J.takeoffBalanceError = s.balanceError;
    s.latAccel = 0; s.intAccel = 0; s.intHeld = 0;
    s.leanEq = 0; s.balanceError = 0; s.balanceErrorTime = 0;
    if (s.pitchOffTime !== undefined) s.pitchOffTime = 0;
    if (s.pitchAnkle !== undefined) s.pitchAnkle = 0;
  } else s.leanRate = 0;
}

/**
 * In the air, instead of the carve solve. Ballistic flight, conserved angular
 * momentum, and the arms. Lands itself when the blades reach the ice.
 */
export function jumpAir(
  s: SkaterState, input: SkatingInput, p: Params, dt: number, events: EdgeEvent[],
): void {
  const J = s.jump;
  J.t += dt;

  // ── AIR ───────────────────────────────────────────────────────────────────
  // L is conserved. The only remaining control is the moment of inertia:
  // pulling the arms and free leg to the axis roughly quarters I, which
  // roughly quadruples omega.
  //
  // An armed jump's arms are blended jumpAssist of the way toward what its
  // geometry asks for (`assistedCarriage`). That moves I and nothing else.
  let carriage = saturate(finite(input.carriage, 0));
  if (J.armed && J.target > 0 && p.jumpAssist > 0) carriage = lerp(carriage, assistedCarriage(J, p, dt), p.jumpAssist);
  const pull = 1 - carriage;
  J.inertia = moveToward(J.inertia, lerp(p.inertiaOpen, p.jumpInertiaTucked, pull), p.inertiaPullRate * dt);
  const omega = J.angMomentum / J.inertia;
  J.rotation += omega * dt;
  J.peakOmega = Math.max(J.peakOmega, omega);
  s.yawRate = omega;
  if (omega !== 0) {
    s.heading = normalizeOr(rotate(s.heading, omega * dt), s.heading);
    for (const b of s.blade) b.tangent = { x: s.heading.x, y: s.heading.y };
  }

  // Nothing touches the ice, so only the air slows the skater.
  const speed = len(s.vel);
  if (speed > 1e-6) {
    const drag = 0.5 * p.airDensity * p.cdA * speed * speed / p.mass * dt;
    s.vel = mul(s.vel, Math.max(0, speed - drag) / speed);
  }
  s.pos = add(s.pos, mul(s.vel, dt));
  for (const b of s.blade) b.contact = { x: s.pos.x, y: s.pos.y };
  J.vz -= p.gravity * dt;
  J.z += J.vz * dt;
  s.knee = moveToward(s.knee, clamp(finite(input.knee, 0.35), 0, 1), p.kneeRate * dt);
  // airPostureMode 1: torque-free. Gravity acts through the centre of mass,
  // so the roll and pitch turn on at the rates the takeoff left them — their
  // inertias do not change with posture in this model, so conserved angular
  // momentum is a conserved rate. The same clamp the pendulum has on the ice.
  if (p.airPostureMode >= 1) {
    s.lean = clamp(s.lean + s.leanRate * dt, -1.55, 1.55);
    if (s.pitch !== undefined) s.pitch = clamp(s.pitch + (s.pitchRate ?? 0) * dt, -1.55, 1.55);
  }

  if (J.z <= 0 && J.t > dt) land(s, input, p, events);
}

/**
 * Radians still to turn before the blades reach the ice, if the arms are sent
 * to `carriage` this tick and held there. Runs the rest of the flight exactly
 * as jumpAir will — the same ballistics, the same arm rate — so "reachable"
 * means reachable, not reachable with an instant tuck. Called with J.t already
 * advanced for the tick it starts on.
 */
export function rotationToLand(J: JumpState, p: Params, dt: number, carriage: number): number {
  const goal = lerp(p.inertiaOpen, p.jumpInertiaTucked, 1 - carriage);
  let inertia = J.inertia, z = J.z, vz = J.vz, t = J.t, turned = 0;
  for (let k = 0; k < 4096; k++) {
    inertia = moveToward(inertia, goal, p.inertiaPullRate * dt);
    turned += (J.angMomentum / inertia) * dt;
    vz -= p.gravity * dt;
    z += vz * dt;
    if (z <= 0 && t > dt) break;
    t += dt;
  }
  return turned;
}

/**
 * The carriage the jump's geometry asks for this tick, 0 tucked .. 1 open.
 *
 * If full tuck cannot finish the target, full tuck: the assist never finds
 * rotation the takeoff did not buy. If arms wide open still overshoot it, open.
 * Otherwise the carriage, found by bisection, whose held rotation lands on the
 * target — so a jump with rotation to spare opens early and checks out on its
 * revolution instead of past it. Asked again every tick, so it corrects itself,
 * and blended with the skater's own arms by jumpAssist it corrects only that much.
 */
export function assistedCarriage(J: JumpState, p: Params, dt: number): number {
  const need = J.target - J.rotation;
  if (need <= 0) return 1;
  if (rotationToLand(J, p, dt, 0) <= need) return 0;
  if (rotationToLand(J, p, dt, 1) >= need) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = 0.5 * (lo + hi);
    if (rotationToLand(J, p, dt, mid) > need) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Touchdown. Rotation accounting mirrors how a technical panel calls a jump. */
function land(s: SkaterState, input: SkatingInput, p: Params, events: EdgeEvent[]): void {
  const J = s.jump;
  const turned = J.rotation / (2 * Math.PI);

  // The blade grips the direction it points, and whatever of the velocity it
  // does not point along is scrubbed off in the landing. An under-rotated
  // jump comes down crossways and loses most of its flow here.
  const t = s.heading;
  const vLong = dot(s.vel, t);
  s.vel = mul(t, vLong);

  const weightR = clamp(finite(input.weight, 0.5), 0, 1);
  const twoFoot = weightR > 0.05 && weightR < 0.95;
  const foot = (weightR >= 0.5 ? FOOT.Right : FOOT.Left) as Foot;
  const dir = vLong < -p.dirSpeedEps ? DIR.Backward : vLong > p.dirSpeedEps ? DIR.Forward : DIR.Stationary;
  const o = outsideness(foot, s.tiltCmd, p);

  let kind = J.kind;
  // rotationCallMode 1: the jump is called at this first touchdown from the
  // turn the takeoff edge carried the body through on the ice, credited up
  // to callTakeoffCredit, plus what was turned in the air; what the feet
  // pivoted or skidded off the edge is never credited, and past a q's worth
  // it is a cheated takeoff; what turns after this instant never counts.
  // 0: the air alone, as before.
  const takeoffTurn = p.rotationCallMode >= 1 ? J.takeoffTurn ?? 0 : 0;
  const takeoffPivot = p.rotationCallMode >= 1 ? J.takeoffPivot ?? 0 : 0;
  const takeoffEdge = takeoffTurn - takeoffPivot;
  const credited = Math.min(Math.max(takeoffEdge, 0), p.callTakeoffCredit);
  const counted = turned + credited;
  // Where the body faces at touchdown, from the reference: every bit of the takeoff's turn.
  const facing = J.rotation + 2 * Math.PI * takeoffTurn;
  let revolutions = 0, shortBy = 0, target: number;
  if (kind !== JUMP_NONE && counted - (kind === JUMP.Axel ? 0.5 : 0) < MIN_JUMP_REVS) kind = JUMP_NONE;
  if (kind !== JUMP_NONE) {
    ({ revolutions, shortBy } = calledRevolutions(counted, kind, p));
    target = 2 * Math.PI * (revolutions + (kind === JUMP.Axel ? 0.5 : 0));
  } else {
    // A hop, a waltz jump, or a takeoff no jump leaves from: land it facing
    // whichever half-turn it is nearest.
    target = Math.PI * Math.round(facing / Math.PI);
  }

  // Landing quality: did you open on time, present the right edge, and absorb
  // the impact with the knee? Every jump lands RBO; a hop can land on anything.
  const checkErr = Math.abs(wrapPi(facing - target)) / Math.PI;
  const absorb = saturate(finite(input.knee, 0.35));
  const edgeOK = kind === JUMP_NONE ? 1
    : foot === FOOT.Right && dir === DIR.Backward ? 1 - edgeMismatch(o, true) : 0;
  // airPostureMode 1: touchdown starts a fresh contact, and the takeoff
  // edge's balance error died with the takeoff. Whether the landing edge
  // holds the lean the skater comes down with is not a score at this
  // instant but the ice's to decide from the landing's own state — the
  // solver's fall rules, from the next tick. 0: the error the takeoff left.
  const balance = p.airPostureMode >= 1 ? 0 : saturate(Math.abs(s.balanceError) / Math.max(p.fallError, 1e-6));
  const landingQuality = saturate(1 - 0.90 * checkErr - 0.50 * (1 - absorb)
    - 0.35 * (1 - edgeOK) - 0.60 * balance
    - (twoFoot && kind !== JUMP_NONE ? TWO_FOOT_PENALTY : 0));

  const fall = landingQuality < 0.18 || shortBy > 0.70;
  s.landed = {
    tick: s.tick, kind, revolutions, turned, shortBy,
    rotationCall: kind === JUMP_NONE ? ROTATION_CALL.Clean : rotationCall(shortBy, p),
    edgeCall: kind !== JUMP_NONE && JUMP_DEFS[kind].edgeCallable ? edgeCall(J.edgeError, p) : EDGE_CALL.Clean,
    toe: J.toeInLoad, takeoffQuality: J.quality, landingQuality,
    height: J.height, airTime: J.t, peakOmega: J.peakOmega,
    twoFoot, stepOut: !fall && landingQuality < 0.34, fall, armed: J.armed,
    ...(p.rotationCallMode >= 1 ? {
      takeoffTurn, takeoffEdge, takeoffPivot, airborne: turned, residual: 0,
      cheatedTakeoff: takeoffPivot > p.callQuarter || takeoffEdge > p.callTakeoffCredit,
    } : {}),
  };

  const side = o > 0 ? EDGE.Outside : o < 0 ? EDGE.Inside : EDGE.Flat;
  events.push({
    tick: s.tick, type: EVENT.Landing, foot,
    prevCode: J.takeoffCode, newCode: makeCode(foot, dir, side as Edge), prevDwell: J.t, value: turned,
  });

  J.phase = JUMP_PHASE.None;
  if (J.takeoffTurn !== undefined) J.takeoffTurn = J.takeoffPivot = undefined;
  if (J.takeoffBalanceError !== undefined) J.takeoffBalanceError = undefined;
  J.t = 0; J.z = 0; J.vz = 0; J.angMomentum = 0; J.inertia = p.inertiaOpen;
  J.armed = false; J.target = 0;
  s.yawRate = 0;

  if (fall) {
    s.fallen = true;
    s.fallReason = FALL.Landing;
    events.push({
      tick: s.tick, type: EVENT.Fall, foot,
      prevCode: J.takeoffCode, newCode: FALL.Landing, prevDwell: 0, value: s.lean,
    });
    return;
  }
  // The impact the knee did not absorb goes into the balance loop, toward
  // whichever way the body was already off. (airPostureMode 1: off the
  // landing blade's equilibrium, which carries no lateral force yet — upright.)
  const off = s.lean - s.leanEq;
  s.leanRate += (off >= 0 ? 1 : -1) * p.landingShock * (1 - landingQuality);
}
