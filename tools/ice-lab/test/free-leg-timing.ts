// The free leg timed by the push: the double loop with the experimental
// stack together, the swing phase-locked to the support leg's extension.
//
//   node test/free-leg-timing.ts [--time-clock] [--set key=value ...]
//
// The stack: normalLoadMode, the push-off with its mechanics
// (pushMechanicsMode, pushOffTime 0.25 s — the calibration's, not a
// default), the takeoff-and-air call, edge commitment, torque-free flight
// (airPostureMode), the existing tuck, landingShock untouched. The takeoff is
// the calibration's (test/loop-calibration.ts: the held back outside edge,
// loaded 0.5 s, tucked to the ice), on the cohort's body.
//
// The free leg (freeLegMode's torque-limited hip, as it is) is asked to swing
// back from rest as the push goes: it starts at 20% of the extension, its
// asked rate peaks at `peak`, it is done by 90%, and it holds to blade-off
// (test/takeoff-budget.ts SwingPhase). The extension is how far the support
// leg has straightened since the release — the body's own clock; under the
// constant-force push it runs as (t / T)^2, so 20% of it is 45% of the time.
// --time-clock uses pushOffTime's elapsed share instead. The phases are
// choreography: they say when the hip is asked, not how hard — and the hip
// is torque-limited in wall-clock time, so the ASKED phases hold when
// pushOffTime changes while the leg's own motion does not (the last table).
//
// Printed: the event timeline at the swing's peak of 0.6 — the push's start,
// the swing's start, its measured peak rate, 90%, blade-off, the apex, the
// touchdown — then the compact timing and phase rows, then the peak swept
// 0.50-0.70 against the reference, beside the old swing (freeLegAt 0.5 s from
// the load, the release) on the same push and the legacy takeoff (the given
// lift, 0.12 s push); then the peak of 0.6 at push times 0.2, 0.25, 0.3.

import type { Params } from "../sim/params.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import type { Frame, Outcome, SwingPhase, Variation } from "./takeoff-budget.ts";
import { cohortBody, COHORT, REFERENCE } from "./loop-calibration.ts";
import { postureBase } from "./air-posture.ts";

export const PUSH_TIME = 0.25;
export const START = 0.2, END = 0.9, PEAKS = [0.5, 0.55, 0.6, 0.65, 0.7] as const;
const CALL = ["clean", "q", "<", "<<"];

/** The experimental stack on the cohort's body, the push at PUSH_TIME. */
export function stackParams(args: string[]): Params {
  const base = { ...postureBase(args) } as unknown as Record<string, number>;
  for (const k of ["pushMechanicsMode", "pushOffTime", "airPostureMode"]) if (!(k in base)) throw Error(`this build has no ${k}`);
  if (!args.includes("pushMechanicsMode=0")) base.pushMechanicsMode = 1;
  if (!args.some(a => a.startsWith("pushOffTime="))) base.pushOffTime = PUSH_TIME;
  return cohortBody(base as unknown as Params);
}

export const swingAt = (peak: number, clock: SwingPhase["clock"] = "extension"): Variation =>
  ({ swing: { start: START, peak, end: END, to: 0, clock } });

export interface Events {
  push: Frame; legStart: Frame | null; legPeak: Frame | null; leg90: Frame | null; bladeOff: Frame;
  apex: Frame | null; touchdown: Frame | null;
}

/** The push's frames on the ice, release to the tick before blade-off, and the blade-off tick itself (the push's last). */
function pushFrames(r: Outcome): { ice: Frame[]; all: Frame[] } {
  const ice = r.frames.filter(f => f.timePhase >= 0 && f.phase !== JUMP_PHASE.Air);
  const off = r.frames.find(f => f.phase === JUMP_PHASE.Air);
  return { ice, all: off ? [...ice, off] : ice };
}

/**
 * The timeline's frames, or null without a push and a takeoff. The swing's
 * start and its 90% are the first ticks whose command was asked at or past
 * those phases, on whichever clock asked it (swingPhase); its peak is the
 * leg's own fastest tick through the push, blade-off included.
 */
export function events(r: Outcome): Events | null {
  const { ice, all } = pushFrames(r), bladeOff = r.frames.find(f => f.phase === JUMP_PHASE.Air);
  if (!ice.length || !bladeOff) return null;
  const legPeak = all.reduce<Frame | null>((b, f) => !b || Math.abs(f.freeSwingRate) > Math.abs(b.freeSwingRate) ? f : b, null);
  const apexT = r.takeoff + r.result.airTime / 2;
  return {
    push: ice[0], legStart: all.find(f => f.swingPhase >= START) ?? null, legPeak,
    leg90: all.find(f => f.swingPhase >= END) ?? null, bladeOff,
    apex: r.frames.find(f => f.t >= apexT - 1e-9) ?? null,
    touchdown: r.landedAt >= 0 ? r.frames.find(f => f.t >= r.landedAt - 1e-9) ?? null : null,
  };
}

/** N m: the hip's ceiling on this body (the solver clamps TorqueBudget.leg to it). */
export const hipLimit = (p: Params): number => p.freeLegTorqueMax;

