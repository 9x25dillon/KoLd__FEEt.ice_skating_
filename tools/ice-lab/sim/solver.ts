// tools/ice-lab/sim/solver.ts — one skater, one fixed tick, a pure function.
//
// State in, state out, plus events into a caller-owned array. No DOM, no
// allocation beyond the events, no hidden globals, no wall clock. That is not
// tidiness: replays, ghosts, server-side verification and every automated test
// in this rig depend on it holding, and it is the property the UE5 port must
// preserve above all others.
//
// 120 Hz, semi-implicit Euler. INERTIAL — velocity is state, not a function of
// position. That is the one thing that could not be carried over from SONIC
// DRIFTER, whose water is overdamped and whose design rule 1 is that no
// velocity term exists at all.
//
// ── five corrections to the engineering package, made deliberately ──────────
//
// 1. HANDEDNESS. Up x t is to the skater's LEFT, and every edge code follows
//    from that. See math.ts perpLeft and classify.ts.
//
// 2. INTERNAL BALANCE AUTHORITY SIGN. The package has
//        a_int = clamp(-gain * balanceError, ...)
//    but the pendulum it feeds is
//        leanAccel = (g sin phi - (a_lat + a_int) cos phi) / L
//    so a positive balance error — over-leaned, falling inward — needs a
//    POSITIVE a_int to arrest it. As written, the arms and free leg push the
//    skater further over, which would read in play as a balance system that
//    makes every wobble worse.
//
// 3. TWO-BLADE LATERAL SOLVE. The package computes each blade's impulse from
//    the FULL body mass and applies them Gauss-Seidel, so the first blade in
//    the order absorbs everything and the second sees no slip left to cancel.
//    Its own acceptance test ("light blade skids first") cannot pass against
//    it. Here each blade answers for its own share of the load, which is what
//    makes weight transfer mean anything.
//
// 4. INTERNAL AUTHORITY HAS NO RATE TERM. Correction 2 fixes the sign of a
//    term that is still proportional-only, so raising its ceiling adds gain
//    without adding damping and an assist tier makes balance worse. See
//    `internalRateGain`, which is 0 in `spec` so the defect stays measurable.
//
// 5. THE FALL TEST SCORES A SAVE AS A FALL. The balance timeout compares the
//    body's lean against the lean the EDGE alone balances, crediting none of
//    the internal authority — so using the arms and free leg IS the fall
//    condition. Measured: down at 2.6 degrees of lean, upright, at 4 m/s. See
//    `fallAuthorityCredit`, also 0 in `spec`.
//
// The hold/skid model follows src/reference/SkateSolver.cpp rather than the
// package: when the edge lets go, the ARC WIDENS to whatever the bite can
// actually hold, and speed bleeds through mu_skid. The package instead leaves
// residual slip velocity, which is the same idea one derivative apart, but the
// bible's version is the project's own and reads more directly on screen.

import { add, mul, dot, len, perpLeft, rotate, normalizeOr, clamp, sign, asinClamped, moveToward, quantize, crc32, v2, tan, sin, cos, lerp, rng } from "./math.ts";
import { EDGE_CODE_NONE, REGIME, FALL, EVENT, FOOT, MOVE, HELD } from "./types.ts";
import type {
  SkaterState, BladeState, SkatingInput, EdgeEvent, Foot, Fall,
} from "./types.ts";
import type { Params } from "./params.ts";
import { SIM_DT } from "./params.ts";
import { effectiveRocker, carveRadius, biteCapacity, muLong, equilibriumLean, rinkSlopeAccel } from "./blade.ts";
import type { IceGrid } from "./ice.ts";
import type { Vec2 } from "./math.ts";
import { onBeat, accentCredit } from "./music.ts";
import { classifyCode, classifyDepth } from "./classify.ts";
import { newJump, noResult, jumpGround, jumpAir, JUMP_PHASE } from "./jump.ts";
import {
  newTurn, newSpin, newInaBauer, newSpiral, noMove, turnStart, twizzleStart, spinStart, inaBauerStart, inaBauerEnd,
  spiralStart, spiralEnd,
  turnPivot, twizzleTick, spinTick, turnFrame, turnLoadFoot, turnEvent, twizzleEvent, spinEvent,
  carryDecay, replacesCarve,
} from "./moves.ts";
import type { PivotTick } from "./moves.ts";

/**
 * A non-finite axis is a bug in the caller, and it must not be a quiet one.
 *
 * Without this, one missing field in an input literal makes every derived
 * quantity NaN, and a NaN skater never falls (no comparison is true) and never
 * diverges (NaN !== NaN, but the checksum quantizes to the same 0) — so three
 * separate tests report SUCCESS while nothing is being simulated at all. That
 * happened, within an hour of writing down that this rig has no type checker.
 *
 * In C++ the input arrives as quantized integers, where this cannot occur and
 * the compiler deletes the check.
 */
const axis = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/**
 * Each leg's knee command, [left, right]: the shared knee, split apart by
 * `kneeSplit` as `leanSplit` splits tilt. With no split both are the knee.
 */
const legKnees = (input: SkatingInput, floor = 0): [number, number] => {
  const knee = axis(input.knee, 0.35), split = clamp(axis(input.kneeSplit ?? 0, 0), -1, 1);
  return [Math.max(knee - split, floor), Math.max(knee + split, floor)];
};

/**
 * The knee the body stands on: each leg's, by how much of the weight it takes.
 * Exactly the shared knee when there is no split (a + w * 0 is a).
 */
const supportKnee = ([l, r]: [number, number], weightR: number): number => l + weightR * (r - l);

/**
 * The share of its grip a blade keeps once it slides: muSkid at scrapeRefTilt.
 * Scaled on biteCapacity, so sharpness, ice and load move a scrape as they
 * move a carve.
 */
const scrapeShare = (p: Params): number => p.muSkid / (p.biteC0 + p.biteC1 * sin(p.scrapeRefTilt));

/**
 * A SCRAPE FOLLOWS THE EDGE. Sliding sideways, a blade dug in toward the side
 * the scrape pushes (`into`, left positive) cuts a groove and resists along
 * the grip curve: deeper, harder; flat, hardly at all. A blade on the OTHER
 * edge — leaning with the slide, not against it — catches: the downhill edge
 * cannot slide, it grips with all its bite, and the body trips over it.
 */
function scrapeForce(b: SkaterState["blade"][number], into: number, p: Params): number {
  if (Math.abs(b.tilt) >= p.flatThreshold && sign(b.tilt) !== into) return b.biteCapacity;
  return b.biteCapacity * scrapeShare(p);
}

/**
 * STAGE B1, THE SLIP SOLVE (slipMode 1). What is left of the travel across
 * the blades after the carve: the edges take it out as far as they can hold
 * (biteCapacity, summed over the carrying blades), and past that they scrape
 * it out along the grip curve (scrapeForce) — or catch, on the wrong edge.
 * An impulse along the blades' normal, so a scrape costs speed the way a
 * scrape does. Returns the sideways force on the body, left positive, and
 * settles each carrying blade's skid regime and events.
 */
function slipSolve(
  s: SkaterState, p: Params, dt: number, stroking: boolean, wasSkid: boolean[], events: EdgeEvent[],
): number {
  const n = perpLeft(s.heading);
  const vLat = dot(s.vel, n);
  const into = -sign(vLat);   // the side the scrape pushes the body toward
  const scrapes: number[] = [0, 0];
  let grip = 0, kinetic = 0;
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (!b.inContact || (stroking && i === s.strokeFoot)) continue;
    grip += b.biteCapacity;
    scrapes[i] = scrapeForce(b, into, p);
    kinetic += scrapes[i];
  }
  const need = p.mass * Math.abs(vLat);
  const sliding = grip > 0 && need > grip * dt;
  const J = Math.min(need, (sliding ? kinetic : grip) * dt);
  if (J > 0) s.vel = add(s.vel, mul(n, -sign(vLat) * J / p.mass));
  // THE DIG. Each scraping blade pushes where it meets the ice, which the
  // heel/toe puts ahead of or behind the boot: r x F about the body's axis.
  // The angular impulse winds the body — carried, like a turn's, into the
  // takeoff (spinCarry), counter-clockwise positive.
  if (sliding && kinetic > 0) {
    const used = J / (kinetic * dt);
    let dL = 0;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (scrapes[i] === 0) continue;
      const r = mul(b.tangent, (b.contactS - 0.5) * p.bladeLength);
      const f = mul(n, into * scrapes[i] * used);
      dL += (r.x * f.y - r.y * f.x) * dt;
    }
    s.spinCarry += dL / p.inertiaOpen;
  }
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (!b.inContact || (stroking && i === s.strokeFoot)) continue;
    b.latSlipAccel = sliding ? scrapes[i] / Math.max(b.normalLoad / p.gravity, 1e-6) : 0;
    if (sliding && b.regime !== REGIME.Brake) b.regime = REGIME.Skid;
    const isSkid = b.regime === REGIME.Skid;
    if (isSkid && !wasSkid[i]) events.push({
      tick: s.tick, type: EVENT.SkidBegin, foot: i as Foot,
      prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: b.latSlipAccel,
    });
    if (!isSkid && wasSkid[i]) events.push({
      tick: s.tick, type: EVENT.SkidEnd, foot: i as Foot,
      prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: 0,
    });
  }
  return -sign(vLat) * J / dt;
}

