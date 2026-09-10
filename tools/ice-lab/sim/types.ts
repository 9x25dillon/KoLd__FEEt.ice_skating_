// tools/ice-lab/sim/types.ts — the vocabulary, and the edge code.
//
// Erasable-syntax TypeScript only: no `enum`, no `namespace`, no parameter
// properties. Node 26 strips types natively, which is what lets this rig run
// with zero dependencies, and stripping cannot emit an enum's runtime object.
// Const objects with union types give the same thing and survive the port to
// C++ enums unchanged.

import type { Vec2 } from "./math.ts";

// ── feet, edges, directions ─────────────────────────────────────────────────

export const FOOT = { Left: 0, Right: 1 } as const;
export type Foot = 0 | 1;

export const EDGE = { Flat: 0, Inside: 1, Outside: 2 } as const;
export type Edge = 0 | 1 | 2;

export const DIR = { Stationary: 0, Forward: 1, Backward: 2 } as const;
export type Dir = 0 | 1 | 2;

export const DEPTH = { Flat: 0, Shallow: 1, Moderate: 2, Deep: 3 } as const;
export type Depth = 0 | 1 | 2 | 3;

export const REGIME = {
  Unloaded: 0, Glide: 1, Edge: 2, Carve: 3, Skid: 4, ToePick: 5, Brake: 6,
} as const;
export type Regime = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const REGIME_NAME = [
  "UNLOADED", "GLIDE", "EDGE", "CARVE", "SKID", "TOEPICK", "BRAKE",
] as const;

export const FALL = {
  None: 0, LeanExceeded: 1, BalanceTimeout: 2, ToePickTrip: 3, Landing: 4,
} as const;
export type Fall = 0 | 1 | 2 | 3 | 4;

export const FALL_NAME = ["", "LEAN EXCEEDED", "BALANCE LOST", "TOE PICK", "LANDING"] as const;

// ── the edge code ───────────────────────────────────────────────────────────

/** No edge: the blade is off the ice. */
export const EDGE_CODE_NONE = 0xff;

/** bit0 foot, bits1-2 direction, bits3-4 side. Stable under serialization. */
export const makeCode = (foot: Foot, dir: Dir, side: Edge): number =>
  (foot | (dir << 1) | (side << 3)) & 0xff;

export const codeFoot = (c: number): Foot => (c & 1) as Foot;
export const codeDir = (c: number): Dir => ((c >> 1) & 3) as Dir;
export const codeSide = (c: number): Edge => ((c >> 3) & 3) as Edge;

/**
 * "RFO", "LBI", "RF-" (flat), "L--" (stationary), "---" (off the ice).
 *
 * This spelling is not decoration — it is the vocabulary data/jump-definitions.csv
 * already uses for `landing_edge`, and test/classify.test.ts asserts against
 * every row of that file. If this function and that data ever disagree, the
 * data is right.
 */
export function codeToString(c: number): string {
  if (c === EDGE_CODE_NONE) return "---";
  const f = codeFoot(c) === FOOT.Right ? "R" : "L";
  const d = codeDir(c) === DIR.Forward ? "F" : codeDir(c) === DIR.Backward ? "B" : "-";
  const s = codeSide(c) === EDGE.Outside ? "O" : codeSide(c) === EDGE.Inside ? "I" : "-";
  return f + d + s;
}

// ── jumps ───────────────────────────────────────────────────────────────────

/**
 * A jump attempt, JumpResolver.cpp's FJumpAttempt in the rig.
 *
 * Plain numbers so it replays and digests like everything else. The fields
 * set at takeoff — vz, airTime, height, angMomentum — are never written again
 * until the next takeoff: ballistics are fixed at the instant the knee is
 * released, and the only lever left in the air is `inertia`.
 */
