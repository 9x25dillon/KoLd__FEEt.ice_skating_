// FREE-FOOT PREPARATION. Where a free foot is carried before it takes the
// load, read from the support signal (sim/support.ts) and the move under way:
// - beside: as a straight stroke's push ends, the pushing foot recovers in
//   beside the skating heel, and is placed from there when it next takes;
// - cross: on a crossover, the outside foot carried forward in front of the
//   skating foot, and placed from there;
// - under: on a crossover, the inside foot that pushed under carried behind
//   the skating foot, and placed from there;
// - held: held in close by the skating ankle through a one-foot turn or a
//   twizzle (a mohawk or choctaw's changing foot is drawn in "beside");
// - none: no preparation; the presentation keeps its own free-foot pose.
//
// PRESENTATION ONLY (owner's pick, 2026-11-18). A pure function of the state
// and its signal: it moves no sim, no score and no replay digest, and the
// solver's free-leg swing (freeLegMode, `freeSwing`) still applies on top of
// it.
//
// Three things shape it, each measured in the pose lab (pose_lab.gd --check):
// - The sim never says ahead of time when a foot will take the load (a blade
//   carries from the first tick it is asked), so a pose is set while the foot
//   is still planted and giving — the pose shows none of it there — and the
//   foot leaves the ice already on its way. Switched on in the frame it
//   lifted, the foot jumped 11–15 cm in a frame.
// - Taking, the pose it was carried in fades as the share comes on, so the foot
//   goes from there to its contact and is not sent two ways at once.
// - The sim's contacts never cross, and the pose lab allows no crossed feet
//   on two blades. A take can't be foreseen, so no pose goes past the skating
//   foot's line: a crossover's crossing shows as the foot carried in front,
//   not over to the far side.
//
// Every distance, time and angle below is AUTHORED, not measured from skaters.

import { add, mul, perpLeft, smoothstep } from "../sim/math.ts";
import type { Vec2 } from "../sim/math.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { SupportSignal } from "../sim/support.ts";
import { MOVE } from "../sim/types.ts";
import type { Foot, SkaterState } from "../sim/types.ts";

export type FootPrepPose = "none" | "beside" | "cross" | "under" | "held";

export interface FootPrep {
  pose: FootPrepPose;
  /** 0..1: how far the presentation goes toward this target. 0 with pose "none". */
  weight: number;
  /** m, world: from the COM's ground point (s.pos) to where the foot is carried, as `cop` is given. */
  at: Vec2;
  /** m: the blade's height above the ice there. */
  lift: number;
}

interface Shape { out: number; ahead: number; lift: number }

/**
 * Each pose relative to the skating blade's contact, in the heading's frame:
 * `out` toward the free foot's own side (never negative: see above), `ahead`
 * along the facing, `lift` the blade above the ice. AUTHORED.
 */
export const FOOT_PREP: Record<Exclude<FootPrepPose, "none">, Shape> & { turnBeside: Shape } = {
  beside: { out: 0.08, ahead: -0.10, lift: 0.07 },
  cross: { out: 0.02, ahead: 0.16, lift: 0.12 },
  under: { out: 0.02, ahead: -0.24, lift: 0.06 },
  held: { out: 0.04, ahead: -0.08, lift: 0.20 },
  /** A mohawk or choctaw's changing foot, heel drawn to the skating instep. */
  turnBeside: { out: 0.07, ahead: -0.05, lift: 0.04 },
};

/** s: a turn's hold comes in over this much of the pivot. AUTHORED. */
export const HOLD_IN_TIME = 0.25;
/** s: a pushing foot's preparation comes in over the end of its push (strokeTime counting down to 0). AUTHORED. */
export const RECOVER_TIME = 0.15;
/** rad of lean toward a crossover's centre across which the crossing comes in, and goes as the lean straightens. AUTHORED. */
export const CROSS_LEAN: [number, number] = [0.05, 0.15];

const NONE = (): FootPrep => ({ pose: "none", weight: 0, at: { x: 0, y: 0 }, lift: 0 });

function place(s: SkaterState, carrier: Foot, free: Foot, pose: Exclude<FootPrepPose, "none">, weight: number,
  shape: Shape = FOOT_PREP[pose]): FootPrep {
  const left = perpLeft(s.heading);
  const ownSide = free === 0 ? 1 : -1; // the left foot's side is toward perpLeft(heading)
  const ground = add(add(s.blade[carrier].contact, mul(left, ownSide * shape.out)), mul(s.heading, shape.ahead));
  return { pose, weight: Math.max(0, Math.min(1, weight)), at: { x: ground.x - s.pos.x, y: ground.y - s.pos.y }, lift: shape.lift };
}

/** Where each foot is carried this tick: [left, right]. A carrying or sharing foot gets "none". */
export function footPrep(s: SkaterState, g: SupportSignal): [FootPrep, FootPrep] {
  const out: [FootPrep, FootPrep] = [NONE(), NONE()];
  if (g.phase === "air" || g.phase === "down" || s.jump.phase === JUMP_PHASE.Air) return out;
  // A one-foot turn or a twizzle: the free foot held in by the skating ankle.
  // A mohawk or choctaw: the changing foot drawn in beside, ready to take.
  if (s.move === MOVE.Turn || s.move === MOVE.Twizzle) {
    const T = s.turn, carrier = (T.cusps > 0 ? T.exitFoot : T.foot) as Foot, free = (1 - carrier) as Foot;
    if (g.share[free] > 0 && g.role[free] !== "taking") return out;
    const w = smoothstep(0, HOLD_IN_TIME, T.t) * (1 - g.share[free]);
    out[free] = T.exitFoot !== T.foot && T.cusps === 0
      ? place(s, T.foot, free, "beside", w, FOOT_PREP.turnBeside)
      : place(s, carrier, free, "held", w);
    return out;
  }
  if (s.move !== MOVE.None) return out;
  for (const free of [0, 1] as const) {
    const role = g.role[free];
    if (role !== "free" && role !== "taking" && role !== "giving") continue;
    const carrier = (1 - free) as Foot;
    if (g.share[carrier] <= 0) continue;
    const taking = role === "taking";
    // Planting: whatever was prepared gives way as the share comes on.
    const fade = taking ? 1 - g.share[free] : 1 - smoothstep(0, RECOVER_TIME, s.strokeTime);
    if (s.crossover && s.crossSide !== 0) {
      const outside: Foot = s.crossSide > 0 ? 1 : 0;
      const toward = smoothstep(CROSS_LEAN[0], CROSS_LEAN[1], s.lean * s.crossSide);
      // The crossover's own beat: the foot that pushed, or one being placed.
      // A crossover flag left over on a held edge carries nothing.
      if (toward > 0 && fade > 0 && (taking || s.strokeFoot === free)) {
        out[free] = place(s, carrier, free, free === outside ? "cross" : "under", toward * fade);
        continue;
      }
    }
    // A straight stroke: once its push is done the pushing foot recovers in
    // beside the skating heel; placed when the other foot's push begins.
    const recovering = !taking && s.strokeFoot === free;
    const placed = taking && s.strokeFoot !== free && s.strokeTime > 0;
    if ((recovering || placed) && fade > 0) out[free] = place(s, carrier, free, "beside", fade);
  }
  return out;
}
