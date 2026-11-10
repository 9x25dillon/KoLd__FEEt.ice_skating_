// tools/ice-lab/sim/spinLevel.ts — a spin's ISU level, from the six
// features this reduced-order model can actually observe.
//
// docs/level-features.md specifies ten features across two kinds: DECLARED
// (an authored asset says a position, entry or exit is difficult; the
// simulation only verifies it was attained and held) and OBSERVED (computed
// purely from physics). Read the whole list before assuming a gap here is an
// oversight — most of it is a wall, not a queue.
//
// 2026-11-09: difficult_variation is scored now, for the one difficult
// variation the sim reads off the body itself — the standing split, the free
// leg's raise and knee (sim/moves.ts spinVariation), held for the data's
// revolutions and centred. The paragraph below stays true of every other
// named variation and of the entrance and exit.
//
// Every DECLARED feature (difficult_variation, difficult_entrance,
// difficult_exit) needs pose or joint-angle data this rig does not have at
// all: design-bible.md §3.1 is explicit that the sim is a REDUCED-ORDER
// model, animation reads it, and a spin's position is exactly three values
// (SPIN_POSITION: upright, sit, camel) — not a catalogue of named variations
// with a reference pose to check a skater's own joints against.
//
// Of the seven OBSERVED features, one still needs a mechanic this rig does
// not have: jump_within_spin, a small jump mid-spin that resumes spinning
// WITHOUT changing feet — the jump and spin systems still do not compose
// that way. change_of_edge is not merely unbuilt: in this model a spin's
// blade tilt is `-Sp.dir * SPIN_EDGE` (sim/moves.ts `spinTick`), so edge sign
// IS rotation direction here, not an independent quantity. "Change of edge
// without changing direction" is not a state this model can ever be in;
// scoring it separately from both_directions would double-count the same
// event.
//
// change_foot_by_jump, difficult_change_of_foot and all_three_positions_
// second_foot are no longer on the "needs a mechanic" list either. sim/
// moves.ts's spinTick can now change the spinning foot mid-element: a fresh
// toe press (input.toe, otherwise unused during a spin) starts a brief,
// airborne transfer — angular momentum conserved but for one transfer cost,
// paid once — landing on the other foot, SpinState.foot toggled, the whole
// event recorded (air time, revolutions lost, whether SPIN_POSITION also
// changed across it). SpinLevelTracker below reads that the same way it
// already reads position and direction.
//
// both_directions works the same way it always has: sim/moves.ts's spinTick
// reverses Sp.dir on a held, opposing stick — "killing all angular momentum
// and regenerating it in the opposite sense... the simulation gets this
// almost for free: the sign of L flips," the data's own words. SpinLevelTracker
// splits a segment on a direction change, a position change, OR a foot
// change now, so segments adjacent across any of the three stay findable.
//
// That leaves six: `increase_of_speed`, `eight_revolutions_no_change`,
// `both_directions`, `change_foot_by_jump`, `difficult_change_of_foot`, and
// `all_three_positions_second_foot`. All six read state sim/moves.ts's
// spinTick already keeps (segRevs, segOmegaMin/Max, position, dir, foot, and
// the foot-change record) — but only for the CURRENT segment or the most
// recent change, overwritten as they go. SpinLevelTracker rebuilds the doc's
// own "list of segments" (§2), plus a small foot-change history, sampled
// once per tick, so earlier ones survive long enough to be scored.
//
// A level built from six of ten features reaches the ISU's own clamp of 4 —
// an honest ceiling now, not merely a bug avoided: level_rule's own
// `min(count, 4)` means a fourth attained feature already saturates it, and
// this file can attain up to six. jump_within_spin and the three DECLARED
// pose features remain real gaps; this file does not pretend otherwise.

import { SPIN_POSITION, SPIN_VARIATION_DIFFICULT } from "./types.ts";
import type { SpinState } from "./types.ts";

export interface SpinSegment {
  /** SPIN_POSITION: 0 upright, 1 sit, 2 camel. */
  position: number;
  /** +1 anticlockwise, -1 clockwise (SpinState.dir) — the segment's own direction throughout. */
  dir: number;
  /** SpinState.foot at the start of this segment — 0/1, toggles across a completed foot change. */
  foot: number;
  revolutions: number;
  omegaMin: number;
  omegaMax: number;
}

/** One completed foot change (sim/moves.ts spinTick), as scoreSpinLevel needs it. */
export interface SpinFootChange {
  airTimeS: number;
  revolutionsLost: number;
  positionChanged: boolean;
}

/** A named variation held within a spin (SpinState.variation), at its longest. */
export interface SpinVariationHeld {
  variation: number;
  /** The basic position it was held in: difficult_variation counts per basic position. */
  position: number;
  revolutions: number;
  /** The spin's drift from where it began at that moment, m: the feature's centering. */
  travel: number;
}

