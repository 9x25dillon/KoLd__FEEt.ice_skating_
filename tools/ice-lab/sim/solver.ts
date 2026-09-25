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

import { add, sub, mul, dot, len, perpLeft, rotate, normalizeOr, clamp, sign, asinClamped, moveToward, quantize, crc32, v2, tan, sin, cos, lerp, rng, smoothstep } from "./math.ts";
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
import { newJump, noResult, jumpGround, jumpAir, JUMP_PHASE, upperInertia, armsWhip } from "./jump.ts";
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
 * kg: the body this blade carries round a curve and stops sliding sideways.
 * normalLoadMode 0 reads it off the load, normalLoad / g, which is the mass
 * only while nothing moves vertically: a knee bending took mass off the
 * curve and a push put it on (three body weights in a push-off tripled the
 * force the carve holds the body in with, and threw the lean upright).
 * normalLoadMode 1: the blade's share of the weight, weight x mass — the
 * load still sets the grip (biteCapacity), not what the grip is asked for.
 * The lean still tips under g (section 7): the leg pushes along itself,
 * through the centre of mass, so its push loads the blade without tipping
 * the body. Where g is the only vertical acceleration the two are the same.
 */
const bladeMass = (b: SkaterState["blade"][number], p: Params): number =>
  p.normalLoadMode === 1 ? b.weight * p.mass : b.normalLoad / p.gravity;

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
 * Each foot's asked angle in its hip, rad, [left, right], toe out positive:
 * out as far as turnout (x 90°), in as far as hipInternal.
 */
function legTurns(input: SkatingInput, p: Params): [number, number] {
  const mean = clamp(axis(input.toeOut ?? 0, 0), -1, 1), split = clamp(axis(input.toeOutSplit ?? 0, 0), -1, 1);
  return [mean - split, mean + split].map((t) => {
    const u = clamp(t, -1, 1);
    return u >= 0 ? u * p.turnout * Math.PI / 2 : u * p.hipInternal;
  }) as [number, number];
}

/** A blade's direction: the body's heading, the toe turned out by `angle` — left foot anticlockwise, right clockwise. */
const footTangent = (heading: Vec2, foot: number, angle: number): Vec2 =>
  angle === 0 ? heading : rotate(heading, foot === FOOT.Left ? angle : -angle);

/**
 * STAGE B2, THE SLIP SOLVE PER BLADE (footMode 1). Turned in the hips, the
 * blades no longer share a line, so each answers for its own share of the
 * body (its weight) against its own sideways travel: grips while its bite can,
 * scrapes along the grip curve past that, catches on the wrong edge
 * (scrapeForce). A snowplow's two scrapes point back and in and their sideways
 * halves cancel; a T-stop's one drags. Each blade's force, applied where it
 * meets the ice, winds the body (the dig), with the stance's width as well as
 * the heel/toe for its lever. Returns the sideways force on the body, left
 * positive in the body's frame.
 *
 * With the trunk (torqueMode), a body turning faster than its carve (yawDev)
 * drags each foot sideways by that spin times the foot's offset, and the
 * blade's friction against it turns the body back: the scraping feet check
 * the rotation. The winding then acts on the body itself, both halves
 * together, rather than being carried to a takeoff.
 */
/** Where along blade i the dig pushes, 0 heel .. 1 toe: its contact, or under the test oracle the asked one. */
const digS = (s: SkaterState, p: Params, i: number): number =>
  p.digOracle === 1 && s.contactAsked ? s.contactAsked[i] : s.blade[i].contactS;

