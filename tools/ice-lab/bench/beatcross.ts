// tools/ice-lab/bench/beatcross.ts — does the jump depend on the music?
//
// Hand_off.md open question 2: Experimental's automatic beat crossovers
// (game/full-controls.ts autoCrossover) put the weight on both feet on every
// beat; with weightTransferMode on, the return to one foot takes up to
// weightTransferTime (0.25 s, authored). A load that begins just after a beat
// may start on two feet. This bench measures it: the canonical clean 2Lo
// entrance (jpse/baseline.ts BASELINE, from test/backjump.test.ts, measured
// 2026-11-14) with the load's start shifted across one full beat period in
// 1-tick steps.
//
// The pad script is baseline.ts's, tick for tick, with loadAt shifted; it runs
// closed-loop through the game's own mapping (setupInput), so the crossovers
// react to the shift as a player's would. Per offset it records the takeoff
// (right) foot's share of the support signal at the load's first tick and on
// the last grounded tick before blade-off, the automatic crossover starts, the
// landing's call, airborne degrees and the run-out. Every run is replay-
// verified and carries its final digest. Deterministic: no wall clock feeds
// the sim; the date below is metadata only.
//
// Run from tools/ice-lab: node bench/beatcross.ts [--out path]
// Sweeps twice — beatCrossoverHoldSuppress 0 (the shipped behaviour) and 1
// (the owner's option: the standing trigger held toward a load stops the
// beat's crossovers) — writes docs/beatcross-2026-11.json and prints both
// tables.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { EVENT, FALL_NAME } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { JUMP_CODE, JUMP_NONE, JUMP_PHASE } from "../sim/jump.ts";
import { supportSignal } from "../sim/support.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
import { BASELINE } from "../jpse/baseline.ts";
import { HOLD_SUPPRESS_ENTRANCE, holdSuppressLoadTick, holdSuppressPress } from "../jpse/hold-suppress.ts";
import type { HoldSuppressKnobs } from "../jpse/hold-suppress.ts";

export interface OffsetRun {
  offsetTicks: number;
  loadAtS: number;
  /** First tick of JUMP_PHASE.Load; -1 if the load never started. */
  loadStartTick: number;
  /** Phase [0,1) of the beat at the load's first tick; -1 if none. */
  loadBeatPhase: number;
  /** Right blade's share (supportSignal) at the load's first tick. */
  shareAtLoadStart: number;
  /** SkatingInput.weight asked on that tick. */
  weightAskedAtLoad: number;
  /** Right share on the last grounded tick before the Takeoff event. */
  shareAtBladeOff: number;
  takeoffTick: number;
  takeoffL: number;
  /** Ticks an automatic crossover started (autoCrossover's crossUntil). */
  crossoverTicks: number[];
  /** Last crossover start before the load's first tick; -1 if none. */
  lastCrossBeforeLoad: number;
  landingTick: number;
  simCalls: string;
  revolutions: number;
  /** landed.turned * 360; rotationCallMode 0 counts the air alone. */
  airborneDeg: number;
  rotationCall: string;
  /** Landing fall, or any fall from touchdown on. */
  fall: boolean;
  /** FALL_NAME of the run's fall, "" if it never fell. */
  fallReason: string;
  /** Touchdown to the first fall or the program's end; -1 if no landing. */
  stoodTicks: number;
  outcome: string;
  /** JPSE's completed gate: called Lo, no fall, stood the full run-out. */
  completed: boolean;
  digest: number;
  verified: boolean;
}

const CALL_MARK = ["clean", "q", "under", "downgraded"];

