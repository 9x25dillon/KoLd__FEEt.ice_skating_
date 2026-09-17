// tools/ice-lab/sim/spinLevel.ts — a spin's ISU level, from the three
// features this reduced-order model can actually observe.
//
// docs/level-features.md specifies ten features across two kinds: DECLARED
// (an authored asset says a position, entry or exit is difficult; the
// simulation only verifies it was attained and held) and OBSERVED (computed
// purely from physics). Read the whole list before assuming a gap here is an
// oversight — most of it is a wall, not a queue.
//
// Every DECLARED feature (difficult_variation, difficult_entrance,
// difficult_exit) needs pose or joint-angle data this rig does not have at
// all: design-bible.md §3.1 is explicit that the sim is a REDUCED-ORDER
// model, animation reads it, and a spin's position is exactly three values
// (SPIN_POSITION: upright, sit, camel) — not a catalogue of named variations
// with a reference pose to check a skater's own joints against.
//
// Of the seven OBSERVED features, four still need a mechanic this rig does
// not have:
//   - change_foot_by_jump, difficult_change_of_foot, all_three_positions_
//     second_foot need a combination spin with a foot change mid-element.
//     spinStart sets `Sp.foot` once; spinTick never reassigns it. There is
//     no second foot to change to.
//   - jump_within_spin needs a small jump mid-spin that resumes spinning.
//     The jump and spin systems do not compose that way.
// change_of_edge is not merely unbuilt: in this model a spin's blade tilt is
// `-Sp.dir * SPIN_EDGE` (sim/moves.ts `spinTick`), so edge sign IS rotation
// direction here, not an independent quantity. "Change of edge without
// changing direction" is not a state this model can ever be in; scoring it
// separately from both_directions would double-count the same event.
//
// both_directions is no longer on that list. sim/moves.ts's spinTick reverses
// Sp.dir on a held, opposing stick, exactly the way the data's own note says
// a real one works: "killing all angular momentum and regenerating it in the
// opposite sense... the simulation gets this almost for free: the sign of L
// flips." SpinLevelTracker below now splits a segment on a direction change
// too, not only a position change, so the two post-flip segments — each
// needing `min_revolutions_each_direction`, both in sit or camel — are there
// to find.
//
// That leaves three: `increase_of_speed`, `eight_revolutions_no_change`, and
// `both_directions`. All three read state sim/moves.ts's spinTick already
// keeps (segRevs, segOmegaMin/Max, position, dir) — but only for the CURRENT
// segment, overwritten the moment it ends. SpinLevelTracker rebuilds the
// doc's own "list of segments" (§2) as a small history, sampled once per
// tick, so earlier segments survive long enough to be scored.
//
// A level built from three of ten features tops out at 3, not 4 — an honest
// ceiling, not a bug. Level 4 needs the combination-spin mechanic above;
// this file is not a substitute for building it, and does not pretend
// otherwise.

import { SPIN_POSITION } from "./types.ts";
import type { SpinState } from "./types.ts";

export interface SpinSegment {
  /** SPIN_POSITION: 0 upright, 1 sit, 2 camel. */
  position: number;
  /** +1 anticlockwise, -1 clockwise (SpinState.dir) — the segment's own direction throughout. */
  dir: number;
  revolutions: number;
  omegaMin: number;
  omegaMax: number;
}

/**
 * Rebuilds the segment list spinTick's own fields overwrite as they go. A
 * segment boundary is a position change or a direction reversal — the same
 * two conditions spinTick itself resets segRevs/segOmegaMin/Max on, so this
 * tracker's split stays in lockstep with what those fields actually mean
 * tick to tick.
 */
export class SpinLevelTracker {
  readonly segments: SpinSegment[] = [];
  private cur: SpinSegment | null = null;
  private lastPosition = -1;
  private lastDir = 0;

  reset(): void {
    this.segments.length = 0;
    this.cur = null;
    this.lastPosition = -1;
    this.lastDir = 0;
  }

  /** Once per tick, only while `s.move === MOVE.Spin`. */
  sample(spin: SpinState): void {
    if (spin.position !== this.lastPosition || spin.dir !== this.lastDir) {
      if (this.cur) this.segments.push(this.cur);
      this.cur = { position: spin.position, dir: spin.dir, revolutions: 0, omegaMin: spin.omega, omegaMax: spin.omega };
      this.lastPosition = spin.position;
      this.lastDir = spin.dir;
    }
    const seg = this.cur as SpinSegment;
    seg.revolutions = spin.segRevs;
    seg.omegaMin = Math.min(seg.omegaMin, spin.omega);
    seg.omegaMax = Math.max(seg.omegaMax, spin.omega);
  }

