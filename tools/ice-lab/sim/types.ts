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
  /** The boards (game/rink.ts): a hard enough hit to fall, rather than bounce off. Game-only. */
  Collision: 5,
  /** pitchMode 1: the body pitched past what the blade could catch, toward toe or heel. */
  Pitched: 6,
} as const;
export type Fall = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const FALL_NAME = ["", "LEAN EXCEEDED", "BALANCE LOST", "TOE PICK", "LANDING", "BOARDS", "PITCHED"] as const;

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
  /** Tick of the last wind-up flick against the rotation, -1 if none or cancelled. */
  windupTick: number;
  /** How far that flick went, 0..1, over the flicks still inside the window. */
  windupPeak: number;
  /** The release came inside the wind-up window: the assist is flying this jump. */
  armed: boolean;
  /** Radians the assist is flying the rotation to; 0 when it is not. */
  target: number;
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
  /** The jump was wound up, and the assist flew its arms. */
  armed: boolean;
}

// ── moves ───────────────────────────────────────────────────────────────────

/** The move under way. One at a time; sim/moves.ts owns every field. */
export const MOVE = { None: 0, Turn: 1, Twizzle: 2, Spin: 3, InaBauer: 4, Spiral: 5 } as const;
export const MOVE_NAME = ["", "TURN", "TWIZZLE", "SPIN", "INA BAUER", "SPIRAL"] as const;

/** Bits of SkaterState.movesHeld: which move buttons were down last tick. */
export const HELD = { Turn: 1, Twizzle: 2, Spin: 4, InaBauer: 8, Bracket: 16, Toe: 32 } as const;

/**
 * An Ina Bauer in progress: both feet down on parallel tracks, the lead foot
 * skating forward and the trailing foot backward, toes turned out, the body
 * side-on to the travel. No other move is a two-foot glide with the blades
 * pointing opposite ways, so it is the one move the carve itself skates.
 */
export interface InaBauerState {
  /** The foot skating forward; the other trails, backward. */
  lead: Foot;
  t: number;
  fromCode: number;
  entrySpeed: number;
}

/**
 * A Spiral in progress: data/motion-primitives.json's own "spiral" — one
 * blade down, the free leg extended, any direction (unlike the Ina Bauer,
 * which the data restricts to forward). The free foot's own weight already
 * goes to zero through the ordinary carve's ["1 - weightR", "weightR"] load
 * split (solver.ts) the moment the skater stands on one blade — this state
 * only marks the moment deliberate, and times it.
 */
export interface SpiralState {
  /** The one loaded foot, snapshotted at entry. */
  foot: Foot;
  t: number;
  fromCode: number;
  entrySpeed: number;
}

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
  /** kg m^2 / s, a magnitude; friction and travel take it away, a held reversal checks and regenerates it. */
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
  /** The spinning foot. Toggles across a completed foot change (sim/moves.ts spinTick). */
  foot: Foot;
  /** Where the spin began, and the furthest it has travelled from there, m. */
  anchor: Vec2;
  travel: number;
  fromCode: number;
  entrySpeed: number;

  // ── the foot change (data/spin-features.json's change_foot_by_jump,
  // difficult_change_of_foot, all_three_positions_second_foot) ────────────
  /** A brief, airborne foot change is under way — `foot` has not yet toggled. */
  changingFoot: boolean;
  /** Seconds into the current change, while `changingFoot`. */
  changeAirT: number;
  /** omega and SPIN_POSITION at the moment the change was triggered — for scoring the completed one. */
  changeStartOmega: number;
  changeStartPosition: number;
  /** s.tick the most recently completed change finished on, or -1 if none yet this spin. */
  changeCompletedTick: number;
  changeAirTimeS: number;
  /** Revolutions not swept during the air time, at the pre-change rate — what "lost" means here. */
  changeRevolutionsLost: number;
  /** Whether SPIN_POSITION also differs across the change (difficult_change_of_foot). */
  changePositionChanged: boolean;
}

