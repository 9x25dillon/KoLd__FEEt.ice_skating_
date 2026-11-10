// tools/ice-lab/jpse/styles.ts — does a style do what it says? Measured, not asserted.
//
// game/styles.ts gives each career style a handful of authored multipliers.
// What they buy is the physics' call, so each style is skated through the same
// JPSE jump search as the neutral skater (what it accepts, how high and how
// hard it leaves, how often the blade skids at the release) and the same
// stroking run (speed, and what is left of wind and legs). A style whose
// numbers do not move what its blurb promises is a label, and gets re-tuned.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, REGIME, MOVE, SPIN_VARIATION_NAME } from "../sim/types.ts";
import { IceGrid } from "../sim/ice.ts";
import { len } from "../sim/math.ts";
import { STYLES, styleParams } from "../game/styles.ts";
import { baselineParams } from "./baseline.ts";
import { runSearch } from "./search.ts";
import type { SearchSpec } from "./search.ts";

export interface StyleRow {
  style: string;
  accepted: number;
  /** Candidates whose blade the solver had skidding at the release. */
  skids: number;
  tookOff: number;
  /** Means over the candidates that left the ice. */
  meanHeight: number;
  meanAbsL: number;
  meanTurned: number;
  /** The stroking run: two-foot pushes for `STROKE_SECONDS`, then what is left. */
  topSpeed: number;
  wind: number;
  legs: number;
  /** The carving run: a full lean on one foot at 6 m/s for CARVE_SECONDS. */
  carveSkidTicks: number;
  carveMinRadius: number;
  carveFell: boolean;
  /** The serpentine: ticks stood (SERPENTINE_TICKS is all of it). */
  serpentineTicks: number;
  /** The spiral: the free leg's highest raise (0.5 hip height, 1 straight up), seconds at or above the hip, legs it cost, standing at the end. */
  spiralPeak: number;
  spiralAboveHip: number;
  spiralLegs: number;
  spiralStood: boolean;
  /** The upright spin with the leg asked straight up: the variation reached (none, attitude, standing split) and the spin rate held in it. */
  splitReached: string;
  splitOmega: number;
  /** The plain upright spin's rate, the same entry: what the split is faster than. */
  plainOmega: number;
}

export const STROKE_SECONDS = 20;

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Push from a standstill for STROKE_SECONDS on two feet, straight. */
export function strokeRun(p: Params): { topSpeed: number; wind: number; legs: number } {
  const s = createState(p, 0), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  let top = 0;
  for (let i = 0; i < Math.round(STROKE_SECONDS / SIM_DT); i++) {
    step(s, { ...NEUTRAL_INPUT, knee: 0.6, push: true }, p, SIM_DT, [], ice);
    top = Math.max(top, len(s.vel));
  }
  return { topSpeed: r4(top), wind: r4(s.wind), legs: r4(s.legs) };
}

export const CARVE_SECONDS = 3;

/** Lean all the way into a forward outside edge at 6 m/s and hold it: does the blade hold, how tight, does the skater stay up? */
export function carveRun(p: Params): { carveSkidTicks: number; carveMinRadius: number; carveFell: boolean } {
  const s = createState(p, 6), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  let skid = 0, minR = Infinity;
  for (let i = 0; i < Math.round(CARVE_SECONDS / SIM_DT) && !s.fallen; i++) {
    step(s, { ...NEUTRAL_INPUT, weight: 1, lean: -1, knee: 0.6 }, p, SIM_DT, [], ice);
    const b = s.blade[s.supportFoot];
    if (b.regime === REGIME.Skid) skid++;
    if (b.inContact && Number.isFinite(b.turnRadius)) minR = Math.min(minR, b.turnRadius);
  }
  return { carveSkidTicks: skid, carveMinRadius: r4(minR), carveFell: s.fallen };
}

/** The serpentine's lean, how often it changes side, and how many changes. Chosen where the neutral skater falls partway. */
export const SERPENTINE = { lean: 0.7, every: 0.6, changes: 8 } as const;
export const SERPENTINE_TICKS = Math.round(SERPENTINE.every / SIM_DT) * SERPENTINE.changes;

/**
 * Deep edges one way then the other on one foot at 5 m/s: the transitions
 * Finesse is for. How long the skater stays up through them.
 */
