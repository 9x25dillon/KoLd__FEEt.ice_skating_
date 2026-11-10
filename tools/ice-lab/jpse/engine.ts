// tools/ice-lab/jpse/engine.ts — Jump Path Synthesis Engine, first slice (issue #74).
//
// Runs each entrance candidate through the Ice Lab solver, unmodified and fed
// inputs only, and reports what the physics did: the COM path and the support
// blade's path kept apart, the edge timeline, the takeoff state, the flight,
// the landing, and the replay that reproduces it all.
//
// Judgement is split the way the owner's review asks:
//   - HARD GATES: pass/fail, each failure a machine-readable reason. Nothing
//     soft can buy back a hard failure.
//   - DIAGNOSTICS: measured numbers for a later optimizer to weigh. This slice
//     deliberately computes no aggregate score: measure first, then choose.
// Completion is the solver's own call (s.landed), never redefined here.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { EVENT, FOOT, REGIME, REGIME_NAME, codeToString, makeCode } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { JUMP_CODE, JUMP_DEFS, JUMP_NONE, JUMP_PHASE, ROTATION_MARK, EDGE_MARK } from "../sim/jump.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { len } from "../sim/math.ts";
import { applyTransform } from "./transform.ts";
import type { Program, Transform } from "./transform.ts";
import { baselineCurvature, bladeSkew, bladeTravelAngle, threePointCurvature, velocityCurvature } from "./geometry.ts";

export const JPSE_SCHEMA = "jpse-report/1";

/**
 * Every threshold this module adds that the solver does not already own, with
 * its source and kind (the owner's review: measured, inferred, or tuning).
 */
export const PROVENANCE = {
  mirrorTolerance: { value: 1e-9, units: "m, rad", kind: "tuning", source: "floating-point headroom for an exact mirror; the measured deviation is reported beside it" },
  sampleEvery: { value: 12, units: "ticks", kind: "tuning", source: "0.1 s at SIM_HZ 120, for the report's sampled paths only" },
  minSpeedForGeometry: { value: 0.5, units: "m/s", kind: "tuning", source: "below this a curvature is noise over a few mm" },
  baselineCurvature: { value: "g tan(phi) / v^2", units: "1/m", kind: "inferred", source: "quasi-steady carve, issue #74; a baseline the solver is compared to, never applied" },
} as const;

/** The jump a candidate is held to, from sim/jump.ts JUMP_DEFS (data/jump-definitions.csv). */
export interface Requirement { jump: string; takeoff: string; toe: boolean; rotation: "ccw" | "cw" }

export function requirementFor(kind: number, t: Transform): Requirement {
  const d = JUMP_DEFS[kind];
  // The mirror swaps the foot and the rotation; the edge's side is the body's
  // own and survives a reflection. Reverse keeps the foot and flips nothing
  // the definition names except the travel, so a reversed entrance is held to
  // the SAME takeoff it set out to make, and fails honestly if it cannot.
  const foot = t.mirror ? (d.foot === FOOT.Left ? FOOT.Right : FOOT.Left) : d.foot;
  return {
    jump: JUMP_CODE[kind], takeoff: codeToString(makeCode(foot, d.dir, d.side)), toe: d.toe,
    rotation: t.mirror ? "cw" : "ccw",
  };
}

const r6 = (x: number): number => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x);
const pt = (v: { x: number; y: number }): [number, number] => [r6(v.x), r6(v.y)];

/** One tick, after the step. Kept in memory for the invariant checks; sampled into the report. */
export interface TrackFrame {
  tick: number;
  com: { x: number; y: number };
  vel: { x: number; y: number };
  lean: number;
  supportFoot: number;
  supportMode: number;
  airborne: boolean;
  fallen: boolean;
  code: string;
  regime: number;
  blade: { x: number; y: number };
  bladeTangent: { x: number; y: number };
  load: [number, number];
  kappaCom: number;
  kappaBaseline: number;
  alpha: number;
}

