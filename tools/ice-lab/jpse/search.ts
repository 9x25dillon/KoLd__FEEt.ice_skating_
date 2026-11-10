// tools/ice-lab/jpse/search.ts — JPSE-007, first pass: measure before optimizing.
//
// The owner's review on issue #74: "report candidate-evaluation cost,
// score/constraint distributions, and repeatability on the baseline set first.
// Deterministic bounded sampling is a sensible first search." So this is a
// grid, walked in a declared order with no randomness, over the baseline pad
// script's own knobs. Every point is a canonical candidate, run through the
// solver and judged by the same hard gates as the slice.
//
// No weighted objective is chosen here. Among accepted candidates it reports
// the Pareto front over solver-owned quantities (rotation error, takeoff
// quality, landing quality): which ones no other accepted candidate beats on
// all three. Picking weights is the owner's call, made once the distribution
// is on the table.

import { BASELINE, BASELINE_KNOBS, baselineParams, loopBaselineProgram } from "./baseline.ts";
import type { EntranceKnobs } from "./baseline.ts";
import { pinPushFeet, requirementFor, runCandidate } from "./engine.ts";
import type { Transform } from "./transform.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";

export interface SearchSpec {
  schema: "jpse-search/1";
  /** Each knob's values. Unlisted knobs stay at the baseline's. Walked in this key order, last fastest. */
  axes: Partial<Record<keyof EntranceKnobs, number[]>>;
  /** How many of the first points to evaluate twice, to measure repeatability. */
  repeat: number;
  /** The transform every point is skated under; absent, the canonical. Optional: added after jpse-search/1 shipped. */
  transform?: Transform;
}

export interface SearchPoint {
  index: number;
  knobs: EntranceKnobs;
  accepted: boolean;
  /** The first hard gate that failed, its reason; "" when accepted. */
  firstReason: string;
  reasons: string[];
  takeoff: string;
  simCalls: string;
  turned: number;
  rotationError: number;
  takeoffQuality: number;
  landingQuality: number;
  /** Takeoff height (m) and angular momentum (kg m^2/s, signed); 0 with no takeoff. Optional: added after jpse-search/1 shipped. */
  height?: number;
  angMomentum?: number;
  /** Seconds in the air as the takeoff set them; 0 with no takeoff. Optional: added 2026-11-10. */
  airTime?: number;
  digest: number;
}

export interface SearchReport {
  schema: "jpse-search-report/1";
  jump: string;
  spec: SearchSpec;
  evaluated: number;
  /** Solver ticks per evaluation: the deterministic half of the cost. Wall time is reported by the CLI, never stored. */
  ticksTotal: number;
  points: SearchPoint[];
  /** First failed gate's reason prefix -> count. "accepted" for the ones that passed. */
  distribution: Record<string, number>;
  repeatability: { checked: number; identical: number };
  accepted: number[];
  pareto: number[];
}

/** The grid's points in declared order, the last axis fastest. */
export function gridPoints(spec: SearchSpec, base: EntranceKnobs = BASELINE_KNOBS): EntranceKnobs[] {
  let pts: EntranceKnobs[] = [{ ...base }];
  for (const [k, values] of Object.entries(spec.axes) as Array<[keyof EntranceKnobs, number[]]>)
    pts = pts.flatMap((p) => values.map((v) => ({ ...p, [k]: v })));
  return pts;
}

const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const prefix = (reason: string): string => reason.split(" ")[0].replace(/(:[a-z]+-).*/, "$1").replace(/-\d.*$/, "-");

const CANONICAL: Transform = { mirror: false, reverse: false };

// The pad script is recorded on the skater who then skates it (`p`), not on the
// neutral one. Its check and run-out are timed off the recording skater's own
// takeoff and landing, as a player's presses are; replayed on a skater who
// flies longer, the check lands at the wrong moment and the inputs can run out
// in the air. Measured 2026-11-10: that alone was why no style but Technician
// "landed" the first grid (docs/jpse/power-search-2026-11-10.md). For the
// neutral skater the two are the same program, so its reports are unchanged.
function evaluate(index: number, knobs: EntranceKnobs, p: Params, revs: number, t: Transform): { point: SearchPoint; ticks: number } {
  const run = runCandidate(`grid-${index}`, pinPushFeet(loopBaselineProgram(knobs, p), p), t, p, BASELINE.jump, BASELINE.runOut);
  const r = run.report;
  const turned = r.landing?.turned ?? 0;
  return {
    ticks: run.track.length,
    point: {
      index, knobs, accepted: !r.rejected, firstReason: r.reasons[0] ?? "", reasons: r.reasons,
      takeoff: r.takeoff?.code ?? "---", simCalls: r.landing?.simCalls ?? "none",
      turned, rotationError: r6(Math.abs(turned - revs)),
      takeoffQuality: r.takeoff?.quality ?? 0, landingQuality: r.landing?.landingQuality ?? 0,
      height: r.flight?.height ?? 0, angMomentum: r.takeoff?.angMomentum ?? 0, airTime: r.flight?.airTime ?? 0,
      digest: r.replay.digest,
    },
  };
}

/** a beats b: no worse on all three, better on one. */
function dominates(a: SearchPoint, b: SearchPoint): boolean {
  const ge = a.rotationError <= b.rotationError && a.takeoffQuality >= b.takeoffQuality && a.landingQuality >= b.landingQuality;
  const gt = a.rotationError < b.rotationError || a.takeoffQuality > b.takeoffQuality || a.landingQuality > b.landingQuality;
  return ge && gt;
}

