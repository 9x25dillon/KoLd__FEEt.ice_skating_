import { MOVE, TURN_KIND, EVENT, FOOT, codeToString, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { SIM_HZ } from "../sim/params.ts";
import { makeProfile, train, xpToRaise, STAT_NAMES, overall, TIERS } from "../sim/profile.ts";
import type { SkaterProfile, StatName } from "../sim/profile.ts";
import { scoreJump } from "../sim/score.ts";
import type { ScoreTables } from "../sim/score.ts";
import { SpinLevelTracker, scoreSpinLevel } from "../sim/spinLevel.ts";
import type { SpinFeatureThresholds } from "../sim/spinLevel.ts";
import { StepSequenceTracker, scoreStepLevel, STEP_TYPE } from "../sim/stepLevel.ts";
import type { StepFeatureThresholds } from "../sim/stepLevel.ts";
import { SessionMeter } from "../sim/session.ts";
import { PcsMeter, pcsInputsFrom, scorePcs } from "../sim/pcs.ts";
import type { SegmentRule, PcsScore } from "../sim/pcs.ts";
import type { IceGrid } from "../sim/ice.ts";

export const ELEMENTS = {
  glide: { title: "Opening glide", hint: "Hold Space / A to push. Glide upright above 3 m/s for 3 seconds.", duration: 3 },
  edge: { title: "Carving phrase", hint: "Hold A / D or steer gently with the left stick. Hold a moving edge for 2 seconds.", duration: 2 },
  crossover: { title: "Crossover phrase", hint: "Carve and push with Space / A. Keep the curve through a crossover.", duration: 0.08 },
  jump: { title: "Jump accent", hint: "Build speed, then J / D-pad up in Beginner. In Simulation, load Shift / RT and release. Land without a fall or step-out.", duration: 0 },
  spin: { title: "Spin phrase", hint: "Carve at speed, then hold Y for one new full rotation. Release to exit.", duration: 0 },
  step: { title: "Step sequence", hint: "Chain different footwork: three-turns, mohawks, brackets, loops and rockers (hold B through the cusp), counters (hold N), twizzles, crossovers, edge changes. Five distinct types, both feet, inside a rolling stretch of skating.", duration: 2 },
  spiral: { title: "Spiral", hint: "Carve with weight fully on one foot, then hold I / LB+RB. The free leg extends; works backward too. Hold for 2 seconds.", duration: 2 },
  pose: { title: "Closing pose", hint: "Glide above 2 m/s and hold U / D-pad down for 2 seconds.", duration: 2 },
} as const;
/** Seconds a step sequence's own variety must show up within — a real one spans a stretch of the program, not an instant. */
export const STEP_WINDOW_SECONDS = 12;
export type ElementId = keyof typeof ELEMENTS;
export interface CareerEvent {
  id: string; title: string; venue: string; seconds: number; routine: readonly ElementId[];
  /**
   * data/segment-rules.csv key, added so sim/pcs.ts's `scorePcs` has a
   * `componentFactor` to key off (queue item, Hand_off.md §0). The ISU only
   * defines "women"/"men" x "short"/"free" — this ladder has five rungs with
   * no gender split, so the mapping is an authored content decision, not a
   * transcription: "women" throughout (no discipline switch exists yet), and
   * "short" for every event except the closing "finale", which is explicitly
   * the full "your complete routine" program and reads as this ladder's
   * "free" the way its own longer duration and element count already imply.
   * Optional — an ad-hoc or Composer-authored routine (no fixed slot in
   * CAREER_EVENTS) can leave both unset, and PCS simply stays unscored for
   * it, the same graceful degradation every other score here already has.
   */
  discipline?: string; segment?: string;
}
export const CAREER_EVENTS: readonly CareerEvent[] = [
  { id: "first-ice", title: "First ice", venue: "Community rink · foundations", seconds: 75, routine: ["glide", "edge", "pose"], discipline: "women", segment: "short" },
  { id: "club-debut", title: "Club debut", venue: "Local club · linking moves", seconds: 90, routine: ["glide", "edge", "crossover", "pose"], discipline: "women", segment: "short" },
  { id: "jump-showcase", title: "Jump showcase", venue: "District exhibition · take flight", seconds: 105, routine: ["edge", "crossover", "jump", "pose"], discipline: "women", segment: "short" },
  { id: "regional", title: "Regional spotlight", venue: "Regional arena · rotation & control", seconds: 120, routine: ["glide", "edge", "jump", "spin", "pose"], discipline: "women", segment: "short" },
  { id: "finale", title: "Championship program", venue: "Championship arena · your complete routine", seconds: 150, routine: ["glide", "crossover", "jump", "edge", "spin", "jump", "pose"], discipline: "women", segment: "free" },
];
export const MEDALS = ["Unplayed", "Bronze", "Silver", "Gold"] as const;
/** XP each of hypeMean and flowMean can add at 1.0, on top of a medal's own 150 — the operator's
 *  bridge, made a number: a routine skated with sustained hype and flow can be worth as much again. */
export const HYPE_FLOW_BONUS_MAX = 75;
/** XP per point of real jump TES (sim/score.ts) landed anywhere in the routine — not just a
 *  pass/fail check on the "jump" element, the judged score itself. */
export const TECHNICAL_XP_PER_POINT = 15;
/** XP per ISU level (sim/spinLevel.ts) the best spin performed in the routine actually reached.
 *  That scorer's own honest ceiling is 3, so this XP tops out at SPIN_LEVEL_XP * 3. */
export const SPIN_LEVEL_XP = 40;
/** XP per ISU grade (sim/stepLevel.ts) the best step-sequence variety window actually reached.
 *  That scorer's own honest ceiling is grade 1, so this XP is either 0 or STEP_LEVEL_XP. */
export const STEP_LEVEL_XP = 40;
/** XP per Program Component Score point (sim/pcs.ts), the real judged total (max ~30 at the
 *  richest componentFactor), scaled down hard so it reads as a style bonus alongside the
 *  technical score above rather than dwarfing it. */
export const PCS_XP_PER_POINT = 3;

/** Ordered choreography reads live solver results; no input press earns a move. */
export class Choreography {
  event: CareerEvent;
  index = 0;
  elapsed = 0;
  held = 0;
  falls = 0;
  private wasFallen = false;
  private lastLanding = -1;
  private spinProgress = 0;
  private lastSpin = 0;
  /**
   * The operator's own bridge, read back into career: hype and flow (both
   * 0..1, sim/solver.ts's staminaMode-adjacent systems) averaged over every
   * sampled tick, including fallen ones — a fall drags both down (flow
   * resets to 0 on one outright), so the mean rewards skating clean AND
   * with hype and flow banked, not just finishing. CareerState.award reads
   * these for a bonus on top of the medal; they do nothing on their own.
   */
  private hypeSum = 0;
  private flowSum = 0;
  private samples = 0;
  private tables?: ScoreTables;
  private spinThresholds?: SpinFeatureThresholds;
  private spinTracker = new SpinLevelTracker();
  private wasSpinning = false;
  private stepThresholds?: StepFeatureThresholds;
  private stepTracker = new StepSequenceTracker();
  private stepWindowTicks = Math.round(STEP_WINDOW_SECONDS * SIM_HZ);
  private lastMoveDoneTick = -1;
  private wasCrossover = false;
  /**
   * The real judged numbers, not the pass/fail checklist below: every jump's
   * actual TES (sim/score.ts) landed anywhere in the routine, summed, the
   * best ISU level (sim/spinLevel.ts) any spin performed actually reached,
   * and the best ISU grade (sim/stepLevel.ts) any rolling variety window
   * actually reached. All three are 0 if their own tables/thresholds were
   * never supplied — the same graceful-degradation the free-skate HUD
   * already has when the scoring data fails to load — and CareerState.award
   * reads all three for a bonus on top of the medal; they do nothing alone.
   */
  technicalScore = 0;
  bestSpinLevel = 0;
  bestStepLevel = 0;
  /**
   * sim/pcs.ts, computed once when the routine ends (post-hoc, not per-tick —
   * scorePcs's own contract). Null until then, and stays null if `segmentRules`
   * or `ice` was never supplied — the same graceful-degradation the other
   * three scores above already have when their data fails to load.
   */
  pcsScore: PcsScore | null = null;
  private segmentRules?: readonly SegmentRule[];
  private ice?: IceGrid;
  private sessionMeter = new SessionMeter();
  private pcsMeter = new PcsMeter();
  private startMusicCredit = -1;
  constructor(
    event: CareerEvent, tables?: ScoreTables, spinThresholds?: SpinFeatureThresholds,
    stepThresholds?: StepFeatureThresholds, segmentRules?: readonly SegmentRule[], ice?: IceGrid,
  ) {
    this.event = event; this.tables = tables; this.spinThresholds = spinThresholds;
    this.stepThresholds = stepThresholds; this.segmentRules = segmentRules; this.ice = ice;
  }
  get complete() { return this.index === this.event.routine.length; }
  get done() { return this.complete || this.elapsed >= this.event.seconds; }
  get seconds() { return Math.max(0, this.event.seconds - this.elapsed); }
  get current() { return this.event.routine[this.index]; }
  get medal() { return !this.complete ? 0 : this.falls === 0 ? 3 : this.falls <= 2 ? 2 : 1; }
  get hypeMean() { return this.samples > 0 ? this.hypeSum / this.samples : 0; }
  get flowMean() { return this.samples > 0 ? this.flowSum / this.samples : 0; }
  sample(s: SkaterState, low: boolean, dt: number, events: readonly EdgeEvent[] = []) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(this.event.seconds, this.elapsed + dt);
    this.hypeSum += s.hype; this.flowSum += s.flow; this.samples++;
    if (this.startMusicCredit < 0) this.startMusicCredit = s.musicCredit;
    // SessionMeter.sample's `input` argument only feeds its own stroke/retry
    // counters (SkatingInput.push) — neither field PCS reads (meanLeanDepth,
    // skidRatio, edgeChangesPerMinute) comes from it, so a routine-wide
    // choreography summary has no real per-tick SkatingInput of its own to
    // give it, and NEUTRAL_INPUT is exact, not a stand-in, for what PCS uses.
    this.sessionMeter.sample(s, NEUTRAL_INPUT, events as EdgeEvent[], dt);
    this.pcsMeter.sample(s);
    const freshLanding = s.landed.tick >= 0 && s.landed.tick !== this.lastLanding;
    this.lastLanding = s.landed.tick;
    if (freshLanding && this.tables) this.technicalScore += scoreJump(this.tables, s.landed)?.score ?? 0;
    if (s.fallen && !this.wasFallen) this.falls++;
    this.wasFallen = s.fallen;
    // Every spin in the routine, not only one in the "spin" slot — a program
    // is judged on what was actually skated, and spinProgress below still
    // gates the element checklist on its own.
    const spinningNow = s.move === MOVE.Spin;
    if (spinningNow) this.spinTracker.sample(s.spin);
    else if (this.wasSpinning) {
      const segments = this.spinTracker.finish();
      if (this.spinThresholds) {
        this.bestSpinLevel = Math.max(this.bestSpinLevel,
          scoreSpinLevel(segments, this.spinThresholds, this.spinTracker.footChanges).level);
      }
      this.spinTracker.reset();
    }
    this.wasSpinning = spinningNow;
    const swept = spinningNow ? s.spin.swept : 0;
    const spinDelta = Math.max(0, swept - this.lastSpin);
    this.lastSpin = swept;
    // Step-sequence footwork (sim/stepLevel.ts): every genuinely distinct
    // type is recorded the tick it happens, unconditionally, like the spin
    // tracker above — a fall does not erase footwork that already happened,
    // only the element's own progress (below) resets on one.
    if (s.moveDone.tick >= 0 && s.moveDone.tick !== this.lastMoveDoneTick) {
      this.lastMoveDoneTick = s.moveDone.tick;
      const foot = codeToString(s.moveDone.toCode)[0] === "R" ? FOOT.Right : FOOT.Left;
      const stepType = s.moveDone.kind === MOVE.Turn
        ? (s.moveDone.detail === TURN_KIND.ThreeTurn ? STEP_TYPE.ThreeTurn
          : s.moveDone.detail === TURN_KIND.Mohawk ? STEP_TYPE.Mohawk
            : s.moveDone.detail === TURN_KIND.Bracket ? STEP_TYPE.Bracket
              : s.moveDone.detail === TURN_KIND.Loop ? STEP_TYPE.Loop
                : s.moveDone.detail === TURN_KIND.Rocker ? STEP_TYPE.Rocker
                  : s.moveDone.detail === TURN_KIND.Counter ? STEP_TYPE.Counter : null)
        : s.moveDone.kind === MOVE.Twizzle ? STEP_TYPE.Twizzle : null;
      if (stepType !== null) this.stepTracker.record(stepType, foot, s.moveDone.tick);
    }
    // A crossover is not a MOVE — s.crossover is a continuous flag alongside
    // an ordinary stroke — so its own "type" is the tick it starts, the same
    // false-to-true edge session.ts's own stroke counter watches for.
    const crossingOver = s.crossover && s.strokeTime > 0;
    if (crossingOver && !this.wasCrossover) this.stepTracker.record(STEP_TYPE.Crossover, s.strokeFoot, s.tick);
    this.wasCrossover = crossingOver;
    // An ordinary change of edge while gliding — not a push-roll (excluded
    // by strokeTime <= 0) and not part of a formal move (s.move === None).
    for (const e of events) {
      if (e.type === EVENT.EdgeChanged && s.move === MOVE.None && s.strokeTime <= 0)
        this.stepTracker.record(STEP_TYPE.ChangeOfEdge, e.foot, s.tick);
    }
    const stepWindow = this.stepThresholds ? scoreStepLevel(this.stepTracker.recent(s.tick, this.stepWindowTicks), this.stepThresholds) : null;
    if (stepWindow) this.bestStepLevel = Math.max(this.bestStepLevel, stepWindow.level);
    if (this.done) this.finalizePcs(s);
    if (this.done || s.fallen) { this.held = 0; this.spinProgress = 0; return; }
    const speed = Math.hypot(s.vel.x, s.vel.y);
    const grounded = s.jump.phase === JUMP_PHASE.None;
    if (this.current === "spin") this.spinProgress = s.move === MOVE.Spin ? this.spinProgress + spinDelta : 0;
    const active: Record<ElementId, boolean> = {
      glide: grounded && s.move === MOVE.None && speed >= 3,
      edge: grounded && s.move === MOVE.None && speed >= 2 && Math.abs(s.lean) > 0.12,
      crossover: grounded && speed >= 2 && s.crossover && s.strokeTime > 0,
      jump: freshLanding && !s.landed.fall && !s.landed.stepOut && s.landed.height > 0.05,
      spin: this.spinProgress >= Math.PI * 2,
      step: (stepWindow?.level ?? 0) >= 1,
      spiral: s.move === MOVE.Spiral,
      pose: grounded && s.move === MOVE.None && low && speed >= 2,
    };
    this.held = active[this.current] ? this.held + dt : 0;
    if (active[this.current] && this.held + 1e-9 >= ELEMENTS[this.current].duration) {
      this.index++; this.held = 0; this.spinProgress = 0;
    }
    if (this.done) this.finalizePcs(s);
  }
  /**
   * sim/pcs.ts, once, the tick the routine actually ends — post-hoc over the
   * whole routine, the same stage scoreJump/scoreSpinLevel/scoreStepLevel are
   * already at above. Silently leaves `pcsScore` null if the caller never
   * supplied `segmentRules`/`ice`, or if `event.discipline`/`segment` names no
   * row in data/segment-rules.csv — the same graceful-degradation every other
   * score here already has when its data failed to load.
   */
  private finalizePcs(s: SkaterState): void {
    if (this.pcsScore !== null || !this.segmentRules || !this.ice) return;
    const rule = this.segmentRules.find(r => r.discipline === this.event.discipline && r.segment === this.event.segment);
    if (!rule) return;
    const musicCredit = Math.max(0, s.musicCredit - Math.max(0, this.startMusicCredit));
    const inputs = pcsInputsFrom(this.sessionMeter.summary(), this.pcsMeter, musicCredit);
    this.pcsScore = scorePcs(rule, inputs, this.ice, s.tick);
  }
}