export interface CandidateRun {
  id: string;
  transform: Transform;
  required: Requirement;
  track: TrackFrame[];
  /** JPSE-009: one MotionFrame per tick, for renderers and other stages. */
  frames: MotionFrame[];
  report: CandidateReport;
  /** The edgework-replay/1 clip of this run. */
  replayJson: string;
}

export interface Gate { gate: string; pass: boolean; reason?: string }

export interface CandidateReport {
  id: string;
  transform: Transform;
  initialSpeed: number;
  required: Requirement;
  entrance: {
    ticks: number;
    loadStartTick: number;
    /** The tick a load lapsed back to nothing without leaving the ice; -1 if none did. */
    loadLapsedTick: number;
    edgeTimeline: Array<{ from: number; to: number; code: string; mode: number }>;
    comPath: Array<[number, number]>;
    bladePath: Array<[number, number]>;
    meanKappaCom: number;
    meanKappaBlade: number;
    meanKappaBaseline: number;
    meanKappaBaselineError: number;
    maxBladeSkew: number;
    /** JPSE-004, measured over the entrance. Optional in the schema: added after jpse-report/1 first shipped. */
    supportLoad?: {
      oneFootTicks: number;
      twoFootTicks: number;
      /** Mean share of the normal load on the right blade, over ticks with any load. */
      meanRightShare: number;
      /** Peak total normal load during the jump's load phase, in body weights (m g). */
      loadPhasePeak: number;
      /** The right blade's share at that peak. */
      loadPhasePeakRightShare: number;
    };
  };
  takeoff: null | {
    tick: number;
    code: string;
    /** The solver's own contact regime for the support blade on the last tick on the ice. */
    regime: string;
    simCalls: string;
    /** The way the jump turns from this takeoff (jumpDirMode 1 decides it; at 0 always ccw). Optional: added after jpse-report/1 shipped. */
    direction?: "ccw" | "cw";
    com: [number, number];
    vel: [number, number];
    speed: number;
    lean: number;
    yawRate: number;
    blade: [number, number];
    bladeHeading: [number, number];
    alpha: number;
    supportLoad: [number, number];
    vz: number;
    angMomentum: number;
    quality: number;
    edgeError: number;
  };
  flight: null | { airTime: number; height: number; peakOmega: number; comPath: Array<[number, number]> };
  landing: null | {
    tick: number; simCalls: string;
    /** Optional: added after jpse-report/1 shipped. */
    direction?: "ccw" | "cw";
    turned: number; rotationCall: string; edgeCall: string;
    fall: boolean; twoFoot: boolean; stepOut: boolean; landingQuality: number; stoodTicks: number;
  };
  gates: Gate[];
  rejected: boolean;
  reasons: string[];
  replay: { ticks: number; digest: number; verified: boolean };
}

function frameOf(s: SkaterState, prev: TrackFrame | null, p: Params): TrackFrame {
  const b = s.blade[s.supportFoot];
  const speed = len(s.vel);
  const geo = speed >= PROVENANCE.minSpeedForGeometry.value && s.jump.phase !== JUMP_PHASE.Air;
  return {
    tick: s.tick,
    com: { ...s.pos }, vel: { ...s.vel }, lean: s.lean,
    supportFoot: s.supportFoot, supportMode: s.supportMode,
    airborne: s.jump.phase === JUMP_PHASE.Air,
    fallen: s.fallen,
    code: codeToString(b.code),
    regime: b.regime,
    blade: { ...b.contact }, bladeTangent: { ...b.tangent },
    load: [s.blade[0].normalLoad, s.blade[1].normalLoad],
    kappaCom: geo && prev ? velocityCurvature(prev.vel, s.vel, SIM_DT) : 0,
    kappaBaseline: geo ? baselineCurvature(s.lean, s.vel, s.heading, p.gravity) : 0,
    alpha: bladeTravelAngle(b.tangent, s.vel),
  };
}

