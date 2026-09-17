import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { makeProfile, train, xpToRaise, STAT_NAMES, overall, TIERS } from "../sim/profile.ts";
import type { SkaterProfile, StatName } from "../sim/profile.ts";

export const ELEMENTS = {
  glide: { title: "Opening glide", hint: "Hold Space / A to push. Glide upright above 3 m/s for 3 seconds.", duration: 3 },
  edge: { title: "Carving phrase", hint: "Hold A / D or steer gently with the left stick. Hold a moving edge for 2 seconds.", duration: 2 },
  crossover: { title: "Crossover phrase", hint: "Carve and push with Space / A. Keep the curve through a crossover.", duration: 0.08 },
  jump: { title: "Jump accent", hint: "Build speed, then J / D-pad up in Beginner. In Simulation, load Shift / RT and release. Land without a fall or step-out.", duration: 0 },
  spin: { title: "Spin phrase", hint: "Carve at speed, then hold Y for one new full rotation. Release to exit.", duration: 0 },
  pose: { title: "Closing pose", hint: "Glide above 2 m/s and hold U / D-pad down for 2 seconds.", duration: 2 },
} as const;
export type ElementId = keyof typeof ELEMENTS;
export interface CareerEvent { id: string; title: string; venue: string; seconds: number; routine: readonly ElementId[] }
export const CAREER_EVENTS: readonly CareerEvent[] = [
  { id: "first-ice", title: "First ice", venue: "Community rink · foundations", seconds: 75, routine: ["glide", "edge", "pose"] },
  { id: "club-debut", title: "Club debut", venue: "Local club · linking moves", seconds: 90, routine: ["glide", "edge", "crossover", "pose"] },
  { id: "jump-showcase", title: "Jump showcase", venue: "District exhibition · take flight", seconds: 105, routine: ["edge", "crossover", "jump", "pose"] },
  { id: "regional", title: "Regional spotlight", venue: "Regional arena · rotation & control", seconds: 120, routine: ["glide", "edge", "jump", "spin", "pose"] },
  { id: "finale", title: "Championship program", venue: "Championship arena · your complete routine", seconds: 150, routine: ["glide", "crossover", "jump", "edge", "spin", "jump", "pose"] },
];
export const MEDALS = ["Unplayed", "Bronze", "Silver", "Gold"] as const;

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
  constructor(event: CareerEvent) { this.event = event; }
  get complete() { return this.index === this.event.routine.length; }
  get done() { return this.complete || this.elapsed >= this.event.seconds; }
  get seconds() { return Math.max(0, this.event.seconds - this.elapsed); }
  get current() { return this.event.routine[this.index]; }
  get medal() { return !this.complete ? 0 : this.falls === 0 ? 3 : this.falls <= 2 ? 2 : 1; }
  sample(s: SkaterState, low: boolean, dt: number) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(this.event.seconds, this.elapsed + dt);
    const freshLanding = s.landed.tick >= 0 && s.landed.tick !== this.lastLanding;
    this.lastLanding = s.landed.tick;
    if (s.fallen && !this.wasFallen) this.falls++;
    this.wasFallen = s.fallen;
    const swept = s.move === MOVE.Spin ? s.spin.swept : 0;
    const spinDelta = Math.max(0, swept - this.lastSpin);
    this.lastSpin = swept;
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
      pose: grounded && s.move === MOVE.None && low && speed >= 2,
    };
    this.held = active[this.current] ? this.held + dt : 0;
    if (active[this.current] && this.held + 1e-9 >= ELEMENTS[this.current].duration) {
      this.index++; this.held = 0; this.spinProgress = 0;
    }
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
    const earned = Math.max(0, routine.medal - this.medals[i]) * 150;
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
