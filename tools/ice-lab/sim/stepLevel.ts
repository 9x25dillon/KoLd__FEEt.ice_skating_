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
//   DIFFICULT {rocker, counter, bracket, twizzle, loop}: five of five, all
//     of them, now. Rocker and Counter turned out buildable after all —
//     TURN_KIND's own comment has the full account of what was actually
//     wrong about "a different cusp topology this rig's pivot does not
//     have": travelSense does not track rotation swept, only whether the
//     exit faces with or against the skater's own CURRENT momentum, and a
//     single-cusp pivot that pins it to "with" regardless of cusp parity is
//     Rocker (from `turn`) or Counter (from `bracket`) — the same pivot
//     every other turn already runs, one more special case in one function.
//   SIMPLE {three_turn, mohawk, choctaw}: two of three. TURN_KIND's own
//     comment is explicit that a "choctaw" built the same way as a mohawk
//     is not actually one — no foot-changing bracket exists.
//   STEPS {cross_roll, chasse, toe_step, change_of_edge, running_step,
//     cross_behind, cross_in_front}: one of seven, an ordinary change of
//     edge while gliding (ClassifyCode already reports it as an EdgeEvent;
//     nothing new to build).
// A crossover is not in the data's taxonomy at all, but is unambiguously
// its own piece of footwork (sim/moves.ts's own crossover push, distinct
// from a stroke), so it is counted as a tenth, rig-specific type — see
// STEP_TYPE_NAME. Nine types total, five of them "difficult".
//
// Nine types and five difficult clears VARIETY_LADDER's own grade 3
// ("Variety": 9 types, 4 difficult, both feet, difficult turns on both
// feet) — the honest ceiling moves to grade 3, given a routine that
// actually spreads its difficult turns across both feet (StepSequenceTracker
// checks this; it is not automatic). Grade 4 needs 11 types (this rig has
// 9), so it is out of reach on the type count alone regardless — choctaw or
// a real STEPS-category mechanic (no data backing exists for any of the
// seven STEPS types) would be needed. Its own `difficult_turns_in_both_
// rotational_directions` requirement is checked: every turn and twizzle
// already knows which way the body rotated (TurnState.dir, +1 anticlockwise,
// -1 clockwise), so a StepEvent carries it and grade 4 needs difficult ones
// in both senses. Only the type count still holds grade 4 out of reach.

import type { Foot } from "./types.ts";

export const STEP_TYPE = {
  ThreeTurn: 0, Mohawk: 1, Bracket: 2, Twizzle: 3, Crossover: 4, ChangeOfEdge: 5, Loop: 6, Rocker: 7, Counter: 8,
} as const;
export const STEP_TYPE_NAME = [
  "three-turn", "mohawk", "bracket", "twizzle", "crossover", "change of edge", "loop", "rocker", "counter",
] as const;
/** data/step-features.json's turn_taxonomy.difficult — all five now real. */
const DIFFICULT = new Set<number>([STEP_TYPE.Bracket, STEP_TYPE.Twizzle, STEP_TYPE.Loop, STEP_TYPE.Rocker, STEP_TYPE.Counter]);

export interface StepEvent {
  type: number;
  foot: Foot;
  /** Sim ticks, for windowing a rolling pattern — see StepSequenceTracker.recent. */
  tick: number;
  /** +1 anticlockwise, -1 clockwise (TurnState.dir); 0 or absent for footwork that does not rotate the body. */
  dir?: number;
}

/** A small history of distinct footwork, the same shape sim/spinLevel.ts's SpinLevelTracker keeps for segments. */
export class StepSequenceTracker {
  readonly events: StepEvent[] = [];

  reset(): void { this.events.length = 0; }

  record(type: number, foot: Foot, tick: number, dir = 0): void { this.events.push({ type, foot, tick, dir }); }

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
  difficultBothDirections: boolean;
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
        difficultBothDirections: Boolean(r.difficult_turns_in_both_rotational_directions),
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
  difficultBothDirections: boolean;
}

/** Pure: the same event list always scores the same result. */
export function scoreStepLevel(events: readonly StepEvent[], t: StepFeatureThresholds): StepLevelResult {
  const types = new Set(events.map((e) => e.type));
  const feet = new Set(events.map((e) => e.foot));
  const difficult = events.filter((e) => DIFFICULT.has(e.type));
  const difficultFeet = new Set(difficult.map((e) => e.foot));
  const difficultDirs = new Set(difficult.map((e) => Math.sign(e.dir ?? 0)).filter((d) => d !== 0));
  const difficultTypes = new Set([...types].filter((ty) => DIFFICULT.has(ty)));
  const bothFeet = feet.size >= 2;
  const difficultBothFeet = difficultFeet.size >= 2;
  const difficultBothDirections = difficultDirs.size >= 2;
  let level = 0;
  for (const g of [...t.grades].sort((a, b) => a.grade - b.grade)) {
    const meets = types.size >= g.distinctTypes && difficultTypes.size >= g.distinctDifficult
      && (!g.bothFeet || bothFeet) && (!g.difficultBothFeet || difficultBothFeet)
      && (!g.difficultBothDirections || difficultBothDirections);
    if (meets) level = g.grade;
  }
  return { level, distinctTypes: [...types], bothFeet, difficultBothFeet, difficultBothDirections };
}
