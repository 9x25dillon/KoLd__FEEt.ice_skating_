// tools/ice-lab/sim/stepLevel.ts — a step sequence's ISU level, from the
// variety ladder this reduced-order model can actually observe.
//
// docs/level-features.md / data/step-features.json: level = min(variety
// grade, 1 + other features attained). This file scores only the variety
// ladder — none of the individual `features` array's items (rotation_both_
// directions, body_movements, difficult_turn_combinations, and the rest) are
// modelled, the same honest-gap discipline sim/spinLevel.ts holds itself to
// for its own list.
//
// The taxonomy names three sets of footwork. This rig can observe some of
// each, never invented — every type below is a real, distinct mechanic
// already in sim/moves.ts or the edge classifier, not a new one built to
// pad the count:
//   DIFFICULT {rocker, counter, bracket, twizzle, loop}: two of five.
//     Rocker, counter and a turn-shaped "loop" are not mechanics here.
//   SIMPLE {three_turn, mohawk, choctaw}: two of three. TURN_KIND's own
//     comment is explicit that a "choctaw" built the same way as a mohawk
//     is not actually one — no foot-changing bracket exists.
//   STEPS {cross_roll, chasse, toe_step, change_of_edge, running_step,
//     cross_behind, cross_in_front}: one of seven, an ordinary change of
//     edge while gliding (ClassifyCode already reports it as an EdgeEvent;
//     nothing new to build).
// A crossover is not in the data's taxonomy at all, but is unambiguously
// its own piece of footwork (sim/moves.ts's own crossover push, distinct
// from a stroke), so it is counted as a seventh, rig-specific type — see
// STEP_TYPE_NAME. Six types total, two of them "difficult".
//
// With six types against a ladder that needs seven for grade 2 (§"Simple
// variety"), this scorer's own honest ceiling is grade 1 ("Minimum
// variety") — never grade 2, 3 or 4, however the six are combined. This is
// exact, not approximate: it does not depend on which six a given routine
// happens to show, since VARIETY_LADDER's own grade 2 needs 7 distinct
// types full stop, and 7 is more than 6 no matter how they are counted.

import type { Foot } from "./types.ts";

export const STEP_TYPE = {
  ThreeTurn: 0, Mohawk: 1, Bracket: 2, Twizzle: 3, Crossover: 4, ChangeOfEdge: 5,
} as const;
export const STEP_TYPE_NAME = ["three-turn", "mohawk", "bracket", "twizzle", "crossover", "change of edge"] as const;
/** data/step-features.json's turn_taxonomy.difficult, restricted to what this rig has. */
const DIFFICULT = new Set<number>([STEP_TYPE.Bracket, STEP_TYPE.Twizzle]);

export interface StepEvent {
  type: number;
  foot: Foot;
  /** Sim ticks, for windowing a rolling pattern — see StepSequenceTracker.recent. */
  tick: number;
}

/** A small history of distinct footwork, the same shape sim/spinLevel.ts's SpinLevelTracker keeps for segments. */
export class StepSequenceTracker {
  readonly events: StepEvent[] = [];

  reset(): void { this.events.length = 0; }

  record(type: number, foot: Foot, tick: number): void { this.events.push({ type, foot, tick }); }

  /** Events within `windowTicks` of `nowTick` — a sustained pattern, not the whole program's history. */
  recent(nowTick: number, windowTicks: number): StepEvent[] {
    return this.events.filter((e) => nowTick - e.tick <= windowTicks);
  }
}

export interface StepGrade {
  grade: number;
  distinctTypes: number;
  distinctDifficult: number;
  bothFeet: boolean;
  difficultBothFeet: boolean;
}

export interface StepFeatureThresholds {
  grades: StepGrade[];
}

/**
 * Reads only `variety_ladder` out of `data/step-features.json` (Convention
 * 3.2, sim/score.ts: scoring is data, never code). Every individual feature
 * in that file's own `features` array is real and deliberately left
 * unparsed — see this file's header for why the taxonomy itself is the
 * binding constraint, not a missing threshold.
 */
export function loadStepFeatureThresholds(json: string): StepFeatureThresholds {
  const data = JSON.parse(json) as {
    variety_ladder?: { grades?: Array<{ grade?: unknown; requires?: Record<string, unknown> }> };
  };
  const grades = data.variety_ladder?.grades;
  if (!Array.isArray(grades) || grades.length === 0) throw new Error("step-features.json: missing variety_ladder.grades");
  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what}: not a finite number`);
    return v;
  };
  return {
    grades: grades.map((g) => {
      const grade = num(g.grade, "variety_ladder grade");
      const r = g.requires ?? {};
      return {
        grade,
        distinctTypes: num(r.distinct_turn_and_step_types, `grade ${grade} distinct_turn_and_step_types`),
        distinctDifficult: num(r.distinct_difficult_turn_types, `grade ${grade} distinct_difficult_turn_types`),
        bothFeet: Boolean(r.both_feet_used),
        difficultBothFeet: Boolean(r.difficult_turns_on_both_feet),
      };
    }),
  };
}

export interface StepLevelResult {
  /** 0 is level B. */
  level: number;
  distinctTypes: number[];
  bothFeet: boolean;
  difficultBothFeet: boolean;
}

/** Pure: the same event list always scores the same result. */
export function scoreStepLevel(events: readonly StepEvent[], t: StepFeatureThresholds): StepLevelResult {
  const types = new Set(events.map((e) => e.type));
  const feet = new Set(events.map((e) => e.foot));
  const difficultFeet = new Set(events.filter((e) => DIFFICULT.has(e.type)).map((e) => e.foot));
  const difficultTypes = new Set([...types].filter((ty) => DIFFICULT.has(ty)));
  const bothFeet = feet.size >= 2;
  const difficultBothFeet = difficultFeet.size >= 2;
  let level = 0;
  for (const g of [...t.grades].sort((a, b) => a.grade - b.grade)) {
    const meets = types.size >= g.distinctTypes && difficultTypes.size >= g.distinctDifficult
      && (!g.bothFeet || bothFeet) && (!g.difficultBothFeet || difficultBothFeet);
    if (meets) level = g.grade;
  }
  return { level, distinctTypes: [...types], bothFeet, difficultBothFeet };
}
