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
import { EVENT, EDGE_CODE_NONE } from "./types.ts";
import { JUMP_NONE } from "./jump.ts";
import { len } from "./math.ts";

/**
 * Landings kept on a card. A card is posted whole and the collector refuses
 * bodies over 64 KB; a hundred of these, pretty-printed, is about half that.
 */
export const MAX_LANDINGS = 100;

/**
 * One landing, numbers only, as sim/jump.ts scored it. Booleans are 0/1 so the
 * card stays a table of numbers — nothing a person typed, nothing about them.
 */
export interface LandingRecord {
  /** Seconds into the session. */
  second: number;
  /** JUMP index (T S Lo F Lz A = 0..5), or 255 for a hop. */
  kind: number;
  revolutions: number;
  shortBy: number;
  rotationCall: number;
  edgeCall: number;
  toe: number;
  takeoffQuality: number;
  landingQuality: number;
  height: number;
  airTime: number;
  twoFoot: number;
  stepOut: number;
  fall: number;
}

/** Speed above which the skater counts as moving, m/s. */
const MOVING = 0.5;

export interface SessionSummary {
  /** §6: "seconds of voluntary play". The headline. Nothing else is close. */
  freePlaySeconds: number;
  /** §6: fraction of ticks where the edge let go. Falls as skill rises. */
  skidRatio: number;
  /** §6: mean |lean| while moving, radians. Best proxy for trusting the ice. */
  meanLeanDepth: number;
  /**
   * §6: signed edge transitions per minute. Exploring vs surviving.
   *
   * Counts only transitions the skater chose. Two kinds are left out, because
   * the rig produces them for every tester alike and they swamped the rest:
   * the pushing blade's roll onto its inside edge and back, two per stroke —
   * measured, 161/min from stroking every 0.75 s with no lean at all, against
   * a first tester's 297 — and NONE -> edge, which is a blade coming back to
   * the ice after a reset, a stand-up or a jump, not a change of edge.
   */
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

  // Jumps. Not §6 metrics — the plan refuses jumps in the prototype, and
  // playtest forces them off — so in any measured block every one of these is
  // zero, which is itself worth being able to see on the card.
  takeoffs: number;
  /** Landings of a named jump: kind is not JUMP_NONE. */
  jumps: number;
  /** Landings of a hop, or of a takeoff no jump leaves from. */
  hops: number;
  /** Landings that ended on the ice. Also counted in `falls`. */
  landingFalls: number;
  /** Means over every landing, 0..1; -1 when there were none. */
  meanTakeoffQuality: number;
  meanLandingQuality: number;
  /** Every landing in order, up to MAX_LANDINGS. */
  landings: LandingRecord[];
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
  /**
   * Per blade, ticks it is still on a push roll after its stroke ran out. The
   * solver snaps the pushing blade back to the body's tilt on the tick AFTER
   * strokeTime reaches zero, so the roll back off the inside edge lands one
   * sample later than the last sample that still shows the stroke running.
   */
  private pushRoll = [0, 0];
  /** Per blade, its edge code at the last sample before a push roll began. */
  private rollFrom = [EDGE_CODE_NONE, EDGE_CODE_NONE];
  private takeoffCount = 0;
  private landingCount = 0;
  private jumpCount = 0;
  private landingFallCount = 0;
  private tqSum = 0;
  private lqSum = 0;
  private landingList: LandingRecord[] = [];

  reset(): void {
    this.ticks = 0; this.movingTicks = 0; this.skidTicks = 0; this.edgeTicks = 0;
    this.leanSum = 0; this.edgeChanges = 0; this.fallsCount = 0; this.strokesCount = 0;
    this.distance = 0; this.top = 0; this.deepest = 0; this.dtSum = 0;
    this.downTicks = 0;
    this.downSince = -1; this.retries = []; this.lastPush = false;
    this.pushRoll = [0, 0]; this.rollFrom = [EDGE_CODE_NONE, EDGE_CODE_NONE];
    this.takeoffCount = 0; this.landingCount = 0; this.jumpCount = 0;
    this.landingFallCount = 0; this.tqSum = 0; this.lqSum = 0; this.landingList = [];
  }

  /** Feed one tick, after `step`. `events` is that tick's events only. */
  sample(s: SkaterState, input: SkatingInput, events: EdgeEvent[], dt: number): void {
    this.ticks++;
    this.dtSum += dt;

    let stoodUp = false;
    const stroking = s.strokeTime > 0;
    for (const e of events) {
      if (e.type === EVENT.EdgeChanged && !s.fallen
        && e.prevCode !== EDGE_CODE_NONE
        && this.pushRoll[e.foot] === 0
        && !(stroking && e.foot === s.strokeFoot)) this.edgeChanges++;
      if (e.type === EVENT.Fall) { this.fallsCount++; this.downSince = this.ticks; }
      if (e.type === EVENT.Recovered) stoodUp = true;
      if (e.type === EVENT.Takeoff) this.takeoffCount++;
      // The resolver writes `landed` on the landing tick, before this sample.
      if (e.type === EVENT.Landing) this.land(s);
    }
    // A push roll is skipped, not erased: if the lean crossed over while the
    // blade was pushing, it comes back on a different edge than it left, and
    // that is one transition the skater made. Without this, stroking hides
    // real changes instead — 54/min gliding became 36/min stroking, measured
    // on the same oscillating lean.
    for (let i = 0; i < 2; i++) {
      const was = this.pushRoll[i];
      if (was > 0) this.pushRoll[i]--;
      if (stroking && i === s.strokeFoot) this.pushRoll[i] = 2;
      if (this.pushRoll[i] > 0) continue;
      const code = s.blade[i].code;
      if (was > 0 && !s.fallen && code !== EDGE_CODE_NONE
        && this.rollFrom[i] !== EDGE_CODE_NONE && code !== this.rollFrom[i]) this.edgeChanges++;
      this.rollFrom[i] = code;
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

  private land(s: SkaterState): void {
    const j = s.landed;
    this.landingCount++;
    if (j.kind !== JUMP_NONE) this.jumpCount++;
    if (j.fall) this.landingFallCount++;
    this.tqSum += j.takeoffQuality;
    this.lqSum += j.landingQuality;
    if (this.landingList.length >= MAX_LANDINGS) return;
    this.landingList.push({
      second: this.dtSum, kind: j.kind, revolutions: j.revolutions, shortBy: j.shortBy,
      rotationCall: j.rotationCall, edgeCall: j.edgeCall, toe: j.toe ? 1 : 0,
      takeoffQuality: j.takeoffQuality, landingQuality: j.landingQuality,
      height: j.height, airTime: j.airTime,
      twoFoot: j.twoFoot ? 1 : 0, stepOut: j.stepOut ? 1 : 0, fall: j.fall ? 1 : 0,
    });
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
      takeoffs: this.takeoffCount,
      jumps: this.jumpCount,
      hops: this.landingCount - this.jumpCount,
      landingFalls: this.landingFallCount,
      meanTakeoffQuality: this.landingCount > 0 ? this.tqSum / this.landingCount : -1,
      meanLandingQuality: this.landingCount > 0 ? this.lqSum / this.landingCount : -1,
      landings: this.landingList.map((l) => ({ ...l })),
    };
  }
}