/** Which turn a pivot became, decided at the cusp by the foot the weight is on. */
/**
 * Bible §2.3's taxonomy is two axes: does the foot change, and does the body
 * rotate into the curve or against it. ThreeTurn (same foot, into) and
 * Mohawk (foot changes, into) were built first; Bracket (same foot, against)
 * reuses every tick of that same pivot, entering with `dir` reversed
 * (sim/moves.ts's `against`).
 *
 * The fourth cell is NOT a choctaw. `flipFrame` negates both blades' tilt
 * unconditionally, so which edge character comes out the other side —
 * preserved (mohawk) or changed (three-turn, bracket) — falls out of which
 * FOOT the exit lands on, by the body's own left/right mirror, never from
 * `dir`'s sign. A real choctaw changes edge character on a NEW foot, which
 * needs a mechanism this rig does not have (measured by trying: an "against
 * + foot change" built this way lands on the same preserved edge a mohawk
 * does, just rotated the other way — no ISU turn is that). So a bracket
 * cannot become anything at its cusp; weight is ignored while `against`.
 *
 * Loop, the fourth, is not a fifth axis: it is the SAME pivot (data/motion-
 * primitives.json's own `post: {foot: same, edge: same, forward: same}`) run
 * through two cusps back to back instead of one — a second flipFrame at
 * 3π/2 undoes the first, so the exit lands back on the entry edge and foot,
 * having swept 2π instead of π. Requested by holding `turn` THROUGH the
 * ordinary cusp instead of letting it check out at π (sim/moves.ts's
 * `turnPivot`); a bracket has no loop sibling, the same reason it has no
 * mohawk one — `against` is not read again once the pivot is under way.
 *
 * Rocker and Counter, the fifth and sixth, were the one gap genuinely
 * re-examined and found buildable after all — the note above ("no edge
 * change at all") was wrong about what `travelSense` actually does. It does
 * not track how far anything has rotated; `endPivot` builds the exit frame
 * from `mul(s.vel, travelSense(T) / speed)` — CURRENT velocity, signed. Its
 * only job is "does the exit blade face WITH the body's own momentum
 * (forward) or AGAINST it (backward)". A three-turn/bracket/mohawk flips
 * that sign once, at the one cusp they have — the exit faces backward
 * relative to a momentum that never itself reversed (a three-turn does not
 * stop the skater; it reverses which way the blade meets that continuing
 * momentum). A loop flips it twice, net unchanged, over two cusps. Rocker
 * and Counter need a THIRD case travelSense must special-case explicitly:
 * one cusp, `flipFrame` runs exactly once (so the edge character changes,
 * same as a three-turn's own single flip) — but travelSense stays
 * `entryDir` regardless, because a rocker's whole point is that the exit
 * still faces the way the momentum is already going. Requested at the same
 * cusp as Loop, distinguished by the stick: held through with the SAME
 * sense as the entry curve continues it (Loop); held through PUSHED AGAINST
 * the entry curve's own sense asks to reverse the lobe instead (Rocker from
 * `turn`, Counter from `bracket` — the same into/against split as
 * ThreeTurn/Bracket carries over, since nothing else distinguishes them
 * once the edge outcome no longer does). The comparison itself is against
 * the entry curve's own sense (`T.against ? -T.dir : T.dir`, sim/moves.ts's
 * `curveSense`), not `T.dir` directly — `against` already inverts `T.dir`
 * from the curve once, at entry, and reading it raw would make a bracket's
 * own UNCHANGED entry stick misread as a reversal request. `T.reverseHeld`
 * tracks the push as a running max across the whole pre-cusp half, not a
 * single-tick snapshot — a real stick, and a digital one scaled down by
 * game/controls.ts's own "manageable shallow edge", will not reliably peak
 * on the exact tick the cusp happens to land on.
 *
 * Choctaw, the seventh, is the new-foot edge change the fourth-cell note
 * above says flipFrame cannot give — so it skips flipFrame. The cusp still
 * counts (travelSense reverses: forward becomes backward, as data/motion-
 * primitives.json's `forward: flip` asks) and the weight still moves to the
 * other foot, but the lean frame is left alone: an unchanged tilt on the
 * mirrored foot IS the opposite edge character (`edge: opposite`), and with
 * travel reversed it curves the other way — the lobe reverses. Requested as
 * a mohawk's weight shift plus a rocker's reversal: `turn` held through the
 * cusp, stick pushed against the entry curve, weight on the other foot.
 * Only from `turn` — a bracket still ignores weight, as above.
 */