export interface JumpState {
  /** JUMP_PHASE: none, load, air. */
  phase: number;
  /** Seconds in the current phase. */
  t: number;
  peakKnee: number;
  /** Accumulates when the load is held past the window: the edge rotates under you. */
  preRotation: number;
  /** Integral of outside-ness over the load, s. Its sign is the setup edge. */
  setup: number;
  /** Tick of the last toe-pick strike, -1 if none. */
  toeTick: number;
  /** A toe pick was struck at some point during this load. */
  toeInLoad: boolean;
  /** The support blade's edge code at the release tick. */
  takeoffCode: number;
  /** JUMP index, or JUMP_NONE for a hop or an unrecognised takeoff. */
  kind: number;
  /** 0 = on the required edge .. 1 = on the opposite one. */
  edgeError: number;
  /** Takeoff quality, 0..1. */
  quality: number;
  /** Blade height above the ice, m, and its rate. */
  z: number;
  vz: number;
  height: number;
  airTime: number;
  /** kg m^2 / s about the vertical. Conserved from takeoff to landing. */
  angMomentum: number;
  /** kg m^2 about the vertical. The one control a skater has in the air. */
  inertia: number;
  /** Radians turned since takeoff. */
  rotation: number;
  peakOmega: number;
}

/** A landed jump, as data/calls-and-deductions.csv would describe it. */
export interface JumpResult {
  /** Tick of the landing, -1 before the first. */
  tick: number;
  kind: number;
  /** The name-number: a triple is 3, a double axel is 2. 0 for a hop. */
  revolutions: number;
  /** Revolutions actually turned, axel's extra half included. */
  turned: number;
  /** Revolutions short of the called jump. Negative is over-rotated. */
  shortBy: number;
  /** ROTATION_CALL: clean, q, <, <<. */
  rotationCall: number;
  /** EDGE_CALL: clean, !, e. Flip and lutz only. */
  edgeCall: number;
  toe: boolean;
  takeoffQuality: number;
  landingQuality: number;
  height: number;
  airTime: number;
  peakOmega: number;
  twoFoot: boolean;
  stepOut: boolean;
  fall: boolean;
}

// ── state ───────────────────────────────────────────────────────────────────

export interface BladeState {
  contact: Vec2;      // m, world, on the ice plane
  tangent: Vec2;      // unit, in-plane, toe-ward
  tilt: number;       // rad, signed; + = top of blade leans toward perpLeft(tangent)
  contactS: number;   // 0 = heel .. 1 = toe pick; sets the effective rocker
  normalLoad: number; // N
  weight: number;     // 0..1 share of body load
  longSpeed: number;  // m/s, signed, along tangent
  /**
   * The lateral acceleration the edge could NOT supply, m/s^2. Zero while
   * holding.
   *
   * Not a slip VELOCITY, despite what "slip" suggests: it is (demand -
   * capacity) / mass, exactly the quantity src/reference/SkateSolver.cpp calls
   * Slip and then multiplies by mu_skid * dt to get a speed decrement. Naming
   * it a velocity — which the engineering package's FBladeState does — invites
   * someone downstream to integrate it a second time.
   */
  latSlipAccel: number;
  latForce: number;   // N supplied by the edge this step, signed toward perpLeft
  biteCapacity: number; // N the edge could have supplied
  demandRatio: number;  // needed / capacity. The GOE "edge quality" signal.
  turnRadius: number;   // m actually being traced (widens when the edge lets go)
  dwell: number;      // s on the current code
  code: number;
  depth: Depth;
  regime: Regime;
  inContact: boolean;
}

