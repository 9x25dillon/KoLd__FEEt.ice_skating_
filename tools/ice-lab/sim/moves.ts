// tools/ice-lab/sim/moves.ts — the moves: turns and twizzles.
//
// Pure functions over the skater state, called from step() and nowhere else,
// like sim/jump.ts. Every one is a no-op unless movesMode is on, which it is in
// no preset, so every number recorded without the moves still measures the
// same thing.
//
// ── A TURN ──────────────────────────────────────────────────────────────────
//
// Bible §2.3: a turn is classified by whether the foot changes, whether the
// edge changes, and whether the body rotates with the curve or against it. A
// three-turn keeps the foot, changes the edge and rotates INTO the curve; a
// mohawk changes the foot, keeps the edge's character, and rotates into the
// curve. Both leave the skater travelling the other way — which is how a
// skater gets backward, and so how most jumps are reached: five of the six
// take off backward (data/jump-definitions.csv), and the salchow's entry
// template is "a forward outside three turn onto the back inside edge".
//
// The model is a pivot. The body keeps the arc it was on; the blade, lifted
// onto its rocker, turns half a revolution about its contact, scraping across
// the path as it goes; at the cusp — a quarter of the way round, blade square
// to the path — the frame the lean is measured in reverses; at the end the
// blade is aligned with the path again, pointing the other way, and carving
// resumes on the exit edge. Nothing about the circle changes: the same body
// lean toward the same centre, the same blade tilt magnitude, and so the same
// radius, now on a backward edge.
//
// THE CUSP IS A CHANGE OF FRAME, NOT OF PHYSICS. Lean, tilt, and every lateral
// quantity in the state are measured toward perpLeft(heading). Reverse the
// heading and each of them changes sign while the body does nothing at all: a
// skater leaning toward the centre of a clockwise circle on RFO is still
// leaning toward it on RBI. So the cusp negates them all at once
// (`flipFrame`), and the edge code flips from outside to inside in the same
// tick, because the classifier reads the side from the sign of the tilt.
// Which is exactly what a three-turn does to an edge.
//
// Through the pivot the pendulum is kept in the TRAVEL frame — the path
// direction, forward before the cusp and backward after — because the blade
// frame spends the middle of the turn at right angles to the lean, where a
// one-axis pendulum has nothing to say.
//
// ── A TWIZZLE ───────────────────────────────────────────────────────────────
//
// Bible §2.1: "travelling rotation on one foot; hold to sustain, stick to
// steer". The same pivot, kept going: the blade spins up to `twizzleRate` —
// slower with the arms out — with a cusp every half revolution, while the body
// travels on and the stick bends its path. Let go and it finishes to the next
// alignment with the path, forward or backward, whichever comes first, which
// is what makes the exit direction the skater's choice of moment
// (data/motion-primitives.json: "the exit direction is solver-selectable").
// A twizzle is skated upright over the foot: the body is held at the lean its
// path needs rather than balanced through a loop no one can steer at 2.5
// revolutions a second.
//
// ── A SPIN ──────────────────────────────────────────────────────────────────
//
// Bible §2.5: "a continuous negotiation between speed, position and
// centering, under a slowly draining angular momentum". The entry hooks the
// skater's travel into rotation — m v spinArm of it, cleaner with the upper
// body checked (carriage at the press) — and after that L only ever falls:
// blade friction, and more of it the further the spin drifts ("a wobbling spin
// dies fast"). The position sets the moment of inertia from
// data/spin-positions.json's inertia_scale on the open baseline, the arms move
// it between tucked and open at the rate a jump's pull-in does, and omega is
// L / I: a camel is slow and an upright fast, emergently, as that file says.
// Knee deep is a sit, stick forward a camel; change position mid-spin and the
// speed changes with it, which is what a combination spin is.
//
// The spinning blade is on the back edge that curves the way the spin turns —
// LBI anticlockwise on the left foot, RBO on the right — and letting go checks
// out: pushed away backward at `spinExitSpeed` onto the back outside edge of
// the foot that lands the rotation.
//
// ── AN INA BAUER ────────────────────────────────────────────────────────────
//
// Both feet down on parallel tracks, the lead foot skating forward and the
// trailing foot backward, toes turned out, the body side-on. It is the one move
// the carve skates itself: the trailing blade's tangent is reversed, so its
// tilt is the body's lean read in a reversed frame, its long speed is negative,
// and the classifier calls it a back edge. Lean toward the lead foot's side and
// both blades are on outside edges — LFO and RBO, the data's Ina Bauer — lean
// the other way and both are inside. The lead foot is the one on the side the
// body leans at the press, so the outside edges are what a press gives. The
// body side-on to the travel has more drag, and nobody turns a foot out a full
// 180 degrees, so the trailing blade scrapes a little: together, calibrated to
// data/motion-primitives.json's -1.1 m/s over 6 m at 6 m/s.

