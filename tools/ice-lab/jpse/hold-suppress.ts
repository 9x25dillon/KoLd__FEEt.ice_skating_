// tools/ice-lab/jpse/hold-suppress.ts — a 2Lo entrance for beatCrossoverHoldSuppress 1.
//
// The owner keeps the option (Brief 2, 2026-11-18): the standing trigger held
// toward a load stops the beat's automatic crossovers. The canonical entrance
// (baseline.ts BASELINE) holds RT half from tick 0, so with the option on it
// suppresses every crossover and loses the pushes it rode in on — 0 of 57 load
// phases stand (docs/beatcross-2026-11.md, sweep 2). The fix is a NEW entrance
// found by search, not a tweak (Hand_off rule: re-tune by re-searching).
//
// A player-doable entrance on the pad, in three phases before the load:
//   1. a RELEASED glide — the standing trigger let go, so the beat's crossovers
//      still fire (the guard is the hold, not the crossover) and shape the edge;
//   2. OWN pushes — gentle pumps of the FREE leg's trigger (LT on the right-foot
//      glide), which push the standing leg without loading the jump (the load
//      reads only the standing trigger). B is held through each pump so the
//      weight stays on the right foot: a transfer to the other foot mid-carve
//      falls (measured). The pump is gentle (pushPull 0.65, knee 0.63 < the 0.7
//      load knee) — a full pump on the deep edge drives lean past the limit;
//   3. a HOLD toward the load — RT held below the load knee (holdPull), which
//      with the option on stops the crossovers, then RT full with B wound and X
//      swung, checked into the air, exactly as the canonical load.
//
// Recorded closed-loop on the game's own sheet (iceGridMode 1), on the skater
// who skates it, with beatCrossoverHoldSuppress 1 — so the recorded inputs are
// what a player's presses produce, and runCandidate replays them tick for tick.
// BASELINE is untouched; this is a separate named entrance (HOLD_SUPPRESS_ENTRANCE).

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { EVENT } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import type { Program } from "./transform.ts";
import { BASELINE, baselineParams } from "./baseline.ts";
import { requirementFor, runCandidate } from "./engine.ts";
import type { Transform } from "./transform.ts";
import { SEARCH_REVOLUTIONS, revolutionsOf } from "./search.ts";
import type { SearchPoint, SearchReport } from "./search.ts";

/**
 * The entrance's knobs. speed/load/swingAt/checkAt/depth are the canonical
 * script's own (the "nearest" rule compares these); glideTicks/pushCount/
 * pushEvery/pushPull/holdTicks/holdPull are the new three-phase structure.
 * Times in ticks unless noted; the load and check are seconds, as BASELINE's.
 */
export interface HoldSuppressKnobs {
  speed: number;
  /** Released-glide ticks before the first own push (includes the 2 B ticks). */
  glideTicks: number;
  /** Own pushes: gentle free-leg (LT) pumps, B held to keep the right foot. */
  pushCount: number;
  /** Ticks between pump starts (>= strokeDuration/SIM_DT so each push settles). */
  pushEvery: number;
  /** The pump's trigger pull (0.65 -> knee 0.63, below the 0.7 load knee). */
  pushPull: number;
  /** RT-half hold ticks before the load. */
  holdTicks: number;
  /** The hold's trigger pull (<= 0.61 keeps the knee below load and the guard on). */
  holdPull: number;
  load: number;
  swingAt: number;
  checkAt: number;
  depth: number;
}

/** Provisional defaults; HOLD_SUPPRESS_ENTRANCE below is the searched, pinned one. */
export const HOLD_SUPPRESS_KNOBS: HoldSuppressKnobs = {
  speed: -7, glideTicks: 180, pushCount: 2, pushEvery: 60, pushPull: 0.65,
  holdTicks: 60, holdPull: 0.6, load: 0.425, swingAt: 0.1, checkAt: 0.45, depth: 1,
};

/** Ticks a pump's trigger is pulled: 4 <= SNAP_TICKS (6), so the pump is full-quick. */
const PUMP_TICKS = 4;

