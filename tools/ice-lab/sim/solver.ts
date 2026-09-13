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

import { add, mul, dot, len, perpLeft, rotate, normalizeOr, clamp, sign, asinClamped, moveToward, quantize, crc32, v2, tan, sin, cos } from "./math.ts";
import { EDGE_CODE_NONE, REGIME, FALL, EVENT, FOOT, MOVE, HELD } from "./types.ts";
import type {
  SkaterState, BladeState, SkatingInput, EdgeEvent, Foot, Fall,
} from "./types.ts";
import type { Params } from "./params.ts";
import { SIM_DT } from "./params.ts";
import { effectiveRocker, carveRadius, biteCapacity, muLong, equilibriumLean } from "./blade.ts";
import { classifyCode, classifyDepth } from "./classify.ts";
import { newJump, noResult, jumpGround, jumpAir, JUMP_PHASE } from "./jump.ts";
import {
  newTurn, newSpin, noMove, turnStart, twizzleStart, spinStart, turnPivot, twizzleTick, spinTick,
  turnFrame, turnLoadFoot, turnEvent, twizzleEvent, spinEvent, carryDecay, replacesCarve,
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
    jump: newJump(p), landed: noResult(),
    move: MOVE.None, turn: newTurn(), spin: newSpin(), moveDone: noMove(), movesHeld: 0, flips: 0, spinCarry: 0,
    fallReason: FALL.None, fallen: false, tick: 0,
    blade: [makeBlade(), makeBlade()],
  };
}

// ── the step ────────────────────────────────────────────────────────────────