import { rotate, normalizeOr, len, mul, dot, sin, tan, atan2, sign, clamp, lerp, moveToward } from "./math.ts";
import { MOVE, TURN_KIND, FOOT, EVENT, EDGE_CODE_NONE, REGIME, SPIN_POSITION, DIR, EDGE, makeCode } from "./types.ts";
import type { SkaterState, TurnState, SpinState, InaBauerState, SpiralState, MoveResult, EdgeEvent, Foot } from "./types.ts";
import type { Params } from "./params.ts";
import { effectiveRocker } from "./blade.ts";
import { JUMP_PHASE } from "./jump.ts";

/** Seconds a twizzle takes to spin up from a turn's pivot rate to its own. */
const TWIZZLE_SPINUP = 0.15;
/** Seconds a twizzle's body settles to the lean its path needs. */
const TWIZZLE_SETTLE = 0.15;

export function newTurn(): TurnState {
  return {
    t: 0, swept: 0, dir: 0, rate: 0, pathRate: 0, entryDir: 1,
    foot: FOOT.Right, exitFoot: FOOT.Right, cusps: 0, release: false, kind: TURN_KIND.ThreeTurn,
    against: false, fromCode: EDGE_CODE_NONE, entrySpeed: 0, reverseHeld: 0,
  };
}

export function noMove(): MoveResult {
  return {
    tick: -1, kind: MOVE.None, detail: 0, revolutions: 0,
    fromCode: EDGE_CODE_NONE, toCode: EDGE_CODE_NONE, speedLost: 0, seconds: 0,
    positions: 0, bestSegRevs: 0, travel: 0,
  };
}

export function newInaBauer(): InaBauerState {
  return { lead: FOOT.Right, t: 0, fromCode: EDGE_CODE_NONE, entrySpeed: 0 };
}

/**
 * Start an Ina Bauer: moves on, skating forward (the data's `pre`), fast
 * enough to glide. The trailing foot is turned out to point backward beside
 * the lead. `lean` is the body's lean command: the lead foot is on its side.
 */
export function inaBauerStart(s: SkaterState, p: Params, lean: number): boolean {
  if (p.movesMode < 1 || s.fallen || s.move !== MOVE.None || s.jump.phase === JUMP_PHASE.Air) return false;
  const speed = len(s.vel);
  if (speed < p.inaBauerMinSpeed || dot(s.vel, s.heading) <= 0) return false;
  const B = s.inaBauer;
  B.lead = (lean > 0.02 ? FOOT.Left : lean < -0.02 ? FOOT.Right : s.supportFoot) as Foot;
  B.t = 0;
  B.fromCode = s.blade[s.supportFoot].code;
  B.entrySpeed = speed;
  const trail = s.blade[1 - B.lead];
  trail.tangent = { x: -s.heading.x, y: -s.heading.y };
  s.move = MOVE.InaBauer;
  s.strokeTime = 0;
  s.crossover = false;
  return true;
}

/** Bring the trailing foot back beside the lead, forward: an ordinary two-foot glide. */
export function inaBauerEnd(s: SkaterState, events: EdgeEvent[]): void {
  const B = s.inaBauer;
  const lead = s.blade[B.lead], trail = s.blade[1 - B.lead];
  trail.tangent = { x: lead.tangent.x, y: lead.tangent.y };
  const r = s.moveDone;
  r.tick = s.tick; r.kind = MOVE.InaBauer; r.detail = B.lead; r.revolutions = 0;
  r.fromCode = B.fromCode; r.toCode = lead.code; r.speedLost = B.entrySpeed - len(s.vel); r.seconds = B.t;
  r.positions = 0; r.bestSegRevs = 0; r.travel = 0;
  s.move = MOVE.None;
  events.push({
    tick: s.tick, type: EVENT.InaBauer, foot: B.lead,
    prevCode: B.fromCode, newCode: lead.code, prevDwell: B.t, value: B.t,
  });
}

export function newSpiral(): SpiralState {
  return { foot: FOOT.Right, t: 0, fromCode: EDGE_CODE_NONE, entrySpeed: 0 };
}

/**
 * Start a Spiral: one blade down, moving, any direction — data/motion-
 * primitives.json's own "spiral", `pre.forward: "any"` unlike the Ina
 * Bauer's forward-only. The free foot's load is already at or near zero
 * (solver.ts's ordinary `[1 - weightR, weightR]` split) the moment the
 * skater is standing on one blade; this only marks holding that on purpose.
 */
export function spiralStart(s: SkaterState, p: Params): boolean {
  if (p.movesMode < 1 || s.fallen || s.move !== MOVE.None || s.jump.phase === JUMP_PHASE.Air) return false;
  const speed = len(s.vel);
  if (speed < p.spiralMinSpeed) return false;
  const Sp = s.spiral;
  Sp.foot = s.supportFoot;
  Sp.t = 0;
  Sp.fromCode = s.blade[s.supportFoot].code;
  Sp.entrySpeed = speed;
  s.move = MOVE.Spiral;
  s.strokeTime = 0;
  s.crossover = false;
  return true;
}