export function runOffset(k: number, p: Params): OffsetRun {
  const s = createState(p, BASELINE.speed);
  // The game's own sheet: iceGridMode 1 feeds friction from it, and the
  // replay verifier replays into a fresh one (sim/replay.ts ReplayPlayer).
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const rec = new ReplayRecorder(p, BASELINE.speed, 0);
  const loadAt = BASELINE.loadAt + k * SIM_DT;
  const { load, swingAt, checkAt } = BASELINE;
  const crossSpan = Math.round(p.strokeDuration / SIM_DT);
  let took = -1, tookTick = -1, landed = false, landTick = -1, fallTick = -1;
  let loadStart = -1, shareAtLoad = -1, weightAskedAtLoad = -1;
  let lastGroundShare = -1, shareAtBladeOff = -1, L = 0;
  const crossoverTicks: number[] = [];
  const tick = (press: () => void): EdgeEvent[] => {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    press();
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    if (st.full?.crossUntil === s.tick + crossSpan) crossoverTicks.push(s.tick);
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, ice);
    rec.capture(input, p, s, events);
    if (loadStart < 0 && s.jump.phase === JUMP_PHASE.Load) {
      loadStart = s.tick;
      shareAtLoad = supportSignal(s).share[1];
      weightAskedAtLoad = input.weight ?? 0.5;
    }
    if (s.jump.phase !== JUMP_PHASE.Air && !s.fallen) lastGroundShare = supportSignal(s).share[1];
    if (took < 0 && events.some((e) => e.type === EVENT.Takeoff)) {
      tookTick = s.tick; shareAtBladeOff = lastGroundShare; L = s.jump.angMomentum;
    }
    if (events.some((e) => e.type === EVENT.Landing)) { landed = true; landTick = s.tick; }
    if (s.fallen && fallTick < 0) fallTick = s.tick;
    return events;
  };
  for (let i = 0; i < 480 && !s.fallen && !landed; i++) {
    const t = i * SIM_DT;
    tick(() => {
      if (took >= 0) { h.buttons[7] = 0.7; h.buttons[1] = t - took >= checkAt ? 1 : 0; return; }
      if (i < 2) h.buttons[1] = 1;
      h.axes[0] = h.axes[2] = -Math.min(1, t / 0.5);
      if (t < loadAt) h.buttons[7] = 0.5;
      if (t >= loadAt && t < loadAt + load) { h.buttons[7] = 1; h.buttons[t - loadAt < swingAt ? 1 : 2] = 1; }
    });
    if (took < 0 && tookTick >= 0) took = t;
  }
  if (landed) for (let i = 0; i < BASELINE.runOut && !s.fallen; i++) tick(() => {
    h.buttons[7] = 0.5; h.buttons[1] = 1;
    if (i >= 18) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
  });
  const v = verifyReplay(parseReplay(rec.toJson()));
  const period = 60 / p.musicBpm;
  const phase = loadStart >= 0
    ? ((((loadStart * SIM_DT - p.musicOffset) % period) + period) % period) / period : -1;
  const beforeLoad = crossoverTicks.filter((t) => loadStart >= 0 && t < loadStart);
  const Ln = s.landed;
  let outcome: string, call = "none", revs = 0, deg = 0, fall = false, stood = -1, calls = "none";
  if (landed) {
    calls = Ln.kind === JUMP_NONE ? "none" : JUMP_CODE[Ln.kind];
    revs = Ln.revolutions; deg = Ln.turned * 360;
    call = CALL_MARK[Ln.rotationCall] ?? "?";
    fall = Ln.fall || (fallTick >= landTick);
    stood = (fallTick >= landTick ? fallTick : s.tick) - landTick;
    outcome = fall ? "fall" : Ln.kind === JUMP_NONE ? "hop" : (CALL_MARK[Ln.rotationCall] ?? "?");
  } else {
    outcome = tookTick < 0 ? (s.fallen ? "fell-entry" : "no-takeoff") : (s.fallen ? "fell-air" : "no-landing");
  }
  return {
    offsetTicks: k, loadAtS: loadAt, loadStartTick: loadStart, loadBeatPhase: phase,
    shareAtLoadStart: shareAtLoad, weightAskedAtLoad, shareAtBladeOff,
    takeoffTick: tookTick, takeoffL: L, crossoverTicks,
    lastCrossBeforeLoad: beforeLoad.length ? beforeLoad[beforeLoad.length - 1] : -1,
    landingTick: landTick, simCalls: calls, revolutions: revs, airborneDeg: deg,
    rotationCall: call, fall, fallReason: s.fallen ? (FALL_NAME[s.fallReason] ?? "?") : "", stoodTicks: stood, outcome,
    completed: landed && calls === "Lo" && !fall && stood >= BASELINE.runOut,
    digest: rec.lastDigest, verified: v.divergence === null,
  };
}