/** Versioned progression; only improved medals award XP, so retries cannot farm it. */
export class CareerState {
  medals = CAREER_EVENTS.map(() => 0);
  profile: SkaterProfile = makeProfile("Career skater");

  /** How far medals alone would unlock: the first not-yet-earned event. */
  get medalCap(): number {
    const next = this.medals.findIndex(m => m === 0);
    return next < 0 ? CAREER_EVENTS.length - 1 : next;
  }
  /**
   * How far the skater's own stats permit, independent of any medal.
   *
   * CAREER_EVENTS and profile.ts's TIERS are the same five rungs, index for
   * index (club, regionals, nationals, grand prix, worlds) — the queued
   * "stat balance tied to the competitive scoring", with `overall()` and the
   * tier floors as the literal attachment points. A neutral, untrained
   * profile (`overall` 50) already clears club (0) and regionals (40), so a
   * new career is not stat-locked out of its first two events; nationals
   * (55) is where training stops being optional.
   */
  get statCap(): number {
    const o = overall(this.profile);
    let cap = 0;
    for (let i = 0; i < TIERS.length; i++) if (o >= TIERS[i].floor) cap = i;
    return cap;
  }
  /** The lower of the two: a clean program does not skip the training it needs. */
  get unlocked(): number { return Math.min(this.medalCap, this.statCap); }

