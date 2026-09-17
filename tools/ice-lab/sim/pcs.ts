// tools/ice-lab/sim/pcs.ts — Program Component Score, design-bible.md §2.7 /
// src/reference/ScoreCalculator.cs's `Component` enum and its formula:
// `Round2(TrimmedMean(panel)) * rules.ComponentFactor`, summed over
// Composition, Presentation and Skating Skills.
//
// Convention 3.2 (sim/score.ts): scoring is data, never code. `componentFactor`
// comes from data/segment-rules.csv — 1.33/1.67 (short) and 2.67/3.33 (free),
// by discipline — never hardcoded, because the ISU revises the scale most
// seasons and a rules change should be a data patch, the same reason
// scale-of-values.csv exists.
//
// THE MAPPING FROM PHYSICS TO A 0..10 SCORE IS INVENTED (L3), NOT TRANSCRIBED.
// Unlike scoreJump's GOE panel (an exact base value and step from the data)
// or spinLevel.ts's both_directions (exact ISU thresholds), no data file
// says "this much mean flow is a 7.5". Composition, Presentation and Skating
// Skills are judged qualities in real skating; what follows is an authored,
// monotonic, openly-labelled proxy over what this reduced-order rig can
// actually observe — not a transcription of anything. Read qualityOf's own
// comment, one bullet of the bible's "driven by" column at a time, before
// trusting a number out of this file.
//
// Post-hoc, not per-tick: computed once, at the end of a program, over
// already-recorded session state (SessionMeter, PcsMeter, an IceGrid). It
// never touches SkaterState or Params, so — like sim/spinLevel.ts — there is
// no replay-determinism risk in it at all; no replay contract bump needed.

import { trimmedMean, round2, parseCsv, gaussian } from "./score.ts";
import { rng, clamp, lerp, saturate } from "./math.ts";
import type { SkaterState } from "./types.ts";
import type { SessionSummary } from "./session.ts";
import type { IceGrid } from "./ice.ts";

export const COMPONENT_NAME = ["Composition", "Presentation", "Skating Skills"] as const;

export interface SegmentRule {
  discipline: string;
  segment: string;
  targetSeconds: number;
  toleranceSeconds: number;
  componentFactor: number;
  jumpElements: number;
  spinElements: number;
  stepElements: number;
}

const num = (s: string, what: string): number => {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`${what}: "${s}" is not a number`);
  return v;
};

export function loadSegmentRules(csv: string): SegmentRule[] {
  return parseCsv(csv).map((r) => ({
    discipline: r.discipline, segment: r.segment,
    targetSeconds: num(r.target_seconds, `${r.discipline}/${r.segment} target_seconds`),
    toleranceSeconds: num(r.tolerance_seconds, `${r.discipline}/${r.segment} tolerance_seconds`),
    componentFactor: num(r.component_factor, `${r.discipline}/${r.segment} component_factor`),
    jumpElements: num(r.jump_elements, `${r.discipline}/${r.segment} jump_elements`),
    spinElements: num(r.spin_elements, `${r.discipline}/${r.segment} spin_elements`),
    stepElements: num(r.step_elements, `${r.discipline}/${r.segment} step_elements`),
  }));
}

export function findSegmentRule(rules: readonly SegmentRule[], discipline: string, segment: string): SegmentRule {
  const r = rules.find((x) => x.discipline === discipline && x.segment === segment);
  if (!r) throw new Error(`segment-rules.csv: no row for ${discipline}/${segment}`);
  return r;
}

// ── gathering what a program actually did ────────────────────────────────────

/**
 * session.ts is deliberately reserved for pre-production-plan.md §6's own
 * gate metrics ("inventing a parallel set would produce numbers that look
 * like evidence and answer nothing") — so the one extra signal PCS needs that
 * file does not carry, flow's own session mean, gets its own small meter
 * rather than growing SessionMeter past its stated purpose.
 */
export class PcsMeter {
  private flowSum = 0;
  private ticks = 0;

  reset(): void { this.flowSum = 0; this.ticks = 0; }

  /** Once per tick, alongside SessionMeter.sample — reads state, never writes it. */
  sample(s: SkaterState): void { this.flowSum += s.flow; this.ticks++; }

  get meanFlow(): number { return this.ticks > 0 ? this.flowSum / this.ticks : 0; }
}

export interface PcsInputs {
  /** 0..1. 0 if flowMode was never on: not a penalty, just nothing to read (qualityOf's own note). */
  meanFlow: number;
  /** Radians, session.ts's own definition: mean |lean| while moving. */
  meanLeanDepth: number;
  /** 0..1, session.ts's own definition: share of ticks the edge let go. */
  skidRatio: number;
  edgeChangesPerMinute: number;
  /** SkaterState.musicCredit accumulated per second of free play. 0 if musicMode was never on. */
  musicCreditRate: number;
}