export const TURN_KIND = { ThreeTurn: 0, Mohawk: 1, Bracket: 2, Loop: 3, Rocker: 4, Counter: 5, Choctaw: 6 } as const;
export const TURN_NAME = ["three-turn", "mohawk", "bracket", "loop", "rocker", "counter", "choctaw"] as const;

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
  /** Entered rotating against the curve rather than into it: a bracket. */
  against: boolean;
  /** Edge code at entry. */
  fromCode: number;
  /** Speed when the pivot began, m/s. */
  entrySpeed: number;
  /**
   * Running max of the reversal push (Math.max(0, -dir * leanAxis)), sampled
   * every tick from entry to the first cusp — not a single-tick snapshot, the
   * same reason a real stick or a scaled-down digital one still reaches a
   * Rocker/Counter even if it never happens to be at its own peak on the
   * exact cusp tick. See turnPivot's own comment.
   */
  reverseHeld: number;
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
  /** How long it lasted, s. The data holds an Ina Bauer to 1.8 s at the least. */
  seconds: number;
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
  /**
   * A crossover push's beat-window outcome (sim/music.ts), as a multiple of a
   * hit's impulse: 1 off `musicMode` or on a straight stroke, `musicMissedPushScale`
   * on a crossover push that missed tempo. Fixed for the length of the push,
   * the way `crossover` and `crossSide` are.
   */
  strokeMusicScale: number;
  /** The current stroke's pushPower, when its push gave one (absent otherwise). */
  strokeScale?: number;
  /** The current stroke's pushKnee, when its push gave one (absent otherwise). */
  strokeKnee?: number;
  /** The jump in progress, if any. sim/jump.ts owns every field. */
  jump: JumpState;
  /** The last jump that came down, as the technical panel would read it. */
  landed: JumpResult;
  /** MOVE under way. sim/moves.ts owns this and everything below it. */
  move: number;
  turn: TurnState;
  spin: SpinState;
  inaBauer: InaBauerState;
  spiral: SpiralState;
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
  /**
   * torqueMode 1 only (absent otherwise, so no digest before stage C moves):
   * the upper body's angle against the lower, rad, counter-clockwise
   * positive, and its rate; and how far the lower body's yaw rate has been
   * twisted off what its edges carve (yawDev, rad/s). s.yawRate is then the
   * carve's rate plus yawDev.
   */
  twist?: number;
  twistRate?: number;
  yawDev?: number;
  /** torqueMode 1 only: last tick's carve rate, rad/s, against which yawDev keeps the body's spin. */
  yawSteer?: number;
  /**
   * footMode 1 only: each foot's angle in its hip, rad, [left, right], toe out
   * positive. The blades point off the body's heading by these; s.heading is
   * then the body's own, not the support blade's.
   */
  footAngle?: [number, number];
  /** freeLegMode 1 only: the free leg's angle round the body against the hips, rad, counter-clockwise positive, and its rate. */
  freeSwing?: number;
  freeSwingRate?: number;
  /** freeLegMode 1 only: last tick's asked swing, rad, so the hip knows how fast it is being asked to move. */
  freeSwingTarget?: number;
  /**
   * pitchMode 1 only: the body's fore-aft lean, rad, + toward the support
   * blade's toe, and its rate; the contact's offset along the blade from its
   * centre, m, + toward the toe; and how long the pendulum's capture point
   * has sat off the blade, s.
   */
  pitch?: number;
  pitchRate?: number;
  pitchContact?: number;
  pitchOffTime?: number;
  /**
   * pitchMode 1 only, observability: each blade's contact as the input asked
   * for it, 0 heel .. 1 toe (what pitchMode 0 would have placed), beside
   * blade[i].contactS, where the ankle actually has it; and the angular
   * impulse the blades' pushes gave the body this tick, N m s, counter-
   * clockwise positive — non-zero while a dig winds. Read-only for the
   * physics, except under the test oracle `digOracle`.
   */
  contactAsked?: [number, number];
  digL?: number;
  /**
   * Accumulated musical credit (sim/music.ts): a turn's cusp or a jump's
   * landing that landed within `musicAccentWindow` of an accent, phrase-weighted.
   * Tracked and replay-safe; not yet spent by sim/score.ts.
   */
  musicCredit: number;
  /**
   * Two stamina pools (design-bible.md §2.8), 1 fresh .. 0 spent. Both start
   * at 1 and stay there while `staminaMode` is 0 — every preset.
   *
   *   wind   aerobic: drains from elapsed time and speed^2, continuously;
   *          recovers only while genuinely low-effort, and slowly.
   *   legs   anaerobic: drains from pushes, deep edges, jumps and sit spins;
   *          recovers the same way wind does, but gated BY wind — once wind
   *          is low, legs stop coming back. Feeds jump height, how tight a
   *          spin or jump air position can pull in, how deep an edge the
   *          skater can still hold, and balance noise.
   */
  wind: number;
  legs: number;
  /**
   * The operator's own bridge between the musical and career layers:
   * "the stamina, strength, flow state and hype from successive trick
   * landing... engaging more and more assist engines with performance
   * increases." 0..1, built from clean landings — more if one also lands
   * within `musicAccentWindow` of an accent (sim/music.ts) — and spent down
   * by time and by a fall. Feeds a small, temporary loosening of control
   * latency, recovery authority and angulation while `hypeMode` is on.
   * Flow itself (bible §2.6) is a separate, still-unbuilt system.
   */
  hype: number;
  /** Consecutive clean landings (no fall, step-out or two-foot). Resets on
   *  any landing that is not, and on a fall. */
  hypeStreak: number;
  /**
   * The flow scalar, design-bible.md §2.6: 0..1, integrated continuously.
   * Rises on a real, unskidded edge, continuous motion, and an alternating
   * lobe; falls on a skid, a flat blade, stopping, re-crossing already-
   * damaged ice, or a repeated lobe. Feeds stamina efficiency (bible: "high
   * flow means... cheaper to skate well") while both `flowMode` and
   * `staminaMode` are on. "Turns on the beat grid" is only partly modelled
   * (a beat-grid bonus, not the full table); README.md says so.
   */
  flow: number;
  /**
   * The curvature-direction tracker flow's own "alternating lobes"/
   * "repeated lobes in the same direction" bullets need (solver.ts §14):
   * one signal, not two. `lobeDir` is the CURRENTLY active lobe's sign
   * (-1/1), or 0 while in a sustained gap between lobes (a flat blade, a
   * skid, or a direct reversal too brief to count as its own gap never
   * actually clears it — see solver.ts). `lobeLastDir` is the most
   * recently ENDED lobe's sign, kept across the gap on purpose — a brief
   * glide between two pushes does not erase which way the skater was
   * curving before it, which is what lets a genuine repeat (curve left,
   * glide, curve left again) read as one instead of every new lobe
   * reading as an alternation by construction. `lobeCandDir`/`lobeCandT`
   * debounce a fresh sign for `flowLobeMinHoldTime` before it is allowed
   * to change either of the above.
   */
  lobeDir: number;
  lobeLastDir: number;
  lobeCandDir: number;
  lobeCandT: number;
  /** Cumulative counts of established lobe transitions, like `flips`: how many opposed vs matched the lobe before them. */
  lobeAlternations: number;
  lobeRepeats: number;
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
  /**
   * -1..1, how far the two blades' heel/toe contact is set APART, as
   * `leanSplit` does for tilt: left blade at pitch - pitchSplit, right at
   * pitch + pitchSplit. Rock one foot onto its toe while the other holds.
   *
   * Optional and absent unless a two-blade mapping drives it, so every input
   * and replay recorded without it is unchanged; absent reads as 0.
   */
  pitchSplit?: number;
  /**
   * -1..1, the two knees' commands set apart: left leg at knee - kneeSplit,
   * right at knee + kneeSplit. The standing leg's bend sets the load and the
   * jump; the pushing leg's sets the push. Optional like `pitchSplit`.
   */
  kneeSplit?: number;
  /**
   * -1..1, both feet turned in the hips: +1 toe out as far as turnout allows,
   * -1 toe in as far as hipInternal allows (footMode 1). toeOutSplit sets them
   * apart, left at toeOut - split and right at toeOut + split. Optional,
   * absent reads as 0.
   */
  toeOut?: number;
  toeOutSplit?: number;
  /**
   * With `push`: which foot pushes (0 left, 1 right) instead of the two-beat
   * alternation, and how hard, 0..1 of the athlete's stroke. Optional, for a
   * setup that pushes a chosen leg (the Experimental setup's pumps and thumb
   * strokes); absent, a push is exactly as it was.
   */
  pushFoot?: number;
  pushPower?: number;
  /**
   * With `push`: the bend the pushing leg extends from, 0..1. The push is the
   * leg straightening, so its force follows this bend easing to nothing over
   * the stroke, instead of the knee as it now stands. Optional; absent, the
   * stroke reads the pushing leg's knee as it always has.
   */
  pushKnee?: number;
  /**
   * 0..1, the free leg's swing (freeLegMode): 0 behind, 1 forward and round.
   * Optional; absent the leg rests midway.
   */
  freeLeg?: number;
  push: boolean;
  brake: boolean;
  /**
   * 0..1, how far the arms and free leg are held from the spin axis — the
   * bible's right-stick "carriage". Read twice by a jump and never on the ice:
   * at takeoff it is the whip that sets the angular momentum, and in the air
   * its absence is the pull-in that sets the rate.
   */
  carriage: number;
  /**
   * -1..1, the arms and shoulders wound round the body's axis: positive is
   * clockwise, AGAINST the counter-clockwise rotation every jump here turns.
   * A flick past `windupThreshold` within `windupWindow` of the release is the
   * commitment that arms the jump's assist (`jumpAssist`, sim/jump.ts); a flick
   * the other way cancels it. Zero, the jump is exactly the manual one.
   */
  windup: number;
  /** A toe-pick strike, this tick. Toe jumps need one within `toeWindow` of the release. */
  toe: boolean;
  /**
   * The turn button, held. A turn starts on the press, if the edge the skater
   * is on permits one (movesMode on). Which turn it becomes — a three-turn, or
   * a mohawk — is the foot the weight is on at the cusp.
   */
  turn: boolean;
  /**
   * The bracket button, held: the same pivot as `turn`, entered rotating
   * against the curve instead of into it (movesMode on). Weight at the cusp
   * does nothing here — a bracket has no foot-changing sibling in this rig;
   * see TURN_KIND's own comment for why a "choctaw" built the same way is
   * not actually one.
   */
  bracket: boolean;
  /** The twizzle button, held: a travelling rotation for as long as it is (movesMode on). */
  twizzle: boolean;
  /**
   * The spin button, held: a spin for as long as it is (movesMode on). The
   * position is the knee and the stick — deep knee sit, stick forward camel —
   * and the arms are carriage.
   */
  spin: boolean;
  /** The Ina Bauer, held: the trailing foot turned out backward beside the lead (movesMode on). */
  inaBauer: boolean;
}