  award(routine: Choreography): number {
    const i = CAREER_EVENTS.indexOf(routine.event);
    if (i < 0 || i > this.unlocked || !routine.done) return 0;
    const improved = Math.max(0, routine.medal - this.medals[i]);
    // Every bonus only pays out alongside a genuine medal improvement — the
    // same anti-farming gate the medal XP itself already has, so a repeat of
    // an already-earned medal cannot be replayed purely for the bonus.
    const bonus = improved > 0
      ? Math.round(HYPE_FLOW_BONUS_MAX * routine.hypeMean) + Math.round(HYPE_FLOW_BONUS_MAX * routine.flowMean)
        + Math.round(TECHNICAL_XP_PER_POINT * routine.technicalScore) + SPIN_LEVEL_XP * routine.bestSpinLevel
        + STEP_LEVEL_XP * routine.bestStepLevel + Math.round(PCS_XP_PER_POINT * (routine.pcsScore?.total ?? 0))
      : 0;
    const earned = improved * 150 + bonus;
    this.medals[i] = Math.max(this.medals[i], routine.medal);
    this.profile = { ...this.profile, xp: this.profile.xp + earned };
    return earned;
  }
  train(stat: StatName) { this.profile = train(this.profile, stat, xpToRaise(this.profile.stats[stat])); }
  serialize() { return JSON.stringify({ version: 1, medals: this.medals, xp: this.profile.xp, stats: this.profile.stats }); }
  static restore(json: string | null): CareerState {
    const career = new CareerState();
    try {
      const saved = JSON.parse(json ?? "null");
      if (saved?.version !== 1 || !Array.isArray(saved.medals) || saved.medals.length !== CAREER_EVENTS.length ||
          !saved.medals.every((m: unknown) => Number.isInteger(m) && Number(m) >= 0 && Number(m) <= 3) ||
          !Number.isSafeInteger(saved.xp) || saved.xp < 0 || saved.xp > CAREER_EVENTS.length * 450 ||
          !STAT_NAMES.every(n => Number.isInteger(saved.stats?.[n]) && saved.stats[n] >= 50 && saved.stats[n] <= 100)) return career;
      // Reject a broken unlock chain instead of silently skipping events.
      const firstEmpty = saved.medals.indexOf(0);
      if (firstEmpty >= 0 && saved.medals.slice(firstEmpty).some((m: number) => m !== 0)) return career;
      career.medals = [...saved.medals];
      career.profile = makeProfile("Career skater", { xp: saved.xp, stats: saved.stats });
    } catch { /* A missing or invalid save starts a playable career. */ }
    return career;
  }
}
