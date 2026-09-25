// The double loop's free leg swung through blade-off, its start swept on the
// push's time clock.
//
//   node test/swing-through.ts [--ticks] [--set key=value ...]
//
// The question: does starting the free leg's power swing earlier in the
// physical push restore takeoff angular momentum — without a higher hip
// ceiling, blade slip, a changed launch, worse roll, or anything added?
//
// Fixed: the experimental stack on the cohort's body (test/free-leg-timing.ts
// stackParams: normalLoadMode, the push-off with its mechanics at pushOffTime
// 0.25 s, the takeoff-and-air call, edge commitment, torque-free flight), the
// hip's ceiling as it is (freeLegTorqueMax 100 N m, 76.5 on the cohort —
// AUTHORED, UNVALIDATED), the tuck, landingShock, the takeoff's roll. Only
// the swing's start changes: 0, 0.1, 0.2, 0.3 of the push's time. The whole
// swing (freeLeg to 0, swung back — the arc's end) is asked at the start and
// held through blade-off (SwingPhase step); freeLegSwingThroughMode 1 keeps
// the hip from braking it before blade-off (off: the same ask, braking as
// before — each start is run both ways). The air inherits the leg's state.
//
// Printed per run: the blade-off record, the momentum lost on the ice after
// its peak, the hip's positive and negative impulse and work, its time at the
// ceiling; with --ticks the last 100 ms before blade-off tick by tick. Then
// the summary table, the rejections, the preferred start (the latest within
// 2% of the best L among those kept), and determinism (each run twice).
//
// L on the ice is inertiaOpen x the body's rate (bodyRate, before the
// takeoff's quality factor); the takeoff's L is that x (0.80 + 0.20 q). The
// loss after the peak is read on the ice's scale, like for like.

import type { Params } from "../sim/params.ts";
import { SIM_DT } from "../sim/params.ts";
import { FALL_NAME } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import type { Frame, Outcome, Variation } from "./takeoff-budget.ts";
import { COHORT, REFERENCE } from "./loop-calibration.ts";
import { stackParams } from "./free-leg-timing.ts";

export const STARTS = [0, 0.1, 0.2, 0.3] as const;
const CALL = ["clean", "q", "<", "<<"];
/** Reporting thresholds for a rejection — the tool's, stated, not physics. */
export const REJECT = { slip: 0.5, gripShare: 0.5, vz: 0.05, rollRate: 0.5 } as const;

export const throughAt = (start: number): Variation =>
  ({ swing: { start, peak: start, end: start, to: 0, clock: "time", step: true }, rideOut: 1 });

/** kg m^2: the free leg about the body's axis (sim/solver.ts freeLegInertia). */
const legInertia = (p: Params) => p.freeLegMass * p.mass * p.freeLegReach * p.freeLegReach;

