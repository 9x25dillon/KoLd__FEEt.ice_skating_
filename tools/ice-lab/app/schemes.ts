// app/schemes.ts — the three control schemes, as pure functions.
//
// pre-production-plan.md §3 requires three, not one, and requires that they
// SPAN THE SPACE rather than cluster around variations of the same idea:
//
//   A · Lean & Load   the bible's §2.1 proposal. Left stick is a lean vector.
//   B · Steer & Load  the safe fallback. Left stick is intended travel
//                     direction, as in any third-person game; the solver picks
//                     whichever edge curves that way and the lean magnitude
//                     falls out of turn demand and speed.
//   C · Two-Foot      the strange one. Left stick is the left blade's edge,
//                     right stick the right blade's. Possibly unlearnable,
//                     possibly the most distinctive scheme in any sports game.
//
// They are labelled A / B / C and nothing else, on screen and in the export,
// because §7 says so: "schemes are labelled A/B/C to the testers AND to the
// observers." A label that says which one the author believes in is not a
// blind test, and the whole reason three exist is that nobody knows yet.
//
// Pure functions of (controls, what the skater is doing now) -> SkatingInput,
// so the mapping can be measured in test/schemes.test.ts rather than argued
// about. No DOM, no state of their own.

import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import type { Vec2 } from "../sim/math.ts";
import { clamp, len } from "../sim/math.ts";
import { relievedPitch } from "./pad.ts";
import type { Controls } from "./pad.ts";

export const SCHEME = { A: 0, B: 1, C: 2 } as const;
export type Scheme = 0 | 1 | 2;

/** What a tester sees. Deliberately says nothing about which is which. */
export const SCHEME_LABEL = ["A", "B", "C"] as const;

/** What the developer sees, in the README and nowhere on screen. */
export const SCHEME_NOTE = [
  "A · Lean & Load — bible §2.1",
  "B · Steer & Load — the safe fallback",
  "C · Two-Foot — one stick per blade",
] as const;

/**
 * How hard B chases the heading you asked for, in yaw rate per radian of error.
 *
 * Measured, not chosen: at 0.8 a 135 degree turn puts the skater down, and at
 * 0.4 the arcs get loose. 0.5 settles every target from 45 to 170 degrees to
 * about a degree.
 */
const STEER_GAIN = 0.5;

/**
 * Seconds of yaw the controller steers ahead of, which is the whole reason B
 * works at all.
 *
 * Lean is a slow state — roughly a second to establish — and heading is its
 * integral, so steering on the heading you HAVE guarantees an overshoot and
 * then an oscillation. Steering on the heading you are ABOUT to have does not.
 *
 * Damping on raw yaw rate was tried first and is worse than useless here: to
 * lean left the blade must first tilt right, so the yaw signal REVERSES at the
 * start of every turn, and a damping term feeds that reversal straight back.
 * Measured: 120 degrees of overshoot at every gain in the sweep.
 */
const STEER_LEAD = 0.3;

/**
 * Past this much heading error there is no preferred side, so B picks one and
 * keeps it. Radians.
 *
 * Without it a near-reversal chatters — the error flips sign every tick as the
 * heading crosses the antipode — and the skater parks facing exactly backwards
 * with a controller that is technically satisfied. Measured at 170 degrees of
 * standing error.
 */
const STEER_COMMIT = 2.97;   // 170 deg

/**
 * How deep a demanded lean has to be before B commits the weight to one foot.
 *
 * Two-footed, the skater settles 12 degrees off the requested heading and falls
 * on anything past 90 degrees, because you cannot hold a deep edge with both
 * feet down — real skaters lift one, and so must this. B commits to whichever
 * foot the player has chosen and defaults to the right, since turn direction
 * does NOT determine the foot: a left curve is a left-forward-outside edge or a
 * right-forward-inside one, and choosing between them is exactly the
 * expressiveness B is specified to give up.
 */
const COMMIT_LEAN = 0.25;