/** Letting go, falling, or slowing too far ends it — the free leg comes back down. */
export function spiralEnd(s: SkaterState, events: EdgeEvent[]): void {
  const Sp = s.spiral;
  const b = s.blade[Sp.foot];
  const r = s.moveDone;
  r.tick = s.tick; r.kind = MOVE.Spiral; r.detail = Sp.foot; r.revolutions = 0;
  r.fromCode = Sp.fromCode; r.toCode = b.code; r.speedLost = Sp.entrySpeed - len(s.vel); r.seconds = Sp.t;
  r.positions = 0; r.bestSegRevs = 0; r.travel = 0;
  s.move = MOVE.None;
  events.push({
    tick: s.tick, type: EVENT.Spiral, foot: Sp.foot,
    prevCode: Sp.fromCode, newCode: b.code, prevDwell: Sp.t, value: Sp.t,
  });
}

/**
 * data/spin-positions.json's inertia_scale for the three basic positions, on
 * its 4.0 kg m^2 open baseline — transcribed, because sim/ cannot read a file;
 * test/spin.test.ts holds them to the file.
 */
export const SPIN_INERTIA_SCALE = [1.0, 1.25, 2.2] as const;

/** Radians of blade tilt on the spinning edge: a shallow back edge, well clear of flat. */
const SPIN_EDGE = 0.26;
/** m/s the classifier is told the spinning contact moves backward at: it is on a back edge. */
const SPIN_BLADE_SPEED = 0.5;
/** Seconds a spinning body settles upright over the foot. */
const SPIN_SETTLE = 0.2;

export function newSpin(): SpinState {
  return {
    t: 0, dir: 0, angMomentum: 0, inertia: 0, omega: 0, swept: 0,
    position: SPIN_POSITION.Upright, positionsHeld: 0, segRevs: 0, bestSegRevs: 0,
    segOmegaMin: 0, segOmegaMax: 0, foot: FOOT.Right, anchor: { x: 0, y: 0 }, travel: 0,
    fromCode: EDGE_CODE_NONE, entrySpeed: 0,
    changingFoot: false, changeAirT: 0, changeStartOmega: 0, changeStartPosition: SPIN_POSITION.Upright,
    changeCompletedTick: -1, changeAirTimeS: 0, changeRevolutionsLost: 0, changePositionChanged: false,
  };
}

/**
 * Reverse the frame every lateral quantity is measured in. The body and the
 * ice are untouched; only the signs that describe them against the heading
 * change. See the header.
 */
export function flipFrame(s: SkaterState): void {
  s.lean = -s.lean;
  s.leanRate = -s.leanRate;
  s.leanEq = -s.leanEq;
  s.balanceError = -s.balanceError;
  s.latAccel = -s.latAccel;
  s.intAccel = -s.intAccel;
  s.intHeld = -s.intHeld;
  s.tiltCmd = -s.tiltCmd;
  s.crossSide = -s.crossSide;
  for (const b of s.blade) { b.tilt = -b.tilt; b.latForce = -b.latForce; }
  s.flips++;
}

/** Whether a pivot is under way — a turn or a twizzle. */
export const pivoting = (s: SkaterState): boolean => s.move === MOVE.Turn || s.move === MOVE.Twizzle;

/** Whether a move is standing in for the carve this tick: a pivot, or a spin. */
export const replacesCarve = (s: SkaterState): boolean => pivoting(s) || s.move === MOVE.Spin;

/** +1 while the travel frame points the way the pivot began, -1 after an odd number of cusps. */
// A rocker or counter never reverses travel — that is the whole distinction
// from a three-turn/bracket (bible §2.3, sim/types.ts's own TURN_KIND
// comment): the lobe (curve sense) reverses, the direction facing it does
// not. Every other kind alternates on cusp parity, the way it always has.
const travelSense = (T: TurnState): number =>
  (T.kind === TURN_KIND.Rocker || T.kind === TURN_KIND.Counter || T.cusps % 2 === 0) ? T.entryDir : -T.entryDir;

/** The foot a pivot in progress has its weight on. */
export function turnLoadFoot(s: SkaterState): Foot {
  return s.turn.cusps > 0 ? s.turn.exitFoot : s.turn.foot;
}

/**
 * The heading the pendulum is measured against during a pivot: the direction
 * of travel, the way the pivot began until the first cusp, then alternating.
 */
export function turnFrame(s: SkaterState): { x: number; y: number } {
  const v = len(s.vel);
  return v > 1e-6 ? mul(s.vel, travelSense(s.turn) / v) : s.blade[turnLoadFoot(s)].tangent;
}