/**
 * N m. How hard the loaded blades resist being pivoted: a blade's grip
 * (biteCapacity, per unit length of contact) acting over the length in the
 * ice about its middle, grip x chord / 4. The chord is the rocker's at
 * contactDepth, so on the toe (shorter rocker) and flat (small grip) a
 * blade turns easily — turns are made on the ball of the foot — and on a
 * deep edge it holds.
 */
function pivotCapacity(s: SkaterState, p: Params): number {
  let cap = 0;
  for (const b of s.blade) {
    if (!b.inContact) continue;
    const chord = 2 * Math.sqrt(2 * effectiveRocker(b.contactS, p) * p.contactDepth);
    cap += b.biteCapacity * chord / 4;
  }
  return cap;
}

/**
 * STAGE C, THE TRUNK. Two bodies: upper (torso and arms, heavier with the arms
 * out) and lower (hips, legs, blades), twisted apart by the trunk's muscles
 * toward the wind-up asked for.
 *
 * The carve itself is not charged to the ice's pivot grip: a tilted rocker
 * rolling in its own groove turns at `steer` the way a tilted coin rolls in a
 * circle, and both bodies are carried round with it. What the pivot grip
 * resists is the trunk twisting the feet OFF that carve: rates here are
 * relative to the carve. The lower body holds while the ice can answer the
 * trunk's reaction and take out any deviation, up to pivotCapacity; past that
 * it pivots (yawDev), resisted only by the scrape's share of the capacity.
 * Returns the lower body's yaw rate.
 */
function trunkTorque(s: SkaterState, p: Params, dt: number, steer: number, input: SkatingInput): number {
  const Il = p.lowerBodyInertia;
  const Iu = Math.max(0.1, lerp(p.inertiaTucked, p.inertiaOpen, clamp(axis(input.carriage, 0), 0, 1)) - Il);
  const twist = s.twist ?? 0, twistRate = s.twistRate ?? 0, dev0 = s.yawDev ?? 0;
  const target = clamp(axis(input.windup, 0), -1, 1) * p.twistMax;
  // On the upper body; the lower takes it back.
  const tauM = clamp(p.twistStiffness * (target - twist) - p.twistDamping * twistRate,
    -p.twistTorqueMax, p.twistTorqueMax);
  // The ice torque that would hold the lower body on its carve this tick.
  const need = tauM - Il * dev0 / dt;
  const cap = pivotCapacity(s, p);
  const dev = Math.abs(need) <= cap ? 0 : dev0 + (sign(need) * cap * scrapeShare(p) - tauM) / Il * dt;
  const upper = dev0 + twistRate + tauM / Iu * dt;
  s.yawDev = dev;
  s.twistRate = upper - dev;
  s.twist = twist + s.twistRate * dt;
  return steer + dev;
}

/**
 * The jump reads the knee it loads, lands and absorbs on: the standing leg's.
 * Without a split this is the input itself, untouched.
 */
const legInput = (input: SkatingInput): SkatingInput =>
  (input.kneeSplit ?? 0) === 0 ? input
    : { ...input, knee: supportKnee(legKnees(input), clamp(axis(input.weight, 0.5), 0, 1)) };

/** Metres each foot of an Ina Bauer sits from the body along the track, lead ahead. */
const INA_BAUER_STRIDE = 0.3;

// ── construction ────────────────────────────────────────────────────────────

function makeBlade(): BladeState {
  return {
    contact: v2(0, 0), tangent: v2(1, 0), tilt: 0, contactS: 0.5,
    normalLoad: 0, weight: 0.5, longSpeed: 0, latSlipAccel: 0, latForce: 0,
    biteCapacity: 0, demandRatio: 0, turnRadius: Infinity, dwell: 0,
    code: EDGE_CODE_NONE, depth: 0, regime: REGIME.Unloaded, inContact: false,
  };
}

export function createState(p: Params, speed = 0, lean = 0): SkaterState {
  return {
    pos: v2(0, 0), vel: v2(speed, 0), heading: v2(1, 0), yawRate: 0,
    lean, leanRate: 0, leanEq: 0, balanceError: 0, balanceErrorTime: 0,
    latAccel: 0, intAccel: 0, intHeld: 0, tiltCmd: lean, legLength: p.comHeight, legRate: 0,
    comZ: p.comHeight, supportFoot: FOOT.Right, supportMode: 2,
    knee: 0, strokeTime: 0, strokeFoot: FOOT.Left, crossover: false, crossSide: 0, pushHeld: false,
    strokeMusicScale: 1,
    jump: newJump(p), landed: noResult(),
    move: MOVE.None, turn: newTurn(), spin: newSpin(), inaBauer: newInaBauer(), spiral: newSpiral(), moveDone: noMove(),
    movesHeld: 0, flips: 0, spinCarry: 0, musicCredit: 0,
    wind: 1, legs: 1, hype: 0, hypeStreak: 0, flow: 0,
    lobeDir: 0, lobeLastDir: 0, lobeCandDir: 0, lobeCandT: 0, lobeAlternations: 0, lobeRepeats: 0,
    fallReason: FALL.None, fallen: false, tick: 0,
    blade: [makeBlade(), makeBlade()],
  };
}

// ── the step ────────────────────────────────────────────────────────────────

