// app/loop.ts — the fixed-step clock.
//
// The simulation runs at 120 Hz whatever the display does. At 60 fps that is
// two steps a frame; on a 144 Hz panel it is sometimes one and sometimes two,
// and the difference is absorbed by interpolating for presentation rather than
// by changing the step. Nothing downstream may see a variable dt: replay,
// checksums and every tuning measurement depend on the step being the step.

import { SIM_DT } from "../sim/params.ts";

export class FixedStep {
  private accumulator = 0;
  private last = 0;
  private running = false;
  /** 0..1 between the previous and current sim states, for presentation. */
  alpha = 0;
  /** Steps taken in the most recent frame, for the HUD. */
  lastSteps = 0;
  paused = false;

  private readonly stepOnce: () => void;
  private readonly draw: () => void;
  private readonly maxStepsPerFrame: number;

  constructor(stepOnce: () => void, draw: () => void, maxStepsPerFrame = 8) {
    this.stepOnce = stepOnce;
    this.draw = draw;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number): void => {
      let dt = (now - this.last) / 1000;
      this.last = now;

      // CLAMPED AT BOTH ENDS, and the lower end is not paranoia. `last` is
      // seeded from performance.now() while `now` is the rAF timestamp, and
      // those can arrive out of order — one negative frame steps the whole
      // simulation backwards, and in SONIC DRIFTER it also drove an animation
      // phase negative and threw "negative radius" out of the canvas.
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;

      this.lastSteps = 0;
      if (!this.paused) {
        this.accumulator += dt;
        let steps = 0;
        while (!this.paused && this.accumulator >= SIM_DT && steps < this.maxStepsPerFrame) {
          this.stepOnce();
          this.accumulator -= SIM_DT;
          steps++;
        }
        // Spiral-of-death guard: drop TIME, never change what a step means.
        if (steps === this.maxStepsPerFrame && this.accumulator >= SIM_DT) this.accumulator = 0;
        if (this.paused) this.accumulator = 0;
        this.lastSteps = steps;
      }
      this.alpha = this.accumulator / SIM_DT;
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