/** What every pivot shares at its start. Returns false when there is nothing to pivot on. */
function beginPivot(s: SkaterState, p: Params, minSpeed: number, needEdge: boolean, against = false): boolean {
  if (p.movesMode < 1 || s.fallen || s.move !== MOVE.None || s.jump.phase === JUMP_PHASE.Air) return false;
  const b = s.blade[s.supportFoot];
  const speed = len(s.vel);
  if (!b.inContact || speed < minSpeed) return false;
  if (needEdge && Math.abs(b.tilt) < p.flatThreshold) return false;
  const T = s.turn;
  // Into the curve: the way the path is already turning. A twizzle off a flat
  // blade has no curve to follow and turns anticlockwise, the rig's rotation.
  // `against` reverses it — a bracket or a choctaw fights the curve instead
  // (bible §2.3): the button that asked for one, not a twizzle's own choice.
  const pathSense = sign(b.tilt) * sign(b.longSpeed);
  if (pathSense === 0 && needEdge) return false;
  T.t = 0;
  T.swept = 0;
  T.dir = pathSense !== 0 ? (against ? -pathSense : pathSense) : 1;
  T.against = against;
  // The front of the rocker is tighter and turns faster: that is what "on the
  // rocker" buys, and it is why a skater rocks forward into a turn.
  T.rate = (Math.PI / p.turnTime) * (p.rocker / effectiveRocker(b.contactS, p));
  T.pathRate = s.yawRate;
  T.entryDir = b.longSpeed >= 0 ? 1 : -1;
  T.foot = s.supportFoot;
  T.exitFoot = s.supportFoot;
  T.cusps = 0;
  T.release = false;
  T.kind = against ? TURN_KIND.Bracket : TURN_KIND.ThreeTurn;
  T.fromCode = b.code;
  T.entrySpeed = speed;
  T.reverseHeld = 0;
  s.strokeTime = 0;
  s.crossover = false;
  return true;
}

/**
 * Start a turn, if the edge the skater is on permits one: moves on, on the
 * ice, one blade on an edge, moving. `against` asks for a bracket (or, with a
 * foot change at the cusp, a choctaw) instead of a three-turn or mohawk.
 * Returns whether it started.
 */
export function turnStart(s: SkaterState, p: Params, against = false): boolean {
  if (!beginPivot(s, p, p.turnMinSpeed, true, against)) return false;
  s.move = MOVE.Turn;
  return true;
}

/** Start a twizzle: moves on, on the ice, moving at least `twizzleMinSpeed`. */
export function twizzleStart(s: SkaterState, p: Params): boolean {
  if (!beginPivot(s, p, p.twizzleMinSpeed, false)) return false;
  s.move = MOVE.Twizzle;
  return true;
}

/** Turn the body's path and pivot the blades by one tick; scrape off speed. Returns the speed. */
function pivotStep(s: SkaterState, p: Params, dt: number, stepAngle: number, scrub: number): number {
  const T = s.turn;
  // The body keeps its arc; both blades turn with the pivot (the free foot
  // goes round with the hips).
  const dPath = T.pathRate * dt;
  s.vel = rotate(s.vel, dPath);
  for (const b of s.blade) b.tangent = normalizeOr(rotate(b.tangent, dPath + T.dir * stepAngle), b.tangent);

  // The blade scrapes across its own path, hardest square to it.
  const speed = len(s.vel);
  if (speed <= 1e-6) return speed;
  const dv = (p.muTurn * p.gravity * Math.abs(sin(T.swept)) * scrub + p.muGlide * p.gravity
    + 0.5 * p.airDensity * p.cdA * speed * speed / p.mass) * dt;
  const next = Math.max(0, speed - dv);
  s.vel = mul(s.vel, next / speed);
  return next;
}

/** What the carve would have left on the blades, from the pivot instead. */
function pivotBlades(s: SkaterState, speed: number): void {
  const T = s.turn, sense = travelSense(T);
  for (const b of s.blade) {
    b.longSpeed = b.inContact ? sense * speed : 0;
    b.latForce = 0; b.latSlipAccel = 0; b.demandRatio = 0; b.biteCapacity = 0;
    b.turnRadius = Math.abs(T.pathRate) > 1e-6 ? speed / Math.abs(T.pathRate) : Infinity;
    b.regime = b.inContact ? REGIME.Edge : REGIME.Unloaded;
  }
}

/** Aligned with the path again: carving resumes, and the move is on the record. */
function endPivot(s: SkaterState, p: Params, speed: number): void {
  const T = s.turn;
  const frame = speed > 1e-6 ? mul(s.vel, travelSense(T) / speed) : s.heading;
  for (const b of s.blade) b.tangent = { x: frame.x, y: frame.y };
  s.heading = s.blade[T.exitFoot].tangent;
  s.yawRate = T.pathRate;
  s.spinCarry = T.dir * T.rate * p.turnCarry;
  const r = s.moveDone;
  r.tick = s.tick; r.kind = s.move; r.detail = T.kind; r.revolutions = T.swept / (2 * Math.PI);
  r.fromCode = T.fromCode; r.toCode = s.blade[T.exitFoot].code; r.speedLost = T.entrySpeed - speed;
  r.seconds = T.t; r.positions = 0; r.bestSegRevs = 0; r.travel = 0;
  s.move = MOVE.None;
}

export interface PivotTick { lat: number; cusp: boolean; ended: boolean }

