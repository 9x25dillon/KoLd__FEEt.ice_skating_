import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";

export const LESSONS = [
  ["Find an edge", "Hold A or D for a smooth curve. Cruise supplies your pushes."],
  ["Cross your feet", "Keep carving and press Space / A to push across the curve."],
  ["Skate backward", "While carving, tap B. Keep gliding after the turn."],
  ["Land a jump", "Hold Shift / RT for a short count, release, then bend again in the air."],
  ["Hold a spin", "At speed, hold Y for a full rotation. Release to exit."],
  ["Open the glide", "Gliding forward, hold I / both bumpers for an Ina Bauer."],
  ["Get low", "Glide and hold U / D-pad down for the cantilever pose."],
] as const;

/** Practice achievements only read what the solver actually did. */
export class Practice {
  done = LESSONS.map(() => false);
  private held = LESSONS.map(() => 0);
  last = "";
  toast = 0;
  get count() { return this.done.filter(Boolean).length; }
  get next() { return this.done.findIndex(v => !v); }
  sample(s: SkaterState, low: boolean, dt: number) {
    this.toast = Math.max(0, this.toast - dt);
    if (s.fallen) { this.held.fill(0); return; }
    const backward = s.vel.x * s.heading.x + s.vel.y * s.heading.y < -0.5;
    const conditions = [
      Math.abs(s.lean) > 0.12 && s.move === MOVE.None,
      s.crossover && s.strokeTime > 0,
      backward && s.move === MOVE.None,
      s.landed.tick >= 0 && !s.landed.fall && s.landed.height > 0.05,
      s.move === MOVE.Spin && s.spin.swept >= Math.PI * 2,
      s.move === MOVE.InaBauer,
      low,
    ];
    const durations = [1.5, 0.08, 0.8, 0, 0, 1, 1];
    conditions.forEach((active, i) => {
      this.held[i] = active ? this.held[i] + dt : 0;
      if (!this.done[i] && active && this.held[i] >= durations[i]) {
        this.done[i] = true; this.last = LESSONS[i][0]; this.toast = 3;
      }
    });
  }
}