/** The sweep's row: what one run measured against the reference. */
export function measureRun(r: Outcome, p: Params) {
  const j = r.result, e = events(r), { all } = pushFrames(r);
  const swinging = all.filter(f => f.swingPhase >= START || (f.swingPhase < 0 && f.freeLegCmd !== 0.5));
  const flight = j.airTime, air = (j.airborne ?? j.turned) * 360, lim = hipLimit(p);
  return {
    L: r.L, Lnorm: r.L / (p.mass * COHORT.height ** 2), vz: j.height > 0 ? Math.sqrt(2 * p.gravity * j.height) : 0,
    flight, airDeg: air, roll: e?.bladeOff.lean ?? NaN, rollRate: e?.bladeOff.leanRate ?? NaN,
    pitch: e?.bladeOff.pitch ?? NaN, pitchRate: e?.bladeOff.pitchRate ?? NaN,
    peakSlip: Math.max(0, ...all.map(f => Math.abs(f.yawSlip))),
    minGrip: swinging.filter(f => f.phase !== JUMP_PHASE.Air).length
      ? Math.min(...swinging.filter(f => f.phase !== JUMP_PHASE.Air).map(f => f.bite - Math.abs(f.latForce))) : NaN,
    saturated: all.filter(f => Math.abs(f.budget?.leg ?? 0) >= lim - 1e-6).length, pushTicks: all.length,
    swingAtOff: e?.bladeOff.freeSwing ?? NaN, swingAtRest: e?.push.freeSwing ?? NaN,
    touchdownRoll: e?.touchdown?.lean ?? NaN, touchdownRollRate: e?.touchdown?.leanRate ?? NaN,
    call: r.takeoff < 0 ? "no takeoff" : `${j.revolutions}Lo ${CALL[j.rotationCall]}${j.fall ? ", fell" : ""}`,
  };
}

const fx = (v: number, d = 2) => (Number.isFinite(v) ? (v >= 0 ? " " : "") + v.toFixed(d) : " —");
const sd = (v: number, [m, s]: readonly [number, number]) => `${(v - m) / s >= 0 ? "+" : ""}${((v - m) / s).toFixed(1)} sd`;

function printTimeline(r: Outcome, p: Params): void {
  const e = events(r);
  if (!e) { console.log("no push or no takeoff — nothing to time"); return; }
  const t0 = e.push.t, L0 = e.push.L;
  console.log("event | t s | extension | time phase | asked on | swing cmd | swing rad | swing rad/s | hip N m | L | dL | seg free leg | yaw slip | grip left N | load N | lean | lean rate | pitch | pitch rate");
  const rows: [string, Frame | null][] = [["push start", e.push], ["swing asked (20%)", e.legStart], ["leg's fastest", e.legPeak],
    ["swing asked (90%)", e.leg90], ["blade-off", e.bladeOff], ["apex", e.apex], ["touchdown", e.touchdown]];
  for (const [name, f] of rows) {
    if (!f) { console.log(`${name} | —`); continue; }
    const onIce = f.phase !== JUMP_PHASE.Air || f === e.bladeOff;
    console.log(`${name} | ${fx(f.t - t0, 3)} | ${fx(f.pushPhase)} | ${fx(f.timePhase)} | ${fx(f.swingPhase)} | ${onIce ? fx(f.freeLegCmd) : " —"} | ${fx(f.freeSwing)} | ${fx(f.freeSwingRate)} | ${fx(f.budget?.leg ?? NaN, 1)} | ${fx(f.L, 1)} | ${fx(f.L - L0, 1)} | ${fx(f.seg?.freeLeg ?? NaN, 1)} | ${fx(f.yawSlip)} | ${f.phase !== JUMP_PHASE.Air ? fx(f.bite - Math.abs(f.latForce), 0) : " —"} | ${f.phase !== JUMP_PHASE.Air ? fx(f.load, 0) : " —"} | ${fx(f.lean)} | ${fx(f.leanRate)} | ${fx(f.pitch)} | ${fx(f.pitchRate)}`);
  }
  const push = e.bladeOff.t - t0, at = (f: Frame | null) => f ? (f.t - t0).toFixed(3) : "—";
  const ph = (f: Frame | null) => f ? ((f.t - t0) / push).toFixed(3) : "—";
  console.log(`\n2Lo timing: push=0.000 legStart=${at(e.legStart)} legPeak=${at(e.legPeak)} legFinal=${at(e.leg90)} bladeOff=${at(e.bladeOff)}`);
  console.log(`2Lo phase (of the push's time): legStart=${ph(e.legStart)} legPeak=${ph(e.legPeak)} legFinal=${ph(e.leg90)} bladeOff=1.000`);
  const ext = (f: Frame | null) => f ? (f === e.bladeOff ? "straight" : f.pushPhase.toFixed(3)) : "—";
  console.log(`2Lo phase (extension, after the tick): legStart=${ext(e.legStart)} legPeak=${ext(e.legPeak)} legFinal=${ext(e.leg90)} bladeOff=straight`);
  const m = measureRun(r, p);
  console.log(`dL over the swing's asked window (90% less 20%): ${e.leg90 && e.legStart ? fx(e.leg90.L - e.legStart.L, 1) : " —"} kg m^2/s; at blade-off ${fx(e.bladeOff.L - L0, 1)} since the push began`);
  console.log(`the leg's swing by blade-off: ${fx(m.swingAtOff)} rad; the hip at its ${hipLimit(p).toFixed(1)} N m ceiling ${m.saturated} of the push's ${m.pushTicks} ticks${r.phaseFallback ? "   [FREE_LEG_TIME_PHASE_FALLBACK: the push had no extension to read]" : ""}`);
  console.log(`\nmetric | model | reference`);
  console.log(`push duration s | ${push.toFixed(3)} | ~${PUSH_TIME} experimental`);
  console.log(`takeoff vertical m/s | ${m.vz.toFixed(2)} | ~2.1-2.2`);
  console.log(`flight s | ${m.flight.toFixed(3)} (${sd(m.flight, REFERENCE.flight)}) | ${REFERENCE.flight[0]} ± ${REFERENCE.flight[1]}`);
  console.log(`airborne rotation deg | ${m.airDeg.toFixed(0)} (${sd(m.airDeg, REFERENCE.airDeg)}) | ${REFERENCE.airDeg[0]} ± ${REFERENCE.airDeg[1]}`);
  console.log(`takeoff L / (m h^2) x10^-3 | ${(m.Lnorm * 1e3).toFixed(1)} (${sd(m.Lnorm, REFERENCE.Lnorm)}) | ${REFERENCE.Lnorm[0] * 1e3} ± ${REFERENCE.Lnorm[1] * 1e3}`);
  console.log(`blade-off roll rad / rate rad/s | ${fx(m.roll)} / ${fx(m.rollRate)} | measured`);
  console.log(`blade-off pitch rad / rate rad/s | ${fx(m.pitch)} / ${fx(m.pitchRate)} | measured`);
  console.log(`touchdown roll rad / rate rad/s | ${fx(m.touchdownRoll)} / ${fx(m.touchdownRollRate)} | measured`);
  console.log(`call | ${m.call} |`);
}

