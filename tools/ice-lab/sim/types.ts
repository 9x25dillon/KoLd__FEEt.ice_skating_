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
  None: 0, LeanExceeded: 1, BalanceTimeout: 2, ToePickTrip: 3,
} as const;
export type Fall = 0 | 1 | 2 | 3;

export const FALL_NAME = ["", "LEAN EXCEEDED", "BALANCE LOST", "TOE PICK"] as const;

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
  lean: number;       // rad, + = COM leans toward perpLeft(heading)
  leanRate: number;
  leanEq: number;     // rad the current lateral acceleration would balance
  balanceError: number;
  balanceErrorTime: number;
  latAccel: number;   // m/s^2 realized toward perpLeft(heading)
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
  fallReason: Fall;
  fallen: boolean;
  tick: number;
  blade: [BladeState, BladeState];
}

/**
 * The rig takes floats where the shipping build will take quantized ints.
 * Quantization is applied at the boundary in `quantizeInput` so the tuning
 * surface stays readable while the replay stream stays honest about what a
 * gamepad can actually express.
 */
export interface SkatingInput {
  lean: number;   // -1..1, desired lean as a fraction of maxLean
  knee: number;   // 0 = straight leg .. 1 = deep bend
  weight: number; // 0 = all left foot .. 1 = all right foot
  pitch: number;  // -1 heel .. +1 toe; moves the contact along the rocker
  push: boolean;
  brake: boolean;
}

export const NEUTRAL_INPUT: SkatingInput = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, push: false, brake: false,
};

// ── events ──────────────────────────────────────────────────────────────────

export const EVENT = {
  EdgeChanged: 0, EdgeEstablished: 1, EdgeLost: 2,
  SkidBegin: 3, SkidEnd: 4, ToePickCatch: 5, Fall: 6,
} as const;
export type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const EVENT_NAME = [
  "EDGE CHANGED", "EDGE ESTABLISHED", "EDGE LOST",
  "SKID BEGIN", "SKID END", "TOE PICK", "FALL",
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