export const NEUTRAL_INPUT: SkatingInput = {
  lean: 0, knee: 0.35, weight: 0.5, pitch: 0, leanSplit: 0, push: false, brake: false,
  carriage: 0, windup: 0, toe: false, turn: false, bracket: false, twizzle: false, spin: false, inaBauer: false,
};

// ── events ──────────────────────────────────────────────────────────────────

export const EVENT = {
  EdgeChanged: 0, EdgeEstablished: 1, EdgeLost: 2,
  SkidBegin: 3, SkidEnd: 4, ToePickCatch: 5, Fall: 6, Recovered: 7,
  Takeoff: 8, Landing: 9, Turn: 10, Twizzle: 11, Spin: 12, InaBauer: 13,
  MusicHit: 14, MusicMiss: 15, MusicAccent: 16, Spiral: 17,
} as const;
export type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

export const EVENT_NAME = [
  "EDGE CHANGED", "EDGE ESTABLISHED", "EDGE LOST",
  "SKID BEGIN", "SKID END", "TOE PICK", "FALL", "RECOVERED",
  "TAKEOFF", "LANDING", "TURN", "TWIZZLE", "SPIN", "INA BAUER",
  "MUSIC HIT", "MUSIC MISS", "MUSIC ACCENT", "SPIRAL",
] as const;

export interface EdgeEvent {
  tick: number;
  type: EventType;
  foot: Foot;
  prevCode: number;
  newCode: number;
  prevDwell: number;
  /** Context: tilt at a change, slip speed at a skid, lean at a fall, TURN_KIND at a turn's cusp, revolutions at a twizzle's or a spin's end, seconds held at an Ina Bauer's end. */
  value: number;
}
