// tools/ice-lab/sim/session.ts — what a play session actually measured.
//
// The metrics here are NOT invented. They are the seven in
// pre-production-plan.md §6, with the definitions that document gives, because
// those are what the §8 kill gate is written against and thresholds were signed
// before any data existed. Inventing a parallel set would produce numbers that
// look like evidence and answer nothing.
//
// Five of the seven can be computed from state this rig already carries. The
// other two are named below with what they need, so nobody assumes they are
// here:
//
//   figure-eight deviation   needs the Figure Eight task and its reference
//                            curve. It is gate criterion 2 AND the shipping
//                            tutorial (The Patch), so it is real work, not
//                            instrumentation.
//   unprompted actions       needs a human watching. Not automatable, and the
//                            plan says so: "manually coded from video."
//
// In sim/ rather than app/ because it must be pure, tested and portable: the
// same numbers have to come out of KoLdSimCore, or the UE5 build and this rig
// are not measuring the same thing.

import type { SkaterState, SkatingInput, EdgeEvent } from "./types.ts";
import { EVENT } from "./types.ts";
import { len } from "./math.ts";

/** Speed above which the skater counts as moving, m/s. */
const MOVING = 0.5;

export interface SessionSummary {
  /** §6: "seconds of voluntary play". The headline. Nothing else is close. */
  freePlaySeconds: number;
  /** §6: fraction of ticks where the edge let go. Falls as skill rises. */
  skidRatio: number;
  /** §6: mean |lean| while moving, radians. Best proxy for trusting the ice. */
  meanLeanDepth: number;
  /** §6: signed edge transitions per minute. Exploring vs surviving. */
  edgeChangesPerMinute: number;
  /**
   * §6: median seconds from a fall to the next input. Under 3 s means the
   * failure felt fair, and it is half of gate criterion 3.
   *
   * In the rig, getting up is a fresh push — the solver stands the skater up
   * where they fell — or the reset, so this measures fall -> back on their
   * feet, whichever way they got there. A fall never got up from contributes
   * no sample rather than an infinite one, and a session with no samples
   * reports -1 rather than 0 — an unmeasured retry and an instant one are not
   * the same number.
   */
  medianTimeToRetrySeconds: number;
  /**
   * Seconds spent on the ice after a fall, until they stood up or reset. 0
   * means they never went down. Since standing up IS the retry input, over a
   * session this is roughly the retries summed; it is reported separately
   * because a fall never got up from counts here and nowhere else.
   */
  downSeconds: number;

  // Context, so a number is readable six months later.
  falls: number;
  strokes: number;
  distanceMetres: number;
  topSpeed: number;
  deepestLean: number;
  timeOnEdgeRatio: number;
  ticks: number;
}

export class SessionMeter {
  private ticks = 0;
  private movingTicks = 0;
  private skidTicks = 0;
  private edgeTicks = 0;
  private leanSum = 0;
  private edgeChanges = 0;
  private fallsCount = 0;
  private strokesCount = 0;
  private distance = 0;
  private top = 0;
  private deepest = 0;
  private dtSum = 0;
  private downTicks = 0;

  /** Ticks since the fall we are waiting to see them get up from, or -1. */
  private downSince = -1;
  private retries: number[] = [];
  private lastPush = false;

  reset(): void {
    this.ticks = 0; this.movingTicks = 0; this.skidTicks = 0; this.edgeTicks = 0;
    this.leanSum = 0; this.edgeChanges = 0; this.fallsCount = 0; this.strokesCount = 0;
    this.distance = 0; this.top = 0; this.deepest = 0; this.dtSum = 0;
    this.downTicks = 0;
    this.downSince = -1; this.retries = []; this.lastPush = false;
  }

  /** Feed one tick, after `step`. `events` is that tick's events only. */
  sample(s: SkaterState, input: SkatingInput, events: EdgeEvent[], dt: number): void {
    this.ticks++;
    this.dtSum += dt;

    let stoodUp = false;
    for (const e of events) {
      if (e.type === EVENT.EdgeChanged && !s.fallen) this.edgeChanges++;
      if (e.type === EVENT.Fall) { this.fallsCount++; this.downSince = this.ticks; }
      if (e.type === EVENT.Recovered) stoodUp = true;
    }

    // NOTHING BELOW THIS LINE COUNTS WHILE THE SKATER IS DOWN.
    //
    // A fallen body lies at about 89 degrees and keeps sliding, so a mean lean
    // depth that includes it reads 80 degrees and means nothing at all —
    // measured, on the first run of this file. The metrics describe skating.
    if (s.fallen) {
      this.downTicks++;
      // A button still held from before the fall is not a new input — that
      // reads as an instant retry every time, which is how this metric first
      // came out as a confident zero. It takes a FRESH push. The solver
      // applies the same rule before it stands the skater up, so in practice
      // a fresh push while down is the tick they get up and is counted below;
      // this branch is for a solver that leaves them down.
      if (this.downSince >= 0 && input.push && !this.lastPush) {
        this.retries.push((this.ticks - this.downSince) * dt);
        this.downSince = -1;
      }
      this.lastPush = input.push;
      return;
    }

    // Back up: whatever they did to get here, that was the retry.
    if (this.downSince >= 0) {
      this.retries.push((this.ticks - this.downSince) * dt);
      this.downSince = -1;
    }
    // The press that stood them up was consumed by standing up. It is the
    // retry, counted above; it is not a stroke, and nothing else happened on
    // this tick that skating metrics should see.
    if (stoodUp) { this.lastPush = input.push; return; }

    const speed = len(s.vel);
    this.distance += speed * dt;
    if (speed > this.top) this.top = speed;

    const lean = Math.abs(s.lean);
    if (speed > MOVING) {
      this.movingTicks++;
      this.leanSum += lean;
      if (lean > this.deepest) this.deepest = lean;
    }

    let skidding = false, onEdge = false;
    for (let i = 0; i < 2; i++) {
      const b = s.blade[i];
      if (!b.inContact) continue;
      if (b.regime === 4) skidding = true;          // REGIME.Skid
      if (b.regime === 2 || b.regime === 3) onEdge = true;
      }
    if (skidding) this.skidTicks++;
    if (onEdge) this.edgeTicks++;

    if (input.push && !this.lastPush) this.strokesCount++;
    this.lastPush = input.push;
  }

  summary(): SessionSummary {
    const seconds = this.dtSum;
    const skating = Math.max(this.ticks - this.downTicks, 1);
    const sorted = [...this.retries].sort((a, b) => a - b);
    const median = sorted.length === 0 ? -1
      : sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return {
      freePlaySeconds: seconds,
      skidRatio: this.skidTicks / skating,
      meanLeanDepth: this.movingTicks > 0 ? this.leanSum / this.movingTicks : 0,
      edgeChangesPerMinute: seconds > 0 ? (this.edgeChanges * 60) / seconds : 0,
      medianTimeToRetrySeconds: median,
      downSeconds: this.downTicks * (seconds / Math.max(this.ticks, 1)),
      falls: this.fallsCount,
      strokes: this.strokesCount,
      distanceMetres: this.distance,
      topSpeed: this.top,
      deepestLean: this.deepest,
      timeOnEdgeRatio: this.edgeTicks / skating,
      ticks: this.ticks,
    };
  }
}