export function step(
  s: SkaterState, input: SkatingInput, p: Params, dt: number, events: EdgeEvent[],
  ice?: IceGrid,
): void {
  const eventsAtStart = events.length;
  const g = p.gravity;
  s.tick++;
  // Explicit resource, not a hidden global (sim/ice.ts): with no grid passed,
  // or `iceGridMode` 0, `condAt` is 0 everywhere and every call site below
  // reads exactly what it did before this file existed.
  const iceOn = !!ice && p.iceGridMode >= 1;
  const condAt = (pos: Vec2): number => (iceOn ? ice!.condition(pos) : 0);

  // Stamina (design-bible.md §2.8): the four fields fatigue touches, blended
  // by the CURRENT pool state into a fresh object rather than mutating the
  // caller's own p. `staminaMode` 0 makes pFatigue identical to p, field for
  // field, the same inertness guarantee iceOn/condAt give the ice grid.
  const staminaOn = p.staminaMode >= 1;
  const slipOn = p.slipMode >= 1;
  const torqueOn = slipOn && p.torqueMode >= 1;
  const legsMul = staminaOn ? clamp(s.legs, 0, 1) : 1;
  const pFatigue: Params = staminaOn ? {
    ...p,
    jumpImpulse: lerp(p.jumpImpulse * p.staminaJumpImpulseMin, p.jumpImpulse, legsMul),
    inertiaTucked: lerp(p.staminaInertiaFloorMax, p.inertiaTucked, legsMul),
    maxLean: Math.max(0, p.maxLean - lerp(p.staminaMaxLeanLoss, 0, legsMul)),
    maxTilt: Math.max(0, p.maxTilt - lerp(p.staminaMaxLeanLoss, 0, legsMul)),
  } : p;

  // Hype: the operator's own bridge, layered ON TOP of pFatigue rather than
  // replacing it — a performance streak can buy back part of what fatigue
  // just cost, which is the entire point of a bridge between the two.
  // `hypeMode` 0 makes pEff identical to pFatigue, field for field.
  const hypeOn = p.hypeMode >= 1;
  const hype = hypeOn ? clamp(s.hype, 0, 1) : 0;
  const pEff: Params = hypeOn ? {
    ...pFatigue,
    controlLatency: lerp(pFatigue.controlLatency, pFatigue.controlLatency * p.hypeControlLatencyMin, hype),
    internalMax: lerp(pFatigue.internalMax, pFatigue.internalMax * p.hypeInternalMaxGain, hype),
    angulationLimit: lerp(pFatigue.angulationLimit, pFatigue.angulationLimit * p.hypeAngulationGain, hype),
  } : pFatigue;

  // Flow (design-bible.md §2.6): read here as last tick's value, the same
  // one-tick lag pFatigue/pEff already carry, so section 12 below can scale
  // Wind's drain by it without needing this tick's own flow, which is not
  // known until section 14 runs.
  const flowOn = p.flowMode >= 1;

  // ── 0. getting up ─────────────────────────────────────────────────────────
  // The bible's §3.4 machine goes Fall -> grounded -> GetUp -> locomotion. The
  // rig's GetUp is a FRESH press of the push button: the skater stands where
  // they fell, facing the way they were facing, at rest, with the clock still
  // running — so the session, its traces and its fall counts carry on, and the
  // seconds between the fall and this press are what §6 calls time-to-retry.
  //
  // Fresh, because a button already held when the ice arrived is not a
  // decision to get up. Push is otherwise level-triggered (held, it keeps
  // stroking), so without this a skater who fell mid-stroke with the button
  // down would be back up the next tick and never see the fall. session.ts
  // applies the same rule before it counts a retry, and for the same reason.
  //
  // The press is consumed: standing up is not also a stroke. The one
  // allocation here is a reset, and a reset is allowed to allocate.
  const freshPush = input.push && !s.pushHeld;
  s.pushHeld = input.push;
  // A move also starts on a fresh press, and for the same reason.
  const heldNow = (input.turn === true ? HELD.Turn : 0) | (input.twizzle === true ? HELD.Twizzle : 0)
    | (input.spin === true ? HELD.Spin : 0) | (input.inaBauer === true ? HELD.InaBauer : 0)
    | (input.bracket === true ? HELD.Bracket : 0) | (input.toe === true ? HELD.Toe : 0);
  const freshMoves = heldNow & ~s.movesHeld;
  s.movesHeld = heldNow;
  if (s.fallen && freshPush) {
    // The last landing is kept: it is the record of why they are down. So is
    // the frame count, since the heading is kept and a scheme reads it.
    const { pos, heading, tick, landed, moveDone, flips, movesHeld, musicCredit, wind, legs, hype, hypeStreak } = s;
    Object.assign(s, createState(p), { pos, heading, tick, landed, moveDone, flips, movesHeld, musicCredit,
      wind, legs, hype, hypeStreak, pushHeld: true });
    for (const b of s.blade) {
      b.tangent = v2(heading.x, heading.y);
      b.contact = v2(pos.x, pos.y);
    }
    events.push({
      tick, type: EVENT.Recovered, foot: s.supportFoot,
      prevCode: EDGE_CODE_NONE, newCode: EDGE_CODE_NONE, prevDwell: 0, value: 0,
    });
    return;
  }

  // ── 0b. in the air ────────────────────────────────────────────────────────
  // Nothing below applies to a skater with no blade on the ice: no carve, no
  // bite, no stroke, no balance loop to fall out of. sim/jump.ts flies the
  // body and lands it. Unreachable while jumpMode is 0.
  if (s.jump.phase === JUMP_PHASE.Air) {
    jumpAir(s, legInput(input), pFatigue, dt, events);
    // A landing resolves INSIDE jumpAir, on this early-return path — the only
    // one there is, every landing goes through it — so this is the one place
    // music credit and hype can ever see EVENT.Landing.
    landingAndTurnCredit(s, p, events, eventsAtStart, hypeOn, flowOn, dt);
    return;
  }

  const alive = !s.fallen;
  const leanCmd = clamp(axis(input.lean, 0), -1, 1) * pFatigue.maxLean;
  // Rate-limited: a leg takes time to bend, and a step command would unload
  // the blades entirely for a tick and read as a jump.
  //
  // Floored during a push: a straight leg cannot push, so a stroke bends the
  // knee whether or not the trigger asked it to. 0.35 is the neutral stance
  // (NEUTRAL_INPUT, and what the keyboard rests at), so a pad with RT released
  // strokes at close to keyboard strength — the leg still has to bend from
  // straight at the start of each push, which costs about an eighth of the
  // speed. Before this, a released trigger read as a straight leg, the push
  // force (strokePower * knee) was zero, and a pad could not get moving at
  // all. Deeper RT is still a stronger push; the floor only sets where zero is.
  //
  // Each leg has its own command (kneeSplit); the body's knee, the one that
  // sets the load, bite and jump, is the standing leg's. The pushing leg's
  // bend sets the push (pushKnee). Floored per leg, so either leg can push.
  const weightR = clamp(axis(input.weight, 0.5), 0, 1);
  const legTargets = legKnees(input, alive && (input.push || s.strokeTime > 0) ? 0.35 : 0);
  const kneeTarget = clamp(supportKnee(legTargets, weightR), 0, 1);
  s.knee = moveToward(s.knee, kneeTarget, p.kneeRate * dt);
  const knee = s.knee;
  // The same bend rate, offset by how far the pushing leg's command sits from
  // the standing leg's. Zero offset without a split: exactly the body's knee.
  const pushKnee = (): number => clamp(knee + (clamp(legTargets[s.strokeFoot], 0, 1) - kneeTarget), 0, 1);
  const split = clamp(axis(input.leanSplit, 0), -1, 1);
  const pitch = axis(input.pitch, 0), pitchSplit = clamp(axis(input.pitchSplit ?? 0, 0), -1, 1);
  // Each blade's own point on the rocker: the shared pitch, split apart.
  const contactS = [pitch - pitchSplit, pitch + pitchSplit].map((c) => clamp(0.5 + 0.5 * clamp(c, -1, 1), 0, 1));

  // ── 0c. a turn, a twizzle or a spin begins ────────────────────────────────
  // sim/moves.ts: on a fresh press, if the ice permits one. From here until it
  // ends the body is on one foot and the move stands in for sections 2-5.
  //
  // An Ina Bauer is held, not a pivot: it ends when the button is let go, or
  // the glide runs out, and the carve skates it in between. A Spiral is the
  // same shape of held move, one blade instead of two.
  if (s.move === MOVE.InaBauer) {
    s.inaBauer.t += dt;
    if (!input.inaBauer || s.fallen || len(s.vel) < 0.5 * p.inaBauerMinSpeed) inaBauerEnd(s, events);
  }
  if (s.move === MOVE.Spiral) {
    s.spiral.t += dt;
    if (!input.inaBauer || s.fallen || len(s.vel) < 0.5 * p.spiralMinSpeed) spiralEnd(s, events);
  }
  if (freshMoves & HELD.Turn) turnStart(s, p, false);
  else if (freshMoves & HELD.Bracket) turnStart(s, p, true);
  else if (freshMoves & HELD.Twizzle) twizzleStart(s, p);
  else if (freshMoves & HELD.Spin) spinStart(s, pFatigue, axis(input.carriage, 0), knee, axis(input.pitch, 0));
  else if (freshMoves & HELD.InaBauer) {
    // The same button reaches either, by how the skater is already standing:
    // weight shared near evenly is the two-footed Ina Bauer (data/motion-
    // primitives.json's own pre.forward: true); weight clearly on one foot
    // is the one-footed Spiral instead (its own pre.forward: "any").
    if (weightR > p.spiralWeightBand && weightR < 1 - p.spiralWeightBand) inaBauerStart(s, p, axis(input.lean, 0));
    else spiralStart(s, p);
  }
  const turning = replacesCarve(s);
  const ina = s.move === MOVE.InaBauer;
  const spiral = s.move === MOVE.Spiral;
  const moveThisTick = s.move;

  // ── 1. legs -> normal load ────────────────────────────────────────────────
  // A deep knee is more push, more bite and more jump impulse; here it only
  // has to produce the load, since the vertical axis belongs to the jump
  // package. legAccel enters N because pressing down loads the blade.
  const legTarget = p.comHeight * (1 - p.maxKneeCompression * knee);
  const legAccel = p.kneeSpring * (legTarget - s.legLength) - p.kneeDamping * s.legRate;
  s.legRate += legAccel * dt;
  s.legLength += s.legRate * dt;
  s.legLength = clamp(s.legLength, 0.3, p.comHeight * 1.05);

  const nTotal = Math.max(0, p.mass * (g + legAccel));
  // A move is made on one foot: the pivot or spinning foot, and after a mohawk's cusp the other.
  const loadFoot = !turning ? -1 : s.move === MOVE.Spin ? s.spin.foot : turnLoadFoot(s);
  // An Ina Bauer is on both feet, whatever the weight input says.
  const weights = loadFoot === FOOT.Right ? [0, 1] : loadFoot === FOOT.Left ? [1, 0]
    : ina ? [0.5, 0.5] : [1 - weightR, weightR];
  let loaded = 0;
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    b.weight = weights[i];
    b.normalLoad = nTotal * weights[i];
    b.contactS = contactS[i];
    b.inContact = b.normalLoad > 1e-3;
    if (b.inContact) loaded++;
  }
  s.supportMode = loaded;
  s.supportFoot = (weights[1] >= weights[0] ? FOOT.Right : FOOT.Left) as Foot;
  // The heading is the lead blade's, which points forward; the trail's points back.
  if (ina) s.supportFoot = s.inaBauer.lead;

  // ── 1b. begin a stroke, before any blade tilt is assigned ─────────────────
  if (alive && input.push && s.strokeTime <= 0 && !turning && !ina) {
    s.strokeTime = p.strokeDuration;
    s.strokeFoot = (1 - s.strokeFoot) as Foot;   // two-beat alternation
    // Legs, once per push rather than per tick: SkateSolver.cpp's own
    // S.LegPool -= 0.011f * Knee, at the moment the push begins.
    if (staminaOn) s.legs = clamp(s.legs - p.staminaLegsPerPush * pushKnee(), 0, 1);
    // "A straight stroke on a flat, a crossover on a curve" (bible §2.1). Read
    // off the BODY's lean, not the blade's: at speed a wide arc needs little
    // blade and a lot of lean — 7 m/s round 13 m is 9 degrees of blade and 21
    // of body — and a tilt threshold turned those crossovers back into
    // strokes. Fixed for the push, so a lean that changes mid-push cannot turn
    // half a stroke into a crossover.
    s.crossover = p.movesMode >= 1 && Math.abs(s.lean) >= p.crossoverLean;
    s.crossSide = s.crossover ? sign(s.lean) : 0;
    // The rhythm layer's beat window (sim/music.ts, bible §2.6): a crossover
    // push either lands on tempo or it does not, decided once at the push's
    // start, same as crossover itself.
    if (p.musicMode >= 1 && s.crossover) {
      const hit = onBeat(p, s.tick);
      s.strokeMusicScale = hit ? 1 : p.musicMissedPushScale;
      events.push({
        tick: s.tick, type: hit ? EVENT.MusicHit : EVENT.MusicMiss, foot: s.strokeFoot,
        prevCode: s.blade[s.strokeFoot].code, newCode: s.blade[s.strokeFoot].code,
        prevDwell: 0, value: hit ? 1 : p.musicMissedPushScale,
      });
    } else {
      s.strokeMusicScale = 1;
    }
  }
  const stroking = s.strokeTime > 0;

  // ── 1c. or a turn's pivot, in place of sections 2-5 ───────────────────────
  let yawNumer = 0, yawDenom = 0, latForceTotal = 0, excessWeighted = 0;
  let flatImpulse = v2(0, 0);
  let pivot: PivotTick | null = null;
  if (turning) {
    pivot = s.move === MOVE.Turn ? turnPivot(s, p, dt, weightR,
        s.turn.against ? input.bracket === true : input.turn === true, axis(input.lean, 0))
      : s.move === MOVE.Twizzle ? twizzleTick(s, p, dt, leanCmd, axis(input.carriage, 0), input.twizzle === true)
        : spinTick(s, pFatigue, dt, knee, axis(input.pitch, 0), axis(input.carriage, 0), input.spin === true,
            axis(input.lean, 0), (freshMoves & HELD.Toe) !== 0);
    latForceTotal = pivot.lat * p.mass;
    // A sit position, held: bible §2.8's "low spin positions" drain Legs.
    if (staminaOn && s.move === MOVE.Spin && knee >= p.spinSitKnee)
      s.legs = clamp(s.legs - p.staminaLegsPerSitSpin * dt, 0, 1);
  }

  // ── 2. balance controller: where the lean should put the blade ────────────
  // The skater does not steer, they lean; the blade angle that produces the
  // curvature the lean needs is solved for here, then rate-limited by the
  // neuromuscular lag. Assist tiers shrink that lag and nothing else.
  const rhoSupport = effectiveRocker(s.blade[s.supportFoot].contactS, p);
  if (alive && !turning) {
    const v2sq = Math.max(dot(s.vel, s.vel), p.minSpeedForCurv * p.minSpeedForCurv);
    // Fatigue noise (bible §2.8: "balance noise grows... x1.0 -> x2.4"),
    // reseeded from the tick count alone so a replay reproduces the same
    // wobble on the same tick rather than drawing from a live stream. 0
    // whenever staminaMode is off, so the balance loop stays exactly the
    // deterministic one every existing measurement was taken against.
    const noise = staminaOn
      ? p.staminaBalanceNoiseBase * lerp(1, p.staminaBalanceNoiseMax, 1 - legsMul) * (2 * rng(s.tick)() - 1)
      : 0;
    const aCmd = g * tan(leanCmd)
      + p.balanceKp * (s.lean - leanCmd)
      + p.balanceKd * s.leanRate
      + noise;
    const kappaMax = sin(pFatigue.maxTilt) / rhoSupport;
    const kappa = clamp(aCmd / v2sq, -kappaMax, kappaMax);
    let tiltTarget = asinClamped(kappa * rhoSupport);
    // SCRAPING, the edge sets the scrape, not a curve: the skater digs in on
    // the side the scrape pushes toward, as deep as the lean needs, and never
    // offers it the other edge. Whether the body can get there is the
    // angulation limit below — lean the wrong way and it cannot.
    if (slipOn && s.blade[s.supportFoot].regime === REGIME.Skid) {
      const into = -sign(dot(s.vel, perpLeft(s.heading)));
      const perSin = scrapeShare(p) * p.biteC1 * p.sharpness * p.iceHardness * (nTotal / p.mass);
      const base = scrapeShare(p) * p.biteC0 * p.sharpness * p.iceHardness * (nTotal / p.mass);
      const want = aCmd * into;
      tiltTarget = want > base && perSin > 1e-9
        ? into * asinClamped(clamp((want - base) / perSin, 0, sin(pFatigue.maxTilt)))
        : 0;
    }
    // Angulation: the blade may run deeper than the body leans, but only so
    // far. This gap is most of what "edge quality" means to a judge.
    tiltTarget = clamp(tiltTarget, s.lean - pEff.angulationLimit, s.lean + pEff.angulationLimit);
    tiltTarget = clamp(tiltTarget, -pEff.maxTilt, pEff.maxTilt);
    const alpha = pEff.controlLatency > 1e-4 ? Math.min(1, dt / pEff.controlLatency) : 1;
    s.tiltCmd += (tiltTarget - s.tiltCmd) * alpha;
  } else if (!turning) {
    s.tiltCmd += (0 - s.tiltCmd) * Math.min(1, dt / 0.3);
  }

  // ── 3. carve and bite, per loaded blade ───────────────────────────────────

  // A CROSSOVER'S PUSH IS CENTRIPETAL AS WELL AS PROPULSIVE. In a straight
  // stroke the sideways halves of the two beats point opposite ways and cancel;
  // on a curve the outside foot pushes out on its inside edge and the inside
  // foot pushes UNDER on its outside edge, so both reactions point at the
  // centre. That shared inward force is carried here: the carving blades need
  // that much less bite for the same arc, the body feels the same total lateral
  // acceleration, and only the forward half is added to the speed in 5b — a
  // centripetal force does no work. So a crossover holds a curve a stroke would
  // weave off, and at the limit it skids later.
  //
  // (The bible's §2.2 writes "the outside foot pushes under, the inside foot
  // pushes out". That is the wrong way round: the underpush is the inside foot's,
  // on its outside edge — which is also the only assignment in which both
  // reactions point inward. Corrected here rather than copied.)
  //
  // The pushing leg's share of the body is on the same arc as the rest of it,
  // so its centripetal demand does not vanish for the push: the carving blades
  // take it up, less what the push itself supplies. Leaving it out — which is
  // what a straight stroke does, and harmlessly, since a straight line has no
  // arc — halves the body's lateral support for the length of every push on a
  // curve, the equilibrium lean halves with it, and the curve collapses the
  // moment the skater pushes. Measured, responsive at 5 m/s on a 20 degree
  // edge: the blade command went from 31 degrees to -8 within a second of the
  // first stroke, and the arc from 4 m to 15.
  //
  // With the moves on, every push carries the pushing leg this way; only a
  // crossover's push also supplies inward force. With them off, pushes stay
  // exactly as `spec` has them, defect included.
  let crossLat = 0, crossLoad = 0, crossUsed = 0, pushMass = 0;
  if (stroking && p.movesMode >= 1) {
    const pb = s.blade[s.strokeFoot];
    if (pb.inContact) {
      for (let i = 0; i < 2; i++) {
        if (i !== s.strokeFoot && s.blade[i].inContact) crossLoad += s.blade[i].normalLoad;
      }
      if (crossLoad > 0) {
        pushMass = pb.normalLoad / g;
        if (s.crossover) {
          const back = dot(s.vel, s.heading) < -p.dirSpeedEps ? p.backPushScale : 1;
          crossLat = cos(p.strokeBeta) * Math.min(p.strokePower * pushKnee() * p.mass * back,
            biteCapacity(pb.normalLoad, s.crossSide * p.strokeEdge, p, condAt(pb.contact)));
        }
      }
    }
  }

  // slipMode: skid events are decided after the slip solve, against these.
  const wasSkidAll = slipOn ? s.blade.map((b) => b.regime === REGIME.Skid) : undefined;
  let carveLost = false;
  if (!turning) for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    // The pushing blade rolls onto its own INSIDE edge for the length of the
    // push; every other blade carries the body's commanded tilt. For the left
    // foot the inside edge is a negative tilt and for the right a positive
    // one, which is the same rule classify.ts states, read backwards.
    const pushing = stroking && i === s.strokeFoot;
    // A pushing blade is committed to its own inside edge and answers to
    // nothing else; every other blade carries the body's tilt, plus its share
    // of however far the two are being held apart.
    //
    // In a crossover both pushing blades lean toward the curve's centre: the
    // outside foot is then on its inside edge as in a stroke, and the inside
    // foot on its OUTSIDE edge — the underpush.
    //
    // In an Ina Bauer the trailing blade points backward, so the body's tilt,
    // read in its reversed frame, has the opposite sign.
    const apart = (i === FOOT.Left ? -1 : 1) * split * p.splitTiltMax;
    const reversed = ina && i !== s.inaBauer.lead;
    b.tilt = pushing
      ? (s.crossover ? s.crossSide * p.strokeEdge : (i === FOOT.Left ? -p.strokeEdge : p.strokeEdge))
      : reversed ? -clamp(s.tiltCmd, -pFatigue.maxTilt, pFatigue.maxTilt)
        : clamp(s.tiltCmd + apart, -pFatigue.maxTilt, pFatigue.maxTilt);

    if (!b.inContact) {
      b.regime = REGIME.Unloaded;
      b.latForce = 0; b.latSlipAccel = 0; b.demandRatio = 0;
      b.biteCapacity = 0; b.turnRadius = Infinity; b.longSpeed = 0;
      continue;
    }

    const wasSkid = b.regime === REGIME.Skid;
    const t = b.tangent;
    const vLong = dot(s.vel, t);
    b.longSpeed = vLong;

    const rhoEff = effectiveRocker(b.contactS, p);
    const absTilt = Math.abs(b.tilt);
    const onEdge = absTilt >= p.flatThreshold;

    if (!onEdge) {
      // A FLAT BLADE IS NOT A CASTER. It still resists being pushed sideways —
      // that is exactly what biteC0 is — and skipping the lateral solve here
      // leaves stroke impulses in the velocity with nothing to remove them.
      // Straight stroking then crabs sideways: measured at just under a metre
      // of drift over fourteen metres of travel before this was added.
      const nFlat = perpLeft(b.tangent);
      const vLatFlat = dot(s.vel, nFlat);
      const capFlat = biteCapacity(b.normalLoad, b.tilt, p, condAt(b.contact));
      const wanted = Math.abs(vLatFlat) * (b.normalLoad / g);
      const allowed = Math.min(wanted, capFlat * dt);
      // With slip on, the body-level slip solve in section 4 does this.
      if (!slipOn) flatImpulse = add(flatImpulse, mul(nFlat, -sign(vLatFlat) * allowed));

      b.turnRadius = Infinity; b.latForce = -sign(vLatFlat) * allowed / dt;
      b.latSlipAccel = 0;
      b.demandRatio = capFlat > 1e-6 ? wanted / (capFlat * dt) : 0;
      b.biteCapacity = capFlat;
      b.regime = REGIME.Glide;
      if (wasSkid && !slipOn) events.push({
        tick: s.tick, type: EVENT.SkidEnd, foot: i as Foot,
        prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: 0,
      });
      yawDenom += b.normalLoad;
      continue;
    }

    const rGeo = carveRadius(b.tilt, rhoEff);
    const massShare = b.normalLoad / g;      // kg this blade answers for
    // In a crossover, a blade carving toward the push's centre also answers
    // for its share of the pushing leg, and is spared its share of the push.
    // Outside one, both are zero and the carve is exactly as it was,
    // expression for expression.
    const inCross = pushMass > 0 && !pushing;
    const share = inCross ? b.normalLoad / crossLoad : 0;
    const helped = crossLat > 0 && sign(b.tilt) === s.crossSide ? share * crossLat : 0;
    crossUsed += helped;
    const arcMass = inCross ? massShare + share * pushMass : massShare;
    const fArc = arcMass * vLong * vLong / rGeo;
    const fNeed = inCross ? Math.abs(fArc - helped) : fArc;
    const fBite = biteCapacity(b.normalLoad, b.tilt, p, condAt(b.contact));

    // `excess` is an ACCELERATION (m/s^2): the part of the demand the edge
    // could not answer. It is what gets scrubbed off as speed below.
    let radius: number, excess: number, fLat: number;
    // With slip on the blade steers along its own arc whatever the edge can
    // hold; whether the travel follows is section 4's slip solve.
    if (slipOn && fNeed > fBite && !(stroking && i === s.strokeFoot)) carveLost = true;
    if (slipOn || fNeed <= fBite) {
      radius = rGeo; excess = 0; fLat = Math.min(fNeed, fBite);
    } else if (inCross) {
      // Letting go mid-crossover: the arc opens to what the push and the bite
      // hold between them.
      const held = helped + (fArc >= helped ? fBite : -fBite);
      radius = held > 1e-6 ? arcMass * vLong * vLong / held : 1e6;
      excess = (fNeed - fBite) / Math.max(arcMass, 1e-6);
      fLat = fBite;
    } else {
      // The edge lets go: the arc opens out to whatever the bite can hold and
      // the difference is scrubbed off as speed.
      radius = fBite > 1e-6 ? massShare * vLong * vLong / fBite : 1e6;
      excess = (fNeed - fBite) / Math.max(massShare, 1e-6);
      fLat = fBite;
    }

    b.turnRadius = radius;
    b.biteCapacity = fBite;
    b.demandRatio = fBite > 1e-6 ? fNeed / fBite : 0;
    b.latSlipAccel = excess;
    // Toward the arc's centre — unless a crossover is pushing in harder than
    // the arc needs, when the edge holds the body out instead.
    b.latForce = fLat * sign(b.tilt) * (fArc >= helped ? 1 : -1);

    // A PUSHING blade is not carrying the skater — it is the push. Its lateral
    // force is applied explicitly in 5b, so counting the carve force here as
    // well would apply the same sideways shove twice, and the second copy is
    // the one that steers and unbalances the body. Left in, ten strokes from a
    // standstill wound the lean up to 40 degrees and put the skater down; the
    // stroke reads as a weave that never comes back.
    if (!(stroking && i === s.strokeFoot)) {
      // The body's lateral frame is the heading's; a reversed blade's is not.
      latForceTotal += reversed ? -b.latForce : b.latForce;
      excessWeighted += excess * b.weight;
      const yawRate = sign(b.tilt) * vLong / Math.max(radius, 0.35);
      yawNumer += yawRate * b.normalLoad;
      yawDenom += b.normalLoad;
    }

    b.regime = excess > 0 ? REGIME.Skid
      : b.demandRatio > p.carveDemand ? REGIME.Carve
        : REGIME.Edge;
    if (input.brake && Math.abs(vLong) > 0.2) b.regime = REGIME.Brake;

    const isSkid = b.regime === REGIME.Skid;
    if (slipOn) continue;
    if (isSkid && !wasSkid) events.push({
      tick: s.tick, type: EVENT.SkidBegin, foot: i as Foot,
      prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: excess,
    });
    if (!isSkid && wasSkid) events.push({
      tick: s.tick, type: EVENT.SkidEnd, foot: i as Foot,
      prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: 0,
    });
  }

  // The inward half of a crossover push acts on the body however the blades
  // shared it, so the pendulum feels the same total the arc demands.
  if (crossUsed > 0) latForceTotal += s.crossSide * crossUsed;

  // ── 4. turn the blades and the body ───────────────────────────────────────
  // An ideal edge does no work: it changes where the velocity points, not how
  // big it is. Rotating the velocity rather than projecting out its lateral
  // component matters more than it sounds — a projection bleeds speed as
  // cos(w dt) every tick, which is a discretization artifact that scales with
  // the timestep and would otherwise get tuned around as though it were drag.
  if (flatImpulse.x !== 0 || flatImpulse.y !== 0) {
    s.vel = add(s.vel, mul(flatImpulse, 1 / p.mass));
  }

  if (!turning) {
    const steer = yawDenom > 1e-6 ? yawNumer / yawDenom : 0;
    const yawRate = torqueOn ? trunkTorque(s, p, dt, steer, input) : steer;
    s.yawRate = yawRate;
    const dPsi = yawRate * dt;
    if (dPsi !== 0) {
      for (let i = 0; i < 2; i++) {
        const b = s.blade[i];
        if (b.inContact) b.tangent = normalizeOr(rotate(b.tangent, dPsi), b.tangent);
      }
      // An edge that holds carries the travel round with it. With slip on,
      // one that cannot leaves the travel behind for the slip solve — and a
      // foot the trunk pivots off its carve carries only the carve's share.
      if (!slipOn || !carveLost) s.vel = rotate(s.vel, torqueOn ? steer * dt : dPsi);
    }
    s.heading = s.blade[s.supportFoot].inContact
      ? s.blade[s.supportFoot].tangent
      : s.heading;
    if (slipOn) {
      const slip = slipSolve(s, p, dt, stroking, wasSkidAll!, events);
      // A lost carve holds nothing toward its centre; the scrape is the force.
      latForceTotal = carveLost ? slip : latForceTotal + slip;
    }
  }

  // ── 5. losses ─────────────────────────────────────────────────────────────
  let speed = len(s.vel);
  if (!turning && speed > 1e-6) {
    const dir = mul(s.vel, 1 / speed);

    // Skid scrub, following SkateSolver.cpp: mu_skid * (excess acceleration)
    // * dt is a speed decrement, which is where the snow comes from.
    if (excessWeighted > 0) speed = Math.max(0, speed - p.muSkid * excessWeighted * dt);

    // Blade friction, summed over the blades so the load split is honoured.
    let dv = 0;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      // With slip on, the scrape is already the slip solve's sideways force.
      dv += muLong(b.tilt, !slipOn && b.latSlipAccel > 0, p, condAt(b.contact)) * b.normalLoad / p.mass * dt;
    }
    if (input.brake) dv += p.muSkid * nTotal / p.mass * dt;
    // An Ina Bauer's trailing foot is never turned out quite square to the lead.
    if (ina) dv += p.inaBauerScrub * s.blade[1 - s.inaBauer.lead].normalLoad / p.mass * dt;

    // Air drag. At 8 m/s this is several times blade friction, which is why
    // speed is expensive to build and cheap to keep. Side-on, arms spread, in
    // an Ina Bauer, rather more.
    const dragArea = ina ? p.cdA * p.inaBauerDrag : spiral ? p.cdA * p.spiralDrag : p.cdA;
    dv += 0.5 * p.airDensity * dragArea * speed * speed / p.mass * dt;

    // Friction never reverses motion.
    //
    // The rink's shape (rinkRelief), skipped outright on a flat sheet so every
    // preset's arithmetic is the /6 solver's to the bit. Only the pull along
    // the travel is applied: across it the edge holds, and at a rink's relief
    // that side load is under a thousandth of g against the lean. It needs
    // speed, as this whole block does — a blade standing still is held by
    // static friction far above any slope a rink has. Not applied in the air
    // or through a turn's pivot, which leave this block before it runs.
    if (p.rinkRelief !== 0) speed = Math.max(0, speed - dv + dot(rinkSlopeAccel(s.pos, p), dir) * dt);
    else speed = Math.max(0, speed - dv);
    s.vel = mul(dir, speed);
  }

  // ── 5b. stroke ────────────────────────────────────────────────────────────
  // You push SIDEWAYS against an edge. A blade offers almost nothing along its
  // own length, so the pushing foot is splayed out of the line of travel by
  // beta and only F sin(beta) of the push goes forward — which is why a stroke
  // is a wide, slow, deep-knee movement rather than a run.
  //
  // The push is capped by the pushing blade's own bite: you cannot push off a
  // flat blade, and over-pushing a lightly loaded one just skids it. That
  // falls out of the capacity term rather than being special-cased.
  if (stroking) {
    s.strokeTime -= dt;
    const push = s.blade[s.strokeFoot];
    if (push.inContact) {
      const outward = s.strokeFoot === FOOT.Left ? 1 : -1;
      // Reaction to a push along the splayed blade's normal: forward by
      // sin(beta), sideways by cos(beta). The sideways halves cancel across
      // the two beats, which is what makes alternation the natural gait.
      // Skating backward, the splay mirrors across the blade's normal and the
      // push drives backward: a C-cut rather than a stroke, and with the moves
      // on a slightly weaker one (backPushScale).
      const back = dot(s.vel, s.heading) < -p.dirSpeedEps ? -1 : 1;
      const wanted = p.strokePower * pushKnee() * p.mass * s.strokeMusicScale
        * (back < 0 && p.movesMode >= 1 ? p.backPushScale : 1);
      const force = Math.min(wanted, push.biteCapacity);
      if (s.crossover && crossLat > 0) {
        // Forward only: the inward half was centripetal, shared with the
        // carving blades in section 3, and a centripetal force does no work.
        s.vel = add(s.vel, mul(s.heading, back * (force / p.mass) * sin(p.strokeBeta) * dt));
      } else {
        const dirv = mul(rotate(perpLeft(s.heading), outward * back * p.strokeBeta), -outward);
        s.vel = add(s.vel, mul(dirv, (force / p.mass) * dt));
      }
    }
  }

  // ── 6. integrate ──────────────────────────────────────────────────────────
  s.pos = add(s.pos, mul(s.vel, dt));

  // ── 7. the inverted pendulum ──────────────────────────────────────────────
  const L = Math.max(s.legLength, 0.3);
  s.latAccel = latForceTotal / p.mass;
  s.leanEq = equilibriumLean(s.latAccel, g);
  s.balanceError = s.lean - s.leanEq;

  let aInt = 0;
  if (alive) {
    // POSITIVE gain: an over-lean needs MORE lateral acceleration to arrest it.
    //
    // The rate term is the second correction to this line. The package has
    // proportional gain only, which is why its own assist tier — raise
    // internalMax and the skater recovers harder — puts the skater down
    // SOONER: a gain with no damping is an oscillator, and a bigger ceiling is
    // a bigger oscillation. Damping is taken on lean RATE rather than on the
    // derivative of the error, so that a moving equilibrium (which is most of
    // skating) does not kick it.
    aInt = clamp(p.internalGain * s.balanceError + p.internalRateGain * s.leanRate,
      -pEff.internalMax, pEff.internalMax);

    // WASHOUT. Arms have finite travel: what is held drains away, what changes
    // gets through. Without it the arms hold a lean the edge is not carrying,
    // forever, and the skater neither reaches the commanded edge nor falls off
    // it — which reads on screen as a controller that ignores you.
    if (p.internalWashout > 1e-4) {
      s.intHeld += (aInt - s.intHeld) * Math.min(1, dt / p.internalWashout);
      aInt = clamp(aInt - s.intHeld, -pEff.internalMax, pEff.internalMax);
    } else {
      s.intHeld = 0;
    }

    // The centre of pressure is NOT washed out: a stance 24 cm wide really can
    // hold a small lean indefinitely, which is what standing still is.
    //
    // Two corrections to it, both 0 in `spec`. As the package has it the
    // stance is a proportional term on the balance error and nothing else,
    // and two-footed it pulls against the lean controller: the controller
    // eases the edge to let the body lean in, the stance holds the body up off
    // the edge it has eased, and from upright its undamped push runs the lean
    // past anything the edge can hold. Measured, `responsive` at 4 m/s with
    // both feet down and 20 degrees asked for: the blade pinned at maxTilt for
    // 229 ticks and the skater fell at 3.4 s, where one-footed the same command
    // settles at 20.1. So the stance gets the rate half of its PD
    // (`copRateGain`, as the arms got theirs), and it aims for the lean the
    // skater commands (`copCommandShare`) as far as the edge could carry the
    // stance's load at this speed — which at a standstill is not at all, so
    // standing still is what it was.
    if (s.supportMode === 2) {
      const copMax = g * p.stanceHalfWidth / L;
      let copError = s.balanceError;
      if (p.copCommandShare > 0) {
        const edgeCan = dot(s.vel, s.vel) * sin(pFatigue.maxTilt) / effectiveRocker(s.blade[s.supportFoot].contactS, p);
        const aim = clamp(edgeCan / copMax, 0, 1) * p.copCommandShare;
        copError = s.lean - (s.leanEq + (leanCmd - s.leanEq) * aim);
      }
      const copDemand = p.copRateGain > 0
        ? p.copGain * copError + p.copRateGain * s.leanRate
        : p.copGain * copError;
      aInt += clamp(copDemand, -copMax, copMax);
    }
  }
  s.intAccel = aInt;
  const leanAccel = (g * sin(s.lean) - (s.latAccel + aInt) * cos(s.lean)) / L;
  s.leanRate += leanAccel * dt;
  s.lean = clamp(s.lean + s.leanRate * dt, -1.55, 1.55);
  s.comZ = L * cos(s.lean);

  // Blade contacts hang off the base of the pendulum, not off the COM. In a
  // turn the pendulum is in the travel frame, and so are they.
  const frameH = moveThisTick === MOVE.Turn || moveThisTick === MOVE.Twizzle ? turnFrame(s) : s.heading;
  const right = mul(perpLeft(frameH), -1);
  const base = add(s.pos, mul(right, L * sin(s.lean)));
  for (let i = 0; i < 2; i++) {
    const off = s.supportMode === 2 ? p.stanceHalfWidth : 0;
    s.blade[i].contact = add(base,
      mul(perpLeft(frameH), i === FOOT.Left ? off : -off));
  }
  // An Ina Bauer's feet are a stride apart along the track: the lead ahead.
  if (ina) {
    const lead = s.inaBauer.lead;
    s.blade[lead].contact = add(s.blade[lead].contact, mul(frameH, INA_BAUER_STRIDE));
    s.blade[1 - lead].contact = add(s.blade[1 - lead].contact, mul(frameH, -INA_BAUER_STRIDE));
  }

  // Write the sheet where each blade ends up this tick — one tick after the
  // position friction and bite above read, the same lag `pushRoll` already
  // has in session.ts, and harmless at 120 Hz.
  if (iceOn) for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (b.inContact) ice!.deposit(b.contact, b.latSlipAccel, dt, p);
  }

  // ── 8. classify, and say so ───────────────────────────────────────────────
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    const prev = b.code;
    if (!b.inContact) {
      if (prev !== EDGE_CODE_NONE) {
        events.push({
          tick: s.tick, type: EVENT.EdgeLost, foot: i as Foot,
          prevCode: prev, newCode: EDGE_CODE_NONE, prevDwell: b.dwell, value: b.tilt,
        });
      }
      b.code = EDGE_CODE_NONE; b.dwell = 0; b.depth = 0;
      continue;
    }
    const next = classifyCode(i as Foot, b.tilt, b.longSpeed, prev, p);
    if (next !== prev) {
      events.push({
        tick: s.tick, type: EVENT.EdgeChanged, foot: i as Foot,
        prevCode: prev, newCode: next, prevDwell: b.dwell, value: b.tilt,
      });
      b.code = next; b.dwell = 0;
    } else {
      const was = b.dwell;
      b.dwell += dt;
      if (was < p.minDwell && b.dwell >= p.minDwell) {
        events.push({
          tick: s.tick, type: EVENT.EdgeEstablished, foot: i as Foot,
          prevCode: next, newCode: next, prevDwell: b.dwell, value: b.tilt,
        });
      }
    }
    b.depth = classifyDepth(b.tilt, p);
  }
  if (pivot?.cusp && moveThisTick === MOVE.Turn) turnEvent(s, events);
  if (pivot?.ended && moveThisTick === MOVE.Twizzle) twizzleEvent(s, events);
  if (pivot?.ended && moveThisTick === MOVE.Spin) spinEvent(s, events);

  // ── 9. fall, latched ──────────────────────────────────────────────────────
  // Latched, because a fall condition that stays true would otherwise emit an
  // event every tick and drown the stream it is trying to explain.
  if (alive) {
    // The timeout is asking whether the skater can still get back. So it has
    // to count the authority they would be getting back WITH: leanEq is the
    // lean the EDGE alone balances, and a skater using their arms and free leg
    // is deliberately not at it — that is what those are for.
    //
    // At credit 0 this is the package's criterion, bit for bit, and it puts
    // the skater on the ice at THREE DEGREES of lean, upright, mid-recovery,
    // 0.35 s after an assist tier was turned up. That measurement is most of
    // why raising internal authority looked like it made balance worse.
    const supported = p.fallAuthorityCredit > 0
      ? equilibriumLean(s.latAccel + p.fallAuthorityCredit * s.intAccel, g)
      : s.leanEq;
    if (Math.abs(s.lean - supported) > p.fallError) s.balanceErrorTime += dt;
    else s.balanceErrorTime = 0;

    let reason: Fall = FALL.None;
    if (Math.abs(s.lean) > p.fallLean) reason = FALL.LeanExceeded;
    else if (s.balanceErrorTime > p.fallErrorTime) reason = FALL.BalanceTimeout;

    if (reason !== FALL.None) {
      s.fallReason = reason;
      s.fallen = true;
      s.strokeTime = 0;
      events.push({
        tick: s.tick, type: EVENT.Fall, foot: s.supportFoot,
        prevCode: s.blade[s.supportFoot].code, newCode: reason,
        prevDwell: s.balanceErrorTime, value: s.lean,
      });
    }
  }

  // ── 10. is the knee loading a jump, or releasing one? ─────────────────────
  if (!turning) carryDecay(s, p, dt);
  const wasGrounded = s.jump.phase !== JUMP_PHASE.Air;
  jumpGround(s, legInput(input), pFatigue, dt, events);
  if (staminaOn && wasGrounded && s.jump.phase === JUMP_PHASE.Air)
    s.legs = clamp(s.legs - p.staminaLegsPerJump, 0, 1);

  // ── 11 & 13. musical credit and hype ───────────────────────────────────────
  // Both react to events THIS tick pushed, wherever in the function that
  // happened — including the 0b early return, which is why this is a call
  // rather than inline code: a landing is resolved inside jumpAir, on the
  // early-return path, and section 12's stamina drain used to be the only
  // thing after it. Without this call landings could turn a jump but never
  // credit music or hype, found while wiring hype through the exact same
  // "scan this tick's events" pattern music already used.
  landingAndTurnCredit(s, p, events, eventsAtStart, hypeOn, flowOn, dt);

  // ── 12. stamina: the two pools drain and recover ──────────────────────────
  // Continuous terms only; the event-driven ones (a push, a jump, a sit
  // spin) already applied above, at the moment they happened. Skipped while
  // fallen — nothing here describes lying on the ice.
  if (staminaOn && alive) {
    const speed = len(s.vel);
    const lowEffort = !stroking && !turning && Math.abs(s.tiltCmd) <= p.staminaLowEffortTilt;
    // "High flow means you carry speed and push less, so it is literally
    // cheaper to skate well" — flowMode 0 makes this 1, exactly as before.
    const flowEfficiency = flowOn ? lerp(1, p.flowStaminaEfficiencyMin, clamp(s.flow, 0, 1)) : 1;
    s.wind = clamp(s.wind
      - (p.staminaWindTimeDrain + p.staminaWindSpeedDrain * speed * speed) * flowEfficiency * dt
      + (lowEffort ? p.staminaWindRecover * dt : 0), 0, 1);
    // Legs, gated by Wind: "once Wind is low, Legs stop coming back."
    const legsRecover = lowEffort && s.wind >= p.staminaLegsRecoverWindFloor ? p.staminaLegsRecover * dt : 0;
    // Only the DEEP part of an edge costs Legs — past depthShallow, the same
    // boundary classify.ts already draws — so cruising a shallow curve is free.
    const deepBy = Math.max(0, Math.abs(s.tiltCmd) - p.depthShallow);
    s.legs = clamp(s.legs - p.staminaLegsPerDeepEdge * deepBy * dt + legsRecover, 0, 1);
  }

  // ── 14. flow: continuous motion, held on a real edge ──────────────────────
  // design-bible.md §2.6. Ground-based terms only; the beat-grid bonus is
  // handled in landingAndTurnCredit below, alongside music and hype, for the
  // same early-return reason.
  if (flowOn && alive && !turning) {
    const speed = len(s.vel);
    const regime = s.blade[s.supportFoot].regime;
    if (regime === REGIME.Skid) s.flow = clamp(s.flow - p.flowSkidLoss * dt, 0, 1);
    else if (speed < 0.5) s.flow = clamp(s.flow - p.flowStopLoss * dt, 0, 1);
    else if (regime === REGIME.Carve || regime === REGIME.Edge) s.flow = clamp(s.flow + p.flowCarveGain * dt, 0, 1);
    else if (regime === REGIME.Glide) s.flow = clamp(s.flow - p.flowFlatLoss * dt, 0, 1);
    // Re-crossing already-damaged ice, only while the ice grid is in play.
    if (iceOn && condAt(s.blade[s.supportFoot].contact) >= p.flowDamagedIceThreshold)
      s.flow = clamp(s.flow - p.flowDamagedIceLoss * dt, 0, 1);
    // "Alternating lobes" / "repeated lobes in the same direction": one
    // signal, not two — does the current curve's sign (s.tiltCmd's, the same
    // convention every other lean-derived signed quantity in this state
    // uses) hold long enough to call it a lobe, and did the one before it
    // match or oppose it. Only a real Carve/Edge counts as curving; a skid
    // or a flat blade cannot be a lobe. See types.ts's own comment on
    // `lobeDir`/`lobeLastDir` for why the gap between two lobes is tracked
    // as its own state rather than folded into one field.
    const curveDir = (regime === REGIME.Carve || regime === REGIME.Edge) ? Math.sign(s.tiltCmd) : 0;
    if (curveDir === s.lobeCandDir) s.lobeCandT += dt;
    else { s.lobeCandDir = curveDir; s.lobeCandT = dt; }
    if (s.lobeCandT >= p.flowLobeMinHoldTime && curveDir !== s.lobeDir) {
      if (curveDir === 0) {
        // The active lobe just ended: a sustained flat blade or skid.
        s.lobeLastDir = s.lobeDir;
        s.lobeDir = 0;
      } else {
        // A new lobe becomes active, from a gap or (no gap having lasted
        // flowLobeMinHoldTime) directly from the one still active.
        const endingDir = s.lobeDir !== 0 ? s.lobeDir : s.lobeLastDir;
        if (endingDir !== 0) {
          if (curveDir === -endingDir) { s.lobeAlternations++; s.flow = clamp(s.flow + p.flowLobeAlternateGain, 0, 1); }
          else { s.lobeRepeats++; s.flow = clamp(s.flow - p.flowLobeRepeatLoss, 0, 1); }
        }
        s.lobeDir = curveDir;
      }
    }
    // "Dead air between elements": once at least one has actually happened
    // (moveDone/landed both start at -1, so an opening glide before the
    // first element is not dead air), a grace period past it, with no new
    // one under way (s.jump.phase === None is this same gate's jump half —
    // `!turning` already covers a turn/twizzle/spin/Ina Bauer in progress;
    // a jump's own airborne phase never reaches this line at all, the 0b
    // early return above takes it).
    const sinceElement = s.moveDone.tick < 0 && s.landed.tick < 0 ? -1
      : (s.tick - Math.max(s.moveDone.tick, s.landed.tick)) * dt;
    if (sinceElement > p.flowDeadAirTime && s.jump.phase === JUMP_PHASE.None)
      s.flow = clamp(s.flow - p.flowDeadAirLoss * dt, 0, 1);
  }
}

