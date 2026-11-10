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

function evaluate(index: number, knobs: EntranceKnobs, p: Params, revs: number, t: Transform): { point: SearchPoint; ticks: number } {
  const run = runCandidate(`grid-${index}`, pinPushFeet(loopBaselineProgram(knobs), p), t, p, BASELINE.jump, BASELINE.runOut);
  const r = run.report;
  const turned = r.landing?.turned ?? 0;
  return {
    ticks: run.track.length,
    point: {
      index, knobs, accepted: !r.rejected, firstReason: r.reasons[0] ?? "", reasons: r.reasons,
      takeoff: r.takeoff?.code ?? "---", simCalls: r.landing?.simCalls ?? "none",
      turned, rotationError: r6(Math.abs(turned - revs)),
      takeoffQuality: r.takeoff?.quality ?? 0, landingQuality: r.landing?.landingQuality ?? 0,
      height: r.flight?.height ?? 0, angMomentum: r.takeoff?.angMomentum ?? 0,
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
