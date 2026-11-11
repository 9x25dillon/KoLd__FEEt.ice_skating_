// game/podium.ts — the podium after a career result, as sim states a client poses like any skater.
//
// The top three of an event's standings (game/rivals.ts), each a fresh skater from
// sim/solver.ts's createState, stood still on their block at the sheet's centre and
// settled for a moment on neutral input, so the pose is the solver's standing pose,
// not an authored one. Gold in the middle, facing sim -y (toward the long side's
// camera); `height` is the block's top, for a client to lift the skater by.
// Presentation only: the places are the standings', nothing here scores.

import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import type { Standing } from "./rivals.ts";

/** Blocks by place: offset along the sheet (m), top height (m). Silver to gold's -x, bronze to +x. AUTHORED. */
export const PODIUM_BLOCKS = [
  { x: 0, height: 0.46 },
  { x: -1.05, height: 0.32 },
  { x: 1.05, height: 0.22 },
] as const;
/** The sheet's centre (game/rink.ts RINK). */
export const PODIUM_AT = { x: 0, y: 18 } as const;
/** Ticks a podium skater settles on neutral input before it is shown. */
export const SETTLE_TICKS = 30;

export interface PodiumPlace { place: number; name: string; you: boolean; height: number; state: SkaterState; low: false }

export function podium(rows: readonly Standing[], params: Params): PodiumPlace[] {
  return rows.filter(r => r.place <= 3).map(r => {
    const block = PODIUM_BLOCKS[r.place - 1];
    // Settled as the solver makes a skater, facing +x at the origin, then the whole stance turned to
    // face sim -y and carried onto the block: heading, and each blade's contact and tangent with it.
    const s = createState(params, 0);
    for (let i = 0; i < SETTLE_TICKS; i++) step(s, NEUTRAL_INPUT, params, SIM_DT, []);
    const at = { x: PODIUM_AT.x + block.x, y: PODIUM_AT.y }, from = { ...s.pos };
    const turn = (v: { x: number; y: number }) => ({ x: v.y, y: -v.x }); // -90 degrees: +x to -y
    s.heading = turn(s.heading);
    s.vel = { x: 0, y: 0 };
    for (const b of s.blade) {
      const rel = turn({ x: b.contact.x - from.x, y: b.contact.y - from.y });
      b.contact = { x: at.x + rel.x, y: at.y + rel.y };
      b.tangent = turn(b.tangent);
    }
    s.pos = at;
    return { place: r.place, name: r.name, you: r.you, height: block.height, state: s, low: false };
  });
}