/**
 * The pad script, tick for tick. `shift` prepends that many released-glide ticks
 * (the beat sweep shifts the load's start across one beat this way, keeping the
 * entrance's structure fixed). `took` is the takeoff time in seconds, -1 until
 * the blade leaves; the caller passes it back as a player's presses are timed.
 */
export function holdSuppressPress(k: HoldSuppressKnobs, shift = 0): (h: ControllerHardware, t: number, i: number, took: number) => void {
  const firstPush = shift + k.glideTicks;
  const holdAt = firstPush + k.pushCount * k.pushEvery;
  const loadAtTick = holdAt + k.holdTicks;
  const loadAtS = loadAtTick * SIM_DT;
  return (h, t, i, took) => {
    if (took >= 0) { h.buttons[7] = 0.7; h.buttons[1] = t - took >= k.checkAt ? 1 : 0; return; }
    if (i < 2) h.buttons[1] = 1;                                 // B: weight on the right foot
    h.axes[0] = h.axes[2] = -k.depth * Math.min(1, t / 0.5);     // both sticks: the deep edge
    for (let j = 0; j < k.pushCount; j++) {
      const ps = firstPush + j * k.pushEvery;
      if (i >= ps && i < ps + PUMP_TICKS) { h.buttons[6] = k.pushPull; h.buttons[1] = 1; return; } // free-leg pump, B keeps the foot
    }
    if (i >= holdAt && i < loadAtTick) { h.buttons[7] = k.holdPull; if (i < holdAt + 2) h.buttons[1] = 1; return; } // hold toward the load
    if (t >= loadAtS && t < loadAtS + k.load) { h.buttons[7] = 1; h.buttons[t - loadAtS < k.swingAt ? 1 : 2] = 1; } // RT full, B wound then X swung
  };
}

/** The entrance's load-start tick (the beat sweep measures the phase here). */
export function holdSuppressLoadTick(k: HoldSuppressKnobs, shift = 0): number {
  return shift + k.glideTicks + k.pushCount * k.pushEvery + k.holdTicks;
}

/**
 * Record the pad script once, closed-loop through the game's mapping on the
 * game's sheet, and keep the SkatingInput stream. Deterministic. `params` should
 * carry beatCrossoverHoldSuppress 1 (the mapping reads it while recording).
 */
export function holdSuppressProgram(k: HoldSuppressKnobs = HOLD_SUPPRESS_KNOBS, params: Params = baselineParams(), shift = 0): Program {
  const p = { ...params }, s = createState(p, k.speed), profile = defaultControllerProfile();
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const press = holdSuppressPress(k, shift);
  const inputs: SkatingInput[] = [];
  const cap = holdSuppressLoadTick(k, shift) + Math.ceil(k.load / SIM_DT) + 240;
  let took = -1, landed = false;
  const tick = (): EdgeEvent[] => {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    press(h, s.tick * SIM_DT, s.tick, took);
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    inputs.push({ ...input });
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, ice);
    return events;
  };
  for (let i = 0; i < cap && !s.fallen && !landed; i++) {
    const t = i * SIM_DT;
    const events = tick();
    if (took < 0 && events.some((e) => e.type === EVENT.Takeoff)) took = t;
    if (events.some((e) => e.type === EVENT.Landing)) landed = true;
  }
  if (landed) for (let i = 0; i < BASELINE.runOut && !s.fallen; i++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    h.buttons[7] = 0.5; h.buttons[1] = 1;
    if (i >= 18) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    inputs.push({ ...input });
    step(s, input, p, SIM_DT, [], ice);
  }
  return { speed: k.speed, inputs };
}

// ── the search (JPSE-007, the hold-suppress grid) ────────────────────────────
//
// A guarded parallel of search.ts's runSearch: same hard gates, same report
// shape, but the entrance is holdSuppressProgram and the knobs are the
// three-phase structure's. search.ts and its grids are untouched (the default
// --grid first|power behave exactly as before); this runs only under
// --grid hold-suppress.

export interface HoldSuppressSpec {
  schema: "jpse-search/1";
  program: "hold-suppress";
  axes: Partial<Record<keyof HoldSuppressKnobs, number[]>>;
  repeat: number;
  transform?: Transform;
}