/**
 * One tick of a turn, in place of the carve: pivot the blade, keep the arc,
 * scrape off speed, flip at the cusp, finish on the exit edge. Returns the
 * lateral acceleration the body feels, for the pendulum, whether this tick was
 * the cusp, and whether the turn finished.
 */
export function turnPivot(
  s: SkaterState, p: Params, dt: number, weightR: number,
  /** Whichever button started this pivot (`input.turn`, or `input.bracket` if `against`) — read
   *  only at the first cusp, to decide a Loop, Rocker or Counter (see TURN_KIND's own comment). */
  entryHeld = false,
  /** Raw stick, -1..1 — NOT solver.ts's own radian-scaled `leanCmd`; only the Rocker/Counter
   *  reversal check reads this, the same idiom sim/moves.ts's own spinTick already uses. */
  leanAxis = 0,
): PivotTick {
  const T = s.turn;
  T.t += dt;
  const ceiling = T.kind === TURN_KIND.Loop ? 2 * Math.PI : Math.PI;
  const stepAngle = Math.min(T.rate * dt, ceiling - T.swept);
  T.swept += stepAngle;
  const footChanged = T.kind === TURN_KIND.Mohawk;
  // Fighting the curve scrapes harder throughout (bible §2.3: bracket and
  // counter outrank a three-turn and a mohawk); a foot change's second half,
  // on the newly placed foot, still scrapes less than the pivoting one did —
  // measured for the mohawk (data/motion-primitives.json) and taken as the
  // same fraction for a choctaw, since nothing distinguishes the landing.
  const scrub = (T.against ? p.againstTurnScrub : 1) * (T.cusps > 0 && footChanged ? p.mohawkScrub : 1);
  let speed = pivotStep(s, p, dt, stepAngle, scrub);

  // "Reversing" means against the PHYSICAL curve the skater is actually on,
  // the same thing regardless of which button asked for this pivot — not
  // against T.dir, which `against` (a bracket or counter) deliberately
  // inverts from that curve already. Undoing that inversion here is what
  // keeps "push the other way" meaning the same thing whether this pivot
  // started from `turn` or `bracket`.
  const curveSense = T.against ? -T.dir : T.dir;
  // Tracked every tick, not read only at the cusp: a real stick (and a
  // digital one, scaled down for its own "manageable shallow edge" reason,
  // game/controls.ts) will not reliably be at its own peak push on the
  // exact tick the cusp happens to land on. A running max survives that the
  // same way a held check already has to.
  if (T.cusps === 0) T.reverseHeld = Math.max(T.reverseHeld, Math.max(0, -curveSense * leanAxis));

  // The cusp: blade square to the path. The frame reverses, and — entered
  // into the curve — the weight decides which turn this was: still on the
  // pivot foot, a three-turn; on the other, a mohawk, and the other foot
  // takes the exit. A bracket has no such foot-changing sibling here: a real
  // choctaw changes edge character on the new foot, which is the mohawk's
  // OTHER axis, not this one, and this rig does not model it (sim/types.ts's
  // `bracket` field explains why). So weight cannot move a bracket to the
  // other foot; it stays a bracket regardless.
  let cusp = false;
  if (T.cusps === 0 && T.swept >= Math.PI / 2) {
    cusp = true;
    T.cusps = 1;
    flipFrame(s);
    const other = (1 - T.foot) as Foot;
    const toOther = !T.against && (other === FOOT.Right ? weightR > 0.75 : weightR < 0.25);
    // Held through the cusp, stick pushed past p.rockerCounterStick against
    // this pivot's own rotational sense: a request to reverse the lobe
    // instead of continuing it — TURN_KIND's own comment on why travelSense
    // has to special-case these two.
    const reversing = entryHeld && Math.max(T.reverseHeld, Math.max(0, -curveSense * leanAxis)) >= p.rockerCounterStick;
    if (toOther) {
      T.kind = TURN_KIND.Mohawk;
      T.exitFoot = other;
      const from = s.blade[T.foot], to = s.blade[other];
      to.normalLoad = from.normalLoad; to.weight = 1; to.inContact = true;
      from.normalLoad = 0; from.weight = 0; from.inContact = false;
      s.supportFoot = other;
    } else if (reversing) {
      T.kind = T.against ? TURN_KIND.Counter : TURN_KIND.Rocker;
    } else if (!T.against && entryHeld) {
      // Still holding `turn`, weight not shifted, stick not reversed: a Loop
      // instead of checking out here — the same pivot, run to a second cusp
      // instead of ending at this first one.
      T.kind = TURN_KIND.Loop;
    }
    // A jump being loaded through the turn takes its setup from the exit edge.
    if (s.jump.phase === JUMP_PHASE.Load) s.jump.setup = 0;
  } else if (T.kind === TURN_KIND.Loop && T.cusps === 1 && T.swept >= 3 * Math.PI / 2) {
    // The second cusp: the frame flips back, undoing the first — same foot,
    // same edge, same direction on the far side, having swept a full circle.
    // Not reported through `cusp` (turnEvent's own trigger): the classification
    // — that this became a Loop at all — was already decided, and reported,
    // at the first one; this is that same move continuing, not a new one.
    T.cusps = 2;
    flipFrame(s);
  }

  const sense = travelSense(T);
  s.heading = s.blade[turnLoadFoot(s)].tangent;
  s.yawRate = T.pathRate + T.dir * T.rate;
  pivotBlades(s, speed);

  let ended = false;
  if (T.swept >= ceiling) { endPivot(s, p, speed); ended = true; }
  return { lat: T.pathRate * speed * sense, cusp, ended };
}

