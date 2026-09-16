// game/rink.ts — the boards, matching the rounded rectangle scene.ts already
// draws (bible §3.5: collision and environment interaction). Live gameplay
// only, applied to the object the frame renders, never inside sim/'s own
// step(): a replay's recorded digest is captured from the pure solver output
// before this runs, so a clip stays part of the verified contract regardless
// of which wall it hit and when — the boards are presentation, the way the
// cantilever pose overlay is (README.md). Played back, the same function
// runs again on the replay's own live state, so watching one still shows the
// bounce; it is simply not what a divergence check compares against.

import type { SkaterState } from "../sim/types.ts";
import { FALL, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";

/** The rounded rectangle scene.ts's `ctx.roundRect(-28, -10, 56, 56, 9)` draws. */
export const RINK = { minX: -28, maxX: 28, minY: -10, maxY: 46, corner: 9 };

/** m/s of perpendicular impact speed past which a hit is a fall, not a bounce. */
export const CRASH_SPEED = 3.5;
/** Share of the perpendicular impact speed kept, reversed, on a bounce. */
export const RESTITUTION = 0.35;

export interface RinkHit { nx: number; ny: number; penetration: number }

/**
 * Outward unit normal and how far past the boundary `x,y` is, or null while
 * still on the ice. The rounded rect is the flat sides' rectangle, inset by
 * the corner radius, read as a signed distance field: clamp the point onto
 * that inset rectangle, and the distance to it minus the radius is the same
 * number whether the nearest boundary is a flat side or a rounded corner.
 */
export function rinkHit(x: number, y: number): RinkHit | null {
  const { minX, maxX, minY, maxY, corner } = RINK;
  const cx = Math.max(minX + corner, Math.min(maxX - corner, x));
  const cy = Math.max(minY + corner, Math.min(maxY - corner, y));
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d <= corner) return null;
  return { nx: dx / d, ny: dy / d, penetration: d - corner };
}

/**
 * Push the skater back inside the boards and answer their velocity into the
 * wall: a bounce below `CRASH_SPEED`, a fall onto the ice above it. Mutates
 * `s.pos` and `s.vel` always on a hit; `s.fallen` and friends only on a
 * crash, mirroring sim/solver.ts's own fall assignment so the rest of the
 * game reads it the same way it reads any other fall.
 */
export function resolveRinkCollision(s: SkaterState, events: EdgeEvent[]): void {
  if (s.fallen) return;
  const hit = rinkHit(s.pos.x, s.pos.y);
  if (!hit) return;
  // Positive: still heading further out, along the outward normal.
  const into = s.vel.x * hit.nx + s.vel.y * hit.ny;
  if (into <= 0) return; // already heading back onto the ice
  s.pos.x -= hit.nx * hit.penetration;
  s.pos.y -= hit.ny * hit.penetration;
  s.vel.x -= hit.nx * into * (1 + RESTITUTION);
  s.vel.y -= hit.ny * into * (1 + RESTITUTION);
  if (into > CRASH_SPEED) {
    s.fallReason = FALL.Collision;
    s.fallen = true;
    s.strokeTime = 0;
    events.push({
      tick: s.tick, type: EVENT.Fall, foot: s.supportFoot,
      prevCode: s.blade[s.supportFoot].code, newCode: FALL.Collision, prevDwell: 0, value: into,
    });
  }
}