export interface HSSearchPoint extends Omit<SearchPoint, "knobs"> { knobs: HoldSuppressKnobs }
export interface HSSearchReport extends Omit<SearchReport, "points" | "spec"> {
  spec: HoldSuppressSpec;
  points: HSSearchPoint[];
  /** Accepted points the landing called a clean DOUBLE (revolutions 2). */
  doubles: number[];
}

const CANONICAL: Transform = { mirror: false, reverse: false };
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const prefix = (reason: string): string => reason.split(" ")[0].replace(/(:[a-z]+-).*/, "$1").replace(/-\d.*$/, "-");

function gridPointsHS(spec: HoldSuppressSpec): HoldSuppressKnobs[] {
  let pts: HoldSuppressKnobs[] = [{ ...HOLD_SUPPRESS_KNOBS }];
  for (const [k, values] of Object.entries(spec.axes) as Array<[keyof HoldSuppressKnobs, number[]]>)
    pts = pts.flatMap((p) => values.map((v) => ({ ...p, [k]: v })));
  return pts;
}

function evaluateHS(index: number, k: HoldSuppressKnobs, p: Params, t: Transform): { point: HSSearchPoint; ticks: number } {
  // The mapping names every push's foot (free-leg pump), so no pinning is needed
  // for the canonical transform; runCandidate replays the recorded stream.
  const run = runCandidate(`hs-${index}`, holdSuppressProgram(k, p), t, p, BASELINE.jump, BASELINE.runOut);
  const r = run.report;
  const turned = r.landing?.turned ?? 0;
  return {
    ticks: run.track.length,
    point: {
      index, knobs: k, accepted: !r.rejected, firstReason: r.reasons[0] ?? "", reasons: r.reasons,
      takeoff: r.takeoff?.code ?? "---", simCalls: r.landing?.simCalls ?? "none",
      turned, rotationError: r6(Math.abs(turned - SEARCH_REVOLUTIONS)),
      takeoffQuality: r.takeoff?.quality ?? 0, landingQuality: r.landing?.landingQuality ?? 0,
      height: r.flight?.height ?? 0, angMomentum: r.takeoff?.angMomentum ?? 0, airTime: r.flight?.airTime ?? 0,
      digest: r.replay.digest,
    },
  };
}

function dominates(a: HSSearchPoint, b: HSSearchPoint): boolean {
  const ge = a.rotationError <= b.rotationError && a.takeoffQuality >= b.takeoffQuality && a.landingQuality >= b.landingQuality;
  const gt = a.rotationError < b.rotationError || a.takeoffQuality > b.takeoffQuality || a.landingQuality > b.landingQuality;
  return ge && gt;
}

export function runHoldSuppressSearch(spec: HoldSuppressSpec, params: Params = baselineParams()): HSSearchReport {
  const pts = gridPointsHS(spec);
  const points: HSSearchPoint[] = [];
  let ticksTotal = 0;
  const t = spec.transform ?? CANONICAL;
  pts.forEach((k, i) => { const e = evaluateHS(i, k, params, t); points.push(e.point); ticksTotal += e.ticks; });
  let identical = 0;
  const checked = Math.min(spec.repeat, pts.length);
  for (let i = 0; i < checked; i++) if (evaluateHS(i, pts[i], params, t).point.digest === points[i].digest) identical++;
  const distribution: Record<string, number> = {};
  for (const pt of points) { const key = pt.accepted ? "accepted" : prefix(pt.firstReason); distribution[key] = (distribution[key] ?? 0) + 1; }
  const acc = points.filter((pt) => pt.accepted);
  const doubles = acc.filter((pt) => revolutionsOf(pt.turned) === 2).map((pt) => pt.index);
  return {
    schema: "jpse-search-report/1", jump: requirementFor(BASELINE.jump, t).jump as "Lo", spec, evaluated: points.length, ticksTotal, points,
    distribution: Object.fromEntries(Object.entries(distribution).sort()),
    repeatability: { checked, identical },
    accepted: acc.map((pt) => pt.index),
    pareto: acc.filter((a) => !acc.some((b) => dominates(b, a))).map((pt) => pt.index),
    doubles,
  };
}