/**
 * Rebuilds the segment list spinTick's own fields overwrite as they go. A
 * segment boundary is a position change, a direction reversal, or a foot
 * change — the same conditions spinTick itself resets segRevs/segOmegaMin/Max
 * on (a foot change resets nothing extra there, but SpinState.foot toggles
 * the moment it completes), so this tracker's split stays in lockstep with
 * what those fields actually mean tick to tick.
 */
export class SpinLevelTracker {
  readonly segments: SpinSegment[] = [];
  /** One entry per completed foot change this spin — data/spin-features.json's
   *  change_foot_by_jump/difficult_change_of_foot only ever credit once
   *  (`max_per_element: 1`), but every attempt is kept for the caller to inspect. */
  readonly footChanges: SpinFootChange[] = [];
  /** Every variation held this spin, each at its most revolutions (present only with the free leg's raise in play). */
  readonly variations: SpinVariationHeld[] = [];
  private cur: SpinSegment | null = null;
  private lastPosition = -1;
  private lastDir = 0;
  private lastFoot = -1;
  private lastChangeCompletedTick = -1;

  reset(): void {
    this.segments.length = 0;
    this.footChanges.length = 0;
    this.variations.length = 0;
    this.cur = null;
    this.lastPosition = -1;
    this.lastDir = 0;
    this.lastFoot = -1;
    this.lastChangeCompletedTick = -1;
  }