/** JPSE-009's record, docs/jpse/schema/motion-frame.schema.json. Unrounded. */
export interface MotionBlade {
  contact: { x: number; y: number }; tangent: { x: number; y: number }; tilt: number;
  code: string; regime: string; inContact: boolean; normalLoad: number; weight: number;
}
export interface MotionFrame {
  schema: "jpse-frame/1";
  tick: number;
  com: { x: number; y: number; z: number };
  vel: { x: number; y: number };
  heading: { x: number; y: number };
  yawRate: number; lean: number; knee: number;
  supportFoot: number; supportMode: number; fallen: boolean;
  jumpPhase: "none" | "load" | "air";
  rotation: number; angMomentum: number; inertia: number;
  blades: [MotionBlade, MotionBlade];
  kappaCom: number; kappaBaseline: number; alpha: number;
}

const PHASE_NAME = ["none", "load", "air"] as const;

function motionFrame(s: SkaterState, f: TrackFrame): MotionFrame {
  const blade = (i: 0 | 1): MotionBlade => {
    const b = s.blade[i];
    return {
      contact: { ...b.contact }, tangent: { ...b.tangent }, tilt: b.tilt, code: codeToString(b.code),
      regime: REGIME_NAME[b.regime], inContact: b.inContact, normalLoad: b.normalLoad, weight: b.weight,
    };
  };
  return {
    schema: "jpse-frame/1", tick: s.tick,
    com: { x: s.pos.x, y: s.pos.y, z: s.comZ }, vel: { ...s.vel }, heading: { ...s.heading },
    yawRate: s.yawRate, lean: s.lean, knee: s.knee,
    supportFoot: s.supportFoot, supportMode: s.supportMode, fallen: s.fallen,
    jumpPhase: PHASE_NAME[s.jump.phase] ?? "none",
    rotation: s.jump.rotation, angMomentum: s.jump.angMomentum, inertia: s.jump.inertia,
    blades: [blade(0), blade(1)],
    kappaCom: f.kappaCom, kappaBaseline: f.kappaBaseline, alpha: f.alpha,
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Name the leg of every push the program leaves to the two-beat alternation.
 *
 * An unnamed push alternates from createState's strokeFoot, which always
 * starts on the left, so a mirrored program would push off the same leg as
 * the canonical (measured: the mirror parted at the first stroke). Running the
 * program once and writing the leg the solver chose into `pushFoot` changes
 * nothing the solver does (sim/solver.ts takes a named leg in place of the
 * alternation, and pushPower/pushKnee stay absent), and gives the mirror a leg
 * to swap. The digests prove it: the pinned program replays the original's.
 */
export function pinPushFeet(prog: Program, params: Params): Program {
  const p = { ...params }, s = createState(p, prog.speed), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const inputs = prog.inputs.map((input) => {
    const out = { ...input };
    step(s, input, p, SIM_DT, [], ice);
    if (input.push && input.pushFoot === undefined) out.pushFoot = s.strokeFoot;
    return out;
  });
  return { speed: prog.speed, inputs };
}

/** Run one candidate. The solver is given inputs and nothing else. */
export function runCandidate(
  id: string, base: Program, t: Transform, params: Params, jumpKind: number, runOut: number,
): CandidateRun {
  const prog = applyTransform(base, t);
  const p = { ...params };
  const s = createState(p, prog.speed);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const rec = new ReplayRecorder(p, prog.speed, 0);
  const required = requirementFor(jumpKind, t);
  const track: TrackFrame[] = [];
  const frames: MotionFrame[] = [];
  let takeoff: CandidateReport["takeoff"] = null, landing: CandidateReport["landing"] = null;
  let loadStart = -1, loadLapsed = -1, landTick = -1, finite = true, prevPhase: number = JUMP_PHASE.None;
  let lastGround: TrackFrame | null = null;

  for (const input of prog.inputs) {
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, ice);
    try { rec.capture(input, p, s, events); } catch { finite = false; break; }
    const f = frameOf(s, track.length ? track[track.length - 1] : null, p);
    track.push(f);
    frames.push(motionFrame(s, f));
    if (loadStart < 0 && s.jump.phase === JUMP_PHASE.Load) loadStart = s.tick;
    if (loadLapsed < 0 && prevPhase === JUMP_PHASE.Load && s.jump.phase === JUMP_PHASE.None) loadLapsed = s.tick;
    prevPhase = s.jump.phase;
    if (!takeoff && events.some((e) => e.type === EVENT.Takeoff) && lastGround) {
      const g = lastGround, J = s.jump;
      takeoff = {
        tick: s.tick, code: codeToString(J.takeoffCode), regime: REGIME_NAME[g.regime],
        direction: (J.rotDir ?? 1) < 0 ? "cw" : "ccw",
        simCalls: J.kind === JUMP_NONE ? "none" : JUMP_CODE[J.kind],
        com: pt(g.com), vel: pt(g.vel), speed: r6(len(g.vel)), lean: r6(g.lean), yawRate: r6(s.yawRate),
        blade: pt(g.blade), bladeHeading: pt(g.bladeTangent), alpha: r6(g.alpha),
        supportLoad: [r6(g.load[0]), r6(g.load[1])],
        vz: r6(J.vz), angMomentum: r6(J.angMomentum), quality: r6(J.quality), edgeError: r6(J.edgeError),
      };
    }
    if (!f.airborne) lastGround = f;
    if (takeoff && !landing && events.some((e) => e.type === EVENT.Landing)) {
      const L = s.landed;
      landTick = s.tick;
      landing = {
        tick: s.tick, simCalls: L.kind === JUMP_NONE ? "none" : JUMP_CODE[L.kind],
        direction: (L.direction ?? 1) < 0 ? "cw" : "ccw", turned: r6(L.turned),
        rotationCall: ROTATION_MARK[L.rotationCall] || "clean", edgeCall: EDGE_MARK[L.edgeCall] || "clean",
        fall: L.fall, twoFoot: L.twoFoot, stepOut: L.stepOut, landingQuality: r6(L.landingQuality), stoodTicks: 0,
      };
    }
  }
  if (landing) {
    // Ticks standing from the touchdown to the first fall, or to the program's end.
    const fell = track.find((f) => f.tick >= landTick && f.fallen);
    landing.stoodTicks = (fell ? fell.tick : track[track.length - 1].tick) - landTick;
  }

  // ── the entrance, everything before the blade leaves ─────────────────────
  const entry = track.filter((f) => !takeoff || f.tick < takeoff.tick);
  const geo = entry.filter((f) => f.kappaBaseline !== 0 || f.kappaCom !== 0);
  const kBlade: number[] = [];
  for (let i = 2; i < entry.length; i++) {
    const a = entry[i - 2], b = entry[i - 1], c = entry[i];
    if (a.supportFoot === b.supportFoot && b.supportFoot === c.supportFoot && len(c.vel) >= PROVENANCE.minSpeedForGeometry.value)
      kBlade.push(threePointCurvature(a.blade, b.blade, c.blade));
  }
  const timeline: CandidateReport["entrance"]["edgeTimeline"] = [];
  for (const f of entry) {
    const last = timeline[timeline.length - 1];
    if (last && last.code === f.code && last.mode === f.supportMode) last.to = f.tick;
    else timeline.push({ from: f.tick, to: f.tick, code: f.code, mode: f.supportMode });
  }
  // JPSE-004: who carried the body, and how hard the load phase pressed.
  const weight = p.mass * p.gravity;
  let rightShareSum = 0, loadedTicks = 0, peak = 0, peakRight = 0;
  for (const f of entry) {
    const total = f.load[0] + f.load[1];
    if (total > 0) { rightShareSum += f.load[1] / total; loadedTicks++; }
    if (loadStart >= 0 && f.tick >= loadStart && total / weight > peak) { peak = total / weight; peakRight = total > 0 ? f.load[1] / total : 0; }
  }
  const supportLoad = {
    oneFootTicks: entry.filter((f) => f.supportMode === 1).length,
    twoFootTicks: entry.filter((f) => f.supportMode === 2).length,
    meanRightShare: r6(loadedTicks ? rightShareSum / loadedTicks : 0),
    loadPhasePeak: r6(peak), loadPhasePeakRightShare: r6(peakRight),
  };
  const every = PROVENANCE.sampleEvery.value;
  const sample = (fs: TrackFrame[], pick: (f: TrackFrame) => { x: number; y: number }) =>
    fs.filter((_, i) => i % every === 0 || i === fs.length - 1).map((f) => pt(pick(f)));
  const air = track.filter((f) => f.airborne);

  // ── determinism: the replay this run recorded, played back from nothing ──
  let verified = false, replayTicks = 0;
  if (finite) {
    const v = verifyReplay(parseReplay(rec.toJson()));
    verified = v.divergence === null;
    replayTicks = v.ticks;
  }

  // ── hard gates ──────────────────────────────────────────────────────────
  const gates: Gate[] = [];
  const gate = (name: string, pass: boolean, reason: string) => gates.push(pass ? { gate: name, pass } : { gate: name, pass, reason });
  gate("finite-state", finite, "state:non-finite");
  gate("replay-deterministic", verified, "replay:diverged");
  gate("rotation-modelled", required.rotation === "ccw" || p.jumpDirMode >= 1, "rotation:cw-not-modelled (jumpDirMode 0: every jump turns counter-clockwise)");
  gate("took-off", takeoff !== null, "takeoff:none");
  if (takeoff) gate("takeoff-edge", takeoff.code === required.takeoff,
    `takeoff-edge:${takeoff.code}!=${required.takeoff}` + (takeoff.simCalls !== "none" ? ` (the solver calls it ${takeoff.simCalls})` : ""));
  // Valid contact at the release is the solver's call, not a threshold of ours:
  // a blade it has in SKID or BRAKE (or off the ice) is not an edge takeoff,
  // whatever its code says (measured: the reverse candidate swivels RFO to
  // RBO mid-skid and "takes off RBO" with the blade 110 degrees across its path).
  const okRegime: number[] = [REGIME.Glide, REGIME.Edge, REGIME.Carve, REGIME.ToePick];
  if (takeoff) gate("takeoff-contact", okRegime.includes(REGIME_NAME.indexOf(takeoff.regime as never)), `takeoff-contact:${takeoff.regime}`);
  const completed = !!landing && landing.simCalls === required.jump && landing.direction === required.rotation
    && !landing.fall && landing.stoodTicks >= runOut;
  gate("completed", completed,
    !landing ? "landing:none" : landing.simCalls !== required.jump ? `landing:called-${landing.simCalls}`
      : landing.direction !== required.rotation ? `landing:turned-${landing.direction}`
      : landing.fall || landing.stoodTicks < runOut && s.fallen ? "landing:fell" : `landing:stood-${landing.stoodTicks}-of-${runOut}-ticks`);
  const reasons = gates.filter((g) => !g.pass).map((g) => g.reason!);

  const report: CandidateReport = {
    id, transform: t, initialSpeed: prog.speed, required,
    entrance: {
      ticks: entry.length, loadStartTick: loadStart, loadLapsedTick: loadLapsed, edgeTimeline: timeline,
      comPath: sample(entry, (f) => f.com), bladePath: sample(entry, (f) => f.blade),
      meanKappaCom: r6(mean(geo.map((f) => f.kappaCom))),
      meanKappaBlade: r6(mean(kBlade)),
      meanKappaBaseline: r6(mean(geo.map((f) => f.kappaBaseline))),
      meanKappaBaselineError: r6(mean(geo.map((f) => Math.abs(f.kappaCom - f.kappaBaseline)))),
      supportLoad,
      maxBladeSkew: r6(Math.max(0, ...entry.filter((f) => len(f.vel) >= PROVENANCE.minSpeedForGeometry.value).map((f) => bladeSkew(f.alpha)))),
    },
    takeoff,
    flight: takeoff ? {
      airTime: r6(s.jump.airTime || (air.length * SIM_DT)), height: r6(s.jump.height), peakOmega: r6(s.jump.peakOmega),
      comPath: sample(air, (f) => f.com),
    } : null,
    landing, gates, rejected: reasons.length > 0, reasons,
    replay: { ticks: replayTicks, digest: rec.lastDigest, verified },
  };
  return { id, transform: t, required, track, frames, report, replayJson: rec.toJson() };
}

// ── invariants across candidates ────────────────────────────────────────────

/**
 * Where this solver is not left/right symmetric, found by mirroring and
 * measured one source at a time (2026-11-09). None is a bug for this engine to
 * fix: the physics layer is the authority, and these are reported, not patched.
 */
export const SOLVER_HANDEDNESS = [
  { id: "ice-grid", where: "sim/ice.ts IceGrid.cellAt",
    what: "the sheet's rows split at y = 0 (rinkHalfWidth 15 / ICE_CELL 0.12 = 125 rows) and y = 0 belongs to the row above; a mirrored skater starting on the line cuts onto fresh ice where the canonical cuts onto ice it has already marked",
    off: "iceGridMode 0" },
  { id: "fatigue-noise", where: "sim/solver.ts balance loop, staminaBalanceNoiseBase",
    what: "the fatigue wobble is seeded by the tick alone, so a mirrored skater gets the same push the same way, not its mirror",
    off: "staminaMode 0" },
  { id: "two-foot-tie", where: "sim/solver.ts supportFoot = weights[1] >= weights[0] ? Right : Left",
    what: "on two feet at exactly equal weight the support (and so the heading's) blade is the right one, for a mirrored skater too",
    off: "jumpDirMode 1: the tie keeps the foot that was carrying (2026-11-09)" },
] as const;

export interface MirrorCheck {
  /** Ticks compared: the entrance, until either candidate's load begins. */
  ticks: number;
  maxPositionError: number;
  maxLeanError: number;
  feetSwapped: boolean;
  /** The first tick the two runs part, past the tolerance; -1 if they never do. */
  divergesAtTick: number;
  /** SOLVER_HANDEDNESS id that explains the parting, "unattributed", or "" when they never part. */
  cause: string;
  pass: boolean;
}

/**
 * The mirror as a CONDITIONAL invariant (the owner's review): on the ice,
 * before the jump, a mirrored entrance traces (x, -y) with its lean negated
 * and its feet swapped — wherever the solver itself is symmetric. From the
 * load on the rotation direction matters and identical outcomes are not
 * expected, so they are not asked. `params` says which handedness sources
 * were on, so a parting can be put down to one of them.
 */
export function checkMirror(a: CandidateRun, m: CandidateRun, params: Params): MirrorCheck {
  const tol = PROVENANCE.mirrorTolerance.value;
  const until = Math.min(
    a.report.entrance.loadStartTick < 0 ? Infinity : a.report.entrance.loadStartTick,
    m.report.entrance.loadStartTick < 0 ? Infinity : m.report.entrance.loadStartTick,
  );
  let ticks = 0, maxPos = 0, maxLean = 0, swapped = true, diverges = -1, at = -1;
  for (let i = 0; i < Math.min(a.track.length, m.track.length); i++) {
    const f = a.track[i], g = m.track[i];
    if (f.tick >= until) break;
    ticks++;
    const dp = Math.max(Math.abs(f.com.x - g.com.x), Math.abs(f.com.y + g.com.y));
    const dl = Math.abs(f.lean + g.lean);
    maxPos = Math.max(maxPos, dp); maxLean = Math.max(maxLean, dl);
    if (f.supportFoot === g.supportFoot && f.supportMode === 1) swapped = false;
    if (diverges < 0 && (dp > tol || dl > tol)) { diverges = f.tick; at = i; }
  }
  let cause = "";
  if (diverges >= 0) {
    // The earliest source that was on and can explain it: a two-foot tie the
    // tick before, else the sheet, else the wobble.
    const prev = at > 0 ? at - 1 : 0, f = a.track[prev], g = m.track[prev];
    if (params.jumpDirMode < 1 && f.supportMode === 2 && g.supportMode === 2 && f.supportFoot === g.supportFoot) cause = "two-foot-tie";
    else if (params.iceGridMode === 1) cause = "ice-grid";
    else if (params.staminaMode === 1) cause = "fatigue-noise";
    else cause = "unattributed";
  }
  return {
    ticks, maxPositionError: maxPos, maxLeanError: maxLean, feetSwapped: swapped, divergesAtTick: diverges, cause,
    pass: diverges < 0 && swapped && ticks > 0,
  };
}

export interface JpseReport {
  schema: typeof JPSE_SCHEMA;
  issue: 74;
  jump: string;
  setup: string;
  baselineSource: string;
  provenance: typeof PROVENANCE;
  candidates: CandidateReport[];
  invariants: {
    /** On the setup as played: the sheet and the wobble on. */
    mirror: MirrorCheck;
    reverseMirror: MirrorCheck;
    /** The same pairs with the sheet and the wobble off: what is left is the solver's own geometry. */
    mirrorControlled: MirrorCheck;
    reverseMirrorControlled: MirrorCheck;
    /** P(L - s) traverses the curve the other way round: the mean entrance curvature changes sign. */
    reverseCurvatureSense: { canonical: number; reverse: number; flipped: boolean };
  };
  solverHandedness: typeof SOLVER_HANDEDNESS;
  accepted: string[];
}

/**
 * The first vertical slice: one jump, one canonical entrance, four candidates,
 * each run through the solver; then the mirror checked as a conditional
 * invariant, on the setup and with the sheet and the wobble off.
 */
export function runSlice(
  program: Program, params: Params, jumpKind: number, runOut: number,
  meta: { setup: string; baselineSource: string },
  candidates: ReadonlyArray<{ id: string; transform: Transform }>,
): { report: JpseReport; runs: CandidateRun[] } {
  const pinned = pinPushFeet(program, params);
  const runs = candidates.map((c) => runCandidate(c.id, pinned, c.transform, params, jumpKind, runOut));
  const by = (id: string): CandidateRun => runs.find((r) => r.id === id)!;
  const quiet: Params = { ...params, iceGridMode: 0, staminaMode: 0 };
  const quietPinned = pinPushFeet(program, quiet);
  const q = (m: boolean, r: boolean) => runCandidate("controlled", quietPinned, { mirror: m, reverse: r }, quiet, jumpKind, runOut);
  const canon = by("canonical"), rev = by("reverse");
  const kc = canon.report.entrance.meanKappaCom, kr = rev.report.entrance.meanKappaCom;
  const report: JpseReport = {
    schema: JPSE_SCHEMA, issue: 74, jump: JUMP_CODE[jumpKind], setup: meta.setup, baselineSource: meta.baselineSource,
    provenance: PROVENANCE,
    candidates: runs.map((r) => r.report),
    invariants: {
      mirror: checkMirror(canon, by("mirror"), params),
      reverseMirror: checkMirror(rev, by("mirror+reverse"), params),
      mirrorControlled: checkMirror(q(false, false), q(true, false), quiet),
      reverseMirrorControlled: checkMirror(q(false, true), q(true, true), quiet),
      reverseCurvatureSense: { canonical: kc, reverse: kr, flipped: kc !== 0 && Math.sign(kc) === -Math.sign(kr) },
    },
    solverHandedness: SOLVER_HANDEDNESS,
    accepted: runs.filter((r) => !r.report.rejected).map((r) => r.id),
  };
  return { report, runs };
}