function slipSolveFeet(
  s: SkaterState, p: Params, dt: number, stroking: boolean, wasSkid: boolean[], events: EdgeEvent[],
  torqueOn: boolean, carriage: number,
): number {
  const bodyLeft = perpLeft(s.heading);
  const spin = torqueOn ? s.yawDev ?? 0 : 0;
  let dv = v2(0, 0), force = v2(0, 0), dL = 0;
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (!b.inContact || (stroking && i === s.strokeFoot)) continue;
    const side = s.supportMode === 2 ? (i === FOOT.Left ? p.stanceHalfWidth : -p.stanceHalfWidth) : 0;
    const r = add(mul(b.tangent, (digS(s, p, i) - 0.5) * p.bladeLength), mul(bodyLeft, side));
    const n = perpLeft(b.tangent);
    const vLat = dot(add(s.vel, mul(perpLeft(r), spin)), n), into = -sign(vLat);
    const need = p.mass * b.weight * Math.abs(vLat);
    const sliding = b.biteCapacity > 0 && need > b.biteCapacity * dt;
    const scrape = scrapeForce(b, into, p);
    const J = Math.min(need, (sliding ? scrape : b.biteCapacity) * dt);
    const f = mul(n, into * J / dt);
    dv = add(dv, mul(f, dt / p.mass));
    force = add(force, f);
    if (sliding || spin !== 0) dL += (r.x * f.y - r.y * f.x) * dt;
    b.latSlipAccel = sliding ? scrape / Math.max(bladeMass(b, p), 1e-6) : 0;
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
  s.vel = add(s.vel, dv);
  if (torqueOn) s.yawDev = (s.yawDev ?? 0) + dL / (p.lowerBodyInertia + upperInertia(p, carriage));
  else s.spinCarry += dL / p.inertiaOpen;
  if (s.digL !== undefined) s.digL += dL;
  return dot(force, bodyLeft);
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
      const r = mul(b.tangent, (digS(s, p, i) - 0.5) * p.bladeLength);
      const f = mul(n, into * scrapes[i] * used);
      dL += (r.x * f.y - r.y * f.x) * dt;
    }
    s.spinCarry += dL / p.inertiaOpen;
    if (s.digL !== undefined) s.digL += dL;
  }
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (!b.inContact || (stroking && i === s.strokeFoot)) continue;
    b.latSlipAccel = sliding ? scrapes[i] / Math.max(bladeMass(b, p), 1e-6) : 0;
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
 * [pivotCapacity, N m; the groove's angle, rad]. pivotCapacity: how hard the
 * loaded blades resist being pivoted: a blade's grip
 * (biteCapacity, per unit length of contact) acting over the length in the
 * ice about its middle, grip x chord / 4. The chord is the rocker's at the
 * blade's depth in the ice: the measured rut's cross-section (contactDepth x
 * rutWidth at rutLoad) scaled by this blade's load, spread flat or cut as a
 * wedge on an edge, whichever is deeper. On the toe (shorter rocker) and flat
 * (little depth, small grip) a blade turns easily — turns are made on the
 * ball of the foot — and on a loaded deep edge it holds. The groove's angle
 * (pivotGrooveMode): how far a blade turns before it has left the groove it
 * cut — rutWidth wide, and the chord's ends leave it first, so rutWidth /
 * (chord / 2) — grip-weighted over the loaded blades.
 */
function pivotGrip(s: SkaterState, p: Params): [number, number] {
  let cap = 0, groove = 0;
  for (const b of s.blade) {
    if (!b.inContact) continue;
    const area = p.contactDepth * p.rutWidth * (b.normalLoad / p.rutLoad);
    const depth = Math.max(area / p.rutWidth, Math.sqrt(2 * area * Math.abs(tan(b.tilt))));
    const chord = 2 * Math.sqrt(2 * effectiveRocker(b.contactS, p) * depth);
    const c = b.biteCapacity * chord / 4;
    cap += c;
    groove += c * p.rutWidth / Math.max(chord / 2, 1e-6);
  }
  return [cap, cap > 0 ? groove / cap : 0];
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
 *
 * STAGE C2: the legs steer only feet with weight on them (engagement, 0..1:
 * none below 0.3 g on the ice, all above 0.8 g). Where the carve's
 * rate changes under an unweighted foot, the body keeps the spin it had — the
 * change goes into yawDev for both bodies — so a three-turn's rise spins
 * through and an unweighted skater keeps turning while the travel does not.
 * (Engagement by edge depth was measured first: the balance loop's own
 * counter-steer from upright then became carried spin and the skater fell.)
 */
function trunkTorque(s: SkaterState, p: Params, dt: number, steer: number, input: SkatingInput): number {
  const Il = p.lowerBodyInertia;
  const Iu = upperInertia(p, axis(input.carriage, 0));
  const twist = s.twist ?? 0, twistRate = s.twistRate ?? 0;
  // The legs steer both feet: engagement is the whole load on the ice, not
  // the support blade's share (on two feet each carries half, and read alone
  // that looked like rising off the ice).
  const engaged = smoothstep(0.3, 0.8, (s.blade[0].normalLoad + s.blade[1].normalLoad) / (p.mass * p.gravity));
  // What the legs could not carry of the carve's change stays as the body's own spin.
  const dev0 = (s.yawDev ?? 0) + ((s.yawSteer ?? steer) - steer) * (1 - engaged);
  s.yawSteer = steer;
  // SkatingInput.windup is clockwise-positive; twist is counter-clockwise.
  const target = -clamp(axis(input.windup, 0), -1, 1) * p.twistMax;
  // The trunk's PD is solved implicitly: with the feet free the two bodies are
  // light (reduced inertia ~0.36 kg m²) and an explicit step of this damping
  // overshoots every tick. `a` is how much one N m changes the twist rate this
  // tick, `base` the twist rate it would have without the trunk's torque.
  const e = target - twist;
  const trunk = (a: number, base: number): [number, number] => {
    let rate = (base + a * p.twistStiffness * e) / (1 + a * (p.twistStiffness * dt + p.twistDamping));
    let tau = p.twistStiffness * (e - rate * dt) - p.twistDamping * rate;
    if (Math.abs(tau) > p.twistTorqueMax) { tau = sign(tau) * p.twistTorqueMax; rate = base + a * tau; }
    return [rate, tau];
  };
  // Feet held on the carve: only the upper body moves; the ice answers the
  // reaction and takes out any spin the lower body carried, up to its grip.
  // The free leg (freeLegMode): its hip torque, whose reaction the lower body takes too.
  const leg = freeLegTorque(s, p, input, dt);
  // The arms' whip (armsWhipMode): swung round the body while the knee loads.
  // The shoulders push the torso back as they swing the arms, and the torso
  // reaches the hips — and the ice — only through the trunk (its spring and
  // its twistTorqueMax), so the reaction is on the upper body, in both
  // branches alike: it becomes spin only as far as the trunk passes it on
  // and the ice holds it.
  const arms = armsWhipTorque(s, p, input, dt);
  const armsKick = arms / Iu * dt;
  const [heldRate, heldTau] = trunk(dt / Iu, twistRate + dev0 - armsKick);
  const need = heldTau + leg - Il * dev0 / dt;
  const [cap, groove] = pivotGrip(s, p);
  let dev: number, rate: number, pivoting = false, trunkTau = heldTau, iceTau = need;
  if (Math.abs(need) <= cap) {
    dev = 0; rate = heldRate;
    if (s.pivotSlip !== undefined) s.pivotSlip = 0;
  } else {
    // The feet pivot, resisted only by the scrape's share of that grip. The
    // free leg's reaction turns the braced torso with the hips — lower and
    // upper as one body — not the hips alone: a light lower body kicked round
    // by a leg is what set blades skidding on a gentle swing.
    // pivotGrooveMode: until the blades have turned out of their own
    // grooves they still bear on the groove's walls — the grip falls to the
    // scrape's share across that angle, not in one tick.
    const inGroove = s.pivotSlip !== undefined && groove > 0 ? Math.max(0, 1 - Math.abs(s.pivotSlip) / groove) : 0;
    const ice = sign(need) * cap * (scrapeShare(p) + (1 - scrapeShare(p)) * inGroove);
    const [freeRate, freeTau] = trunk(dt * (1 / Iu + 1 / Il), twistRate - armsKick - ice / Il * dt);
    dev = dev0 + (ice - freeTau) / Il * dt - leg / (Il + Iu) * dt;
    rate = freeRate;
    pivoting = true; trunkTau = freeTau; iceTau = ice;
    if (s.pivotSlip !== undefined) s.pivotSlip += dev * dt;
  }
  // The leg's own rate, against the hips: its torque — and, when the body
  // pivots, the body's turn back under it, so angular momentum adds up.
  if (s.freeSwingRate !== undefined) {
    s.freeSwingRate += leg * (1 / freeLegInertia(p) + (pivoting ? 1 / (Il + Iu) : 0)) * dt;
    s.freeSwing = (s.freeSwing ?? 0) + s.freeSwingRate * dt;
  }
  if (s.armsL !== undefined) s.armsL += arms * dt;
  if (s.torqueBudget) Object.assign(s.torqueBudget, {
    arms, trunk: trunkTau, leg, need, cap, ice: iceTau, pivoting, Il, Iu,
  });
  s.yawDev = dev;
  s.twistRate = rate;
  s.twist = twist + rate * dt;
  return steer + dev;
}

/**
 * THE ARMS' WHIP (armsWhipMode). While the knee loads for a jump the arms
 * swing round the body toward the angular momentum today's whip would put
 * in at takeoff (inertiaOpen x jumpWhip x the signed whip, sim/jump.ts
 * `armsWhip`), at up to armsWhipTorque. Returns the shoulders' torque on the
 * arms (N m, counter-clockwise positive); the body takes it back, and the
 * trunk solve decides whether the edge holds it. Outside a load the arms
 * hold nothing for a jump: s.armsL rests at 0, and stopping a swing that led
 * nowhere is not charged to the ice.
 */
function armsWhipTorque(s: SkaterState, p: Params, input: SkatingInput, dt: number): number {
  if (p.armsWhipMode < 1) return 0;
  if (s.jump.phase !== JUMP_PHASE.Load) { s.armsL = 0; return 0; }
  s.armsL ??= 0;
  const want = p.inertiaOpen * p.jumpWhip * armsWhip(s.jump, input, p, s.tick, dt, true);
  if (s.torqueBudget) s.torqueBudget.armsAsked = (want - s.armsL) / dt;
  return clamp((want - s.armsL) / dt, -p.armsWhipTorque, p.armsWhipTorque);
}

/** kg m². The free leg about the body's axis, swung out. */
const freeLegInertia = (p: Params): number => p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach;

/**
 * THE FREE LEG (freeLegMode). The unweighted leg, swung round the body by the
 * hip toward SkatingInput.freeLeg: 0 behind, 1 forward and round, over
 * freeLegArc either side of the hip. A right free leg swinging forward turns
 * counter-clockwise, a left one clockwise. With both feet down there is no
 * free leg: its state rests at zero. Returns the hip's torque on the leg (N m,
 * counter-clockwise positive); the lower body takes it back.
 */
function freeLegTorque(s: SkaterState, p: Params, input: SkatingInput, dt: number): number {
  if (p.freeLegMode < 1) return 0;
  const weightR = clamp(axis(input.weight, 0.5), 0, 1);
  const free = weightR >= 0.95 ? FOOT.Left : weightR <= 0.05 ? FOOT.Right : -1;
  if (free < 0) { s.freeSwing = 0; s.freeSwingRate = 0; s.freeSwingTarget = 0; return 0; }
  const around = free === FOOT.Right ? 1 : -1;
  const target = around * p.freeLegArc * (2 * clamp(axis(input.freeLeg ?? 0.5, 0.5), 0, 1) - 1);
  s.freeSwing ??= 0; s.freeSwingRate ??= 0;
  // The hip tracks the swing it is asked for, speed included: damping acts on
  // the difference from the asked speed, not on the leg's speed itself, or
  // merely following a moving target would drag the foot round.
  const wanted = (target - (s.freeSwingTarget ?? target)) / dt;
  s.freeSwingTarget = target;
  return clamp(p.freeLegStiffness * (target - s.freeSwing) + p.freeLegDamping * (wanted - s.freeSwingRate),
    -p.freeLegTorqueMax, p.freeLegTorqueMax);
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

/**
 * THE TOE PICK (toePickMode). big_reffg.txt §3.5, EDGE-005: a loaded blade
 * whose contact has reached the pick's root while it travels toward its toe
 * faster than `toePickTripSpeed` drives the pick into the ice — a trip.
 * Backward the pick trails the blade and only strikes. The blade that
 * catches, or -1.
 */
function toePickCatch(s: SkaterState, p: Params): number {
  for (let i = 0; i < 2; i++) {
    const b = s.blade[i];
    if (b.inContact && (b.contactS - 0.5) * p.bladeLength >= p.toePickEngage
      && dot(s.vel, b.tangent) > p.toePickTripSpeed) return i;
  }
  return -1;
}

/**
 * THE FORE-AFT PENDULUM (pitchMode). big_reffg.txt §3.5: the lateral
 * pendulum's mirror along the support blade — along the blade, not the body,
 * because across it the edge holds the body and along it only the ankle can:
 * with the feet turned off the body (a hockey stop, a spread eagle) the
 * braking is across the blades and the ankle is not asked to carry it. The
 * body leans `pitch` toward the toe; the ice under the blades accelerates
 * the base `aFwd` along the blade (braking is negative, and pitches the body
 * forward) — the push, drag and the rink's slope act through the hips and
 * the body, and an edge's hold and a skid's friction act across the blade;
 * none of them turns the body about the ankle. The ankle's one
 * authority is where along the blade the ice pushes back, the contact `c`
 * from the blade's centre:
 *
 *   L pitch'' = g (sin pitch - c / L) - aFwd cos pitch.
 *
 * `c` is clamped to the loaded blades' reach, half a blade length. The ankle
 * steers by the capture point (Pratt 2006; Hof 2008's extrapolated centre of
 * mass): the COM's offset from where this acceleration would balance it,
 * plus its rate over sqrt(g / L) — the one point a contact held there brings
 * the body to rest over. The contact goes to the capture point, and
 * `pitchGain` of its distance past the lean asked beyond it, which draws the
 * capture point to the asked lean. With no acceleration the body settles over
 * contactS = 0.5 + 0.5 x input.pitch, pitchMode 0's direct placement. A
 * capture point off the blade cannot be brought back by the ankle: held off
 * as long as the lateral balance timeout, the skater is down.
 */
function pitchTick(
  s: SkaterState, p: Params, dt: number, alive: boolean, pitchIn: number, velStart: Vec2, velBlades: Vec2, L: number,
  armsLeft: number,
): void {
  const g = p.gravity, along = s.blade[s.supportFoot].tangent, w = Math.sqrt(g / L);
  const aFwd = dot(sub(velBlades, velStart), along) / dt;
  let reach = 0;
  for (const b of s.blade)
    if (b.inContact) reach = Math.max(reach, 0.5 * p.bladeLength * Math.abs(dot(b.tangent, along)));
  const capture = (phi: number, rate: number): number =>
    L * sin(phi) - (aFwd * L / g) * cos(phi) + L * cos(phi) * rate / w;
  let phi = s.pitch ?? 0, rate = s.pitchRate ?? 0, c = 0, aInt = 0;
  // pitchInternalMode: the arms' and trunk's reach, as contact — their
  // acceleration enters the lean as g c / L does, times cos(pitch).
  const armsOn = p.pitchInternalMode === 1, armsReach = armsLeft * L * cos(phi) / g;
  if (alive && reach > 0) {
    const xi = capture(phi, rate), asked = clamp(pitchIn, -1, 1) * 0.5 * p.bladeLength;
    const demand = xi + p.pitchGain * (xi - asked);
    if (armsOn) {
      // The ankle follows the demand's slow part; the arms take what is left,
      // as far as they reach — the fast part, and past the blade's end.
      const tau = p.pitchAnkleTau;
      const slow = s.pitchAnkle = tau > 1e-4 ? (s.pitchAnkle ?? 0) + (demand - (s.pitchAnkle ?? 0)) * Math.min(1, dt / tau) : demand;
      c = clamp(slow, -reach, reach);
      const arms = clamp(demand - c, -armsReach, armsReach);
      aInt = armsReach > 0 ? arms * g / (L * cos(phi)) : 0;
    } else c = clamp(demand, -reach, reach);
  }
  rate += ((g * (sin(phi) - c / L) - (aFwd + aInt) * cos(phi)) / L) * dt;
  phi = clamp(phi + rate * dt, -1.55, 1.55);
  s.pitch = phi;
  s.pitchRate = rate;
  s.pitchContact = c;
  if (armsOn) s.pitchIntAccel = aInt;
  // Down when even the ankle and the arms together cannot bring the capture point back.
  const catchable = reach + (armsOn ? p.fallAuthorityCredit * armsReach : 0);
  s.pitchOffTime = Math.abs(capture(phi, rate)) > catchable ? (s.pitchOffTime ?? 0) + dt : 0;
}

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
    // Present only where the pendulum is, so a standing-up retry resets it too.
    ...(p.pivotGrooveMode === 1 ? { pivotSlip: 0 } : {}),
    ...(p.pitchMode === 1 ? { pitch: 0, pitchRate: 0, pitchContact: 0, pitchOffTime: 0, contactAsked: [0.5, 0.5] as [number, number], digL: 0 } : {}),
    ...(p.pitchMode === 1 && p.pitchInternalMode === 1 ? { pitchAnkle: 0, pitchIntAccel: 0 } : {}),
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
  if (s.digL !== undefined) s.digL = 0;   // pitchMode 1 observability: this tick's winding from the blades
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
  const footOn = slipOn && p.footMode >= 1;
  const legsMul = staminaOn ? clamp(s.legs, 0, 1) : 1;
  const pFatigue: Params = staminaOn ? {
    ...p,
    jumpImpulse: lerp(p.jumpImpulse * p.staminaJumpImpulseMin, p.jumpImpulse, legsMul),
    inertiaTucked: lerp(p.staminaInertiaFloorMax, p.inertiaTucked, legsMul),
    jumpInertiaTucked: lerp(p.staminaInertiaFloorMax, p.jumpInertiaTucked, legsMul),
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
  const pushKnee = (): number => s.strokeKnee !== undefined
    // A push that named its bend extends from it: the leg straightening over the stroke.
    ? s.strokeKnee * clamp(s.strokeTime / p.strokeDuration, 0, 1)
    : clamp(knee + (clamp(legTargets[s.strokeFoot], 0, 1) - kneeTarget), 0, 1);
  const split = clamp(axis(input.leanSplit, 0), -1, 1);
  const pitch = axis(input.pitch, 0), pitchSplit = clamp(axis(input.pitchSplit ?? 0, 0), -1, 1);
  // Each blade's own point on the rocker: the shared pitch, split apart.
  const contactS = [pitch - pitchSplit, pitch + pitchSplit].map((c) => clamp(0.5 + 0.5 * clamp(c, -1, 1), 0, 1));
  // Observability (pitchMode 1): the contact the input asked for, before the ankle places it.
  if (s.contactAsked) { s.contactAsked[0] = contactS[0]; s.contactAsked[1] = contactS[1]; }

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
  // pitchMode 1: the fore-aft pendulum's ankle places the shared contact; a
  // pivot or a spin keeps the input's direct placement (model limit).
  const pitchOn = p.pitchMode === 1 && !turning;
  // What only the ice did along the blade pitches the body: the push goes up
  // the leg into the hips, and drag and the rink's slope act on the whole
  // body — none of them turns it about the ankle — while an edge's hold and
  // a skid's friction are across the blade (section 5 says which is which).
  const velStart = v2(s.vel.x, s.vel.y);
  let comDv = v2(0, 0), carveDv = v2(0, 0), velBlades = velStart;
  if (pitchOn) {
    const shared = clamp(2 * (s.pitchContact ?? 0) / p.bladeLength, -1, 1);
    for (let i = 0; i < 2; i++) contactS[i] = clamp(0.5 + 0.5 * clamp(shared + (i === 0 ? -pitchSplit : pitchSplit), -1, 1), 0, 1);
  }

  // ── 1. legs -> normal load ────────────────────────────────────────────────
  // A deep knee is more push, more bite and more jump impulse; here it only
  // has to produce the load, since the vertical axis belongs to the jump
  // package. legAccel enters N because pressing down loads the blade.
  const legTarget = p.comHeight * (1 - p.maxKneeCompression * knee);
  const legAccel = p.kneeSpring * (legTarget - s.legLength) - p.kneeDamping * s.legRate;
  s.legRate += legAccel * dt;
  s.legLength += s.legRate * dt;
  s.legLength = clamp(s.legLength, 0.3, p.comHeight * 1.05);

  // A jump's push-off (pushOffMode): the takeoff's upward speed goes through the blade.
  const nTotal = Math.max(0, p.mass * (g + legAccel)) + (s.jump.pushLoad ?? 0);
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
    // Two-beat alternation, unless the push names its leg.
    s.strokeFoot = (input.pushFoot === 0 || input.pushFoot === 1 ? input.pushFoot : 1 - s.strokeFoot) as Foot;
    s.strokeScale = input.pushPower === undefined ? undefined : clamp(axis(input.pushPower, 1), 0, 1);
    s.strokeKnee = input.pushKnee === undefined ? undefined : clamp(axis(input.pushKnee, 0), 0, 1);
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
  // A push naming the leg already pushing adds to its stroke: a thumb stroke
  // and a trigger pump of the same leg, one just after the other, are one
  // stronger push. It never weakens one.
  if (s.strokeTime > 0 && input.pushFoot === s.strokeFoot && input.pushPower !== undefined && s.strokeScale !== undefined)
    s.strokeScale = Math.max(s.strokeScale, clamp(axis(input.pushPower, 1), 0, 1));
  if (s.strokeTime > 0 && input.pushFoot === s.strokeFoot && input.pushKnee !== undefined && s.strokeKnee !== undefined)
    s.strokeKnee = Math.max(s.strokeKnee, clamp(axis(input.pushKnee, 0), 0, 1));
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
    // diagTakeoffBalance (test-only): the takeoff with the loop's counter-steer taken out, or not asked.
    const takeoffDiag = p.diagTakeoffBalance === 3 ? (s.jump.pushFrom !== undefined ? 1 : 0)
      : p.diagTakeoffBalance > 0 && s.jump.phase === JUMP_PHASE.Load ? p.diagTakeoffBalance : 0;
    // EDGE COMMITMENT (edgeCommitMode). Once a jump's load has begun the
    // skater rides the edge the asked lean carves instead of trimming it to
    // their balance: the loop's lean-error and lean-rate terms fade out
    // together over edgeCommitTime of the load, and stay out through the
    // push-off. The body answers the committed curve uncorrected — lifted up
    // and over a curling edge, or into the ice off a bad one.
    const commit = p.edgeCommitMode >= 1 && s.jump.phase === JUMP_PHASE.Load
      ? (s.jump.pushFrom !== undefined ? 0 : Math.max(0, 1 - s.jump.t / p.edgeCommitTime)) : 1;
    const aCmd = commit < 1 ? g * tan(leanCmd) + commit * (p.balanceKp * (s.lean - leanCmd) + p.balanceKd * s.leanRate) + noise
      : takeoffDiag === 1 ? g * tan(leanCmd) + noise
      : takeoffDiag === 4 ? g * tan(leanCmd) + p.balanceKd * s.leanRate + noise
        : takeoffDiag === 5 ? g * tan(leanCmd) + p.balanceKp * (s.lean - leanCmd) + noise
          : g * tan(leanCmd)
            + p.balanceKp * (s.lean - leanCmd)
            + p.balanceKd * s.leanRate
            + noise;
    const kappaMax = sin(pFatigue.maxTilt) / rhoSupport;
    const kappa = clamp(aCmd / v2sq, -kappaMax, kappaMax);
    let tiltTarget = asinClamped(kappa * rhoSupport);
    const fromKappa = tiltTarget;
    // SCRAPING, the edge sets the scrape, not a curve: the skater digs in on
    // the side the scrape pushes toward, as deep as the lean needs, and never
    // offers it the other edge. Whether the body can get there is the
    // angulation limit below — lean the wrong way and it cannot.
    // With the feet splayed (a snowplow) the loaded blades can scrape toward
    // opposite sides: their sideways forces cancel, there is nothing to lean
    // on, and one common edge would dig one blade and catch the other — so the
    // body stands flat and the edge split sets each blade's edge.
    const sides = s.blade.filter((b) => b.inContact).map((b) => -sign(dot(s.vel, perpLeft(footOn ? b.tangent : s.heading))));
    const splayed = footOn && sides.length === 2 && sides[0] !== sides[1];
    if (splayed && s.blade[s.supportFoot].regime === REGIME.Skid) tiltTarget = 0;
    else if (slipOn && s.blade[s.supportFoot].regime === REGIME.Skid) {
      const into = -sign(dot(s.vel, perpLeft(footOn ? s.blade[s.supportFoot].tangent : s.heading)));
      const perSin = scrapeShare(p) * p.biteC1 * p.sharpness * p.iceHardness * (nTotal / p.mass);
      const base = scrapeShare(p) * p.biteC0 * p.sharpness * p.iceHardness * (nTotal / p.mass);
      const want = aCmd * into;
      tiltTarget = want > base && perSin > 1e-9
        ? into * asinClamped(clamp((want - base) / perSin, 0, sin(pFatigue.maxTilt)))
        : 0;
    }
    const afterScrape = tiltTarget;
    // Angulation: the blade may run deeper than the body leans, but only so
    // far. This gap is most of what "edge quality" means to a judge.
    tiltTarget = clamp(tiltTarget, s.lean - pEff.angulationLimit, s.lean + pEff.angulationLimit);
    const afterAngulation = tiltTarget;
    tiltTarget = clamp(tiltTarget, -pEff.maxTilt, pEff.maxTilt);
    const alpha = pEff.controlLatency > 1e-4 ? Math.min(1, dt / pEff.controlLatency) : 1;
    if (takeoffDiag !== 2) s.tiltCmd += (tiltTarget - s.tiltCmd) * alpha;
    if (s.balanceBudget) Object.assign(s.balanceBudget, {
      leanCmd, lean: s.lean, leanRate: s.leanRate,
      gTan: g * tan(leanCmd), kp: p.balanceKp * (s.lean - leanCmd), kd: p.balanceKd * s.leanRate, noise, aCmd,
      v2: v2sq, kappa, kappaMax, rho: rhoSupport, fromKappa, afterScrape, afterAngulation, target: tiltTarget,
      tiltCmd: s.tiltCmd,
      clamps: (Math.abs(aCmd / v2sq) > kappaMax ? 1 : 0) | (afterScrape !== fromKappa ? 2 : 0)
        | (afterAngulation !== afterScrape ? 4 : 0) | (tiltTarget !== afterAngulation ? 8 : 0),
    });
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
        pushMass = bladeMass(pb, p);
        if (s.crossover) {
          const back = dot(s.vel, s.heading) < -p.dirSpeedEps ? p.backPushScale : 1;
          crossLat = cos(p.strokeBeta) * Math.min(p.strokePower * pushKnee() * p.mass * back * (s.strokeScale ?? 1),
            biteCapacity(pb.normalLoad, s.crossSide * p.strokeEdge, p, condAt(pb.contact)));
        }
      }
    }
  }

  // slipMode: skid events are decided after the slip solve, against these.
  const wasSkidAll = slipOn ? s.blade.map((b) => b.regime === REGIME.Skid) : undefined;
  // STAGE B2: each foot turns in its hip toward what is asked, at the legs'
  // rate, and its blade points that far off the body's heading.
  if (footOn && !turning && !ina) {
    const ask = legTurns(input, p);
    const now = s.footAngle ?? [0, 0];
    s.footAngle = [0, 1].map((i) => moveToward(now[i], ask[i], p.footTurnRate * dt)) as [number, number];
    for (let i = 0; i < 2; i++) s.blade[i].tangent = footTangent(s.heading, i, s.footAngle[i]);
  }
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
      const wanted = Math.abs(vLatFlat) * bladeMass(b, p);
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
    const massShare = bladeMass(b, p);      // kg this blade answers for
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
      // A blade scraping sideways is not rolling along its arc, so it does
      // not steer (slipMode): it still carries its load, which the carve's
      // rate is shared over.
      if (!(slipOn && wasSkidAll![i])) yawNumer += yawRate * b.normalLoad;
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
    // The whole body's mass has to be turned, not only what the blades carry:
    // rising off the edge leaves the grip too small for the curve, and the
    // travel runs straight on while the body keeps turning.
    if (slipOn && !carveLost) {
      let grip = 0;
      for (let i = 0; i < 2; i++) {
        const b = s.blade[i];
        if (b.inContact && !(stroking && i === s.strokeFoot)) grip += b.biteCapacity;
      }
      if (p.mass * Math.abs(steer) * len(s.vel) > grip) carveLost = true;
    }
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
      if (!slipOn || !carveLost) {
        const before = s.vel;
        s.vel = rotate(s.vel, torqueOn ? steer * dt : dPsi);
        // The edge's own force, square to the blade: it carries no pitch.
        if (pitchOn) carveDv = add(carveDv, sub(s.vel, before));
      }
    }
    if (footOn) {
      // The body turns; the blades follow it at their own angles in the hips.
      if (dPsi !== 0) s.heading = normalizeOr(rotate(s.heading, dPsi), s.heading);
      const angles = s.footAngle ?? [0, 0];
      for (let i = 0; i < 2; i++) s.blade[i].tangent = footTangent(s.heading, i, angles[i]);
    } else {
      s.heading = s.blade[s.supportFoot].inContact
        ? s.blade[s.supportFoot].tangent
        : s.heading;
      // With slip on, a blade off the ice points along the body: left where
      // it lifted, it would touch down across the travel and skid (measured:
      // a weight change mid-curve on Blade Explorer, the lean ran away).
      if (slipOn) for (const b of s.blade) if (!b.inContact) b.tangent = s.heading;
    }
    if (slipOn) {
      const slip = footOn ? slipSolveFeet(s, p, dt, stroking, wasSkidAll!, events, torqueOn, axis(input.carriage, 0))
        : slipSolve(s, p, dt, stroking, wasSkidAll!, events);
      // A lost carve holds nothing toward its centre; the scrape is the force.
      latForceTotal = carveLost ? slip : latForceTotal + slip;
    }
  }

  // ── 5. losses ─────────────────────────────────────────────────────────────
  let speed = len(s.vel);
  if (!turning && speed > 1e-6) {
    const dir = mul(s.vel, 1 / speed), speed0 = speed;
    let glideDv = 0;

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
      if (pitchOn) glideDv += muLong(b.tilt, false, p, condAt(b.contact)) * b.normalLoad / p.mass * dt;
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
    // Of this block's losses only the glide's friction runs along the blade.
    // Drag and the slope act on the body; a skid's friction (muSkid, the
    // scrub, the brake, an Ina Bauer's trailing foot) runs across it, and
    // with slipMode 1 the slip solve has already put the scrape there.
    if (pitchOn) comDv = mul(dir, speed - speed0 + glideDv);
    s.vel = mul(dir, speed);
  }

  if (pitchOn) velBlades = v2(s.vel.x - comDv.x - carveDv.x, s.vel.y - comDv.y - carveDv.y);

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
      const wanted = p.strokePower * pushKnee() * p.mass * s.strokeMusicScale * (s.strokeScale ?? 1)
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

  let aInt = 0, armsLat = 0;
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

    armsLat = aInt;   // the arms' share, before the stance: fore-aft gets what is left (pitchInternalMode)

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
  if (pitchOn) {
    const armsMax = pEff.internalMax;
    pitchTick(s, p, dt, alive, pitch, velStart, velBlades, L, Math.sqrt(Math.max(0, armsMax * armsMax - armsLat * armsLat)));
    // The COM a leg length from the base, leaning both ways at once.
    const across = L * sin(s.lean), along = L * sin(s.pitch ?? 0);
    s.comZ = Math.sqrt(Math.max(0, L * L - across * across - along * along));
  }

  // Blade contacts hang off the base of the pendulum, not off the COM. In a
  // turn the pendulum is in the travel frame, and so are they.
  const frameH = moveThisTick === MOVE.Turn || moveThisTick === MOVE.Twizzle ? turnFrame(s) : s.heading;
  const right = mul(perpLeft(frameH), -1);
  let base = add(s.pos, mul(right, L * sin(s.lean)));
  // Pitched toward the toe, the boots are behind the centre of mass.
  if (pitchOn) base = add(base, mul(s.blade[s.supportFoot].tangent, -L * sin(s.pitch ?? 0)));
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
    // The pendulum's to catch: without it the body has no fore-aft lean to
    // throw over the pick, and a pivot or a spin places the contact itself.
    const picked = p.toePickMode === 1 && pitchOn ? toePickCatch(s, p) : -1;
    if (Math.abs(s.lean) > p.fallLean) reason = FALL.LeanExceeded;
    else if (picked >= 0) {
      reason = FALL.ToePickTrip;
      const b = s.blade[picked];
      events.push({
        tick: s.tick, type: EVENT.ToePickCatch, foot: picked as Foot,
        prevCode: b.code, newCode: b.code, prevDwell: b.dwell, value: dot(s.vel, b.tangent),
      });
    }
    else if (s.balanceErrorTime > p.fallErrorTime) reason = FALL.BalanceTimeout;
    else if (pitchOn && (s.pitchOffTime ?? 0) > p.fallErrorTime) reason = FALL.Pitched;

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
  // rotationCallMode: what the body turns on the ice after touchdown, over
  // LANDING_SETTLE — reported with the landing, never credited to the call.
  if (s.landed.residual !== undefined && s.tick > s.landed.tick && (s.tick - s.landed.tick) * dt <= LANDING_SETTLE)
    s.landed.residual += s.yawRate * dt / (2 * Math.PI);
}

/** s after a landing's first touchdown over which its residual rotation is measured (JumpResult.residual). */
const LANDING_SETTLE = 0.3;

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