/**
 * The hold-suppress entrance (jpse/hold-suppress.ts) at load-phase offset k.
 * The beat sweep shifts the load's start by prepending k released-glide ticks
 * (the entrance's structure stays fixed; the beat grid is the game's default),
 * the analogue of the canonical sweep's loadAt shift. Closed-loop on the game's
 * sheet, replay-verified, same OffsetRun fields. The canonical runOffset above
 * is untouched.
 */
export function runHoldSuppressOffset(k: number, p: Params, knobs: HoldSuppressKnobs = HOLD_SUPPRESS_ENTRANCE): OffsetRun {
  const s = createState(p, knobs.speed);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const rec = new ReplayRecorder(p, knobs.speed, 0);
  const press = holdSuppressPress(knobs, k);
  const loadAtTick = holdSuppressLoadTick(knobs, k);
  const cap = loadAtTick + Math.ceil(knobs.load / SIM_DT) + 240;
  const crossSpan = Math.round(p.strokeDuration / SIM_DT);
  let took = -1, tookTick = -1, landed = false, landTick = -1, fallTick = -1;
  let loadStart = -1, shareAtLoad = -1, weightAskedAtLoad = -1;
  let lastGroundShare = -1, shareAtBladeOff = -1, L = 0;
  const crossoverTicks: number[] = [];
  const tick = (pressFn: () => void): EdgeEvent[] => {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    pressFn();
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    if (st.full?.crossUntil === s.tick + crossSpan) crossoverTicks.push(s.tick);
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, ice);
    rec.capture(input, p, s, events);
    if (loadStart < 0 && s.jump.phase === JUMP_PHASE.Load) {
      loadStart = s.tick;
      shareAtLoad = supportSignal(s).share[1];
      weightAskedAtLoad = input.weight ?? 0.5;
    }
    if (s.jump.phase !== JUMP_PHASE.Air && !s.fallen) lastGroundShare = supportSignal(s).share[1];
    if (took < 0 && events.some((e) => e.type === EVENT.Takeoff)) {
      tookTick = s.tick; shareAtBladeOff = lastGroundShare; L = s.jump.angMomentum;
    }
    if (events.some((e) => e.type === EVENT.Landing)) { landed = true; landTick = s.tick; }
    if (s.fallen && fallTick < 0) fallTick = s.tick;
    return events;
  };
  for (let i = 0; i < cap && !s.fallen && !landed; i++) {
    const t = i * SIM_DT;
    tick(() => press(h, t, i, took));
    if (took < 0 && tookTick >= 0) took = t;
  }
  if (landed) for (let i = 0; i < BASELINE.runOut && !s.fallen; i++) tick(() => {
    h.buttons[7] = 0.5; h.buttons[1] = 1;
    if (i >= 18) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
  });
  const v = verifyReplay(parseReplay(rec.toJson()));
  const period = 60 / p.musicBpm;
  const phase = loadStart >= 0
    ? ((((loadStart * SIM_DT - p.musicOffset) % period) + period) % period) / period : -1;
  const beforeLoad = crossoverTicks.filter((t) => loadStart >= 0 && t < loadStart);
  const Ln = s.landed;
  let outcome: string, call = "none", revs = 0, deg = 0, fall = false, stood = -1, calls = "none";
  if (landed) {
    calls = Ln.kind === JUMP_NONE ? "none" : JUMP_CODE[Ln.kind];
    revs = Ln.revolutions; deg = Ln.turned * 360;
    call = CALL_MARK[Ln.rotationCall] ?? "?";
    fall = Ln.fall || (fallTick >= landTick);
    stood = (fallTick >= landTick ? fallTick : s.tick) - landTick;
    outcome = fall ? "fall" : Ln.kind === JUMP_NONE ? "hop" : (CALL_MARK[Ln.rotationCall] ?? "?");
  } else {
    outcome = tookTick < 0 ? (s.fallen ? "fell-entry" : "no-takeoff") : (s.fallen ? "fell-air" : "no-landing");
  }
  return {
    offsetTicks: k, loadAtS: loadAtTick * SIM_DT, loadStartTick: loadStart, loadBeatPhase: phase,
    shareAtLoadStart: shareAtLoad, weightAskedAtLoad, shareAtBladeOff,
    takeoffTick: tookTick, takeoffL: L, crossoverTicks,
    lastCrossBeforeLoad: beforeLoad.length ? beforeLoad[beforeLoad.length - 1] : -1,
    landingTick: landTick, simCalls: calls, revolutions: revs, airborneDeg: deg,
    rotationCall: call, fall, fallReason: s.fallen ? (FALL_NAME[s.fallReason] ?? "?") : "", stoodTicks: stood, outcome,
    completed: landed && calls === "Lo" && !fall && stood >= BASELINE.runOut,
    digest: rec.lastDigest, verified: v.divergence === null,
  };
}