/**
 * How much of the physically holdable lean B is allowed to ask for.
 *
 * The plan calls B "the bible's Club assist tier promoted to the default
 * control scheme", so keeping the player inside what the edge can hold is the
 * scheme working as specified rather than a safety rail bolted on. The ceiling
 * itself is not a constant: it is atan(v^2 sin(maxTilt) / rho / g), the deepest
 * lean the blade can support at this speed.
 */
const STEER_MARGIN = 0.75;

/** How far the keyboard's discrete steer counts as "over there", rad. */
const KEY_STEER_ANGLE = 1.05;

/**
 * The one piece of memory a scheme is allowed: which way B decided to go round
 * when the player asked for a reversal. Owned by the caller so the schemes
 * stay pure functions of their arguments and stay testable.
 */
export interface SchemeState {
  commit: number;
}

export const newSchemeState = (): SchemeState => ({ commit: 0 });

/** Signed angle from `a` to `b`, both unit-ish. Positive is toward perpLeft. */
function signedAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
}

/**
 * A · Lean & Load. The left stick IS the lean: sideways is which edge and how
 * deep, fore/aft is where the contact sits along the rocker. On the ice the
 * right stick is left alone, because A is the hypothesis under test as §2.1
 * wrote it: "three simultaneous continuous analog channels is more than most
 * players carry." Giving the idle stick a carving job would test a different
 * scheme. It is the bible's carriage, and the only thing that reads carriage
 * is a jump — the whip at takeoff and the pull-in in the air — so with jumps
 * off, which is every preset, A still carves on three channels.
 */
export function schemeA(c: Controls): SkatingInput {
  return {
    ...NEUTRAL_INPUT,
    lean: c.kx !== 0 ? c.kx : c.lean,
    pitch: c.ky !== 0 ? c.ky : c.pitch,
    leanSplit: 0,
    knee: c.knee, weight: c.weight, push: c.push, brake: c.brake,
    carriage: carriage(c), toe: c.toe,
  };
}

/** The right stick's reach, or the keyboard's held C. Jumps only; see schemeA. */
function carriage(c: Controls): number {
  return clamp(Math.max(c.carriage, Math.hypot(c.rx, c.ry)), 0, 1);
}

/**
 * B · Steer & Load. The stick points where you want to go and the skater works
 * out the rest: heading error becomes a yaw demand, the yaw demand and the
 * current speed become the lateral acceleration that would produce it, and the
 * lean that balances THAT is the command.
 *
 *   omega = clamp(gain * heading error)      what you asked for
 *   a_lat = v * omega                        what that costs
 *   phi   = atan(a_lat / g)                  the lean that pays for it
 *
 * Which is the same algebra as A, run backwards. That is the point: it keeps
 * the carve physics, the emergent radius and the load-release takeoff, and
 * gives up only the deliberate choice of inside or outside edge — the sport's
 * actual alphabet, and the whole question the down-select is asking.
 *
 * At a standstill there is no heading to correct toward and no speed to lean
 * against, so it commands nothing and the skater simply stands there. That is
 * honest rather than a limitation: B cannot express an edge you are not
 * already carrying speed into.
 */
