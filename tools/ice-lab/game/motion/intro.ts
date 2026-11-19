// game/motion/intro.ts — the moment before the music (the owner's pick, 2026-11-18).
//
// A program in the sport begins with the skater still at her start spot while she is announced,
// and the music starts after. Here a run asked for it (IceEngine start {intro: true}) opens with
// INTRO_SECONDS of that: an idle clip on the whole body, the sim held at its tick 0 (never stepped,
// never recorded), then the program runs exactly as it would have without it. A fresh press of A
// skips it. Presentation only: no state, replay, score or clock of the program sees it.

import { CLIP_BY_ID } from "./library.ts";
import { sample } from "./types.ts";
import type { MotionFrame } from "./player.ts";

/** s the skater stands before the music. AUTHORED: an announcement's length, not measured. */
export const INTRO_SECONDS = 4;

/** The still clips a skater waits in at her start spot (game/motion/ceremony.ts); stretches and shakes are the warm-up's. */
export const INTRO_CLIPS = ["idle.breathe", "idle.look-around"] as const;

/** The clip for this run: a pure function of its seed (the event, or a dance sequence's seed), never the clock. */
export function introClip(seed: number): string {
  const n = INTRO_CLIPS.length;
  return INTRO_CLIPS[((Math.trunc(seed) % n) + n) % n];
}

export class ProgramIntro {
  readonly clip: string;
  readonly seconds: number;
  t = 0;
  private armed = false;
  constructor(seed: number, seconds = INTRO_SECONDS) {
    this.clip = introClip(seed);
    this.seconds = seconds;
  }
  /** Done at its length, within a summed tick's rounding (480 ticks of 1/120 s fall short of 4 by 1e-14). */
  get done(): boolean { return this.t >= this.seconds - 1e-9; }
  get left(): number { return Math.max(0, this.seconds - this.t); }
  /**
   * One tick of standing. `skip` is the A button: it ends the intro only on a fresh press, so an A
   * still held from the menu that started the run does not skip it.
   */
  tick(dt: number, skip = false): void {
    if (this.done) return;
    if (!skip) this.armed = true;
    else if (this.armed) { this.t = this.seconds; return; }
    this.t = Math.min(this.seconds, this.t + dt);
  }
  /** The whole body in the clip; a looping idle wraps in sample(). */
  frame(): MotionFrame {
    const c = CLIP_BY_ID.get(this.clip);
    if (!c) throw new Error(`Unknown intro clip ${this.clip}`);
    return { layer: "full", clip: c.id, t: this.t, pose: sample(c, this.t) };
  }
}
