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
import { clamp, saturate, lerp, moveToward, rotate, normalizeOr, wrapPi, dot, mul, len, add } from "./math.ts";

export const JUMP_MODE = { Off: 0, Hop: 1, Full: 2 } as const;
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
    toeTick: -1, toeInLoad: false, takeoffCode: EDGE_CODE_NONE, kind: JUMP_NONE,
    edgeError: 0, quality: 0, z: 0, vz: 0, height: 0, airTime: 0,
    angMomentum: 0, inertia: p.inertiaOpen, rotation: 0, peakOmega: 0,
  };
}

export function noResult(): JumpResult {
  return {
    tick: -1, kind: JUMP_NONE, revolutions: 0, turned: 0, shortBy: 0,
    rotationCall: ROTATION_CALL.Clean, edgeCall: EDGE_CALL.Clean, toe: false,
    takeoffQuality: 0, landingQuality: 0, height: 0, airTime: 0, peakOmega: 0,
    twoFoot: false, stepOut: false, fall: false,
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
 * On the ice, once per tick, after the carve solve: is the knee loading, and
 * has it just been released? A no-op unless jumpMode is on, so every recorded
 * measurement taken with it off still measures the same thing.
 */
export function jumpGround(
  s: SkaterState, input: SkatingInput, p: Params, dt: number, events: EdgeEvent[],
): void {
  const J = s.jump;
  if (p.jumpMode <= JUMP_MODE.Off) return;
  if (s.fallen || s.supportMode === 0) { J.phase = JUMP_PHASE.None; return; }

  const kneeIn = finite(input.knee, 0.35);
  if (input.toe) J.toeTick = s.tick;
  const b = s.blade[s.supportFoot];
  const o = outsideness(s.supportFoot, b.tilt, p);

  if (J.phase === JUMP_PHASE.None) {
    if (kneeIn >= p.jumpLoadKnee) {
      J.phase = JUMP_PHASE.Load;
      J.t = 0; J.peakKnee = s.knee; J.preRotation = 0; J.setup = 0; J.toeInLoad = false;
    }
    return;
  }

  // ── LOAD ──────────────────────────────────────────────────────────────────
  // Knee compression sets the vertical impulse. Hold too long and the edge
  // rotates underneath you before you leave the ice: pre-rotation.
  J.t += dt;
  J.peakKnee = Math.max(J.peakKnee, s.knee);
  J.setup += o * dt;
  if (input.toe) J.toeInLoad = true;
  if (J.t > IDEAL_LOAD * 1.6) J.preRotation += PRE_ROTATION_RATE * dt;
  if (J.t > p.jumpLoadMax) { J.phase = JUMP_PHASE.None; return; }
  if (kneeIn >= p.jumpReleaseKnee) return;
  // Mid-move the blade is not on an edge to leave from: the release waits for
  // the exit edge, and takes off from it (sim/moves.ts).
  if (s.move !== MOVE.None) return;

  // ── TAKEOFF ───────────────────────────────────────────────────────────────
  const foot = s.supportFoot;
  const dir = b.code === EDGE_CODE_NONE ? DIR.Stationary : codeDir(b.code);
  const mean = J.setup / Math.max(J.t, dt);
  const side = (Math.abs(mean) >= SETUP_FLAT ? mean : o) >= 0 ? EDGE.Outside : EDGE.Inside;
  const toe = J.toeInLoad;
  const struck = toe && J.toeTick >= 0 && (s.tick - J.toeTick) * dt <= p.toeWindow;

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
  if (p.movesMode >= 1 && J.kind !== JUMP_NONE) {
    const vh = len(s.vel);
    const vault = !JUMP_DEFS[J.kind].toe || struck ? vh / ENTRY_SPEED[J.kind] : 0;
    const legs = J.vz * (1 - p.jumpSpeedShare);
    J.vz = legs + J.vz * p.jumpSpeedShare * vault;
    const left = vh * vh - (J.vz * J.vz - legs * legs);
    if (vh > 1e-6) s.vel = mul(s.vel, Math.sqrt(Math.max(0, left)) / vh);
  }
  J.airTime = 2 * J.vz / p.gravity;
  J.height = J.vz * J.vz / (2 * p.gravity);

  // Angular momentum: the entry curve, whatever a turn just before it left in
  // the body (spinCarry, zero without the moves), plus the whip of the free
  // side — and after this instant L never changes. A counter-clockwise skater cannot
  // spin clockwise off a bad entry, so a net negative is no rotation at all.
  const whip = saturate(finite(input.carriage, 0));
  J.angMomentum = p.jumpMode >= JUMP_MODE.Full
    ? p.inertiaOpen * Math.max(0, p.jumpRotBias * s.yawRate + s.spinCarry + p.jumpWhip * whip) * (0.80 + 0.20 * q)
    : 0;
  J.inertia = p.inertiaOpen;
  J.rotation = 0; J.peakOmega = 0; J.z = 0;
  J.takeoffCode = b.code;

  events.push({
    tick: s.tick, type: EVENT.Takeoff, foot,
    prevCode: b.code, newCode: EDGE_CODE_NONE, prevDwell: J.t, value: J.vz,
  });
  J.phase = JUMP_PHASE.Air;
  J.t = 0;
  loseContact(s, events);
  s.strokeTime = 0;
  s.leanRate = 0;
  s.legRate = 0;
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
  const pull = 1 - saturate(finite(input.carriage, 0));
  J.inertia = moveToward(J.inertia, lerp(p.inertiaOpen, p.inertiaTucked, pull), p.inertiaPullRate * dt);
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

  if (J.z <= 0 && J.t > dt) land(s, input, p, events);
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
  let revolutions = 0, shortBy = 0, target: number;
  if (kind !== JUMP_NONE && turned - (kind === JUMP.Axel ? 0.5 : 0) < MIN_JUMP_REVS) kind = JUMP_NONE;
  if (kind !== JUMP_NONE) {
    ({ revolutions, shortBy } = calledRevolutions(turned, kind, p));
    target = 2 * Math.PI * (revolutions + (kind === JUMP.Axel ? 0.5 : 0));
  } else {
    // A hop, a waltz jump, or a takeoff no jump leaves from: land it facing
    // whichever half-turn it is nearest.
    target = Math.PI * Math.round(J.rotation / Math.PI);
  }

  // Landing quality: did you open on time, present the right edge, and absorb
  // the impact with the knee? Every jump lands RBO; a hop can land on anything.
  const checkErr = Math.abs(wrapPi(J.rotation - target)) / Math.PI;
  const absorb = saturate(finite(input.knee, 0.35));
  const edgeOK = kind === JUMP_NONE ? 1
    : foot === FOOT.Right && dir === DIR.Backward ? 1 - edgeMismatch(o, true) : 0;
  const balance = saturate(Math.abs(s.balanceError) / Math.max(p.fallError, 1e-6));
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
    twoFoot, stepOut: !fall && landingQuality < 0.34, fall,
  };

  const side = o > 0 ? EDGE.Outside : o < 0 ? EDGE.Inside : EDGE.Flat;
  events.push({
    tick: s.tick, type: EVENT.Landing, foot,
    prevCode: J.takeoffCode, newCode: makeCode(foot, dir, side as Edge), prevDwell: J.t, value: turned,
  });

  J.phase = JUMP_PHASE.None;
  J.t = 0; J.z = 0; J.vz = 0; J.angMomentum = 0; J.inertia = p.inertiaOpen;
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
  // whichever way the body was already off.
  const off = s.lean - s.leanEq;
  s.leanRate += (off >= 0 ? 1 : -1) * p.landingShock * (1 - landingQuality);
}
