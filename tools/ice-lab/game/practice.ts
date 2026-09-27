import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";

export const LESSONS = [
  ["Find an edge", "Build speed with a few strokes, then hold a gentle lean for a smooth curve."],
  ["Cross your feet", "Keep carving and add a stroke across the curve. Watch your feet cross."],
  ["Skate backward", "Ask for a turn while carving. Keep your weight on the skating foot and glide out backward."],
  ["Land a jump", "Load the skating knee, release to take off, then bend again to cushion your landing."],
  ["Hold a spin", "Build speed on an edge, then hold your spin input for a full rotation. Release to exit."],
  ["Open the glide", "Glide forward into an Ina Bauer. Pause and open Controls for your setup’s binding."],
  ["Get low", "Hold a low cantilever pose while gliding. Pause and open Controls for your setup’s binding."],
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