/**
 * Sections 11 & 13: musical credit (sim/music.ts, bible §2.1, §2.6) for a
 * turn's cusp or a jump's landing, hype's own read of the same events — a
 * landing that also earned an accent this tick — and flow's beat-grid
 * bonus. A function, not inline code, because a landing resolves inside
 * jumpAir on step()'s early-return path (0b), before any of these systems'
 * usual place in the tick, so both call sites need the identical scan.
 */
function landingAndTurnCredit(
  s: SkaterState, p: Params, events: EdgeEvent[], eventsAtStart: number,
  hypeOn: boolean, flowOn: boolean, dt: number,
): void {
  if (p.musicMode >= 1) {
    const eventsEnd = events.length;
    for (let i = eventsAtStart; i < eventsEnd; i++) {
      const e = events[i];
      if (e.type !== EVENT.Turn && e.type !== EVENT.Landing) continue;
      const credit = accentCredit(p, s.tick);
      if (credit > 0) {
        s.musicCredit += credit;
        events.push({
          tick: s.tick, type: EVENT.MusicAccent, foot: e.foot,
          prevCode: e.newCode, newCode: e.newCode, prevDwell: 0, value: credit,
        });
      }
    }
  }

  // Shared between hype and flow: did THIS tick's turn or landing earn an
  // accent above. Scanned once rather than twice.
  let musicHit = false;
  if (hypeOn || flowOn) {
    for (let i = eventsAtStart; i < events.length; i++) {
      if (events[i].type === EVENT.MusicAccent) { musicHit = true; break; }
    }
  }

  if (hypeOn) {
    let landedThisTick = false, fellThisTick = false;
    for (let i = eventsAtStart; i < events.length; i++) {
      const e = events[i];
      if (e.type === EVENT.Landing) landedThisTick = true;
      else if (e.type === EVENT.Fall) fellThisTick = true;
    }
    if (fellThisTick) {
      s.hype = clamp(s.hype * (1 - p.hypeFallLoss), 0, 1);
      s.hypeStreak = 0;
    } else if (landedThisTick) {
      const clean = !s.landed.fall && !s.landed.stepOut && !s.landed.twoFoot;
      if (clean) {
        s.hypeStreak++;
        const gain = p.hypeLandingGain * s.landed.landingQuality * (1 + p.hypeStreakBonus * (s.hypeStreak - 1))
          + (musicHit ? p.hypeMusicBonus : 0);
        s.hype = clamp(s.hype + gain, 0, 1);
      } else {
        s.hypeStreak = 0;
      }
    }
    // Continuous, so it applies whichever path called this — grounded or
    // the airborne early return, once per tick either way.
    s.hype = clamp(s.hype - p.hypeDecayPerSecond * dt, 0, 1);
  }

  // "Turns executed on the beat grid" (bible §2.6): the flat bonus half of
  // that bullet. It needs no landing/fall branching of its own — a turn's
  // cusp reaches this function through the normal end of a tick, never the
  // early return, but sharing the call keeps one scan for both systems.
  if (flowOn && musicHit) s.flow = clamp(s.flow + p.flowBeatGain, 0, 1);
}

