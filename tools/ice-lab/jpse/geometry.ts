// tools/ice-lab/jpse/geometry.ts — path geometry, measured off the solver.
//
// The COM and the support blade are separate tracks (the owner's review,
// issue #74): a COM curve alone cannot establish an edge takeoff.

import type { Vec2 } from "../sim/math.ts";
import { atan2, deltaAngle, dot, len, tan } from "../sim/math.ts";

/** z of a x b. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

/**
 * Signed curvature of the path the velocity traces, 1/m, counter-clockwise
 * positive: the turn of the velocity over the distance it covered.
 */
export function velocityCurvature(vPrev: Vec2, v: Vec2, dt: number): number {
  const s = len(v) * dt;
  if (s < 1e-9 || len(vPrev) < 1e-9) return 0;
  return deltaAngle(atan2(vPrev.y, vPrev.x), atan2(v.y, v.x)) / s;
}

/** Signed curvature through three points (Menger), 1/m, counter-clockwise positive. */
export function threePointCurvature(a: Vec2, b: Vec2, c: Vec2): number {
  const ab = { x: b.x - a.x, y: b.y - a.y }, bc = { x: c.x - b.x, y: c.y - b.y }, ac = { x: c.x - a.x, y: c.y - a.y };
  const d = len(ab) * len(bc) * len(ac);
  return d < 1e-12 ? 0 : (2 * cross(ab, bc)) / d;
}

/**
 * The quasi-steady carve, kappa = g tan(phi) / v^2, signed on the ice.
 *
 * A BASELINE ESTIMATE, not a law of this engine (the owner's review): it
 * assumes a steady carve with no transient loading or segment motion. Ice Lab
 * decides what actually happens; this number is only what that differs from.
 * `lean` is the solver's (+ toward perpLeft(heading)); skating backward the
 * travel opposes the heading, so the same lean curves the other way round.
 */
export function baselineCurvature(lean: number, vel: Vec2, heading: Vec2, g: number): number {
  const v2 = dot(vel, vel);
  if (v2 < 1e-6) return 0;
  const dirSign = dot(vel, heading) >= 0 ? 1 : -1;
  return (dirSign * g * tan(lean)) / v2;
}

/**
 * alpha_b, the blade-to-travel angle: atan2(b x t, b . t), rad. 0 is the blade
 * pointing along the travel, pi skating backward along it; anything else is a
 * blade angled across its own path.
 */
export function bladeTravelAngle(blade: Vec2, vel: Vec2): number {
  if (len(vel) < 1e-9) return 0;
  return atan2(cross(blade, vel), dot(blade, vel));
}

/** How far the blade points off its line of travel, whichever way it skates: 0..pi/2. */
export function bladeSkew(alpha: number): number {
  const a = Math.abs(alpha);
  return a > Math.PI / 2 ? Math.PI - a : a;
}
