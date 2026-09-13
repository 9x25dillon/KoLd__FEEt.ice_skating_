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

// ── moves ───────────────────────────────────────────────────────────────────

/** The move under way. One at a time; sim/moves.ts owns every field. */
export const MOVE = { None: 0, Turn: 1, Twizzle: 2, Spin: 3 } as const;
export const MOVE_NAME = ["", "TURN", "TWIZZLE", "SPIN"] as const;

/** Bits of SkaterState.movesHeld: which move buttons were down last tick. */
export const HELD = { Turn: 1, Twizzle: 2, Spin: 4 } as const;

/** A spin's basic position (data/spin-positions.json's basic_position). */
export const SPIN_POSITION = { Upright: 0, Sit: 1, Camel: 2 } as const;
export const SPIN_POSITION_NAME = ["upright", "sit", "camel"] as const;

/**
 * A spin in progress. Bible §2.5: "a continuous negotiation between speed,
 * position and centering, under a slowly draining angular momentum". The
 * angular momentum is set by the entry and never grows; the position and the
 * arms set the moment of inertia, and omega = L / I.
 */
export interface SpinState {
  /** Seconds spinning. */
  t: number;
  /** +1 anticlockwise, -1 clockwise. */
  dir: number;
  /** kg m^2 / s, a magnitude; only friction and travel take it away. */
  angMomentum: number;
  /** kg m^2 about the vertical now: the position's scale on the arms' reach. */
  inertia: number;
  /** rad/s now. */
  omega: number;
  /** Radians turned since the entry. */
  swept: number;
  /** SPIN_POSITION now. */
  position: number;
  /** Bits of SPIN_POSITION held for two revolutions or more: the data's min_revolutions. */
  positionsHeld: number;
  /** Revolutions in the current position, and the most in any one. */
  segRevs: number;
  bestSegRevs: number;
  /** rad/s, the slowest and fastest in the current position: "clear increase of speed". */
  segOmegaMin: number;
  segOmegaMax: number;
  /** The spinning foot. */
  foot: Foot;
  /** Where the spin began, and the furthest it has travelled from there, m. */
  anchor: Vec2;
  travel: number;
  fromCode: number;
  entrySpeed: number;
}

/** Which turn a pivot became, decided at the cusp by the foot the weight is on. */
export const TURN_KIND = { ThreeTurn: 0, Mohawk: 1 } as const;
export const TURN_NAME = ["three-turn", "mohawk"] as const;

/**
 * A pivot in progress — a turn or a twizzle. The blade rotates about its
 * contact while the body travels. Bible §2.3: a three turn keeps the foot and
 * changes the edge, a mohawk changes the foot and keeps the edge's character;
 * both rotate INTO the curve and leave the skater going the other way. A
 * twizzle keeps going: a travelling rotation on one foot, a cusp every half
 * revolution.
 */
export interface TurnState {
  /** Seconds into the pivot. */
  t: number;
  /** Radians the blade has pivoted against the path: 0..pi for a turn, on and on for a twizzle. */
  swept: number;
  /** +1 anticlockwise, -1 clockwise: the way the body turns. */
  dir: number;
  /** rad/s of blade pivot now: fixed for a turn, spun up and held for a twizzle. */
  rate: number;
  /** rad/s the path was turning at entry, which the body keeps through the pivot. */
  pathRate: number;
  /** +1 the turn began skating forward, -1 backward. */
  entryDir: number;
  /** The foot the pivot is made on. */
  foot: Foot;
  /** The foot that carries the exit: the same one, or the other for a mohawk. */
  exitFoot: Foot;
  /** Cusps passed — blade square to the path, the frame flipped. A turn has one. */
  cusps: number;
  /** A twizzle whose button has been let go, finishing to the next alignment. */
  release: boolean;
  /** TURN_KIND, final once past the cusp. */
  kind: number;
  /** Edge code at entry. */
  fromCode: number;
  /** Speed when the pivot began, m/s. */
  entrySpeed: number;
}

