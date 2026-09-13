// tools/ice-lab/sim/blade.ts — blade geometry and what an edge can hold.
//
// Four small functions, separated from the solver because they are the ones
// the tests interrogate directly and the ones a tuning session actually moves.

import { clamp, lerp, smoothstep, sin, cos, atan2, v2 } from "./math.ts";
import type { Vec2 } from "./math.ts";
import type { Params } from "./params.ts";

/**
 * The blade is not one arc.
 *
 * Its front third is far tighter, which is why turns are executed "on the
 * rocker" — moving the contact point forward shortens the radius without any
 * change of lean. src/reference/SkateSolver.cpp carries this and the design
 * bible calls it the mechanism behind turns; the engineering package left it
 * out and used a single constant radius, which quietly removes a whole
 * technique from the game.
 *
 * contactS: 0 = heel, 1 = toe pick.
 */
export function effectiveRocker(contactS: number, p: Params): number {
  return lerp(p.rocker, p.rockerToeFraction * p.rocker,
    smoothstep(p.rockerToeOnset, 1.0, clamp(contactS, 0, 1)));
}

/**
 * The radius a tilted rocker wants to trace.
 *
 *   R = rho / |sin theta|
 *
 * Tilt the rocker circle by theta and intersect it with the ice: near the
 * contact the projected arc is y = sin(theta) x^2 / (2 rho), whose curvature is
 * sin(theta)/rho. A flat blade goes straight, which is why this is clamped
 * rather than allowed to run to infinity.
 */
export function carveRadius(tilt: number, rhoEff: number): number {
  const s = Math.abs(sin(tilt));
  return s > 1e-4 ? rhoEff / s : 1e6;
}

/**
 * Lateral holding capacity, N.
 *
 *   F_bite = N (c0 + c1 sin|theta|) * sharpness * hardness
 *
 * Note what c1 means once it is above about 1: that is not Coulomb friction —
 * steel on ice cannot supply it — it is the edge cutting a groove and pushing
 * sideways against the wall of it. The model is a caricature of an interlock,
 * and it is a game constant. It is also the single number most likely to be
 * wrong, which is why the rig puts it on a slider.
 */
export function biteCapacity(normalLoad: number, tilt: number, p: Params): number {
  return normalLoad * (p.biteC0 + p.biteC1 * Math.abs(sin(tilt)))
    * p.sharpness * p.iceHardness;
}

/** Longitudinal friction coefficient. A deep edge costs speed; a skid costs more. */
export function muLong(tilt: number, skidding: boolean, p: Params): number {
  const mu = p.muGlide * (1 + p.muEdgeGain * (1 - cos(tilt)));
  return skidding ? mu + p.muSkid : mu;
}

/**
 * The lean that balances a given lateral acceleration: tan(phi) = a / g.
 *
 * Edgework does not enforce balance, it reports what balance would be. The gap
 * between this and the body's actual lean is the error the skater is solving
 * tick by tick, and it is the quantity every wobble, save and fall comes out of.
 */
export function equilibriumLean(latAccel: number, gravity: number): number {
  return atan2(latAccel, gravity);
}

/**
 * Speed at which a given edge stops holding, m/s. Diagnostic, for the panel.
 *
 * Setting demand equal to capacity, m v^2 sin|t| / rho = m g (c0 + c1 sin|t|),
 * and solving for v. Deep edges approach sqrt(g rho c1) from below, so with the
 * current defaults nothing skids until roughly 8.4 m/s however hard it leans —
 * which is a claim the rig lets you check against a stopwatch and your eyes.
 */
export function skidOnsetSpeed(tilt: number, rhoEff: number, p: Params): number {
  const s = Math.abs(sin(tilt));
  if (s < 1e-4) return Infinity;
  return Math.sqrt(p.gravity * rhoEff * (p.biteC0 + p.biteC1 * s) / s);
}

/**
 * The pull of the rink's shape along the ice, m/s^2, world frame.
 *
 *   h = relief (1 - (x/a)^2 - (y/b)^2),   a = -g grad h = 2 g relief (x/a^2, y/b^2)
 *
 * Downhill is outward on a crown and toward centre ice in a bowl. Each axis
 * is flat beyond its boards. The slopes are small enough (a thousandth or so)
 * that sin and tan of them are the slope itself.
 */
export function rinkSlopeAccel(pos: Vec2, p: Params): Vec2 {
  const k = 2 * p.gravity * p.rinkRelief;
  const a = p.rinkHalfLength, b = p.rinkHalfWidth;
  return v2(
    Math.abs(pos.x) <= a ? k * pos.x / (a * a) : 0,
    Math.abs(pos.y) <= b ? k * pos.y / (b * b) : 0,
  );
}