/**
 * One tick of a twizzle: steer the path from the stick, spin the blade up and
 * keep it spinning while the button is held, a cusp every half revolution,
 * and on release finish to the next alignment.
 */
export function twizzleTick(
  s: SkaterState, p: Params, dt: number, leanCmd: number, carriage: number, held: boolean,
): PivotTick {
  const T = s.turn, g = p.gravity;
  T.t += dt;
  let speed = len(s.vel);
  if (!held || speed < 0.5 * p.twizzleMinSpeed) T.release = true;

  // Stick to steer: the lean it asks for, as the curvature of the path.
  const want = speed > 0.5 ? g * tan(leanCmd) / (speed * travelSense(T)) : 0;
  T.pathRate += (want - T.pathRate) * Math.min(1, dt / p.twizzleSteerTime);

  // Arms in is fast, arms out is slow.
  const target = p.twizzleRate * (1 - p.twizzleArmsOut * clamp(carriage, 0, 1));
  T.rate += (target - T.rate) * Math.min(1, dt / TWIZZLE_SPINUP);

  // Let go, and it finishes to the next time the blade lines up with the path.
  const align = Math.max(Math.PI, Math.ceil(T.swept / Math.PI - 1e-9) * Math.PI);
  const stepAngle = T.release ? Math.min(T.rate * dt, align - T.swept) : T.rate * dt;
  T.swept += stepAngle;
  speed = pivotStep(s, p, dt, stepAngle, p.twizzleScrub);

  let cusp = false;
  if (T.swept >= Math.PI / 2 + T.cusps * Math.PI) {
    cusp = true;
    T.cusps++;
    flipFrame(s);
    if (s.jump.phase === JUMP_PHASE.Load) s.jump.setup = 0;
  }

  const sense = travelSense(T);
  s.heading = s.blade[T.foot].tangent;
  s.yawRate = T.pathRate + T.dir * T.rate;
  pivotBlades(s, speed);

  // Upright over the foot: the body goes to the lean its path needs.
  const lat = T.pathRate * speed * sense;
  s.lean += (atan2(lat, g) - s.lean) * Math.min(1, dt / TWIZZLE_SETTLE);
  s.leanRate = 0;

  let ended = false;
  if (T.release && T.swept >= align - 1e-9) { endPivot(s, p, speed); ended = true; }
  return { lat, cusp, ended };
}

/** Knee deep is a sit, stick forward a camel, anything else upright. */
export function spinPosition(knee: number, pitch: number, p: Params): number {
  return knee >= p.spinSitKnee ? SPIN_POSITION.Sit : pitch >= p.spinCamelPitch ? SPIN_POSITION.Camel : SPIN_POSITION.Upright;
}

/**
 * Start a spin: moves on, on the ice, fast enough to have something to hook.
 * The spin turns the way the path does; the travel becomes the rotation.
 */
export function spinStart(s: SkaterState, p: Params, carriage: number, knee: number, pitch: number): boolean {
  if (p.movesMode < 1 || s.fallen || s.move !== MOVE.None || s.jump.phase === JUMP_PHASE.Air) return false;
  const b = s.blade[s.supportFoot];
  const speed = len(s.vel);
  if (!b.inContact || speed < p.spinMinSpeed) return false;
  const Sp = s.spin;
  const pathSense = sign(b.tilt) * sign(b.longSpeed);
  const check = clamp(carriage, 0, 1);
  Sp.t = 0;
  Sp.dir = pathSense !== 0 ? pathSense : 1;
  Sp.angMomentum = p.mass * speed * p.spinArm * (0.7 + 0.3 * check);
  Sp.position = spinPosition(knee, pitch, p);
  Sp.inertia = SPIN_INERTIA_SCALE[Sp.position] * lerp(p.inertiaTucked, p.inertiaOpen, check);
  Sp.omega = Sp.angMomentum / Sp.inertia;
  Sp.swept = 0;
  Sp.positionsHeld = 0;
  Sp.segRevs = 0;
  Sp.bestSegRevs = 0;
  Sp.segOmegaMin = Sp.omega;
  Sp.segOmegaMax = Sp.omega;
  Sp.foot = s.supportFoot;
  Sp.anchor = { x: s.pos.x, y: s.pos.y };
  Sp.travel = 0;
  Sp.fromCode = b.code;
  Sp.entrySpeed = speed;
  // The hook takes the travel: what is left drifts, and dies away.
  s.vel = mul(s.vel, p.spinTravelKeep);
  s.move = MOVE.Spin;
  s.strokeTime = 0;
  s.crossover = false;
  return true;
}

