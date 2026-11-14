// THE SUPPORT SIGNAL. One reading of who is carrying the skater, for every
// presentation to pose from: which blade carries the body, how the load is
// moving between them, where the centre of pressure is, and where the centre
// of mass sits over it.
//
// It is derived, never stored: a pure function of the solver's state, so it
// cannot change a replay or a score, and a replayed run gives the same signal
// tick for tick. Godot (scripts/skater.gd) and Unreal (IceSkater.cpp) read it
// rather than each working support out from the blades in its own way.
//
// With weightTransferMode 0 the load moves between blades within one tick, so
// `rate` is 0 and the phase is never "shift"; the signal still says which foot
// carries and where the pressure is. With 1 the shift is the solver's own.

import { dot, perpLeft, sub, v2 } from "./math.ts";
import type { Vec2 } from "./math.ts";
import { JUMP_PHASE } from "./jump.ts";
import type { Foot, SkaterState } from "./types.ts";

/**
 * What carries the body this tick.
 * - one: a single blade on the ice.
 * - both: two blades sharing a load that is not moving.
 * - shift: two blades on the ice and the load moving from one to the other.
 * - air: a jump's flight; no blade carries anything.
 * - down: fallen.
 */
export type SupportPhase = "one" | "both" | "shift" | "air" | "down";

/**
 * What one blade is doing.
 * - carrying: the only loaded blade.
 * - sharing: loaded, beside another, the load still.
 * - taking: loaded and its share rising.
 * - giving: loaded and its share falling.
 * - free: carrying nothing (off the ice, or in the air, or down).
 */
export type BladeRole = "carrying" | "sharing" | "taking" | "giving" | "free";

export interface SupportSignal {
  phase: SupportPhase;
  /** The blade carrying the most (the solver's supportFoot). */
  foot: Foot;
  /** The blade gaining load during a shift, or -1. */
  toward: Foot | -1;
  /** Each blade's share of the body's load, 0..1; both 0 in the air or down. */
  share: [number, number];
  /** Each share's rate of change, 1/s; 0 without weightTransferMode. */
  rate: [number, number];
  role: [BladeRole, BladeRole];
  /** m, world, on the ice: the share-weighted contact. The COM's own ground point when nothing carries. */
  cop: Vec2;
  /**
   * m from the centre of pressure to the COM's ground point, in the heading's
   * frame: `across` + toward perpLeft(heading), `along` + toward the heading.
   * A lean into a carve shows here as the body hanging inside the blade.
   */
  comOver: { across: number; along: number };
  /** m, the COM above the ice (SkaterState.comZ). */
  comHeight: number;
}

/** 1/s of share below which a two-footed load counts as still: 0.1 s to move 1 %. */
export const SHIFT_RATE = 0.1;

export function supportSignal(s: SkaterState): SupportSignal {
  const air = s.jump.phase === JUMP_PHASE.Air;
  const carried = !air && !s.fallen;
  const share: [number, number] = carried
    ? [s.blade[0].inContact ? s.blade[0].weight : 0, s.blade[1].inContact ? s.blade[1].weight : 0]
    : [0, 0];
  const r = carried && s.loadRate !== undefined ? s.loadRate : 0;
  const rate: [number, number] = [-r, r];
  const loaded = (share[0] > 0 ? 1 : 0) + (share[1] > 0 ? 1 : 0);
  const shifting = loaded === 2 && Math.abs(r) >= SHIFT_RATE;
  const phase: SupportPhase = s.fallen ? "down" : air ? "air" : loaded === 0 ? "air"
    : loaded === 1 ? "one" : shifting ? "shift" : "both";
  const toward: Foot | -1 = shifting ? (r > 0 ? 1 : 0) : -1;
  const role = ([0, 1] as const).map((i): BladeRole => {
    if (share[i] <= 0) return "free";
    if (loaded === 1) return "carrying";
    if (!shifting) return "sharing";
    return i === toward ? "taking" : "giving";
  }) as [BladeRole, BladeRole];
  const total = share[0] + share[1];
  const cop = total > 0
    ? v2((s.blade[0].contact.x * share[0] + s.blade[1].contact.x * share[1]) / total,
      (s.blade[0].contact.y * share[0] + s.blade[1].contact.y * share[1]) / total)
    : v2(s.pos.x, s.pos.y);
  const over = sub(s.pos, cop);
  return {
    phase, foot: s.supportFoot, toward, share, rate, role, cop,
    comOver: { across: dot(over, perpLeft(s.heading)), along: dot(over, s.heading) },
    comHeight: s.comZ,
  };
}