  /** Call once the spin has ended, to flush the segment still open. */
  finish(): readonly SpinSegment[] {
    if (this.cur) { this.segments.push(this.cur); this.cur = null; }
    return this.segments;
  }
}

export interface SpinFeatureThresholds {
  /** spin.increase_of_speed: omega_ratio_min, sustained_revolutions. */
  speedRatioMin: number;
  speedMinRevolutions: number;
  /** spin.increase_of_speed: max_per_element — also this scorer's cap on distinct positions counted. */
  maxSpeedFeatures: number;
  /** spin.eight_revolutions_no_change: min_revolutions. */
  longSegmentMinRevolutions: number;
  /** spin.both_directions: min_revolutions_each_direction. */
  reverseMinRevolutions: number;
}

/**
 * Reads only the three features this file can score out of `spin-features.json`
 * (Convention 3.2, sim/score.ts: scoring is data, never code). Every other
 * feature in that file is real and deliberately left unparsed — see the
 * header above for why each one is out of reach.
 */
export function loadSpinFeatureThresholds(json: string): SpinFeatureThresholds {
  const data = JSON.parse(json) as {
    features?: Array<{ id?: unknown; max_per_element?: unknown; requires?: Record<string, unknown> }>;
  };
  if (!Array.isArray(data.features)) throw new Error("spin-features.json: missing features array");
  const find = (id: string) => data.features!.find((f) => f.id === id);
  const speed = find("spin.increase_of_speed");
  const long = find("spin.eight_revolutions_no_change");
  const reverse = find("spin.both_directions");
  if (!speed || !long || !reverse) throw new Error("spin-features.json: missing a feature this scorer reads");
  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what}: not a finite number`);
    return v;
  };
  return {
    speedRatioMin: num(speed.requires?.omega_ratio_min, "spin.increase_of_speed.requires.omega_ratio_min"),
    speedMinRevolutions: num(speed.requires?.sustained_revolutions, "spin.increase_of_speed.requires.sustained_revolutions"),
    maxSpeedFeatures: num(speed.max_per_element, "spin.increase_of_speed.max_per_element"),
    longSegmentMinRevolutions: num(long.requires?.min_revolutions, "spin.eight_revolutions_no_change.requires.min_revolutions"),
    reverseMinRevolutions: num(reverse.requires?.min_revolutions_each_direction, "spin.both_directions.requires.min_revolutions_each_direction"),
  };
}

export interface SpinLevelResult {
  /** 0 is level B. Capped at 4 by definition, though this scorer alone never exceeds 3. */
  level: number;
  /** Distinct basic positions that earned the speed feature, in the order reached, up to maxSpeedFeatures. */
  speedPositions: number[];
  eightRevolutions: boolean;
  /** spin.both_directions: a reversal with reverseMinRevolutions on each side, both in sit or camel. */
  bothDirections: boolean;
}

const SIT_OR_CAMEL = new Set<number>([SPIN_POSITION.Sit, SPIN_POSITION.Camel]);

/**
 * A direction change is always a segment boundary (SpinLevelTracker), so any
 * pair of ADJACENT segments with opposite `dir` is the whole reversal — there
 * is no same-direction segment that could sit between them. `max_gap_s` from
 * the data is not checked: this model's reversal never leaves MOVE.Spin, so
 * two segments from one tracker are, by construction, "immediately
 * following" — the gap the data is guarding against cannot arise here.
 */
function hasReversal(segments: readonly SpinSegment[], minRevEach: number): boolean {
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1], b = segments[i];
    if (a.dir === b.dir) continue;
    if (a.revolutions < minRevEach || b.revolutions < minRevEach) continue;
    if (!SIT_OR_CAMEL.has(a.position) || !SIT_OR_CAMEL.has(b.position)) continue;
    return true;
  }
  return false;
}

/** Pure: the same segment list always scores the same result. */
export function scoreSpinLevel(segments: readonly SpinSegment[], t: SpinFeatureThresholds): SpinLevelResult {
  const speedPositions: number[] = [];
  const seen = new Set<number>();
  for (const seg of segments) {
    if (speedPositions.length >= t.maxSpeedFeatures) break;
    if (seen.has(seg.position)) continue;
    if (seg.revolutions < t.speedMinRevolutions || seg.omegaMin <= 0) continue;
    if (seg.omegaMax / seg.omegaMin >= t.speedRatioMin) { speedPositions.push(seg.position); seen.add(seg.position); }
  }
  const eightRevolutions = segments.some((s) => s.revolutions >= t.longSegmentMinRevolutions);
  const bothDirections = hasReversal(segments, t.reverseMinRevolutions);
  const level = Math.min(speedPositions.length + (eightRevolutions ? 1 : 0) + (bothDirections ? 1 : 0), 4);
  return { level, speedPositions, eightRevolutions, bothDirections };
}