/**
 * One tick of a spin, in place of the carve: the position and arms set I, L
 * drains, omega = L / I turns the body, the drift dies, and letting go — or
 * running out of rotation — checks out.
 */
export function spinTick(
  s: SkaterState, p: Params, dt: number, knee: number, pitch: number, carriage: number, held: boolean,
  /** Raw stick, -1..1 — NOT solver.ts's own radian-scaled `leanCmd`; only a reversal check reads this. */
  leanAxis = 0,
  /**
   * A fresh toe press this tick (solver.ts's own HELD.Toe edge, `input.toe` unused elsewhere during
   * a spin) — starts a brief, airborne foot change if one is not already under way. The blade leaves
   * the ice for `spinFootChangeAirTime`, angular momentum conserved but for the one-time transfer
   * cost, and lands on the other foot: data/spin-features.json's change_foot_by_jump family.
   */
  footChangeTrigger = false,
): PivotTick {
  const Sp = s.spin;
  Sp.t += dt;

  if (footChangeTrigger && !Sp.changingFoot) {
    Sp.changingFoot = true;
    Sp.changeAirT = 0;
    Sp.changeStartOmega = Sp.omega;
    Sp.changeStartPosition = Sp.position;
    Sp.angMomentum *= 1 - p.spinFootChangeLoss;
    Sp.omega = Sp.angMomentum / Sp.inertia;
  }

  const pos = spinPosition(knee, pitch, p);
  if (pos !== Sp.position) {
    if (Sp.segRevs >= 2) Sp.positionsHeld |= 1 << Sp.position;
    Sp.position = pos;
    Sp.segRevs = 0;
    Sp.segOmegaMin = Sp.omega;
    Sp.segOmegaMax = Sp.omega;
  }
  // Arms and a free leg move at the rate a jump's pull-in does.
  const target = SPIN_INERTIA_SCALE[pos] * lerp(p.inertiaTucked, p.inertiaOpen, clamp(carriage, 0, 1));
  Sp.inertia = moveToward(Sp.inertia, target, p.inertiaPullRate * dt);

  // data/spin-features.json's both_directions: held stick against Sp.dir, past
  // spinReverseStick, checks the spin's own angular momentum on top of its
  // ordinary decay; once that is checked to spinReverseFloor the direction
  // flips and regenerates, scaled by how hard the check was held. Free while
  // the stick agrees with Sp.dir or sits near neutral — `against` is 0 there.
  // No blade-ice friction and no reversal check while airborne on a foot
  // change — angular momentum is exactly conserved there but for the one-time
  // transfer cost already spent at the trigger.
  const against = Sp.changingFoot ? 0 : Math.max(0, -Sp.dir * leanAxis);
  // Below the threshold this is not a check at all — a stick imperfectly
  // centred, or nudged the "wrong" way by a little, costs nothing. Only past
  // it does the extra decay (and the possibility of a flip) apply.
  const checking = against >= p.spinReverseStick;
  const drift = len(s.vel);
  s.vel = mul(s.vel, Math.max(0, 1 - dt / p.spinTravelTime));
  if (!Sp.changingFoot) {
    Sp.angMomentum *= Math.max(0, 1 - (p.spinDecay + p.spinTravelDecay * drift + p.spinReverseRate * (checking ? against : 0)) * dt);
    if (checking && Sp.angMomentum <= p.spinReverseFloor) {
      Sp.dir = -Sp.dir;
      Sp.angMomentum = p.spinReverseRegen * against;
      // A fresh segment, the same reason a position change starts one: the
      // pre-flip revolutions must not bleed into the new direction's count.
      Sp.segRevs = 0;
      Sp.segOmegaMin = Sp.angMomentum / Sp.inertia;
      Sp.segOmegaMax = Sp.segOmegaMin;
    }
  }
  Sp.omega = Sp.angMomentum / Sp.inertia;

  const dAngle = Sp.omega * dt;
  Sp.swept += dAngle;
  Sp.segRevs += dAngle / (2 * Math.PI);
  Sp.bestSegRevs = Math.max(Sp.bestSegRevs, Sp.segRevs);
  Sp.segOmegaMin = Math.min(Sp.segOmegaMin, Sp.omega);
  Sp.segOmegaMax = Math.max(Sp.segOmegaMax, Sp.omega);
  const ax = s.pos.x - Sp.anchor.x, ay = s.pos.y - Sp.anchor.y;
  Sp.travel = Math.max(Sp.travel, Math.sqrt(ax * ax + ay * ay));

  if (Sp.changingFoot) {
    Sp.changeAirT += dt;
    if (Sp.changeAirT >= p.spinFootChangeAirTime) {
      Sp.changingFoot = false;
      Sp.foot = (1 - Sp.foot) as Foot;
      Sp.changeCompletedTick = s.tick;
      Sp.changeAirTimeS = Sp.changeAirT;
      // What "lost" means here: the revolutions NOT swept, at the pre-change
      // rate, during the time the blade was actually off the ice — not a
      // fabricated number, the same operational honesty spinLevel.ts's own
      // header holds every other scored quantity to.
      Sp.changeRevolutionsLost = (Sp.changeStartOmega * Sp.changeAirT) / (2 * Math.PI);
      Sp.changePositionChanged = Sp.position !== Sp.changeStartPosition;
    }
  }

  s.heading = normalizeOr(rotate(s.heading, Sp.dir * dAngle), s.heading);
  s.yawRate = Sp.dir * Sp.omega;
  s.lean += (0 - s.lean) * Math.min(1, dt / SPIN_SETTLE);
  s.leanRate = 0;
  s.tiltCmd = -Sp.dir * SPIN_EDGE;
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    b.tangent = { x: s.heading.x, y: s.heading.y };
    b.latForce = 0; b.latSlipAccel = 0; b.demandRatio = 0; b.biteCapacity = 0; b.turnRadius = Infinity;
    if (Sp.changingFoot) {
      // Airborne, briefly: neither blade is on the ice mid-change.
      b.longSpeed = 0;
      b.regime = REGIME.Unloaded;
    } else if (b.inContact) {
      // On the back edge that curves the way the spin turns.
      b.tilt = -Sp.dir * SPIN_EDGE;
      b.longSpeed = -SPIN_BLADE_SPEED;
      b.regime = REGIME.Edge;
    } else {
      b.longSpeed = 0;
      b.regime = REGIME.Unloaded;
    }
  }

  // A reversal in progress is deliberately, briefly slower than spinMinOmega
  // — that dip through near-zero is what "killing all angular momentum" IS —
  // so an active check (against past the stick threshold) is exempted from
  // the ordinary too-slow exit for as long as it is held, and so is a foot
  // change's own brief airborne moment. Letting go without completing either
  // still ends the spin exactly as before.
  const ended = !held || (Sp.omega < p.spinMinOmega && !checking && !Sp.changingFoot);
  if (ended) {
    if (Sp.segRevs >= 2) Sp.positionsHeld |= 1 << Sp.position;
    const exitFoot = (Sp.dir > 0 ? FOOT.Right : FOOT.Left) as Foot;
    // The check-out: pushed away backward onto that foot's back outside edge.
    s.vel = mul(s.heading, -p.spinExitSpeed);
    s.yawRate = 0;
    s.tiltCmd = -Sp.dir * SPIN_EDGE;
    const r = s.moveDone;
    r.tick = s.tick; r.kind = MOVE.Spin; r.detail = Sp.position; r.revolutions = Sp.swept / (2 * Math.PI);
    r.fromCode = Sp.fromCode; r.toCode = makeCode(exitFoot, DIR.Backward, EDGE.Outside);
    r.speedLost = Sp.entrySpeed - p.spinExitSpeed;
    r.seconds = Sp.t;
    r.positions = Sp.positionsHeld; r.bestSegRevs = Sp.bestSegRevs; r.travel = Sp.travel;
    s.move = MOVE.None;
  }
  return { lat: 0, cusp: false, ended };
}