/** The baseline's double: what the rotation error is measured against. */
export const SEARCH_REVOLUTIONS = 2;

export function runSearch(spec: SearchSpec, params: Params = baselineParams()): SearchReport {
  const pts = gridPoints(spec);
  const points: SearchPoint[] = [];
  let ticksTotal = 0;
  const t = spec.transform ?? CANONICAL;
  pts.forEach((k, i) => { const e = evaluate(i, k, params, SEARCH_REVOLUTIONS, t); points.push(e.point); ticksTotal += e.ticks; });
  let identical = 0;
  const checked = Math.min(spec.repeat, pts.length);
  for (let i = 0; i < checked; i++) if (evaluate(i, pts[i], params, SEARCH_REVOLUTIONS, t).point.digest === points[i].digest) identical++;
  const distribution: Record<string, number> = {};
  for (const pt of points) { const key = pt.accepted ? "accepted" : prefix(pt.firstReason); distribution[key] = (distribution[key] ?? 0) + 1; }
  const acc = points.filter((pt) => pt.accepted);
  return {
    schema: "jpse-search-report/1", jump: requirementFor(BASELINE.jump, t).jump as "Lo", spec, evaluated: points.length, ticksTotal, points,
    distribution: Object.fromEntries(Object.entries(distribution).sort()),
    repeatability: { checked, identical },
    accepted: acc.map((pt) => pt.index),
    pareto: acc.filter((a) => !acc.some((b) => dominates(b, a))).map((pt) => pt.index),
  };
}

/** The first measured grid: around the baseline on each of its knobs. */
export const FIRST_GRID: SearchSpec = {
  schema: "jpse-search/1",
  axes: {
    speed: [-6, -6.5, -7, -7.5, -8],
    load: [0.4, 0.5, 0.6],
    checkAt: [0.35, 0.375, 0.4, 0.425, 0.45],
    depth: [0.8, 0.9, 1],
  },
  repeat: 10,
};

/**
 * Power's grid (2026-11-10): the first grid's check range (0.35 to 0.45 s)
 * stops short of where a higher, longer flight wants its check, and its loads
 * (0.4 s and up) are longer than the entrances Power lands most easily. Depth
 * stays at the full stick: at 0.8 nothing leaves the ice.
 */
export const POWER_GRID: SearchSpec = {
  schema: "jpse-search/1",
  axes: {
    speed: [-7, -7.25, -7.5, -7.75],
    load: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
    checkAt: [0.35, 0.375, 0.4, 0.425, 0.45, 0.475, 0.5, 0.525, 0.55],
  },
  repeat: 10,
};

/** Revolutions a landing is counted as: the nearest whole turn. The gates accept a single loop as a loop. */
export const revolutionsOf = (turned: number): number => Math.round(turned);

/** A run of consecutive check ticks that all land the same number of revolutions. */
export interface CheckWindow {
  /** Ticks into the air, first and last, at which the check lands the jump. */
  from: number;
  to: number;
  revolutions: number;
  /** The window runs to the landing: the jump lands with no check in the air at all. */
  open: boolean;
  /** The best landing quality in the window, and the check tick that gave it. */
  bestLanding: number;
  bestAt: number;
}

export interface CheckScan {
  knobs: EntranceKnobs;
  /** Ticks in the air; 0 when the entrance never leaves the ice. */
  airTicks: number;
  /** Rotation at the touchdown with no check in the air, and whether that landed. */
  uncheckedTurned: number;
  uncheckedAccepted: boolean;
  windows: CheckWindow[];
  evaluated: number;
}

/** The earliest check scanned: 0.2 s into the air. */
export const CHECK_SCAN_FROM = 24;

/**
 * How forgiving an entrance is, in the one knob a player times by feel: every
 * check tick from CHECK_SCAN_FROM to the landing, each skated in full and
 * judged by the hard gates. A grid's check axis steps 3 ticks at a time and
 * can step over a window that is 3 or 4 ticks wide; this does not.
 */
export function checkWindows(knobs: EntranceKnobs, params: Params = baselineParams(), t: Transform = CANONICAL): CheckScan {
  const at = (tick: number) => evaluate(tick, { ...knobs, checkAt: tick * SIM_DT + 1e-9 }, params, SEARCH_REVOLUTIONS, t).point;
  // A check asked for after any flight ends is no check in the air.
  const free = at(Math.round(5 / SIM_DT));
  const airTicks = Math.round((free.airTime ?? 0) / SIM_DT);
  const scan: CheckScan = { knobs, airTicks, uncheckedTurned: free.turned, uncheckedAccepted: free.accepted, windows: [], evaluated: 1 };
  if (!airTicks) return scan;
  let open: CheckWindow | null = null;
  for (let tick = CHECK_SCAN_FROM; tick <= airTicks; tick++) {
    const pt = tick === airTicks ? free : at(tick);
    if (tick < airTicks) scan.evaluated++;
    const revs = revolutionsOf(pt.turned);
    if (!pt.accepted || (open && open.revolutions !== revs)) open = null;
    if (!pt.accepted) continue;
    if (!open) { open = { from: tick, to: tick, revolutions: revs, open: false, bestLanding: pt.landingQuality, bestAt: tick }; scan.windows.push(open); }
    open.to = tick;
    if (pt.landingQuality > open.bestLanding) { open.bestLanding = pt.landingQuality; open.bestAt = tick; }
  }
  if (open) open.open = true;
  return scan;
}
