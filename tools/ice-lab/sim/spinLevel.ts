// tools/ice-lab/sim/spinLevel.ts — a spin's ISU level, from the two features
// this reduced-order model can actually observe.
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
// Of the seven OBSERVED features, five need a mechanic this rig does not
// have either:
//   - change_foot_by_jump, difficult_change_of_foot, all_three_positions_
//     second_foot need a combination spin with a foot change mid-element.
//     spinStart sets `Sp.foot` once; spinTick never reassigns it. There is
//     no second foot to change to.
//   - jump_within_spin needs a small jump mid-spin that resumes spinning.
//     The jump and spin systems do not compose that way.
//   - both_directions needs reversing rotation direction mid-spin. `Sp.dir`
//     is set once at entry (sim/moves.ts `spinStart`) and never reassigned;
//     there is no input that flips it.
// change_of_edge is not merely unbuilt: in this model a spin's blade tilt is
// `-Sp.dir * SPIN_EDGE` (sim/moves.ts `spinTick`), so edge sign IS rotation
// direction here, not an independent quantity. "Change of edge without
// changing direction" is not a state this model can ever be in; scoring it
// separately from both_directions would double-count the same event.
//
// That leaves exactly two: `increase_of_speed` and
// `eight_revolutions_no_change`. Both read state sim/moves.ts's spinTick
// already keeps (segRevs, segOmegaMin/Max, position) — but only for the
// CURRENT segment, overwritten the moment position changes. SpinLevelTracker
// rebuilds the doc's own "list of segments" (§2) as a small history, sampled
// once per tick, so earlier segments survive long enough to be scored.
//
// A level built from two of ten features tops out at 2, never 4 — an honest
// ceiling, not a bug. Levels 3 and 4 need the combination-spin and
// direction-reversal mechanics above; this file is not a substitute for
// building those, and does not pretend otherwise.

import type { SpinState } from "./types.ts";

export interface SpinSegment {
  /** SPIN_POSITION: 0 upright, 1 sit, 2 camel. */
  position: number;
  revolutions: number;
  omegaMin: number;
  omegaMax: number;
}

/** Rebuilds the segment list spinTick's own fields overwrite as they go. */
export class SpinLevelTracker {
  readonly segments: SpinSegment[] = [];
  private cur: SpinSegment | null = null;
  private lastPosition = -1;

  reset(): void {
    this.segments.length = 0;
    this.cur = null;
    this.lastPosition = -1;
  }

  /** Once per tick, only while `s.move === MOVE.Spin`. */
  sample(spin: SpinState): void {
    if (spin.position !== this.lastPosition) {
      if (this.cur) this.segments.push(this.cur);
      this.cur = { position: spin.position, revolutions: 0, omegaMin: spin.omega, omegaMax: spin.omega };
      this.lastPosition = spin.position;
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
}

/**
 * Reads only the two features this file can score out of `spin-features.json`
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
  if (!speed || !long) throw new Error("spin-features.json: missing a feature this scorer reads");
  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what}: not a finite number`);
    return v;
  };
  return {
    speedRatioMin: num(speed.requires?.omega_ratio_min, "spin.increase_of_speed.requires.omega_ratio_min"),
    speedMinRevolutions: num(speed.requires?.sustained_revolutions, "spin.increase_of_speed.requires.sustained_revolutions"),
    maxSpeedFeatures: num(speed.max_per_element, "spin.increase_of_speed.max_per_element"),
    longSegmentMinRevolutions: num(long.requires?.min_revolutions, "spin.eight_revolutions_no_change.requires.min_revolutions"),
  };
}

export interface SpinLevelResult {
  /** 0 is level B. Capped at 4 by definition, though this scorer alone never exceeds 2. */
  level: number;
  /** Distinct basic positions that earned the speed feature, in the order reached, up to maxSpeedFeatures. */
  speedPositions: number[];
  eightRevolutions: boolean;
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
  const level = Math.min(speedPositions.length + (eightRevolutions ? 1 : 0), 4);
  return { level, speedPositions, eightRevolutions };
}