export interface SkaterState {
  pos: Vec2;
  vel: Vec2;
  heading: Vec2;      // unit; the support blade's tangent
  /**
   * rad/s the skater is actually turning, this tick. Derived, but kept because
   * a controller that steers has to see it — a heading demand with no rate term
   * winds the lean up and puts the skater down, measured at 2.0 s flat.
   */
  yawRate: number;
  lean: number;       // rad, + = COM leans toward perpLeft(heading)
  leanRate: number;
  leanEq: number;     // rad the current lateral acceleration would balance
  balanceError: number;
  balanceErrorTime: number;
  latAccel: number;   // m/s^2 realized toward perpLeft(heading), from the EDGE
  /**
   * m/s^2 of balance authority that did not come from an edge: arms and free
   * leg, plus the centre-of-pressure shift inside the stance when two-footed.
   * After clamping, so this is what was actually applied.
   *
   * Separate from latAccel because they are separate channels: one needs an
   * edge and a speed, the other does not. A tuning session cannot read a save
   * without seeing this, and the fall test now credits it.
   */
  intAccel: number;
  /**
   * The part of the internal authority that has been held long enough to have
   * been washed out — how far the arms already are from where they started.
   */
  intHeld: number;
  tiltCmd: number;    // rad, after the neuromuscular lag
  legLength: number;  // m, contact to COM
  legRate: number;
  comZ: number;       // m, COM height above the ice (= legLength * cos lean)
  supportFoot: Foot;
  supportMode: number; // 0 airborne / none, 1 one-foot, 2 two-foot
  /** The rate-limited knee, 0..1, as the legs have actually reached it. */
  knee: number;
  /** Seconds left in the current push; 0 when not stroking. */
  strokeTime: number;
  /** Which foot is pushing. Alternates, so a stroke sequence is two-beat. */
  strokeFoot: Foot;
  /**
   * Whether push was down last tick. Strokes are level-triggered (hold it and
   * you keep stroking); standing up after a fall is edge-triggered, because a
   * button already held when the ice arrived is not a decision to get up.
   */
  pushHeld: boolean;
  /** The jump in progress, if any. sim/jump.ts owns every field. */
  jump: JumpState;
  /** The last jump that came down, as the technical panel would read it. */
  landed: JumpResult;
  fallReason: Fall;
  fallen: boolean;
  tick: number;
  blade: [BladeState, BladeState];
}

/**
 * The rig takes floats where the shipping build will take quantized ints.
 * The tuning rig and its replay files preserve these actual floating-point
 * inputs after scheme mapping. There is no input quantizer in this rig yet;
 * a shipping quantized-input contract belongs to the C++ port.
 */
export interface SkatingInput {
  lean: number;   // -1..1, desired lean as a fraction of maxLean
  knee: number;   // 0 = straight leg .. 1 = deep bend
  weight: number; // 0 = all left foot .. 1 = all right foot
  pitch: number;  // -1 heel .. +1 toe; moves the contact along the rocker
  /**
   * -1..1, how far the two blades are tilted APART from each other.
   *
   * The body has one lean and each blade has a tilt, so (lean, leanSplit) is
   * the mean and the difference of the two tilts — an exact reparametrization
   * of controlling each blade separately, with the balance loop still solving
   * for the mean instead of being bypassed.
   *
   * Zero everywhere except control scheme C (pre-production-plan.md §3, the
   * two-foot scheme), which is what it exists for. It is also the axis a
   * crossover, mohawk or choctaw needs, since those are two-foot actions with
   * the blades on opposite edges — so it is not scaffolding for a test, it is
   * the input the element vocabulary was always going to want.
   */
  leanSplit: number;
  push: boolean;
  brake: boolean;
  /**
   * 0..1, how far the arms and free leg are held from the spin axis — the
   * bible's right-stick "carriage". Read twice by a jump and never on the ice:
   * at takeoff it is the whip that sets the angular momentum, and in the air
   * its absence is the pull-in that sets the rate.
   */
  carriage: number;
  /** A toe-pick strike, this tick. Toe jumps need one within `toeWindow` of the release. */
  toe: boolean;
}

export const NEUTRAL_INPUT: SkatingInput = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, leanSplit: 0, push: false, brake: false,
  carriage: 0, toe: false,
};

// ── events ──────────────────────────────────────────────────────────────────

export const EVENT = {
  EdgeChanged: 0, EdgeEstablished: 1, EdgeLost: 2,
  SkidBegin: 3, SkidEnd: 4, ToePickCatch: 5, Fall: 6, Recovered: 7,
  Takeoff: 8, Landing: 9,
} as const;
export type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const EVENT_NAME = [
  "EDGE CHANGED", "EDGE ESTABLISHED", "EDGE LOST",
  "SKID BEGIN", "SKID END", "TOE PICK", "FALL", "RECOVERED",
  "TAKEOFF", "LANDING",
] as const;

export interface EdgeEvent {
  tick: number;
  type: EventType;
  foot: Foot;
  prevCode: number;
  newCode: number;
  prevDwell: number;
  /** Context: tilt at a change, slip speed at a skid, lean at a fall. */
  value: number;
}