function row(r: OffsetRun): string {
  const f = (x: number, d: number) => (x < 0 ? "—" : x.toFixed(d));
  return [
    String(r.offsetTicks).padStart(2), r.loadAtS.toFixed(4), String(r.loadStartTick).padStart(4),
    f(r.loadBeatPhase, 3), f(r.shareAtLoadStart, 3), f(r.shareAtBladeOff, 3),
    r.crossoverTicks.join(",") || "—", f(r.takeoffL, 2), String(r.revolutions),
    f(r.airborneDeg, 1), r.rotationCall, String(r.stoodTicks).padStart(4), r.outcome,
  ].join("  ");
}

function summary(name: string, rs: OffsetRun[]): string {
  const count = (pred: (r: OffsetRun) => boolean) => rs.filter(pred).length;
  const shares = rs.filter((r) => r.shareAtLoadStart >= 0).map((r) => r.shareAtLoadStart);
  return `${name}: completed ${count((r) => r.completed)}/${rs.length}, ` +
    `falls ${count((r) => r.fall)}, entry falls ${count((r) => r.outcome === "fell-entry")}, ` +
    `share@load min ${Math.min(...shares).toFixed(3)} max ${Math.max(...shares).toFixed(3)}, ` +
    `crossover starts ${rs.reduce((n, r) => n + r.crossoverTicks.length, 0)}, ` +
    `all replays verified ${rs.every((r) => r.verified)}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1]
    : fileURLToPath(new URL("../../../docs/beatcross-2026-11.json", import.meta.url));
  const pOff = setupParams(BASELINE.setup);
  const pOn = { ...pOff, beatCrossoverHoldSuppress: 1 };
  const period = 60 / pOff.musicBpm;
  const offsets = Math.ceil(period / SIM_DT);
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const off: OffsetRun[] = [], on: OffsetRun[] = [];
  for (let k = 0; k < offsets; k++) { off.push(runOffset(k, pOff)); on.push(runOffset(k, pOn)); }
  const hsOff: OffsetRun[] = [], hsOn: OffsetRun[] = [];
  for (let k = 0; k < offsets; k++) { hsOff.push(runHoldSuppressOffset(k, pOff)); hsOn.push(runHoldSuppressOffset(k, pOn)); }
  const doc = {
    bench: "beatcross", date: new Date().toISOString().slice(0, 10), commit,
    question: "Hand_off.md open question 2: does the jump depend on the music?",
    baseline: {
      source: "jpse/baseline.ts BASELINE — test/backjump.test.ts, measured 2026-11-14",
      setup: BASELINE.setup, speed: BASELINE.speed, loadAt: BASELINE.loadAt, load: BASELINE.load,
      swingAt: BASELINE.swingAt, checkAt: BASELINE.checkAt, runOut: BASELINE.runOut,
    },
    music: { bpm: pOff.musicBpm, offset: pOff.musicOffset, periodS: period, periodTicks: period / SIM_DT, beatWindowS: pOff.musicBeatWindow },
    support: {
      weightTransferMode: pOff.weightTransferMode, weightTransferTimeS: pOff.weightTransferTime,
      strokeDurationS: pOff.strokeDuration, jumpLoadKnee: pOff.jumpLoadKnee,
    },
    param: {
      name: "beatCrossoverHoldSuppress", off: 0, on: 1,
      definition: "1: on one foot, not mid-push, the standing trigger pulled past the snap window (GESTURE_TICKS 30) stops automatic beat crossovers — game/full-controls.ts, the loading guard",
    },
    sweep: { offsets, stepTicks: 1, loadAtS: [BASELINE.loadAt, BASELINE.loadAt + (offsets - 1) * SIM_DT] },
    notes: [
      "share = supportSignal(s).share[1], the right (takeoff) blade's share of the body's load",
      "shareAtBladeOff is the last grounded tick before the Takeoff event",
      "airborneDeg = landed.turned * 360; rotationCallMode 0 counts the air alone",
      "crossoverTicks detected by autoCrossover's crossUntil = tick + strokeDuration/SIM_DT",
      "the ice grid is the game's own (iceGridMode 1); every run replay-verifies into a fresh sheet",
      "authored: weightTransferTime 0.25 s, musicBpm 128, strokeDuration 0.30 s, jumpLoadKnee 0.7",
    ],
    off,
    on,
    holdSuppress: {
      source: "jpse/hold-suppress.ts HOLD_SUPPRESS_ENTRANCE — searched 2026-11-18 on HOLD_SUPPRESS_GRID (Experimental, beatCrossoverHoldSuppress 1), nearest the canonical by support-signal.md §1's rule",
      knobs: HOLD_SUPPRESS_ENTRANCE,
      sweep: "the load's start shifted by k prepended released-glide ticks (the entrance's structure stays fixed); the same 57 offsets of one beat",
      off: hsOff,
      on: hsOn,
    },
  };
  writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
  console.log(`beatcross — ${offsets} offsets of 1 tick across one ${period.toFixed(5)} s beat (${pOff.musicBpm} bpm, authored)`);
  console.log(" k  loadAt    load  phase  share@load  share@off  crossovers  L      revs  airDeg  call   stood  outcome");
  console.log("── beatCrossoverHoldSuppress 0 (off, the shipped behaviour) ──");
  for (const r of off) console.log(row(r));
  console.log(summary("off", off));
  console.log("── beatCrossoverHoldSuppress 1 (on, the owner's option) ──");
  for (const r of on) console.log(row(r));
  console.log(summary("on", on));
  console.log("── the searched hold-suppress entrance (HOLD_SUPPRESS_ENTRANCE) ──");
  console.log("── beatCrossoverHoldSuppress 0 (off) ──");
  for (const r of hsOff) console.log(row(r));
  console.log(summary("hold-suppress off", hsOff));
  console.log("── beatCrossoverHoldSuppress 1 (on) ──");
  for (const r of hsOn) console.log(row(r));
  console.log(summary("hold-suppress on", hsOn));
  console.log(`wrote ${out}`);
}

if (import.meta.main) main();