export function step(
  s: SkaterState, input: SkatingInput, p: Params, dt: number, events: EdgeEvent[],
): void {
  const g = p.gravity;
  s.tick++;

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
    | (input.spin === true ? HELD.Spin : 0);
  const freshMoves = heldNow & ~s.movesHeld;
  s.movesHeld = heldNow;
  if (s.fallen && freshPush) {
    // The last landing is kept: it is the record of why they are down. So is
    // the frame count, since the heading is kept and a scheme reads it.
    const { pos, heading, tick, landed, moveDone, flips, movesHeld } = s;
    Object.assign(s, createState(p), { pos, heading, tick, landed, moveDone, flips, movesHeld, pushHeld: true });
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
    jumpAir(s, input, p, dt, events);
    return;
  }

  const alive = !s.fallen;
  const leanCmd = clamp(axis(input.lean, 0), -1, 1) * p.maxLean;
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
  const kneeTarget = Math.max(axis(input.knee, 0.35),
    alive && (input.push || s.strokeTime > 0) ? 0.35 : 0);
  s.knee = moveToward(s.knee, clamp(kneeTarget, 0, 1), p.kneeRate * dt);
  const knee = s.knee;
  const weightR = clamp(axis(input.weight, 0.5), 0, 1);
  const split = clamp(axis(input.leanSplit, 0), -1, 1);
  const contactS = clamp(0.5 + 0.5 * clamp(axis(input.pitch, 0), -1, 1), 0, 1);

  // ── 0c. a turn, a twizzle or a spin begins ────────────────────────────────
  // sim/moves.ts: on a fresh press, if the ice permits one. From here until it
  // ends the body is on one foot and the move stands in for sections 2-5.
  if (freshMoves & HELD.Turn) turnStart(s, p);
  else if (freshMoves & HELD.Twizzle) twizzleStart(s, p);
  else if (freshMoves & HELD.Spin) spinStart(s, p, axis(input.carriage, 0), knee, axis(input.pitch, 0));
  const turning = replacesCarve(s);
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
  const weights = loadFoot === FOOT.Right ? [0, 1] : loadFoot === FOOT.Left ? [1, 0] : [1 - weightR, weightR];
  let loaded = 0;
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    b.weight = weights[i];
    b.normalLoad = nTotal * weights[i];
    b.contactS = contactS;
    b.inContact = b.normalLoad > 1e-3;
    if (b.inContact) loaded++;
  }
  s.supportMode = loaded;
  s.supportFoot = (weights[1] >= weights[0] ? FOOT.Right : FOOT.Left) as Foot;

  // ── 1b. begin a stroke, before any blade tilt is assigned ─────────────────
  if (alive && input.push && s.strokeTime <= 0 && !turning) {
    s.strokeTime = p.strokeDuration;
    s.strokeFoot = (1 - s.strokeFoot) as Foot;   // two-beat alternation
    // "A straight stroke on a flat, a crossover on a curve" (bible §2.1). Read
    // off the BODY's lean, not the blade's: at speed a wide arc needs little
    // blade and a lot of lean — 7 m/s round 13 m is 9 degrees of blade and 21
    // of body — and a tilt threshold turned those crossovers back into
    // strokes. Fixed for the push, so a lean that changes mid-push cannot turn
    // half a stroke into a crossover.
    s.crossover = p.movesMode >= 1 && Math.abs(s.lean) >= p.crossoverLean;
    s.crossSide = s.crossover ? sign(s.lean) : 0;
  }
  const stroking = s.strokeTime > 0;

  // ── 1c. or a turn's pivot, in place of sections 2-5 ───────────────────────
  let yawNumer = 0, yawDenom = 0, latForceTotal = 0, excessWeighted = 0;
  let flatImpulse = v2(0, 0);
  let pivot: PivotTick | null = null;
  if (turning) {
    pivot = s.move === MOVE.Turn ? turnPivot(s, p, dt, weightR)
      : s.move === MOVE.Twizzle ? twizzleTick(s, p, dt, leanCmd, axis(input.carriage, 0), input.twizzle === true)
        : spinTick(s, p, dt, knee, axis(input.pitch, 0), axis(input.carriage, 0), input.spin === true);
    latForceTotal = pivot.lat * p.mass;
  }

  // ── 2. balance controller: where the lean should put the blade ────────────
  // The skater does not steer, they lean; the blade angle that produces the
  // curvature the lean needs is solved for here, then rate-limited by the
  // neuromuscular lag. Assist tiers shrink that lag and nothing else.
  const rhoSupport = effectiveRocker(s.blade[s.supportFoot].contactS, p);
  if (alive && !turning) {
    const v2sq = Math.max(dot(s.vel, s.vel), p.minSpeedForCurv * p.minSpeedForCurv);
    const aCmd = g * tan(leanCmd)
      + p.balanceKp * (s.lean - leanCmd)
      + p.balanceKd * s.leanRate;
    const kappaMax = sin(p.maxTilt) / rhoSupport;
    const kappa = clamp(aCmd / v2sq, -kappaMax, kappaMax);
    let tiltTarget = asinClamped(kappa * rhoSupport);
    // Angulation: the blade may run deeper than the body leans, but only so
    // far. This gap is most of what "edge quality" means to a judge.
    tiltTarget = clamp(tiltTarget, s.lean - p.angulationLimit, s.lean + p.angulationLimit);
    tiltTarget = clamp(tiltTarget, -p.maxTilt, p.maxTilt);
    const alpha = p.controlLatency > 1e-4 ? Math.min(1, dt / p.controlLatency) : 1;
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
          crossLat = cos(p.strokeBeta) * Math.min(p.strokePower * knee * p.mass * back,
            biteCapacity(pb.normalLoad, s.crossSide * p.strokeEdge, p));
        }
      }
    }
  }

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
    const apart = (i === FOOT.Left ? -1 : 1) * split * p.splitTiltMax;
    b.tilt = pushing
      ? (s.crossover ? s.crossSide * p.strokeEdge : (i === FOOT.Left ? -p.strokeEdge : p.strokeEdge))
      : clamp(s.tiltCmd + apart, -p.maxTilt, p.maxTilt);

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
      const capFlat = biteCapacity(b.normalLoad, b.tilt, p);
      const wanted = Math.abs(vLatFlat) * (b.normalLoad / g);
      const allowed = Math.min(wanted, capFlat * dt);
      flatImpulse = add(flatImpulse, mul(nFlat, -sign(vLatFlat) * allowed));

      b.turnRadius = Infinity; b.latForce = -sign(vLatFlat) * allowed / dt;
      b.latSlipAccel = 0;
      b.demandRatio = capFlat > 1e-6 ? wanted / (capFlat * dt) : 0;
      b.biteCapacity = capFlat;
      b.regime = REGIME.Glide;
      if (wasSkid) events.push({
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
    const fBite = biteCapacity(b.normalLoad, b.tilt, p);

    // `excess` is an ACCELERATION (m/s^2): the part of the demand the edge
    // could not answer. It is what gets scrubbed off as speed below.
    let radius: number, excess: number, fLat: number;
    if (fNeed <= fBite) {
      radius = rGeo; excess = 0; fLat = fNeed;
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
      latForceTotal += b.latForce;
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
    const yawRate = yawDenom > 1e-6 ? yawNumer / yawDenom : 0;
    s.yawRate = yawRate;
    const dPsi = yawRate * dt;
    if (dPsi !== 0) {
      for (let i = 0; i < 2; i++) {
        const b = s.blade[i];
        if (b.inContact) b.tangent = normalizeOr(rotate(b.tangent, dPsi), b.tangent);
      }
      s.vel = rotate(s.vel, dPsi);
    }
    s.heading = s.blade[s.supportFoot].inContact
      ? s.blade[s.supportFoot].tangent
      : s.heading;
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
      dv += muLong(b.tilt, b.latSlipAccel > 0, p) * b.normalLoad / p.mass * dt;
    }
    if (input.brake) dv += p.muSkid * nTotal / p.mass * dt;

    // Air drag. At 8 m/s this is several times blade friction, which is why
    // speed is expensive to build and cheap to keep.
    dv += 0.5 * p.airDensity * p.cdA * speed * speed / p.mass * dt;

    // Friction never reverses motion.
    speed = Math.max(0, speed - dv);
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
      const wanted = p.strokePower * knee * p.mass * (back < 0 && p.movesMode >= 1 ? p.backPushScale : 1);
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
      -p.internalMax, p.internalMax);

    // WASHOUT. Arms have finite travel: what is held drains away, what changes
    // gets through. Without it the arms hold a lean the edge is not carrying,
    // forever, and the skater neither reaches the commanded edge nor falls off
    // it — which reads on screen as a controller that ignores you.
    if (p.internalWashout > 1e-4) {
      s.intHeld += (aInt - s.intHeld) * Math.min(1, dt / p.internalWashout);
      aInt = clamp(aInt - s.intHeld, -p.internalMax, p.internalMax);
    } else {
      s.intHeld = 0;
    }

    // The centre of pressure is NOT washed out: a stance 24 cm wide really can
    // hold a small lean indefinitely, which is what standing still is.
    if (s.supportMode === 2) {
      const copMax = g * p.stanceHalfWidth / L;
      aInt += clamp(p.copGain * s.balanceError, -copMax, copMax);
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
  jumpGround(s, input, p, dt, events);
}

/** Run n ticks at the fixed rate. Convenience for tests and the replay path. */
export function run(
  s: SkaterState, input: SkatingInput, p: Params, ticks: number, events: EdgeEvent[] = [],
): SkaterState {
  for (let i = 0; i < ticks; i++) step(s, input, p, SIM_DT, events);
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