export function analyse(r: Outcome, p: Params, start: number) {
  const ice = r.frames.filter(f => f.timePhase >= 0 && f.phase !== JUMP_PHASE.Air);
  const off = r.frames.find(f => f.phase === JUMP_PHASE.Air) ?? null;
  const push = off ? [...ice, off] : ice;
  const lim = p.freeLegTorqueMax, Ifl = legInertia(p);
  const j = r.result, q = j.takeoffQuality, qf = 0.8 + 0.2 * q;
  const t0 = ice[0]?.t ?? 0;
  let posImp = 0, negImp = 0, posWork = 0, negWork = 0, sat = 0, firstSat: number | null = null;
  for (const f of push) {
    const tau = f.budget?.leg ?? 0;
    if (tau > 0) posImp += tau * SIM_DT; else negImp += tau * SIM_DT;
    const w = tau * f.freeSwingRate * SIM_DT;
    if (w > 0) posWork += w; else negWork += w;
    if (Math.abs(tau) >= lim - 1e-6) { sat++; if (firstSat === null) firstSat = f.t - t0; }
  }
  const swingStart = push.find(f => f.swingPhase >= 0 && f.freeLegCmd !== 0.5) ?? null;
  const peak = ice.reduce<Frame | null>((b, f) => !b || f.L > b.L ? f : b, null);
  const LboIce = off ? r.L / qf : NaN;
  const peakL = Math.max(peak?.L ?? -Infinity, LboIce);
  const fastest = push.reduce<Frame | null>((b, f) => !b || Math.abs(f.freeSwingRate) > Math.abs(b.freeSwingRate) ? f : b, null);
  const grip = ice.filter(f => f.freeLegCmd !== 0.5);
  return {
    start, startS: start * p.pushOffTime, push: off ? off.t - t0 : NaN, off, ice, peak, fastest, swingStart,
    Lnorm: r.L / (p.mass * COHORT.height ** 2), L: r.L, qf, LboIce, peakL, lossIce: peakL - LboIce,
    Lswing: swingStart ? swingStart.L : NaN,
    legAngle: off?.freeSwing ?? NaN, legRate: off?.freeSwingRate ?? NaN,
    legLocalL: off ? Ifl * off.freeSwingRate : NaN, legTransferL: off ? Ifl * (off.yawSlip + off.freeSwingRate) : NaN,
    hipAsked: off?.budget?.legAsked ?? NaN, hipApplied: off?.budget?.leg ?? NaN,
    sat, satS: sat * SIM_DT, satShare: push.length ? sat / push.length : 0, firstSat, posImp, negImp, posWork, negWork,
    peakSlip: Math.max(0, ...push.map(f => Math.abs(f.yawSlip))),
    minGrip: grip.length ? Math.min(...grip.map(f => f.bite - Math.abs(f.latForce))) : NaN,
    edgeDeg: (j.takeoffEdge ?? 0) * 360, vz: j.height > 0 ? Math.sqrt(2 * p.gravity * j.height) : 0,
    vh: off?.speed ?? NaN, roll: off?.lean ?? NaN, rollRate: off?.leanRate ?? NaN, pitch: off?.pitch ?? NaN, pitchRate: off?.pitchRate ?? NaN,
    extension: ice.at(-1)?.pushPhase ?? NaN, flight: j.airTime, airDeg: (j.airborne ?? j.turned) * 360,
    call: r.takeoff < 0 ? "no takeoff" : `${j.revolutions}Lo ${CALL[j.rotationCall]}`,
    touchdown: r.landedAt >= 0 ? r.frames.find(f => f.t >= r.landedAt - 1e-9) ?? null : null,
    landed: r.landedAt >= 0 && !r.fallen, fallAfter: r.fallen && r.landedAt >= 0 ? r.fallAt - r.landedAt : null,
    fallReason: r.fallen ? FALL_NAME[r.fallReason] || "fell" : null,
  };
}
type Run = ReturnType<typeof analyse>;

const fx = (v: number | null, d = 2) => v === null || !Number.isFinite(v) ? " —" : (v >= 0 ? " " : "") + v.toFixed(d);
const sd = (v: number, [m, s]: readonly [number, number]) => `${(v - m) / s >= 0 ? "+" : ""}${((v - m) / s).toFixed(1)} sd`;

function printRecord(name: string, a: Run, p: Params): void {
  console.log(`\n── ${name}: start ${a.start}T = ${a.startS.toFixed(3)} s ──`);
  console.log(`  push ${fx(a.push, 3)} s; extension at the last ice tick ${fx(a.extension)}; vz ${fx(a.vz)} m/s, horizontal ${fx(a.vh)} m/s`);
  console.log(`  free leg at blade-off: ${fx(a.legAngle)} rad, ${fx(a.legRate)} rad/s; its own L ${fx(a.legLocalL)}, transfer L (with the feet's pivot) ${fx(a.legTransferL)} kg m^2/s`);
  console.log(`  hip at blade-off: asked ${fx(a.hipAsked, 1)}, applied ${fx(a.hipApplied, 1)} N m (ceiling ${p.freeLegTorqueMax.toFixed(1)}); at the ceiling ${a.sat} ticks = ${a.satS.toFixed(3)} s = ${(a.satShare * 100).toFixed(0)}% of the push, first after ${a.firstSat === null ? "never" : `${(a.firstSat * 1000).toFixed(0)} ms`}`);
  console.log(`  hip impulse + ${fx(a.posImp)} / - ${fx(a.negImp)} N m s; work + ${fx(a.posWork, 1)} / - ${fx(a.negWork, 1)} J`);
  console.log(`  L (ice scale): at the swing's start ${fx(a.Lswing, 1)}, peak ${fx(a.peakL, 1)} at ${a.peak ? fx(a.peak.t - (a.ice[0]?.t ?? 0), 3) : " —"} s, at blade-off ${fx(a.LboIce, 1)} -> lost after the peak ${fx(a.lossIce, 1)}; takeoff L ${fx(a.L, 1)} (x ${a.qf.toFixed(3)} quality) = ${(a.Lnorm * 1e3).toFixed(1)} x10^-3 (${sd(a.Lnorm, REFERENCE.Lnorm)})`);
  console.log(`  contact: peak slip ${fx(a.peakSlip)} rad/s, least grip in the swing ${fx(a.minGrip, 0)} N, edge turn ${fx(a.edgeDeg, 0)} deg`);
  console.log(`  axis at blade-off: roll ${fx(a.roll)} rad at ${fx(a.rollRate)} rad/s, pitch ${fx(a.pitch)} at ${fx(a.pitchRate)}`);
  const td = a.touchdown;
  console.log(`  after: flight ${fx(a.flight, 3)} s, air ${fx(a.airDeg, 0)} deg, ${a.call}; touchdown roll ${fx(td?.lean ?? NaN)} at ${fx(td?.leanRate ?? NaN)}; ${a.landed ? "rode out 1 s" : a.fallAfter === null ? `fell (${a.fallReason ?? "—"}) before touchdown` : a.fallAfter < 1e-9 ? "fell at touchdown (the landing's score)" : `fell +${(a.fallAfter * 1000).toFixed(0)} ms (${a.fallReason})`}`);
}