export function schemeB(
  c: Controls, heading: Vec2, vel: Vec2, yawRate: number, p: Params, st: SchemeState,
): SkatingInput {
  const speed = len(vel);
  const stickMag = Math.hypot(c.lx, c.ly);

  let err = 0;
  if (stickMag > 1e-3) {
    // Where the stick points, as a direction in the world the rink is drawn in.
    const desired = { x: c.lx / stickMag, y: c.ly / stickMag };
    err = signedAngle(heading, desired) * Math.min(1, stickMag);
  } else if (c.kx !== 0) {
    // The keyboard cannot point, so a held key means "over there", and holding
    // it keeps asking for the same angle — which is a steady turn.
    err = -c.kx * KEY_STEER_ANGLE;
  }

  // A reversal has no preferred side. Pick one, keep it until the turn is
  // genuinely underway, then let go of it.
  if (Math.abs(err) > STEER_COMMIT) {
    if (st.commit === 0) st.commit = yawRate !== 0 ? Math.sign(yawRate) : 1;
    err = st.commit * Math.abs(err);
  } else if (Math.abs(err) < STEER_COMMIT - 0.4) {
    st.commit = 0;
  }

  // Steer on the heading you are about to have, not the one you have.
  const omega = STEER_GAIN * (err - yawRate * STEER_LEAD);
  const wanted = Math.atan2(speed * omega, p.gravity);

  // ...and never deeper than the blade can hold at this speed.
  const ceiling = Math.atan2(speed * speed * Math.sin(p.maxTilt) / p.rocker, p.gravity);
  const cmd = clamp(wanted, -STEER_MARGIN * ceiling, STEER_MARGIN * ceiling);

  // Commit to a foot as the edge deepens, keeping the one the player chose.
  const chosen = c.weight >= 0.5 ? 1 : 0;
  const commitment = Math.min(1, Math.abs(cmd) / COMMIT_LEAN);
  const weight = c.weight + (chosen - c.weight) * commitment;

  return {
    ...NEUTRAL_INPUT,
    lean: clamp(cmd / p.maxLean, -1, 1),
    // Fore/aft is not a steering channel here — B's whole premise is that the
    // player does not think about the blade — so only the keyboard moves it.
    // The right stick stays idle for the same reason: a rocker channel on it
    // would hand B a piece of A and blur the one contrast the down-select is
    // there to measure.
    pitch: c.ky,
    leanSplit: 0,
    knee: c.knee, weight, push: c.push, brake: c.brake,
    carriage: carriage(c), toe: c.toe,
  };
}

/**
 * C · Two-Foot. One stick per blade, which is what a crossover, a mohawk and a
 * choctaw actually are.
 *
 * The solver carries one body lean and one tilt per blade, so the two sticks'
 * sideways axes are read as their mean and their difference — an exact
 * reparametrization of controlling each blade, with the balance loop still
 * solving for the mean rather than being bypassed by it. Push both the same
 * way and it is a lean; push them apart and the blades go onto opposite edges.
 *
 * Fore/aft on a blade's stick is where that blade's contact sits along its
 * rocker. The solver carries ONE contact point for both blades, so it gets the
 * mean of the two — the same rule the sideways axes follow, with no split
 * because there is nothing to split. (An earlier comment here said both
 * vertical axes were spent on edges and the rocker had to be keyboard-only;
 * it is the horizontal axes that are spent, and the vertical ones were idle.)
 * Each stick's fore/aft is relieved of its sideways bleed exactly as A's left
 * stick is, so holding an edge does not walk the contact point.
 */
export function schemeC(c: Controls): SkatingInput {
  const l = c.kPrimaryX !== 0 ? c.kPrimaryX : c.lx;     // left blade:  A/D
  const r = c.kAltX !== 0 ? c.kAltX : c.rx;            // right blade: arrows
  const mean = (l + r) / 2;
  const apart = (r - l) / 2;
  return {
    ...NEUTRAL_INPUT,
    lean: clamp(mean, -1, 1),
    leanSplit: clamp(apart, -1, 1),
    pitch: c.ky !== 0 ? c.ky
      : clamp((relievedPitch(c.lx, c.ly) + relievedPitch(c.rx, c.ry)) / 2, -1, 1),
    knee: c.knee, weight: c.weight, push: c.push, brake: c.brake,
    // The right stick is the right blade here, so C's carriage is the
    // keyboard's alone. A pad skating C can hop but not whip a rotation.
    carriage: clamp(c.carriage, 0, 1), toe: c.toe,
  };
}

/** Whichever of the three is live. */
export function applyScheme(
  scheme: Scheme, c: Controls, heading: Vec2, vel: Vec2, yawRate: number,
  p: Params, st: SchemeState,
): SkatingInput {
  if (scheme === SCHEME.B) return schemeB(c, heading, vel, yawRate, p, st);
  if (scheme === SCHEME.C) return schemeC(c);
  return schemeA(c);
}