/** After classification on a spin's last tick: revolutions, and the edge it checks out onto. */
export function spinEvent(s: SkaterState, events: EdgeEvent[]): void {
  const r = s.moveDone;
  events.push({
    tick: s.tick, type: EVENT.Spin, foot: (r.toCode & 1) as Foot,
    prevCode: r.fromCode, newCode: r.toCode, prevDwell: s.spin.t, value: r.revolutions,
  });
}

/** After classification on a turn's cusp tick: say which turn it was, and onto what. */
export function turnEvent(s: SkaterState, events: EdgeEvent[]): void {
  const T = s.turn;
  events.push({
    tick: s.tick, type: EVENT.Turn, foot: T.exitFoot,
    prevCode: T.fromCode, newCode: s.blade[T.exitFoot].code, prevDwell: T.t, value: T.kind,
  });
  // A turn that finished on its cusp tick recorded the exit before it was classified.
  if (s.move === MOVE.None && s.moveDone.tick === s.tick) s.moveDone.toCode = s.blade[T.exitFoot].code;
}

/** After classification on a twizzle's last tick: how many revolutions, and out onto what. */
export function twizzleEvent(s: SkaterState, events: EdgeEvent[]): void {
  const T = s.turn;
  s.moveDone.toCode = s.blade[T.exitFoot].code;
  events.push({
    tick: s.tick, type: EVENT.Twizzle, foot: T.exitFoot,
    prevCode: T.fromCode, newCode: s.moveDone.toCode, prevDwell: T.t, value: s.moveDone.revolutions,
  });
}

/** The rotation a pivot left in the body drains away. */
export function carryDecay(s: SkaterState, p: Params, dt: number): void {
  if (s.spinCarry !== 0) s.spinCarry -= s.spinCarry * Math.min(1, dt / p.turnCarryTime);
}
