// app/camera.ts — where the rig looks from.
//
// A debug camera, and deliberately no more: the vertical-slice plan rewrites
// everything presentational, and the game's camera is design-bible §4.5's
// Broadcast Director, built in UE5. What this one is for is SEEING the model —
// which is why "travel up" and "chase" turn with the direction of travel rather
// than with the body. In the air the body spins and the travel is fixed at
// takeoff, so the view holds still through the rotation: §4.5's "hold, never
// cut", for the same reason — a still reference to time the check-out by.
//
// Everything on the ice plane goes through one canvas transform, so the
// renderer draws in metres and never learns which way it is being looked at.
// At north up and zoom 1 that transform is the one the rig always had.
//
// The chase view is ORTHOGRAPHIC: the ice is tilted away by the elevation and
// height is lifted by its cosine, with no vanishing point. That keeps the ice
// a single affine transform — circles stay circles-seen-at-an-angle for free —
// and it is what the solver needs you to see: lean, depth of knee, height of a
// jump. A true perspective (§4.5's Ice Cam, Skater's Line) would replace
// `groundMatrix` and `project` together; nothing else here depends on which.

import type { SkaterState } from "../sim/types.ts";
import { deltaAngle } from "../sim/math.ts";

/** Pixels per metre at zoom 1. */
export const PX = 26;

export const VIEW = { NorthUp: 0, TravelUp: 1, Chase: 2 } as const;
export const VIEW_NAME = ["north up", "travel up", "chase"] as const;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;
/** Chase elevation limits, degrees above the ice. */
export const CHASE_MIN = 15;
export const CHASE_MAX = 85;
/** One press of + or -. */
const ZOOM_STEP = 1.25;
/**
 * Yaw follow, s. Dampened, per §4.5, so a wobble on the edge does not swing
 * the rink; a turn still comes round in about a second.
 */
const YAW_TAU = 0.6;
const ELEVATION_TAU = 0.4;
/** Below this the direction of travel is noise, and the view holds. m/s. */
const TRAVEL_MIN = 0.5;
/** Travel up and chase look this far ahead: seconds of travel. */
const LEAD = 0.35;
const LEAD_TAU = 0.3;
/** How far below centre the chase view puts the skater, as a share of height. */
const CHASE_LOW = 0.22;

export type Matrix = [number, number, number, number, number, number];

export class Camera {
  view: number = VIEW.NorthUp;
  zoom = 1;
  /** The ice-plane direction that is screen up, radians. pi/2 is +y, north. */
  yaw = Math.PI / 2;
  /** Degrees above the ice, now. 90 is straight down. */
  elevation = 90;
  /** Where the chase view settles, degrees. `[` and `]`. */
  chaseElevation = 30;
  /** Where the view is centred, m. The skater plus the smoothed lead. */
  cx = 0;
  cy = 0;
  private leadX = 0;
  private leadY = 0;
  private placed = false;
  /** This frame's transform and height scale, set by groundMatrix. */
  private m: Matrix = [1, 0, 0, 1, 0, 0];
  private zPx = 0;

  get px(): number { return PX * this.zoom; }

  /** Straight onto the skater: first frame, and a reset. */
  snap(s: SkaterState): void {
    this.leadX = 0; this.leadY = 0;
    this.cx = s.pos.x; this.cy = s.pos.y;
    this.yaw = this.targetYaw(s);
    this.elevation = this.targetElevation();
    this.placed = true;
  }

  /** Once per simulation tick, so a replay is framed the way it was played. */
  update(s: SkaterState, dt: number): void {
    if (!this.placed) { this.snap(s); return; }
    // Every glide lands exactly rather than creeping for ever, so coming back
    // to north up is the original camera again, not a near miss of it.
    const dy = deltaAngle(this.yaw, this.targetYaw(s));
    this.yaw = Math.abs(dy) < 1e-6 ? this.targetYaw(s) : this.yaw + dy * Math.min(1, dt / YAW_TAU);
    const te = this.targetElevation(), de = te - this.elevation;
    this.elevation = Math.abs(de) < 1e-3 ? te : this.elevation + de * Math.min(1, dt / ELEVATION_TAU);
    const travel = this.view !== VIEW.NorthUp;
    const k = Math.min(1, dt / LEAD_TAU);
    this.leadX += ((travel ? s.vel.x * LEAD : 0) - this.leadX) * k;
    this.leadY += ((travel ? s.vel.y * LEAD : 0) - this.leadY) * k;
    this.cx = s.pos.x + this.leadX;
    this.cy = s.pos.y + this.leadY;
  }

  cycleView(): void { this.view = (this.view + 1) % VIEW_NAME.length; }

  /** Multiplicative, so every step feels the same size. Fractional for a wheel. */
  zoomBy(steps: number): void {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * Math.pow(ZOOM_STEP, steps)));
  }

  /** Raise (+) or lower (-) the chase camera, degrees. */
  tiltBy(degrees: number): void {
    this.chaseElevation = Math.min(CHASE_MAX, Math.max(CHASE_MIN, this.chaseElevation + degrees));
  }

  private targetYaw(s: SkaterState): number {
    if (this.view === VIEW.NorthUp) return Math.PI / 2;
    return Math.hypot(s.vel.x, s.vel.y) > TRAVEL_MIN ? Math.atan2(s.vel.y, s.vel.x) : this.yaw;
  }

  private targetElevation(): number {
    return this.view === VIEW.Chase ? this.chaseElevation : 90;
  }

  /**
   * The canvas transform for the ice plane, z = 0: `ctx.setTransform(...m)`.
   * Call once a frame, before `project`.
   *
   * With U the ice direction that is screen up and R = U turned a right angle
   * clockwise, a point p goes to
   *   x = w/2 + px (p - c).R
   *   y = h/2 + low - px sin(elevation) (p - c).U
   * where `low` drops the skater toward the bottom as the camera comes down,
   * and is exactly zero overhead. At north up, overhead, zoom 1 this is
   * translate(w/2, h/2), scale(PX, -PX), translate(-c): the rig's original
   * camera. The determinant stays negative, so the ice keeps its handedness.
   */
  groundMatrix(w: number, h: number): Matrix {
    const px = this.px, e = this.elevation * Math.PI / 180, sE = Math.sin(e);
    const ux = Math.cos(this.yaw), uy = Math.sin(this.yaw);
    const a = px * uy, c = -px * ux;               // R = (uy, -ux)
    const b = -px * sE * ux, d = -px * sE * uy;
    const low = h * CHASE_LOW * (1 - sE);
    this.m = [a, b, c, d, w / 2 - a * this.cx - c * this.cy, h / 2 + low - b * this.cx - d * this.cy];
    this.zPx = px * Math.cos(e);
    return this.m;
  }

  /** A point in the world, z up from the ice, to screen pixels. */
  project(x: number, y: number, z: number): [number, number] {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5] - this.zPx * z];
  }

  /** Distance into the screen, m: larger is farther. For drawing order. */
  depth(x: number, y: number): number {
    return (x - this.cx) * Math.cos(this.yaw) + (y - this.cy) * Math.sin(this.yaw);
  }

  /** How far from the centre, in metres of ice, the view can reach. */
  visibleRadius(w: number, h: number): number {
    const sE = Math.max(Math.sin(this.elevation * Math.PI / 180), 0.2);
    return Math.hypot(w, h) / (2 * this.px * sE);
  }
}