/** The last move that finished, for the panel and the tests. */
export interface MoveResult {
  /** Tick it finished; -1 before the first. */
  tick: number;
  /** MOVE. */
  kind: number;
  /** For a turn, TURN_KIND. */
  detail: number;
  /** Revolutions the blade turned against the path: a turn's half, a twizzle's count. */
  revolutions: number;
  fromCode: number;
  toCode: number;
  /** Speed lost across the move, m/s. */
  speedLost: number;
  /** A spin's: bits of SPIN_POSITION held two revolutions, the most revolutions in one, and its drift, m. */
  positions: number;
  bestSegRevs: number;
  travel: number;
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
   * The push under way is a crossover: movesMode on, and the blade tilted past
   * `crossoverLean` when it began. Fixed for the length of the push.
   */
  crossover: boolean;
  /**
   * Where the centre of that crossover's curve is: +1 toward perpLeft(heading),
   * -1 the other side, 0 for a straight stroke. Both pushes of a crossover
   * drive the body toward it — the outside foot pushing out on its inside edge,
   * the inside foot pushing under on its outside edge.
   */
  crossSide: number;
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
  /** MOVE under way. sim/moves.ts owns this and everything below it. */
  move: number;
  turn: TurnState;
  spin: SpinState;
  /** The last move that finished. */
  moveDone: MoveResult;
  /** HELD bits: which move buttons were down last tick. A move starts on a fresh press. */
  movesHeld: number;
  /**
   * How many times the body's frame has been reversed — a turn's cusp. Lean,
   * tilt and every lateral quantity are measured toward perpLeft(heading), so
   * when the heading reverses they all change sign with the physics unchanged.
   * A control scheme reads this to keep a held stick meaning the same side of
   * the ice (app/schemes.ts).
   */
  flips: number;
  /**
   * rad/s of rotation a turn leaves in the body, anticlockwise positive,
   * draining over `turnCarryTime`. A jump taken off the turn's exit edge
   * inherits it: why a salchow is entered off a three-turn.
   */
  spinCarry: number;
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
  /**
   * The turn button, held. A turn starts on the press, if the edge the skater
   * is on permits one (movesMode on). Which turn it becomes — a three-turn, or
   * a mohawk — is the foot the weight is on at the cusp.
   */
  turn: boolean;
  /** The twizzle button, held: a travelling rotation for as long as it is (movesMode on). */
  twizzle: boolean;
  /**
   * The spin button, held: a spin for as long as it is (movesMode on). The
   * position is the knee and the stick — deep knee sit, stick forward camel —
   * and the arms are carriage.
   */
  spin: boolean;
}

export const NEUTRAL_INPUT: SkatingInput = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, leanSplit: 0, push: false, brake: false,
  carriage: 0, toe: false, turn: false, twizzle: false, spin: false,
};

// ── events ──────────────────────────────────────────────────────────────────

export const EVENT = {
  EdgeChanged: 0, EdgeEstablished: 1, EdgeLost: 2,
  SkidBegin: 3, SkidEnd: 4, ToePickCatch: 5, Fall: 6, Recovered: 7,
  Takeoff: 8, Landing: 9, Turn: 10, Twizzle: 11, Spin: 12,
} as const;
export type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const EVENT_NAME = [
  "EDGE CHANGED", "EDGE ESTABLISHED", "EDGE LOST",
  "SKID BEGIN", "SKID END", "TOE PICK", "FALL", "RECOVERED",
  "TAKEOFF", "LANDING", "TURN", "TWIZZLE", "SPIN",
] as const;

export interface EdgeEvent {
  tick: number;
  type: EventType;
  foot: Foot;
  prevCode: number;
  newCode: number;
  prevDwell: number;
  /** Context: tilt at a change, slip speed at a skid, lean at a fall, TURN_KIND at a turn's cusp, revolutions at a twizzle's or a spin's end. */
  value: number;
}