  /** Once per tick, only while `s.move === MOVE.Spin`. */
  sample(spin: SpinState): void {
    if (spin.position !== this.lastPosition || spin.dir !== this.lastDir || spin.foot !== this.lastFoot) {
      if (this.cur) this.segments.push(this.cur);
      this.cur = {
        position: spin.position, dir: spin.dir, foot: spin.foot, revolutions: 0,
        omegaMin: spin.omega, omegaMax: spin.omega,
      };
      this.lastPosition = spin.position;
      this.lastDir = spin.dir;
      this.lastFoot = spin.foot;
    }
    const seg = this.cur as SpinSegment;
    seg.revolutions = spin.segRevs;
    seg.omegaMin = Math.min(seg.omegaMin, spin.omega);
    seg.omegaMax = Math.max(seg.omegaMax, spin.omega);
    if ((spin.variation ?? 0) > 0) {
      const v = spin.variation!, held = this.variations.find((x) => x.variation === v && x.position === spin.position);
      const revolutions = spin.varRevs ?? 0;
      if (!held) this.variations.push({ variation: v, position: spin.position, revolutions, travel: spin.travel });
      else if (revolutions > held.revolutions) { held.revolutions = revolutions; held.travel = spin.travel; }
    }
    if (spin.changeCompletedTick >= 0 && spin.changeCompletedTick !== this.lastChangeCompletedTick) {
      this.lastChangeCompletedTick = spin.changeCompletedTick;
      this.footChanges.push({
        airTimeS: spin.changeAirTimeS, revolutionsLost: spin.changeRevolutionsLost,
        positionChanged: spin.changePositionChanged,
      });
    }
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
  /** spin.change_foot_by_jump: min_air_time_s, max_revolutions_lost. `resumes_spin_within_s` is not
   *  read separately — sim/moves.ts's spinTick can only ever record a completed change that resumed
   *  the spin (an interrupted one never reaches SpinState.changeCompletedTick at all), and the air
   *  time it can produce is bounded by Params.spinFootChangeAirTime's own validated <= 0.4 ceiling. */
  footChangeMinAirTimeS: number;
  footChangeMaxRevolutionsLost: number;
  /** spin.difficult_change_of_foot: max_revolutions_lost. `max_transition_s` is not read separately,
   *  for the same reason as `resumes_spin_within_s` above — bounded by construction. */
  difficultChangeMaxRevolutionsLost: number;
  /** spin.all_three_positions_second_foot: distinct_basic_positions_after_foot_change, min_revolutions_each. */
  secondFootDistinctPositions: number;
  secondFootMinRevolutionsEach: number;
  /** spin.difficult_variation: min_revolutions_held, max_centering_error_m, max_per_element. The pose tolerance is read where the variation is (sim/moves.ts spinVariation). */
  variationMinRevolutions: number;
  variationMaxCentering: number;
  maxVariationFeatures: number;
}

/**
 * Reads the three features SpinLevelTracker/scoreSpinLevel could not score
 * before the foot-change mechanic (sim/moves.ts spinTick), on top of the
 * three the eleventh session's own scorer already reads — six of ten now
 * (Convention 3.2, sim/score.ts: scoring is data, never code). The remaining
 * four (jump_within_spin, and the three DECLARED pose-based features) are
 * still real gaps — see the header above.
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
  const footChange = find("spin.change_foot_by_jump");
  const difficultChange = find("spin.difficult_change_of_foot");
  const secondFoot = find("spin.all_three_positions_second_foot");
  const variation = find("spin.difficult_variation");
  if (!speed || !long || !reverse || !footChange || !difficultChange || !secondFoot || !variation) {
    throw new Error("spin-features.json: missing a feature this scorer reads");
  }
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
    footChangeMinAirTimeS: num(footChange.requires?.min_air_time_s, "spin.change_foot_by_jump.requires.min_air_time_s"),
    footChangeMaxRevolutionsLost: num(footChange.requires?.max_revolutions_lost, "spin.change_foot_by_jump.requires.max_revolutions_lost"),
    difficultChangeMaxRevolutionsLost: num(difficultChange.requires?.max_revolutions_lost, "spin.difficult_change_of_foot.requires.max_revolutions_lost"),
    secondFootDistinctPositions: num(secondFoot.requires?.distinct_basic_positions_after_foot_change, "spin.all_three_positions_second_foot.requires.distinct_basic_positions_after_foot_change"),
    secondFootMinRevolutionsEach: num(secondFoot.requires?.min_revolutions_each, "spin.all_three_positions_second_foot.requires.min_revolutions_each"),
    variationMinRevolutions: num(variation.requires?.min_revolutions_held, "spin.difficult_variation.requires.min_revolutions_held"),
    variationMaxCentering: num(variation.requires?.max_centering_error_m, "spin.difficult_variation.requires.max_centering_error_m"),
    maxVariationFeatures: num(variation.max_per_element, "spin.difficult_variation.max_per_element"),
  };
}

export interface SpinLevelResult {
  /** 0 is level B. Capped at 4 by definition. */
  level: number;
  /** Distinct basic positions that earned the speed feature, in the order reached, up to maxSpeedFeatures. */
  speedPositions: number[];
  eightRevolutions: boolean;
  /** spin.both_directions: a reversal with reverseMinRevolutions on each side, both in sit or camel. */
  bothDirections: boolean;
  /** spin.change_foot_by_jump: at least one completed airborne change within the data's own bounds. */
  footChangeByJump: boolean;
  /** spin.difficult_change_of_foot: a completed change where SPIN_POSITION also differs across it. */
  difficultChangeOfFoot: boolean;
  /** spin.all_three_positions_second_foot: the foot reached after a change held all three basic
   *  positions for secondFootMinRevolutionsEach or more. */
  allThreePositionsSecondFoot: boolean;
  /** spin.difficult_variation: the basic positions a difficult variation was held in, up to maxVariationFeatures. */
  difficultVariations: number[];
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

/**
 * spin.all_three_positions_second_foot: the "second foot" is whichever foot
 * differs from the first segment's own — this model only ever has the two —
 * so distinct basic positions are counted among segments on that foot alone,
 * each needing `minRevEach` or more, same as a speed feature's own floor.
 */
function hasAllThreePositionsSecondFoot(segments: readonly SpinSegment[], minRevEach: number, need: number): boolean {
  if (segments.length === 0) return false;
  const firstFoot = segments[0].foot;
  const positions = new Set<number>();
  for (const seg of segments) {
    if (seg.foot === firstFoot || seg.revolutions < minRevEach) continue;
    positions.add(seg.position);
  }
  return positions.size >= need;
}

/** Pure: the same segment list and foot-change list always score the same result. */
export function scoreSpinLevel(
  segments: readonly SpinSegment[], t: SpinFeatureThresholds,
  footChanges: readonly SpinFootChange[] = [],
  variations: readonly SpinVariationHeld[] = [],
): SpinLevelResult {
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
  const footChangeByJump = footChanges.some((c) => c.airTimeS >= t.footChangeMinAirTimeS && c.revolutionsLost <= t.footChangeMaxRevolutionsLost);
  const difficultChangeOfFoot = footChanges.some((c) => c.positionChanged && c.revolutionsLost <= t.difficultChangeMaxRevolutionsLost);
  const allThreePositionsSecondFoot = hasAllThreePositionsSecondFoot(segments, t.secondFootMinRevolutionsEach, t.secondFootDistinctPositions);
  // A difficult variation (the data's flag), held long enough and centred: one per basic position.
  const difficultVariations: number[] = [];
  for (const v of variations) {
    if (difficultVariations.length >= t.maxVariationFeatures) break;
    if (!SPIN_VARIATION_DIFFICULT[v.variation] || difficultVariations.includes(v.position)) continue;
    if (v.revolutions >= t.variationMinRevolutions && v.travel <= t.variationMaxCentering) difficultVariations.push(v.position);
  }
  const level = Math.min(
    difficultVariations.length + speedPositions.length + (eightRevolutions ? 1 : 0) + (bothDirections ? 1 : 0)
      + (footChangeByJump ? 1 : 0) + (difficultChangeOfFoot ? 1 : 0) + (allThreePositionsSecondFoot ? 1 : 0),
    4,
  );
  return {
    level, speedPositions, eightRevolutions, bothDirections,
    footChangeByJump, difficultChangeOfFoot, allThreePositionsSecondFoot, difficultVariations,
  };
}