export function serpentineRun(p: Params): { serpentineTicks: number } {
  const s = createState(p, 5), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const per = Math.round(SERPENTINE.every / SIM_DT);
  let i = 0;
  for (; i < SERPENTINE_TICKS && !s.fallen; i++) {
    const lean = Math.floor(i / per) % 2 === 0 ? -SERPENTINE.lean : SERPENTINE.lean;
    step(s, { ...NEUTRAL_INPUT, weight: 1, lean, knee: 0.5 }, p, SIM_DT, [], ice);
  }
  return { serpentineTicks: s.fallen ? i : SERPENTINE_TICKS };
}

/** The spiral's run: on the right foot at 5 m/s, the free leg asked as high as it goes, an outside edge then the inside. */
export const SPIRAL = { speed: 5, seconds: 6, lean: 0.3 } as const;

export function spiralRun(p: Params): { spiralPeak: number; spiralAboveHip: number; spiralLegs: number; spiralStood: boolean } {
  const s = createState(p, SPIRAL.speed), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  for (let i = 0; i < 60; i++) step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.25 }, p, SIM_DT, [], ice);
  const legs0 = s.legs, n = Math.round(SPIRAL.seconds / SIM_DT);
  for (let i = 0; i < n && !s.fallen; i++)
    step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.25, kneeSplit: 0.25, lean: i < n / 2 ? -SPIRAL.lean : SPIRAL.lean, inaBauer: true, freeLegRaise: 1 }, p, SIM_DT, [], ice);
  const held = s.move === MOVE.Spiral ? s.spiral : s.moveDone;
  return { spiralPeak: r4(held.peakRaise ?? 0), spiralAboveHip: r4(held.aboveHip ?? 0), spiralLegs: r4(legs0 - s.legs), spiralStood: !s.fallen };
}

/** An upright spin entered at 5 m/s on the right foot, the free leg asked to `raise` with the free knee at `freeKnee`; the variation and the rate 200 ticks in. */
export function spinPose(p: Params, raise: number, freeKnee: number): { variation: number; omega: number } {
  const s = createState(p, 5), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  for (let i = 0; i < 30; i++) step(s, { ...NEUTRAL_INPUT, weight: 1, knee: 0.3, lean: -0.3 }, p, SIM_DT, [], ice);
  // The standing (right) knee at 0.15, well clear of a sit; the free (left) one at freeKnee:
  // left = knee - kneeSplit, right = knee + kneeSplit.
  const knee = (freeKnee + 0.15) / 2, kneeSplit = (0.15 - freeKnee) / 2;
  let variation = 0, omega = 0;
  for (let i = 0; i <= 200; i++) {
    step(s, { ...NEUTRAL_INPUT, weight: 1, knee, kneeSplit, spin: true, carriage: 0.2, freeLegRaise: i > 20 ? raise : 0 }, p, SIM_DT, [], ice);
    if (s.move === MOVE.Spin) { variation = s.spin.variation ?? 0; omega = s.spin.omega; }
  }
  return { variation, omega: r4(omega) };
}

/** The leg asked straight up, knee straight, against the plain upright spin. */
export function splitRow(p: Params): { splitReached: string; splitOmega: number; plainOmega: number } {
  const sp = spinPose(p, 1, 0), plain = spinPose(p, 0, 0);
  return { splitReached: SPIN_VARIATION_NAME[sp.variation] || "none", splitOmega: sp.omega, plainOmega: plain.omega };
}

/** The neutral skater, then each style at full mastery. */
export function compareStyles(spec: SearchSpec, base: Params = baselineParams()): StyleRow[] {
  const rows: StyleRow[] = [];
  const subjects: Array<[string, Params]> = [["none", base], ...STYLES.map((st, i): [string, Params] => [st.id, styleParams(base, i, 1)])];
  for (const [style, p] of subjects) {
    const r = runSearch(spec, p);
    const off = r.points.filter((x) => x.firstReason !== "takeoff:none");
    rows.push({
      style, accepted: r.accepted.length,
      skids: r.points.filter((x) => x.firstReason.startsWith("takeoff-contact:SKID")).length,
      tookOff: off.length,
      meanHeight: r4(mean(off.map((x) => x.height ?? 0))),
      meanAbsL: r4(mean(off.map((x) => Math.abs(x.angMomentum ?? 0)))),
      meanTurned: r4(mean(off.map((x) => x.turned))),
      ...strokeRun(p),
      ...carveRun(p),
      ...serpentineRun(p),
      ...spiralRun(p),
      ...splitRow(p),
    });
  }
  return rows;
}