/** Run n ticks at the fixed rate. Convenience for tests and the replay path. */
export function run(
  s: SkaterState, input: SkatingInput, p: Params, ticks: number, events: EdgeEvent[] = [],
  ice?: IceGrid,
): SkaterState {
  for (let i = 0; i < ticks; i++) step(s, input, p, SIM_DT, events, ice);
  return s;
}

// ── checksum ────────────────────────────────────────────────────────────────

/**
 * Quantized state checksum, for divergence detection across a replay.
 *
 * Position to 0.1 mm, angles to 1e-5 rad, by truncation. Blade codes are
 * included: a divergence that showed up only as a different edge call, with
 * the kinematics still matching to a tenth of a millimetre, is exactly the
 * kind this has to catch.
 */
export function checksum(s: SkaterState): number {
  const q = new Int32Array([
    quantize(s.pos.x, 1e4), quantize(s.pos.y, 1e4),
    quantize(s.vel.x, 1e4), quantize(s.vel.y, 1e4),
    quantize(s.heading.x, 1e6), quantize(s.heading.y, 1e6),
    quantize(s.lean, 1e5), quantize(s.leanRate, 1e5),
    quantize(s.tiltCmd, 1e5), quantize(s.latAccel, 1e4),
    s.blade[0].code | (s.blade[1].code << 8) | (s.blade[0].regime << 16) | (s.blade[1].regime << 24),
    s.tick | 0,
  ]);
  return crc32(new Uint8Array(q.buffer));
}