/**
 * The declared grid: around the canonical entrance's own knobs (speed, load,
 * check, depth) and the new three-phase structure. pushEvery 60 (0.5 s, longer
 * than the 0.30 s push so each settles), pushPull 0.65 (the gentle pump that
 * stays under the load knee) and swingAt 0.1 are fixed; the rest are walked.
 */
export const HOLD_SUPPRESS_GRID: HoldSuppressSpec = {
  schema: "jpse-search/1",
  program: "hold-suppress",
  axes: {
    speed: [-7, -7.5, -8],
    glideTicks: [120, 180, 240],
    pushCount: [0, 2],
    holdTicks: [60, 120, 180],
    holdPull: [0.5, 0.6],
    load: [0.35, 0.425],
    checkAt: [0.425, 0.45, 0.475],
    depth: [0.95, 1],
  },
  repeat: 10,
};

/**
 * The one nearest the canonical entrance, by the rule docs/support-signal.md §1
 * used ("the one nearest the old script"): among the clean doubles, the smallest
 * change to the canonical's OWN knobs. Distance is Euclidean over speed, load,
 * checkAt and depth, each axis in units of its grid step (so a step of speed
 * counts as a step of load, not 0.5 m/s against 0.025 s). The new structure's
 * knobs have no canonical analogue; they break ties toward the simplest entrance
 * (fewest pushes, then shortest glide, then shortest hold), then grid order.
 */
export function nearestToCanonical(report: HSSearchReport): number {
  const step = (axis: keyof HoldSuppressKnobs): number => {
    const vs = [...(report.spec.axes[axis] ?? [])].sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < vs.length; i++) min = Math.min(min, vs[i] - vs[i - 1]);
    return Number.isFinite(min) && min > 0 ? min : 1;
  };
  const canon = { speed: BASELINE.speed, load: BASELINE.load, checkAt: BASELINE.checkAt, depth: 1 };
  const dist = (k: HoldSuppressKnobs): number => Math.sqrt(
    ((k.speed - canon.speed) / step("speed")) ** 2 +
    ((k.load - canon.load) / step("load")) ** 2 +
    ((k.checkAt - canon.checkAt) / step("checkAt")) ** 2 +
    ((k.depth - canon.depth) / step("depth")) ** 2);
  let best = -1, bestKey = "";
  for (const i of report.doubles) {
    const k = report.points[i].knobs;
    const key = `${dist(k).toFixed(9)}|${String(k.pushCount).padStart(3)}|${String(k.glideTicks).padStart(5)}|${String(k.holdTicks).padStart(5)}|${String(i).padStart(6)}`;
    if (best < 0 || key < bestKey) { best = i; bestKey = key; }
  }
  return best;
}

/**
 * The searched entrance for beatCrossoverHoldSuppress 1 (Brief 2, 2026-11-18).
 *
 * Provenance: found by runHoldSuppressSearch on HOLD_SUPPRESS_GRID (Experimental,
 * beatCrossoverHoldSuppress 1, the game's sheet), the clean double nearest the
 * canonical entrance by docs/support-signal.md §1's rule — its speed, load,
 * checkAt, swingAt and depth are the canonical's own (-7 m/s, 0.425 s, 0.45 s,
 * 0.1 s, full stick); only the three-phase structure is new (a 1.5 s released
 * glide, two gentle free-leg pumps at 0.5 s, a 0.5 s hold at RT 0.6). Measured
 * through the JPSE hard gates: RBO takeoff, L 25.25, 0.383 m, 0.559 s air,
 * 2.037 revolutions called clean, standing the 1.2 s run-out. BASELINE is
 * unchanged; this entrance is for the option on, not a replacement.
 */
export const HOLD_SUPPRESS_ENTRANCE: HoldSuppressKnobs = {
  speed: -7, glideTicks: 180, pushCount: 2, pushEvery: 60, pushPull: 0.65,
  holdTicks: 60, holdPull: 0.6, load: 0.425, swingAt: 0.1, checkAt: 0.45, depth: 1,
};