function printTicks(r: Outcome, p: Params): void {
  const off = r.frames.find(f => f.phase === JUMP_PHASE.Air);
  if (!off) return;
  console.log("  t to blade-off | time phase | extension | leg rad | leg rad/s | hip asked | hip applied | sat | L | leg transfer L | tilt | yaw rate | slip | grip N | roll | roll rate");
  for (const f of r.frames.filter(f => f.t >= off.t - 0.1 - 1e-9 && f.t <= off.t + 1e-9)) {
    const onIce = f.phase !== JUMP_PHASE.Air;
    console.log(`  ${fx(f.t - off.t, 3)} | ${fx(f.timePhase)} | ${fx(f.pushPhase)} | ${fx(f.freeSwing)} | ${fx(f.freeSwingRate)} | ${fx(f.budget?.legAsked ?? NaN, 1)} | ${fx(f.budget?.leg ?? NaN, 1)} | ${Math.abs(f.budget?.leg ?? 0) >= p.freeLegTorqueMax - 1e-6 ? "*" : " "} | ${fx(f.L, 1)} | ${fx(f.seg?.freeLeg ?? NaN, 1)} | ${fx(f.tilt)} | ${fx(f.yawRate)} | ${fx(f.yawSlip)} | ${onIce ? fx(f.bite - Math.abs(f.latForce), 0) : " —"} | ${fx(f.lean)} | ${fx(f.leanRate)}`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2), ticks = args.includes("--ticks");
  const base = stackParams(args);
  if (!("freeLegSwingThroughMode" in base)) throw Error("this build has no freeLegSwingThroughMode");
  console.log(`cohort body, pushOffTime ${base.pushOffTime} s, hip ceiling ${base.freeLegTorqueMax.toFixed(1)} N m (AUTHORED, UNVALIDATED), time clock, the swing asked whole at its start and held`);
  // The clean run to judge against: PR #48's time-clock swing (start 0.2, peak 0.6, end 0.9), braking as before.
  const refRun = attempt("held", base, Infinity, { swing: { start: 0.2, peak: 0.6, end: 0.9, to: 0, clock: "time" } });
  const ref = analyse(refRun, base, 0.2);
  console.log(`reference run (#48, time clock, eased 0.2-0.9, braking): L ${(ref.Lnorm * 1e3).toFixed(1)} x10^-3, vz ${ref.vz.toFixed(2)}, roll rate ${ref.rollRate.toFixed(2)}, least grip ${ref.minGrip.toFixed(0)} N, peak slip ${ref.peakSlip.toFixed(2)}`);

  const runs: { name: string; through: boolean; a: Run; det: boolean }[] = [];
  for (const through of [true, false]) for (const start of STARTS) {
    const p = { ...base, freeLegSwingThroughMode: through ? 1 : 0 };
    const A = attempt("held", p, Infinity, throughAt(start)), B = attempt("held", p, Infinity, throughAt(start));
    const det = JSON.stringify(A.frames) === JSON.stringify(B.frames) && JSON.stringify(A.result) === JSON.stringify(B.result);
    const name = `SWING-${String(Math.round(start * 100)).padStart(2, "0")}${through ? "" : " (braking)"}`;
    const a = analyse(A, p, start);
    runs.push({ name, through, a, det });
    if (through) { printRecord(name, a, p); if (ticks) printTicks(A, p); }
  }

  const reject = (a: Run): string[] => {
    const why: string[] = [];
    if (a.peakSlip > REJECT.slip) why.push(`slip ${a.peakSlip.toFixed(2)} > ${REJECT.slip}`);
    if (a.minGrip < REJECT.gripShare * ref.minGrip) why.push(`grip ${a.minGrip.toFixed(0)} < ${REJECT.gripShare} x ${ref.minGrip.toFixed(0)}`);
    if (Math.abs(a.vz - ref.vz) > REJECT.vz) why.push(`vz ${a.vz.toFixed(2)} vs ${ref.vz.toFixed(2)}`);
    if (a.rollRate - ref.rollRate > REJECT.rollRate) why.push(`roll rate ${a.rollRate.toFixed(2)} vs ${ref.rollRate.toFixed(2)}`);
    return why;
  };
  console.log("\nrun | start | L norm x10^-3 | L peak | L lost before BO | leg rad/s BO | hip sat | + hip impulse | - hip impulse | peak slip | least grip N | roll BO | roll rate BO | vz | air deg | call | landing | deterministic | rejected");
  for (const { name, a, det } of runs) {
    const why = reject(a);
    console.log(`${name} | ${a.start.toFixed(2)}T | ${(a.Lnorm * 1e3).toFixed(1)} (${sd(a.Lnorm, REFERENCE.Lnorm)}) | ${fx(a.peakL, 1)} | ${fx(a.lossIce, 1)} | ${fx(a.legRate)} | ${(a.satShare * 100).toFixed(0)}% | ${fx(a.posImp)} | ${fx(a.negImp)} | ${fx(a.peakSlip)} | ${fx(a.minGrip, 0)} | ${fx(a.roll)} | ${fx(a.rollRate)} | ${fx(a.vz)} | ${fx(a.airDeg, 0)} | ${a.call} | ${a.landed ? "rode out" : a.fallAfter === null ? "no touchdown" : a.fallAfter < 1e-9 ? "fell at touchdown" : `fell +${(a.fallAfter * 1000).toFixed(0)} ms ${a.fallReason}`} | ${det ? "yes" : "NO"} | ${why.length ? why.join("; ") : "—"}`);
  }
  console.log(`reference: flight ${REFERENCE.flight[0]} ± ${REFERENCE.flight[1]} s, air ${REFERENCE.airDeg[0]} ± ${REFERENCE.airDeg[1]} deg, L ${REFERENCE.Lnorm[0] * 1e3} ± ${REFERENCE.Lnorm[1] * 1e3} x10^-3, vz ~2.1-2.2 m/s. Rejection thresholds (the tool's): slip > ${REJECT.slip} rad/s, grip < ${REJECT.gripShare} x the reference run's, |vz change| > ${REJECT.vz}, roll rate up > ${REJECT.rollRate}.`);

  const kept = runs.filter(r => r.through && !reject(r.a).length);
  if (kept.length) {
    const best = Math.max(...kept.map(r => r.a.Lnorm));
    const near = kept.filter(r => r.a.Lnorm >= 0.98 * best);
    const pick = near.reduce((b, r) => r.a.start > b.a.start ? r : b);
    console.log(`preferred (the latest start within 2% of the best kept L, ${(best * 1e3).toFixed(1)}): ${pick.name}`);
  } else console.log("preferred: none — every swing-through run was rejected");
  const through = runs.filter(r => r.through);
  if (through.every(r => r.a.satShare >= 0.3) && through.every(r => r.a.Lnorm < REFERENCE.Lnorm[0] - 2 * REFERENCE.Lnorm[1]))
    console.log(`ACTUATOR_LIMIT_SUSPECTED: every start has the hip at its ceiling ≥ 30% of the push and L more than 2 sd below the reference. The ceiling is not changed here.`);
}
