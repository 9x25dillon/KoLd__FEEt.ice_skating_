// app/camera.ts — where the rig looks from.
//
// A debug camera, and deliberately no more: the vertical-slice plan rewrites
// everything presentational, and the game's camera is design-bible §4.5's
// Broadcast Director, built in UE5. What this one is for is SEEING the model —
// which is why "travel up" turns with the direction of travel rather than with
// the body. In the air the body spins and the travel is fixed at takeoff, so
// the view holds still through the rotation: §4.5's "hold, never cut", for the
// same reason — the player needs a still reference to time the check-out by.
//
// The camera is one canvas transform for everything on the ice plane, so the
// renderer draws in metres and never learns which way it is being looked at.
// At north up and zoom 1 that transform is the one the rig always had.

import type { SkaterState } from "../sim/types.ts";
import { deltaAngle } from "../sim/math.ts";

/** Pixels per metre at zoom 1. */
export const PX = 26;

export const VIEW = { NorthUp: 0, TravelUp: 1 } as const;
export const VIEW_NAME = ["north up", "travel up"] as const;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;
/** One press of + or -. */
const ZOOM_STEP = 1.25;
/**
 * Yaw follow, s. Dampened, per §4.5, so a wobble on the edge does not swing
 * the rink; a turn still comes round in about a second.
 */
const YAW_TAU = 0.6;
/** Below this the direction of travel is noise, and the view holds. m/s. */
const TRAVEL_MIN = 0.5;
/** Travel up looks this far ahead: seconds of travel, so more ice in front. */
const LEAD = 0.35;
const LEAD_TAU = 0.3;

export type Matrix = [number, number, number, number, number, number];

export class Camera {
  view: number = VIEW.NorthUp;
  zoom = 1;
  /** The ice-plane direction that is screen up, radians. pi/2 is +y, north. */
  yaw = Math.PI / 2;
  /** Degrees above the ice. 90 is straight down. */
  elevation = 90;
  /** Where the view is centred, m. The skater plus the smoothed lead. */
  cx = 0;
  cy = 0;
  private leadX = 0;
  private leadY = 0;
  private placed = false;

  get px(): number { return PX * this.zoom; }

  /** Straight onto the skater: first frame, and a reset. */
  snap(s: SkaterState): void {
    this.leadX = 0; this.leadY = 0;
    this.cx = s.pos.x; this.cy = s.pos.y;
    this.yaw = this.targetYaw(s);
    this.placed = true;
  }

  /** Once per simulation tick, so a replay is framed the way it was played. */
  update(s: SkaterState, dt: number): void {
    if (!this.placed) { this.snap(s); return; }
    this.yaw += deltaAngle(this.yaw, this.targetYaw(s)) * Math.min(1, dt / YAW_TAU);
    const travel = this.view === VIEW.TravelUp;
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

  private targetYaw(s: SkaterState): number {
    if (this.view === VIEW.NorthUp) return Math.PI / 2;
    return Math.hypot(s.vel.x, s.vel.y) > TRAVEL_MIN ? Math.atan2(s.vel.y, s.vel.x) : this.yaw;
  }

  /**
   * The canvas transform for the ice plane, z = 0: `ctx.setTransform(...m)`.
   *
   * With U the ice direction that is screen up and R = U turned a right angle
   * clockwise, a point p goes to
   *   x = w/2 + px (p - c).R
   *   y = h/2 - px sin(elevation) (p - c).U
   * which at north up, overhead, zoom 1 is translate(w/2, h/2), scale(PX, -PX),
   * translate(-c): the rig's original camera. The determinant stays negative,
   * so anything drawn in the ice frame keeps its handedness.
   */
  groundMatrix(w: number, h: number): Matrix {
    const px = this.px, sE = Math.sin(this.elevation * Math.PI / 180);
    const ux = Math.cos(this.yaw), uy = Math.sin(this.yaw);
    const a = px * uy, c = -px * ux;               // R = (uy, -ux)
    const b = -px * sE * ux, d = -px * sE * uy;
    return [a, b, c, d, w / 2 - a * this.cx - c * this.cy, h / 2 - b * this.cx - d * this.cy];
  }

  /** How far from the centre, in metres of ice, the view can reach. */
  visibleRadius(w: number, h: number): number {
    const sE = Math.max(Math.sin(this.elevation * Math.PI / 180), 0.2);
    return Math.hypot(w, h) / (2 * this.px * sE);
  }
}
