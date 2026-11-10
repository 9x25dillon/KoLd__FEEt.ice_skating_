// tools/ice-lab/game/journal.ts — how the career skater actually skated.
//
// The owner, 2026-11-09: "a custom style option that emerges from the
// player's second season or playthrough", and "I like the nudge". Through the
// first season every career run writes what the physics saw into a journal:
// the jumps landed and how high and how hard they turned, the speed, the
// spiral held above the hip and the standing split, the time on deep edges,
// the falls, the legs left at the end. When the finale is medalled the season
// is over, the journal is read into four leanings — one per style — and the
// custom style is forged from them (game/styles.ts customStyle).
//
// THE REFERENCES ARE AUTHORED (L3). Each says what "a lot" of that skating is
// for one run: a 0.4 m jump, a double's turn, 12 m/s, five seconds of spiral,
// ten of deep edge, a run finished with half the legs left. They only set how
// a season's record divides between the four; the physics of the style that
// comes out is the four styles' own.

import type { SkaterState } from "../sim/types.ts";
import { DEPTH, MOVE, SPIN_VARIATION } from "../sim/types.ts";
import { JUMP_NONE } from "../sim/jump.ts";

/** Sums over a season's career runs. */
export interface Journal {
  runs: number;
  seconds: number;
  jumpsLanded: number;
  /** Sums over the jumps landed: height (m), revolutions turned, |L| at takeoff (kg m^2/s). */
  jumpHeight: number;
  jumpTurned: number;
  jumpL: number;
  /** Sum over runs of each run's top speed, m/s. */
  topSpeed: number;
  /** Seconds a spiral was held with the free leg at or above the hip; seconds in a standing split spin. */
  spiralAboveHip: number;
  splitSeconds: number;
  /** Seconds on a deep edge, on the ice and standing. */
  deepEdgeSeconds: number;
  falls: number;
  /** Sum over runs of the legs left at the end, 0..1. */
  legsLeft: number;
}

export const emptyJournal = (): Journal => ({
  runs: 0, seconds: 0, jumpsLanded: 0, jumpHeight: 0, jumpTurned: 0, jumpL: 0, topSpeed: 0,
  spiralAboveHip: 0, splitSeconds: 0, deepEdgeSeconds: 0, falls: 0, legsLeft: 0,
});

/** One run's journal, sampled once per tick like the career's own meters. */
export class RunJournal {
  readonly j: Journal = { ...emptyJournal(), runs: 1 };
  private top = 0;
  private lastLanding = -1;
  private takeoffL = 0;
  private wasAir = false;
  private wasFallen = false;
  private legs = 1;

  sample(s: SkaterState, dt: number): void {
    const j = this.j;
    j.seconds += dt;
    const air = s.jump.phase === 2;
    if (air && !this.wasAir) this.takeoffL = Math.abs(s.jump.angMomentum);
    this.wasAir = air;
    this.top = Math.max(this.top, Math.hypot(s.vel.x, s.vel.y));
    const r = s.landed;
    if (r.tick >= 0 && r.tick !== this.lastLanding) {
      this.lastLanding = r.tick;
      if (r.kind !== JUMP_NONE && !r.fall) {
        j.jumpsLanded++; j.jumpHeight += r.height; j.jumpTurned += r.turned; j.jumpL += this.takeoffL;
      }
    }
    if (s.fallen && !this.wasFallen) j.falls++;
    this.wasFallen = s.fallen;
    if (s.move === MOVE.Spiral && (s.freeRaise ?? 0) >= 0.5) j.spiralAboveHip += dt;
    if (s.move === MOVE.Spin && s.spin.variation === SPIN_VARIATION.Split) j.splitSeconds += dt;
    if (!s.fallen && !air && s.supportMode === 1 && s.blade[s.supportFoot].depth === DEPTH.Deep) j.deepEdgeSeconds += dt;
    this.legs = s.legs;
  }

  /** The run as it ended. */
  finish(): Journal { return { ...this.j, topSpeed: this.top, legsLeft: this.legs }; }
}

export const addJournal = (a: Journal, b: Journal): Journal =>
  Object.fromEntries((Object.keys(a) as (keyof Journal)[]).map((k) => [k, a[k] + b[k]])) as unknown as Journal;

/** What "a lot" is, per run (or per jump for the jump's own numbers). Authored, L3. */
export const JOURNAL_REFERENCE = {
  jumpHeight: 0.4, jumpTurned: 2, jumpL: 20, jumpsPerRun: 2, topSpeed: 12,
  spiralAboveHip: 5, splitSeconds: 3, deepEdgeSeconds: 10, fallsPerRun: 2, legsLeft: 0.5, runSeconds: 120,
} as const;

const unit = (x: number): number => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/**
 * The season read into four leanings, in STYLES order (power, finesse,
 * technician, endurance), each 0..1: how much of that style's skating the
 * record holds, against JOURNAL_REFERENCE.
 */
export function leanings(j: Journal): [number, number, number, number] {
  const R = JOURNAL_REFERENCE, runs = Math.max(1, j.runs), jumps = Math.max(1, j.jumpsLanded);
  const mean = (...xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const landed = j.jumpsLanded > 0;
  const power = mean(
    landed ? unit(j.jumpHeight / jumps / R.jumpHeight) : 0,
    landed ? unit(j.jumpTurned / jumps / R.jumpTurned) : 0,
    landed ? unit(j.jumpL / jumps / R.jumpL) : 0,
    unit(j.topSpeed / runs / R.topSpeed),
  );
  const finesse = mean(unit(j.spiralAboveHip / runs / R.spiralAboveHip), unit(j.splitSeconds / runs / R.splitSeconds));
  const technician = mean(unit(j.deepEdgeSeconds / runs / R.deepEdgeSeconds), unit(1 - j.falls / runs / R.fallsPerRun));
  const endurance = mean(unit(j.legsLeft / runs / R.legsLeft), unit(j.seconds / runs / R.runSeconds));
  return [power, finesse, technician, endurance];
}

/** The player's nudge: a quarter more toward one style. Authored. */
export const NUDGE = 0.25;

/** Leanings into shares summing to 1, with the nudge (-1 none, or a STYLES index) added before they are shared out. */
export function styleShares(lean: readonly number[], nudge = -1): number[] {
  const total0 = lean.reduce((a, b) => a + b, 0);
  const base = total0 > 0 ? lean.map((x) => x / total0) : lean.map(() => 1 / lean.length);
  const nudged = base.map((x, i) => x + (i === nudge ? NUDGE : 0));
  const total = nudged.reduce((a, b) => a + b, 0);
  return nudged.map((x) => x / total);
}
