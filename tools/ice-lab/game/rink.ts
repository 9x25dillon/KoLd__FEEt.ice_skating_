// game/rink.ts — the boards, matching the rounded rectangle scene.ts already
// draws (bible §3.5: collision and environment interaction). Live gameplay
// only, applied to the object the frame renders, never inside sim/'s own
// step(). The recorder captures BEFORE collision, but the changed state feeds
// the NEXT solver tick. Playback must apply the same collision policy between
// ticks; changing it can change future digests. It is not a pose-only overlay.

import type { SkaterState } from "../sim/types.ts";
import { FALL, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";

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

/** m/s inward a learner pushes herself off the boards with, hands on them. AUTHORED: an easy walking pace, slower than any push. */
export const BOARDS_PUSH_OFF = 0.5;
/** |cos| below which her blade lies along the boards and needs no push-off. AUTHORED: within ~3° of parallel. */
export const PARALLEL_BOARDS = 0.05;
/** m inside the boards the assist leaves her, so the next tick starts on the ice. AUTHORED: 1 mm. */
export const BOARDS_CLEARANCE = 1e-3;

/**
 * The learner's boards (Params.boardsAssistMode 1: Beginner mode and the tutorial lessons). The
 * hard boards answer a hit with a bounce, or a fall above CRASH_SPEED; a learner who skates into
 * them, or stands against them pushing, gets stuck there (the owner's First ice: 52.8 s within
 * 2 mm of the boards at under 0.1 m/s, docs/boardsgap-2026-11.md). Here, instead:
 *  - she is put back on the ice, BOARDS_CLEARANCE inside, heading in or out;
 *  - her speed into the boards is taken away, with no bounce and no crash; her speed along them
 *    is kept, so she slides along the boards rather than stopping on them;
 *  - slower than BOARDS_PUSH_OFF against them, she pushes off with her hands along her blade,
 *    whichever way leads away from the boards, so standing against them always leaves them.
 * No event: nothing here is a fall or an edge. The sim's own step is untouched.
 */
function assistBoards(s: SkaterState, hit: RinkHit): void {
  s.pos.x -= hit.nx * (hit.penetration + BOARDS_CLEARANCE);
  s.pos.y -= hit.ny * (hit.penetration + BOARDS_CLEARANCE);
  const into = s.vel.x * hit.nx + s.vel.y * hit.ny;
  if (into > 0) { s.vel.x -= hit.nx * into; s.vel.y -= hit.ny * into; }
  pushOffBoards(s, hit);
}

/**
 * Slow against the boards, she pushes off them with her hands. Moving, she slides: her speed along
 * the boards is hers. Only slow does she push off, and along her blade, never across it: a blade
 * slides along itself, and a sideways shove only skids it (measured: a sideways push-off while
 * carving along the boards at 3 m/s put her down in 4.8 s). Whichever way along the blade leads away
 * from the boards is the way she goes: backward when she faces them, forward when she backs onto them.
 */
function pushOffBoards(s: SkaterState, hit: RinkHit): void {
  if (Math.hypot(s.vel.x, s.vel.y) >= BOARDS_PUSH_OFF) return;
  const facing = s.heading.x * hit.nx + s.heading.y * hit.ny;
  if (Math.abs(facing) < PARALLEL_BOARDS) return;   // square along them: her own push goes along
  const away = -Math.sign(facing);
  const off = (s.vel.x * s.heading.x + s.vel.y * s.heading.y) * away;
  if (off < BOARDS_PUSH_OFF) {
    s.vel.x += s.heading.x * away * (BOARDS_PUSH_OFF - off);
    s.vel.y += s.heading.y * away * (BOARDS_PUSH_OFF - off);
  }
}

/**
 * Push the skater back inside the boards and answer their velocity into the
 * wall: a bounce below `CRASH_SPEED`, a fall onto the ice above it. Mutates
 * position and velocity on outward hits; `s.fallen` and friends only on a
 * crash, mirroring sim/solver.ts's own fall assignment so the rest of the
 * game reads it the same way it reads any other fall.
 */
export function resolveRinkCollision(s: SkaterState, events: EdgeEvent[],
  options: Partial<Pick<Params, "boardsSnapInbound" | "boardsAssistMode" | "boardsUnstickMode">> = { boardsSnapInbound: 0 }): void {
  if (s.fallen) return;
  const hit = rinkHit(s.pos.x, s.pos.y);
  if (!hit) return;
  if (options.boardsAssistMode === 1) return assistBoards(s, hit);
  hardBoards(s, events, hit, options);
  // boardsUnstickMode: slow against the boards, she pushes off them (every mode; the bounce and
  // the crash above are unchanged).
  if (options.boardsUnstickMode === 1 && !s.fallen) pushOffBoards(s, hit);
}

/** The boards as they were: a bounce, or a fall above CRASH_SPEED. */
function hardBoards(s: SkaterState, events: EdgeEvent[], hit: RinkHit,
  options: Partial<Pick<Params, "boardsSnapInbound">>): void {
  // Positive: still heading further out, along the outward normal.
  const into = s.vel.x * hit.nx + s.vel.y * hit.ny;
  if (into <= 0) {
    // Opt-in prototype: recover position without reflecting inward velocity,
    // adding an event, or changing the existing fallen-skater policy.
    if (options.boardsSnapInbound === 1) {
      s.pos.x -= hit.nx * hit.penetration;
      s.pos.y -= hit.ny * hit.penetration;
    }
    return;
  }
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
