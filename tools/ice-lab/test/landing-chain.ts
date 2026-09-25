// The double loop from blade-off to a second on the ice, owned stage by stage.
//
//   node test/landing-chain.ts [--set key=value ...]
//
// Telemetry only: no constant changes. The takeoff is frozen at PR #49's:
// the experimental stack on the cohort body (test/free-leg-timing.ts
// stackParams), the free leg swung through blade-off from 0.3 of the push
// (freeLegSwingThroughMode, test/swing-through.ts), the knee bent to 0.8
// from the check to absorb. Landing preparation is the model's own: at the
// check the arms open (carriage 1) and the air's inertia eases toward
// inertiaOpen at inertiaPullRate — L conserved, the spin slowed. The check
// is swept; the chain is followed at the check whose airborne rotation is
// nearest the measured 470.5 deg (a diagnostic choice, not a tune).
//
// What the model has, and what it does not — every number below is in its
// terms:
//   roll   the lean: a point mass at leg length on the blade. Its only
//          inertia is m L^2 about the blade; none about the centre of mass.
//          In the air it turns torque-free at blade-off's rate
//          (airPostureMode), so H_roll here is m L^2 x the lean's rate.
//   yaw    J.angMomentum / J.inertia in the air — conserved while the
//          inertia changes. On the ice, the carve's rate.
//   contact  land(): the blade keeps the velocity it points along and
//          scrubs the rest (a lateral impulse at the blade), the arriving
//          vertical speed is stopped (the leg takes it), the spin is
//          stopped (s.yawRate = 0) — and landingShock kicks the lean's rate
//          by landingShock x (1 - landing quality), away from upright.
//
// The touchdown's impulse J and its arm r (CoM to blade: leg length x the
// lean across, the pitch along) give r x J about the CoM. For the lean's own
// dynamics the impact's prediction is the standard one: the impulse acts at
// the contact, so the body's angular momentum about the contact is kept
// through it, and for this point-mass pendulum the lean's rate after is the
// CoM's motion about the stopped blade, (-r x v) / L^2. The top of the report
// sets that change beside what the model's contact applies (nothing) and what
// landingShock applies.

