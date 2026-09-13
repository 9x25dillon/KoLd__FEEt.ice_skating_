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

import { rotate, normalizeOr, len, mul, sin, tan, atan2, sign, clamp } from "./math.ts";
import { MOVE, TURN_KIND, FOOT, EVENT, EDGE_CODE_NONE, REGIME } from "./types.ts";
import type { SkaterState, TurnState, MoveResult, EdgeEvent, Foot } from "./types.ts";
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
    fromCode: EDGE_CODE_NONE, entrySpeed: 0,
  };
}

export function noMove(): MoveResult {
  return {
    tick: -1, kind: MOVE.None, detail: 0, revolutions: 0,
    fromCode: EDGE_CODE_NONE, toCode: EDGE_CODE_NONE, speedLost: 0,
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

/** Whether a pivot is under way — a turn or a twizzle — standing in for the carve. */
export const pivoting = (s: SkaterState): boolean => s.move === MOVE.Turn || s.move === MOVE.Twizzle;

/** +1 while the travel frame points the way the pivot began, -1 after an odd number of cusps. */
const travelSense = (T: TurnState): number => (T.cusps % 2 === 0 ? T.entryDir : -T.entryDir);

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
function beginPivot(s: SkaterState, p: Params, minSpeed: number, needEdge: boolean): boolean {
  if (p.movesMode < 1 || s.fallen || s.move !== MOVE.None || s.jump.phase === JUMP_PHASE.Air) return false;
  const b = s.blade[s.supportFoot];
  const speed = len(s.vel);
  if (!b.inContact || speed < minSpeed) return false;
  if (needEdge && Math.abs(b.tilt) < p.flatThreshold) return false;
  const T = s.turn;
  // Into the curve: the way the path is already turning. A twizzle off a flat
  // blade has no curve to follow and turns anticlockwise, the rig's rotation.
  const pathSense = sign(b.tilt) * sign(b.longSpeed);
  if (pathSense === 0 && needEdge) return false;
  T.t = 0;
  T.swept = 0;
  T.dir = pathSense !== 0 ? pathSense : 1;
  // The front of the rocker is tighter and turns faster: that is what "on the
  // rocker" buys, and it is why a skater rocks forward into a turn.
  T.rate = (Math.PI / p.turnTime) * (p.rocker / effectiveRocker(b.contactS, p));
  T.pathRate = s.yawRate;
  T.entryDir = b.longSpeed >= 0 ? 1 : -1;
  T.foot = s.supportFoot;
  T.exitFoot = s.supportFoot;
  T.cusps = 0;
  T.release = false;
  T.kind = TURN_KIND.ThreeTurn;
  T.fromCode = b.code;
  T.entrySpeed = speed;
  s.strokeTime = 0;
  s.crossover = false;
  return true;
}

/**
 * Start a turn, if the edge the skater is on permits one: moves on, on the
 * ice, one blade on an edge, moving. Returns whether it started.
 */
export function turnStart(s: SkaterState, p: Params): boolean {
  if (!beginPivot(s, p, p.turnMinSpeed, true)) return false;
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
  s.move = MOVE.None;
}

export interface PivotTick { lat: number; cusp: boolean; ended: boolean }

/**
 * One tick of a turn, in place of the carve: pivot the blade, keep the arc,
 * scrape off speed, flip at the cusp, finish on the exit edge. Returns the
 * lateral acceleration the body feels, for the pendulum, whether this tick was
 * the cusp, and whether the turn finished.
 */
export function turnPivot(s: SkaterState, p: Params, dt: number, weightR: number): PivotTick {
  const T = s.turn;
  T.t += dt;
  const stepAngle = Math.min(T.rate * dt, Math.PI - T.swept);
  T.swept += stepAngle;
  let speed = pivotStep(s, p, dt, stepAngle, T.cusps > 0 && T.kind === TURN_KIND.Mohawk ? p.mohawkScrub : 1);

  // The cusp: blade square to the path. The frame reverses, and the weight
  // decides which turn this was: still on the pivot foot, a three-turn; on the
  // other, a mohawk, and the other foot takes the exit.
  let cusp = false;
  if (T.cusps === 0 && T.swept >= Math.PI / 2) {
    cusp = true;
    T.cusps = 1;
    flipFrame(s);
    const other = (1 - T.foot) as Foot;
    const toOther = other === FOOT.Right ? weightR > 0.75 : weightR < 0.25;
    if (toOther) {
      T.kind = TURN_KIND.Mohawk;
      T.exitFoot = other;
      const from = s.blade[T.foot], to = s.blade[other];
      to.normalLoad = from.normalLoad; to.weight = 1; to.inContact = true;
      from.normalLoad = 0; from.weight = 0; from.inContact = false;
      s.supportFoot = other;
    }
    // A jump being loaded through the turn takes its setup from the exit edge.
    if (s.jump.phase === JUMP_PHASE.Load) s.jump.setup = 0;
  }

  const sense = travelSense(T);
  s.heading = s.blade[turnLoadFoot(s)].tangent;
  s.yawRate = T.pathRate + T.dir * T.rate;
  pivotBlades(s, speed);

  let ended = false;
  if (T.swept >= Math.PI) { endPivot(s, p, speed); ended = true; }
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