if (import.meta.main) {
  const args = process.argv.slice(2), clock = args.includes("--time-clock") ? "time" : "extension";
  const p = stackParams(args);
  console.log(`cohort body, pushOffTime ${p.pushOffTime}, pushMechanicsMode ${p.pushMechanicsMode}, clock: ${clock}\n`);
  printTimeline(attempt("held", p, Infinity, swingAt(0.6, clock)), p);
  if (p.pushOffMode !== 1) { console.log("\nno push-off (pushOffMode 0): the swing has nothing to time; no sweep"); process.exit(0); }

  console.log("\nswing | takeoff L | L/(m h^2) x10^-3 | vz m/s | flight s | air deg | roll | roll rate | pitch rate | peak slip rad/s | min grip in swing N | hip at ceiling | swing by blade-off rad | call");
  const row = (name: string, r: Outcome, q: Params) => {
    const m = measureRun(r, q);
    console.log(`${name} | ${m.L.toFixed(1)} | ${(m.Lnorm * 1e3).toFixed(1)} (${sd(m.Lnorm, REFERENCE.Lnorm)}) | ${m.vz.toFixed(2)} | ${m.flight.toFixed(3)} | ${m.airDeg.toFixed(0)} | ${fx(m.roll)} | ${fx(m.rollRate)} | ${fx(m.pitchRate)} | ${m.peakSlip.toFixed(2)} | ${fx(m.minGrip, 0)} | ${m.saturated}/${m.pushTicks} | ${fx(m.swingAtOff)} | ${m.call}`);
  };
  for (const peak of PEAKS) row(`peak ${peak}`, attempt("held", p, Infinity, swingAt(peak, clock)), p);
  row("old: freeLegAt 0.5 s", attempt("held", p, Infinity, { freeLegAt: 0.5, freeLegTo: 0 }), p);
  const legacy = { ...p, pushMechanicsMode: 0, pushOffTime: 0.12 };
  row("legacy: given lift, 0.12 s", attempt("held", legacy, Infinity, { freeLegAt: 0.5, freeLegTo: 0 }), legacy);

  console.log(`\npush s | leg's fastest at (time share / extension) | swing by blade-off rad | hip at ceiling | L/(m h^2) x10^-3 | flight s`);
  for (const T of [0.2, 0.25, 0.3]) {
    const q = { ...p, pushOffTime: T }, r = attempt("held", q, Infinity, swingAt(0.6, clock)), e = events(r), m = measureRun(r, q);
    if (!e) { console.log(`${T} | no push or no takeoff`); continue; }
    const f = e.legPeak!, share = (f.t - e.push.t) / (e.bladeOff.t - e.push.t);
    console.log(`${T} | ${share.toFixed(2)} / ${f === e.bladeOff ? "straight" : f.pushPhase.toFixed(2)} | ${fx(m.swingAtOff)} | ${m.saturated}/${m.pushTicks} | ${(m.Lnorm * 1e3).toFixed(1)} | ${m.flight.toFixed(3)}`);
  }
}