import type { Params } from "../sim/params.ts";
import { FALL_NAME } from "../sim/types.ts";
import type { LandingBudget, SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import type { Frame, Outcome, Variation } from "./takeoff-budget.ts";
import { COHORT, REFERENCE } from "./loop-calibration.ts";
import { stackParams } from "./free-leg-timing.ts";
import { throughAt } from "./swing-through.ts";

export const SWING_START = 0.3, LAND_KNEE = 0.8, RIDE = 1;
export const CHECKS = [0.15, 0.175, 0.2, 0.225, 0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.4, Infinity] as const;
const CALL = ["clean", "q", "<", "<<"];

export function chainParams(args: string[]): Params {
  const p = { ...stackParams(args), freeLegSwingThroughMode: 1 } as Params;
  for (const k of ["freeLegSwingThroughMode", "airPostureMode", "pushMechanicsMode"]) if (!(k in p)) throw Error(`this build has no ${k}`);
  return p;
}

/** One chain run: checked (the landing's preparation begins) at `check` s after blade-off. */
export function chainRun(p: Params, check: number, extra: Variation = {}): { r: Outcome; lb: LandingBudget | null } {
  let s: SkaterState | null = null;
  const r = attempt("held", p, check, {
    ...throughAt(SWING_START), landKnee: LAND_KNEE, rideOut: RIDE, ...extra,
    atTakeoff: st => { st.landingBudget = {} as LandingBudget; s = st; extra.atTakeoff?.(st); },
  });
  const lb = (s as SkaterState | null)?.landingBudget;
  return { r, lb: lb && lb.tick !== undefined ? { ...lb } : null };
}

type V3 = { t: number; n: number; z: number };
const cross = (a: V3, b: V3): V3 => ({ t: a.n * b.z - a.z * b.n, n: a.z * b.t - a.t * b.z, z: a.t * b.n - a.n * b.t });

/**
 * The touchdown in the frame of the heading at contact: t forward, n left
 * (t x n = up), z up. The lean's sign is about -t (a positive lean has the
 * CoM left of the blade), the pitch's about n (toe-ward positive, with the
 * contact behind the CoM).
 */
export function touchdown(lb: LandingBudget, p: Params) {
  const t = lb.heading, n = { x: -t.y, y: t.x }, m = p.mass, L = lb.legLength;
  const along = (v: { x: number; y: number }, a: { x: number; y: number }) => v.x * a.x + v.y * a.y;
  const vPre: V3 = { t: along(lb.velPre, t), n: along(lb.velPre, n), z: lb.vz };
  const vPost: V3 = { t: along(lb.velPost, t), n: along(lb.velPost, n), z: 0 };
  const J: V3 = { t: m * (vPost.t - vPre.t), n: m * (vPost.n - vPre.n), z: m * (vPost.z - vPre.z) };
  // The blade sits leg length x sin(lean) to the right of the CoM (sim/solver.ts section 7), and with the pitch toward the toe, behind it.
  const r: V3 = { t: -L * Math.sin(lb.pitch), n: -L * Math.sin(lb.lean), z: -L * Math.cos(lb.lean) };
  const rJ = cross(r, J);
  // About the contact the impulse has no moment: the pendulum keeps m (-r) x v through it.
  const Hc = cross({ t: -r.t, n: -r.n, z: -r.z }, { t: m * vPre.t, n: m * vPre.n, z: m * vPre.z });
  const I = m * L * L;
  const leanRatePred = -Hc.t / I;
  return {
    vPre, vPost, J, r, rJ, I,
    rJLean: -rJ.t, rJPitch: rJ.n, rJYaw: rJ.z,
    leanRatePre: lb.leanRatePre, leanRatePred, dLeanPred: leanRatePred - lb.leanRatePre,
    dLeanContact: 0, dLeanShock: lb.leanRatePost - lb.leanRatePre,
    HLeanPre: I * lb.leanRatePre, HLeanShock: I * (lb.leanRatePost - lb.leanRatePre),
    HyawPre: lb.L, HyawPost: 0,
  };
}

/** deg: how far the body faces from skating backward along its travel (0 = a backward landing's facing), signed. */
export function offBackward(f: Frame): number {
  const back = Math.atan2(-Math.sin(f.travel), -Math.cos(f.travel));
  let d = f.heading - back;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d * 180 / Math.PI;
}

const fx = (v: number | null | undefined, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? " —" : (v >= 0 ? " " : "") + v.toFixed(d);
const sd = (v: number, [mu, s]: readonly [number, number]) => `${(v - mu) / s >= 0 ? "+" : ""}${((v - mu) / s).toFixed(1)} sd`;
const at = (r: Outcome, t: number) => r.frames.find(f => f.t >= t - 1e-9) ?? null;

export function events(r: Outcome) {
  const air = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
  const bo = air[0] ?? null, last = air.at(-1) ?? null, td = r.landedAt;
  const prep = air.find(f => f.carriage > 0) ?? null;
  const prepEnd = prep ? air.find(f => f.t > prep.t && Math.abs(f.inertia - air.at(-1)!.inertia) < 1e-9) ?? last : null;
  const prepMid = prep && prepEnd ? at(r, (prep.t + prepEnd.t) / 2) : null;
  return {
    bo, apex: bo ? at(r, r.takeoff + r.result.airTime / 2) : null, prep, prepMid, prepEnd,
    pre100: td >= 0 ? at(r, td - 0.1) : null, pre50: td >= 0 ? at(r, td - 0.05) : null, last,
    td: td >= 0 ? at(r, td) : null,
    after: (ms: number) => td >= 0 && (r.fallAt < 0 || r.fallAt >= td + ms / 1000 - 1e-9) ? at(r, td + ms / 1000) : null,
  };
}

function row(name: string, f: Frame | null, p: Params, r: Outcome): string {
  if (!f) return `${name} | —`;
  const onIce = f.phase !== JUMP_PHASE.Air, L = f.comAcross !== 0 ? f.comAcross / Math.sin(f.lean || 1e-9) : p.comHeight;
  const outward = Math.sign(f.lean) === Math.sign(f.leanRate) && f.leanRate !== 0;
  return `${name} | ${fx(f.t - (r.landedAt >= 0 && f.t >= r.landedAt ? r.landedAt : r.takeoff), 3)} | ${fx(f.lean)} | ${fx(f.leanRate)} | ${fx(f.pitch)} | ${fx(f.pitchRate)} | ${fx(f.phase === JUMP_PHASE.Air ? f.omega : f.yawRate)} | ${fx(p.mass * L * L * f.leanRate, 1)} | ${fx(f.phase === JUMP_PHASE.Air ? f.L : NaN, 1)} | ${fx(f.phase === JUMP_PHASE.Air ? f.inertia : NaN)} | ${onIce ? fx(f.comAcross) : " —"} | ${onIce ? (outward ? "out" : "in") : " —"} | ${onIce ? fx(f.bite - Math.abs(f.latForce), 0) : " —"} | ${onIce ? fx(f.yawSlip) : " —"} | ${fx(f.knee)}`;
}

if (import.meta.main) {
  const args = process.argv.slice(2), p = chainParams(args);
  console.log(`cohort body; takeoff frozen at #49 (swing-through from ${SWING_START}T, push ${p.pushOffTime} s); landingShock ${p.landingShock}; knee ${LAND_KNEE} from the check`);

  // ── landing preparation: the check swept ─────────────────────────────────
  console.log("\ncheck s | air deg | at the check deg | added opening deg | I_yaw at check -> TD | omega at check -> TD | H_yaw drift | flags | call | landing");
  let chosen = CHECKS[0] as number, best = Infinity;
  for (const check of CHECKS) {
    const { r } = chainRun(p, check);
    const e = events(r), j = r.result, air = (j.airborne ?? j.turned) * 360;
    const airF = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
    const drift = airF.length ? Math.max(...airF.map(f => Math.abs(f.L - airF[0].L))) : NaN;
    const rotAtCheck = e.prep ? airF.filter(f => f.t <= e.prep!.t).reduce((a, f) => a + f.omega * (1 / 120), 0) * 180 / Math.PI : NaN;
    const flag = e.prep && e.last && e.last.inertia > e.prep.inertia && Math.abs(e.last.omega) >= Math.abs(e.prep.omega) ? "OPENING_DID_NOT_SLOW_ROTATION" : "—";
    const landing = r.landedAt < 0 ? "no touchdown" : !r.fallen ? "rode out" : r.fallAt - r.landedAt < 1e-9 ? "fell at touchdown" : `fell +${((r.fallAt - r.landedAt) * 1000).toFixed(0)} ms ${FALL_NAME[r.fallReason]}`;
    console.log(`${check} | ${air.toFixed(0)} (${sd(air, REFERENCE.airDeg)}) | ${fx(rotAtCheck, 0)} | ${fx(e.prep ? air - rotAtCheck : NaN, 0)} | ${fx(e.prep?.inertia)} -> ${fx(e.last?.inertia)} | ${fx(e.prep?.omega, 1)} -> ${fx(e.last?.omega, 1)} | ${drift.toExponential(1)} | ${flag} | ${r.takeoff < 0 ? "no takeoff" : `${j.revolutions}Lo ${CALL[j.rotationCall]}`} | ${landing}`);
    if (Math.abs(air - REFERENCE.airDeg[0]) < best) { best = Math.abs(air - REFERENCE.airDeg[0]); chosen = check; }
  }
  console.log(`the chain below: check ${chosen} s — the airborne rotation nearest ${REFERENCE.airDeg[0]} deg`);

  // ── every check's touchdown: contact against landingShock ─────────────────
  console.log("\ncheck s | off backward at BO / TD deg | CoM across the blade m/s | J lateral N s | lean rate TD | impact predicts d(lean rate) | model's contact | landingShock | r x J lean | score (check err) | outcome");
  for (const check of CHECKS) {
    const { r, lb } = chainRun(p, check);
    if (!lb) { console.log(`${check} | no touchdown`); continue; }
    const T = touchdown(lb, p), e = events(r);
    const outcome = !r.fallen ? "rode out" : r.fallAt - r.landedAt < 1e-9 ? "fell at the score" : `fell +${((r.fallAt - r.landedAt) * 1000).toFixed(0)} ms ${FALL_NAME[r.fallReason]}`;
    console.log(`${check} | ${fx(e.bo ? offBackward(e.bo) : NaN, 0)} / ${fx(e.last ? offBackward(e.last) : NaN, 0)} | ${fx(T.vPre.n)} | ${fx(T.J.n, 0)} | ${fx(lb.leanRatePre)} | ${fx(T.dLeanPred)} | ${fx(T.dLeanContact)} | ${lb.fall ? " — (not reached)" : fx(T.dLeanShock)} | ${fx(T.rJLean, 1)} | ${lb.landingQuality.toFixed(2)} (${lb.checkErr.toFixed(2)}) | ${outcome}`);
  }

  // ── the chain at the chosen check, and with landingShock 0 ──────────────
  const A = chainRun(p, chosen), B = chainRun({ ...p, landingShock: 0 }, chosen), A2 = chainRun(p, chosen);
  const det = JSON.stringify(A.r.frames) === JSON.stringify(A2.r.frames) && JSON.stringify(A.lb) === JSON.stringify(A2.lb);
  const { r, lb } = A;
  if (!lb) { console.log("no touchdown — nothing to own"); process.exit(0); }
  const T = touchdown(lb, p);

  console.log(`\nTOP LINE (the lean's rate, rad/s, and as H about the blade, m L^2 = ${T.I.toFixed(1)} kg m^2):`);
  console.log(`  what the impact predicts for the lean   ${fx(T.dLeanPred)} rad/s  (${fx(T.I * T.dLeanPred, 1)} kg m^2/s)   [pendulum impact about the contact]`);
  console.log(`  what the model's contact applies        ${fx(T.dLeanContact)} rad/s`);
  console.log(`  what landingShock applies               ${fx(T.dLeanShock)} rad/s  (${fx(T.HLeanShock, 1)} kg m^2/s)`);
  console.log(`  r x J about the CoM, lean axis          ${fx(T.rJLean, 1)} kg m^2/s  (no CoM roll inertia in the model to apply it to)`);

  const e = events(r);
  console.log(`\nstage | t s | roll | roll rate | pitch | pitch rate | yaw rate | H_roll (m L^2 w) | H_yaw | I_yaw | CoM across m | CoM moving | grip left N | slip | knee`);
  for (const [name, f] of [["blade-off", e.bo], ["apex", e.apex], ["landing prep start", e.prep], ["landing prep mid", e.prepMid], ["landing prep end", e.prepEnd],
    ["pre-touchdown -100 ms", e.pre100], ["pre-touchdown -50 ms", e.pre50], ["last air step", e.last]] as [string, Frame | null][]) console.log(row(name, f, p, r));
  const I = T.I;
  console.log(`TD pre-impulse | 0.000 | ${fx(lb.lean)} | ${fx(lb.leanRatePre)} | ${fx(lb.pitch)} | ${fx(lb.pitchRate)} | ${fx(lb.omega)} | ${fx(I * lb.leanRatePre, 1)} | ${fx(lb.L, 1)} | ${fx(lb.inertia)} | — | — | — | — | ${fx(lb.knee)}`);
  console.log(`TD post-physical | 0.000 | ${fx(lb.lean)} | ${fx(lb.leanRatePre)} | ${fx(lb.pitch)} | ${fx(lb.pitchRate)} | ${fx(lb.yawRatePost)} | ${fx(I * lb.leanRatePre, 1)} | ${fx(0, 1)} | — | — | — | — | — | ${fx(lb.knee)}`);
  console.log(`TD post-shock | 0.000 | ${fx(lb.lean)} | ${fx(lb.leanRatePost)} | ${fx(lb.pitch)} | ${fx(lb.pitchRate)} | ${fx(lb.yawRatePost)} | ${fx(I * lb.leanRatePost, 1)} | ${fx(0, 1)} | — | — | — | — | — | ${fx(lb.knee)}`);
  for (const ms of [16, 50, 100, 250, 500]) console.log(row(`+${ms} ms`, e.after(ms), p, r));

  console.log(`\nimpulse table (heading frame at contact; lean axis = -forward, pitch axis = left, yaw = up; kg m^2/s):`);
  console.log(`quantity | lean | pitch | yaw`);
  console.log(`H pre (the model's state) | ${fx(I * lb.leanRatePre, 1)} (m L^2 w) | — (no pitch inertia) | ${fx(lb.L, 1)}`);
  console.log(`r x J, physical, about the CoM | ${fx(T.rJLean, 1)} | ${fx(T.rJPitch, 1)} | ${fx(T.rJYaw, 1)}`);
  console.log(`H after the model's contact | ${fx(I * lb.leanRatePre, 1)} | — | ${fx(0, 1)} (the spin stopped: -${lb.L.toFixed(1)})`);
  console.log(`H the impact predicts (about the contact) | ${fx(I * T.leanRatePred, 1)} | — | —`);
  console.log(`closure: model less prediction | ${fx(I * (lb.leanRatePre - T.leanRatePred), 1)} | — | —`);
  console.log(`dH landingShock | ${fx(T.HLeanShock, 1)} | 0 | 0`);
  console.log(`H after the shock | ${fx(I * lb.leanRatePost, 1)} | — | 0`);
  console.log(`J: lateral ${fx(T.J.n, 0)}, along ${fx(T.J.t, 0)}, vertical ${fx(T.J.z, 0)} N s; r: along ${fx(T.r.t, 3)}, across ${fx(T.r.n, 3)}, down ${fx(T.r.z, 3)} m; CoM velocity at contact: along ${fx(T.vPre.t)}, across ${fx(T.vPre.n)}, vertical ${fx(T.vPre.z)} m/s`);
  console.log(`landing score: ${lb.landingQuality.toFixed(2)} (check error ${lb.checkErr.toFixed(2)}, absorb ${lb.absorb.toFixed(2)}, edge ${lb.edgeOK.toFixed(2)}, balance ${lb.balance.toFixed(2)}${lb.twoFoot ? ", two feet" : ""})${lb.fall ? " — FALL at the touchdown's score" : ""}`);

  // ── landingShock A/B ──────────────────────────────────────────────────────
  const eb = events(B.r);
  console.log(`\nlandingShock A/B (diagnostic only): | +100 ms roll / rate | +250 ms | +500 ms | outcome`);
  for (const [name, x, ev] of [["as is", r, e], ["landingShock 0", B.r, eb]] as const) {
    const s = (ms: number) => { const f = ev.after(ms); return f ? `${fx(f.lean)} / ${fx(f.leanRate)}` : " —"; };
    console.log(`${name} | ${s(100)} | ${s(250)} | ${s(500)} | ${x.landedAt < 0 ? "no touchdown" : !x.fallen ? "rode out" : `fell +${((x.fallAt - x.landedAt) * 1000).toFixed(0)} ms ${FALL_NAME[x.fallReason]}`}`);
  }

  // ── recovery: the fall's owner ────────────────────────────────────────────
  const ice = r.frames.filter(f => r.landedAt >= 0 && f.t >= r.landedAt && f.phase !== JUMP_PHASE.Air);
  const minGrip = ice.length ? Math.min(...ice.map(f => f.bite - Math.abs(f.latForce))) : NaN;
  const peakSlip = ice.length ? Math.max(...ice.map(f => Math.abs(f.yawSlip))) : NaN;
  const maxRoll = ice.length ? Math.max(...ice.map(f => Math.abs(f.lean))) : NaN;
  const j = r.result;
  console.log(`\nLANDING CHAIN SUMMARY`);
  console.log(`  blade-off: roll ${fx(e.bo?.lean)} at ${fx(e.bo?.leanRate)} rad/s, pitch ${fx(e.bo?.pitch)} at ${fx(e.bo?.pitchRate)}; H_yaw ${fx(e.bo?.L, 1)}; L ${(r.L / (p.mass * COHORT.height ** 2) * 1e3).toFixed(1)} x10^-3`);
  console.log(`  preparation: from ${fx(e.prep ? e.prep.t - r.takeoff : NaN, 3)} s to ${fx(e.prepEnd ? e.prepEnd.t - r.takeoff : NaN, 3)} s; I_yaw ${fx(e.prep?.inertia)} -> ${fx(e.prepEnd?.inertia)}; yaw rate ${fx(e.prep?.omega, 1)} -> ${fx(e.prepEnd?.omega, 1)}; air ${((j.airborne ?? j.turned) * 360).toFixed(0)} deg, ${j.revolutions}Lo ${CALL[j.rotationCall]}`);
  console.log(`  pre-touchdown: roll ${fx(lb.lean)} at ${fx(lb.leanRatePre)}, pitch ${fx(lb.pitch)} at ${fx(lb.pitchRate)}, yaw ${fx(lb.omega, 1)} rad/s, CoM across ${fx(T.vPre.n)} m/s of travel off the blade, vertical ${fx(lb.vz)} m/s`);
  console.log(`  touchdown: lateral impulse ${fx(T.J.n, 0)} N s at ${fx(-T.r.z, 2)} m below the CoM; the impact predicts ${fx(T.dLeanPred)} rad/s on the lean, the model's contact applies 0, landingShock ${lb.fall ? "not reached" : fx(T.dLeanShock)}; the spin (${lb.L.toFixed(1)} kg m^2/s) is stopped outright`);
  const flags: string[] = [];
  if (Math.abs(T.dLeanPred - T.dLeanContact) > 0.5) flags.push(`TOUCHDOWN_ANGULAR_IMPULSE_MISMATCH (lean): the impact predicts ${fx(T.dLeanPred)} rad/s, the contact applies ${fx(T.dLeanContact)}`);
  if (Math.abs(-lb.L - T.rJYaw) > 1) flags.push(`TOUCHDOWN_ANGULAR_IMPULSE_MISMATCH (yaw): the contact removes ${lb.L.toFixed(1)} kg m^2/s of spin, r x J accounts for ${fx(T.rJYaw, 1)}`);
  const off = e.last ? offBackward(e.last) : NaN;
  if (Math.abs(off) > 45) flags.push(`CROSSWAYS_TOUCHDOWN: ${off.toFixed(0)} deg off a backward landing, ${fx(T.vPre.n)} m/s across the blade`);
  for (const f of flags) console.log(`  FLAG ${f}`);
  console.log(`  owner: the skater leaves facing ${fx(e.bo ? offBackward(e.bo) : NaN, 0)} deg off backward along its travel, rolling ${fx(e.bo?.lean)} at ${fx(e.bo?.leanRate)} rad/s; torque-free flight carries the roll to ${fx(lb.lean)} at ${fx(lb.leanRatePre)}; ${((j.airborne ?? j.turned) * 360).toFixed(0)} deg of air lands it ${off.toFixed(0)} deg off its travel; the blade's impulse would change the lean's rate by ${fx(T.dLeanPred)} rad/s and the model applies ${fx(T.dLeanContact)}; landingShock ${lb.fall ? "never runs (the touchdown's score falls it first)" : `adds ${fx(T.dLeanShock)}`}; ${r.fallen ? (r.fallAt - r.landedAt < 1e-9 ? "it falls at the touchdown's score" : `it falls +${((r.fallAt - r.landedAt) * 1000).toFixed(0)} ms (${FALL_NAME[r.fallReason]})`) : "it rides out"}.`);
  console.log(`  recovery: least grip ${fx(minGrip, 0)} N, peak slip ${fx(peakSlip)} rad/s, largest roll ${fx(maxRoll)} rad; ${r.fallen ? `fell +${((r.fallAt - r.landedAt) * 1000).toFixed(0)} ms (${FALL_NAME[r.fallReason] || "at the touchdown's score"})` : "rode out 1 s"}; deterministic ${det ? "yes" : "NO"}`);
}