/** The session/PCS meters' own fields, read into the shape scorePcs wants. */
export function pcsInputsFrom(session: SessionSummary, meter: PcsMeter, musicCredit: number): PcsInputs {
  return {
    meanFlow: meter.meanFlow,
    meanLeanDepth: session.meanLeanDepth,
    skidRatio: session.skidRatio,
    edgeChangesPerMinute: session.edgeChangesPerMinute,
    musicCreditRate: session.freePlaySeconds > 0 ? musicCredit / session.freePlaySeconds : 0,
  };
}

// ── physics -> a 0..1 "quality" per component ────────────────────────────────

/** `v` at or below `floor` is 0; at or past `ceiling` is 1; linear between. Authored, not measured — see this file's own header. */
const rise = (v: number, floor: number, ceiling: number): number => saturate((v - floor) / (ceiling - floor));

/**
 * design-bible.md §2.7's "driven by" column, one bullet at a time, each
 * either genuinely modelled here or named as a gap — the same discipline
 * spinLevel.ts's own header holds itself to.
 *
 * Skating Skills — "mean flow, mean lean depth, skid ratio, speed retained
 * through transitions, both-direction turn usage". Four of five: flow and
 * lean depth read directly; skid ratio inverted (fewer skids is the skill);
 * `edgeChangesPerMinute` stands in for "multi-directional skating" (the
 * bible's own phrase for what this component is, not a substitution this
 * file invented). "Speed retained through transitions" has no clean per-tick
 * signal — SessionMeter does not isolate a transition from ordinary travel —
 * left out.
 *
 * Presentation — "musical credit accumulation, accent usage, carriage-stick
 * activity, gaze behaviour, posture under fatigue". One of five: musical
 * credit's own accumulation rate, which already folds in accent usage (every
 * credit IS a hit accent, sim/music.ts) into one number. Carriage activity,
 * gaze and posture need telemetry this rig does not keep, or — gaze — data it
 * has no way to observe at all.
 *
 * Composition — "ice-coverage map from the tracing buffer, lobe variety,
 * element distribution, Composer layout". One of four: `IceGrid.coverage()`
 * directly, the exact "tracing buffer" the bible names (sim/ice.ts). Lobe
 * variety needs the same curvature-direction tracker flow's own "alternating
 * lobes" is still missing (README.md, solver.ts §14). Element distribution
 * and Composer layout are real gaps too, not built yet.
 */
function skatingSkillsQuality(i: PcsInputs): number {
  const lean = rise(i.meanLeanDepth, 0.05, 0.35);
  const clean = 1 - rise(i.skidRatio, 0, 0.3);
  const variety = rise(i.edgeChangesPerMinute, 20, 80);
  return (saturate(i.meanFlow) + lean + clean + variety) / 4;
}

function presentationQuality(i: PcsInputs): number {
  return rise(i.musicCreditRate, 0, 4);
}

// ── the judge panel, and the total ───────────────────────────────────────────

/**
 * Nine marks, quarter-point steps, 0.25..10.00 — score.ts's own `judgePanel`
 * shape (a seeded RNG, a strictness per judge, Gaussian noise), scaled to
 * PCS's range instead of GOE's -5..5. No blemish concept at this level: a
 * program either was, or was not, a fall (deductions.ts's own concern, not
 * this file's), so only the authored quality and judge noise vary a mark.
 */
export function pcsJudgePanel(quality: number, seed: number, judges = 9): number[] {
  const u = rng(seed >>> 0);
  const marks: number[] = [];
  for (let j = 0; j < judges; j++) {
    const strictness = 0.5 + 0.5 * u();
    const v = lerp(0.25, 10, saturate(quality)) + (1 - strictness) * 0.4 * gaussian(u);
    marks.push(clamp(Math.round(v * 4) / 4, 0.25, 10));
  }
  return marks;
}

export interface PcsScore {
  composition: number;
  presentation: number;
  skatingSkills: number;
  panels: { composition: number[]; presentation: number[]; skatingSkills: number[] };
  /** The three component scores, summed. */
  total: number;
}

/**
 * `ice` is required, not optional the way `step()`'s own grid argument is:
 * this runs once, after a program, not once a tick, so there is no
 * replay-determinism reason to make it a silent no-op — a caller with no
 * grid (iceGridMode never turned on) should not call this at all, the same
 * way one with no score tables skips `scoreJump`.
 */
export function scorePcs(rule: SegmentRule, inputs: PcsInputs, ice: IceGrid, seed: number): PcsScore {
  const panels = {
    composition: pcsJudgePanel(ice.coverage(), seed ^ 0x9e3779b1),
    presentation: pcsJudgePanel(presentationQuality(inputs), seed ^ 0x85ebca77),
    skatingSkills: pcsJudgePanel(skatingSkillsQuality(inputs), seed ^ 0xc2b2ae35),
  };
  const composition = round2(trimmedMean(panels.composition) * rule.componentFactor);
  const presentation = round2(trimmedMean(panels.presentation) * rule.componentFactor);
  const skatingSkills = round2(trimmedMean(panels.skatingSkills) * rule.componentFactor);
  return { composition, presentation, skatingSkills, panels, total: round2(composition + presentation + skatingSkills) };
}
