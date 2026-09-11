// A steering bot for the Figure Eight. Not a test file: a helper, shared by
// test/figure8.test.ts (it is how RADIUS and START_SPEED were chosen) and
// test/race.test.ts (it is the ghost a race is run against).
//
// It steers on distance from the line and on heading error, with the lean
// capped at what it can hold; one foot per lobe; and one two-footed push at
// the crossing, as a school figure pushes. Crude on purpose — its 45-point run
// is a floor a person should clear, not a demonstration of the figure.

import { PRESETS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState, SkatingInput } from "../sim/types.ts";
import { FigureEight, CENTRES, RADIUS, START_SPEED } from "../app/figure8.ts";

export function figureBot(p: Params = PRESETS.responsive,
  each?: (input: SkatingInput, s: SkaterState, events: EdgeEvent[]) => void): { s: SkaterState; run: FigureEight } {
  const s = createState(p, START_SPEED);
  const run = new FigureEight(s);
  const ev: EdgeEvent[] = [];
  let lobe = 0, since = 999;
  for (let t = 0; t < 60 * 120 && run.state === "running"; t++) {
    const k = run.lobe;
    if (k !== lobe) { lobe = k; since = 0; }
    const c = CENTRES[k], dx = s.pos.x - c.x, dy = s.pos.y - c.y, dist = Math.hypot(dx, dy);
    const v = Math.hypot(s.vel.x, s.vel.y) || 1e-6, dir = k === 0 ? -1 : 1;
    const tx = (dir < 0 ? dy : -dy) / dist, ty = (dir < 0 ? -dx : dx) / dist;
    const vx = s.vel.x / v, vy = s.vel.y / v;
    const out = Math.atan2(vx * dx / dist + vy * dy / dist, vx * tx + vy * ty);
    const most = Math.atan(v * v / (9.81 * Math.max(RADIUS * 0.55, 1)));
    const phi = Math.max(0, Math.min(most, Math.atan(v * v / (9.81 * RADIUS)) + 0.04 * (dist - RADIUS) + 0.4 * out));
    const pushing = k === 1 && since < 40;
    const input = { ...NEUTRAL_INPUT, weight: pushing ? 0.5 : k === 0 ? 1 : 0, knee: 0.45,
      lean: (k === 0 ? -1 : 1) * phi / p.maxLean, push: k === 1 && since === 0 };
    since++;
    ev.length = 0;
    step(s, input, p, SIM_DT, ev);
    run.sample(s, SIM_DT);
    each?.(input, s, ev);
  }
  return { s, run };
}
