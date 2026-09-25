// The double loop against its measured envelope, like for like.
//
//   node test/loop-calibration.ts [--set key=value ...]
//
// The reference is the women's double loop of Frontiers in Sports and Active
// Living 2025, "Comparisons of angular momentum at takeoff in six types of
// jumps in women's figure skating" (46.9 +- 3.7 kg, 1.55 +- 0.04 m): flight
// 0.443 +- 0.025 s, 470.5 +- 23.9 deg in the air, 1063.9 +- 54.7 deg/s,
// takeoff angular momentum 140.2 +- 11.2 x 10^-3 s^-1 of mass x height^2.
//
// Two bodies skate the same clean-input jump (test/takeoff-budget.ts: the
// held back outside edge, loaded 0.5 s, the push-off, the free leg swung back
// 0.5 s in, tucked to the ice), both with the push-off, normalLoadMode and the
// takeoff-and-air call on: the production skater (55 kg; no stature in the
// model, so 1.73 m from comHeight 0.95 at 0.55 of height, an assumption), and
// a calibration skater the cohort's size, never shipped. The calibration body
// is the production one scaled geometrically: mass to 46.9 kg, lengths by
// 1.55 / 1.73, inertias by mass x height^2, torques and stiffnesses by mass x
// height — so the same motions take the same angular accelerations.
// Everything else (speeds, the vertical impulse, the controller's gains) is
// left as it is: the discrepancies that survive are the model's.

import type { Params } from "../sim/params.ts";
import { attempt } from "./takeoff-budget.ts";
import { overridden } from "./loop-comparison.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

export const COHORT = { mass: 46.9, height: 1.55 };
export const REFERENCE = {
  flight: [0.443, 0.025], airDeg: [470.5, 23.9], airOmegaDeg: [1063.9, 54.7], Lnorm: [140.2e-3, 11.2e-3],
} as const;
/** m. No stature in the model: comHeight at 0.55 of height (an assumption). */
export const statureOf = (p: Params): number => p.comHeight / 0.55;

/** The production skater scaled to the cohort's body (see the header). */
export function cohortBody(base: Params): Params {
  const h0 = statureOf(base), kL = COHORT.height / h0, kM = COHORT.mass / base.mass;
  const kI = kM * kL * kL, kT = kM * kL;
  return {
    ...base, mass: COHORT.mass,
    comHeight: base.comHeight * kL, freeLegReach: base.freeLegReach * kL, stanceHalfWidth: base.stanceHalfWidth * kL,
    inertiaOpen: base.inertiaOpen * kI, inertiaTucked: base.inertiaTucked * kI, jumpInertiaTucked: base.jumpInertiaTucked * kI,
    lowerBodyInertia: base.lowerBodyInertia * kI, staminaInertiaFloorMax: base.staminaInertiaFloorMax * kI, inertiaPullRate: base.inertiaPullRate * kI,
    twistTorqueMax: base.twistTorqueMax * kT, twistStiffness: base.twistStiffness * kT, twistDamping: base.twistDamping * kT,
    armsWhipTorque: base.armsWhipTorque * kT,
    freeLegTorqueMax: base.freeLegTorqueMax * kT, freeLegStiffness: base.freeLegStiffness * kT, freeLegDamping: base.freeLegDamping * kT,
  };
}

/** The jump on one body, in the reference's terms. */
export function measure(p: Params, height: number) {
  const r = attempt("held", p, Infinity, { freeLegAt: 0.5, freeLegTo: 0 });
  const j = r.result, flight = j.airTime, air = (j.airborne ?? j.turned) * 360;
  const ice = r.frames.filter(f => f.phase !== JUMP_PHASE.Air && (r.takeoff < 0 || f.t < r.takeoff));
  return {
    L: r.L, Lnorm: r.L / (p.mass * height * height), flight, airDeg: air, airOmegaDeg: flight > 0 ? air / flight : 0,
    vz: j.height > 0 ? Math.sqrt(2 * p.gravity * j.height) : 0, impulse: j.height > 0 ? p.mass * Math.sqrt(2 * p.gravity * j.height) : 0,
    edgeDeg: (j.takeoffEdge ?? 0) * 360, pivotDeg: (j.takeoffPivot ?? 0) * 360,
    call: j.rotationCall, revolutions: j.revolutions, shortDeg: j.shortBy * 360, fell: r.fallen, meanI: flight > 0 ? r.L / (air / flight * Math.PI / 180) : 0,
    tookOff: r.takeoff >= 0, iceFrames: ice.length,
  };
}

const CALL = ["clean", "q", "<", "<<"];
const sd = (v: number, [m, s]: readonly [number, number]) => `${((v - m) / s >= 0 ? "+" : "")}${((v - m) / s).toFixed(1)} sd`;

if (import.meta.main) {
  const base = { ...overridden(process.argv.slice(2)) };
  for (const k of ["pushOffMode", "normalLoadMode", "rotationCallMode"] as const)
    if (!process.argv.includes(`${k}=0`)) (base as unknown as Record<string, number>)[k] = 1;
  const bodies: [string, Params, number][] = [["production", base, statureOf(base)], ["cohort", cohortBody(base), COHORT.height]];
  console.log("body | kg | m | L | L/(m h^2) x10^-3 | flight s | air deg | air deg/s | mean I | vz m/s | impulse N s | edge deg | pivot deg | call");
  for (const [name, p, h] of bodies) {
    const m = measure(p, h);
    console.log(`${name} | ${p.mass.toFixed(1)} | ${h.toFixed(2)} | ${m.L.toFixed(1)} | ${(m.Lnorm * 1e3).toFixed(1)} (${sd(m.Lnorm, REFERENCE.Lnorm)}) | ${m.flight.toFixed(3)} (${sd(m.flight, REFERENCE.flight)}) | ${m.airDeg.toFixed(0)} (${sd(m.airDeg, REFERENCE.airDeg)}) | ${m.airOmegaDeg.toFixed(0)} (${sd(m.airOmegaDeg, REFERENCE.airOmegaDeg)}) | ${m.meanI.toFixed(2)} | ${m.vz.toFixed(2)} | ${m.impulse.toFixed(0)} | ${m.edgeDeg.toFixed(0)} | ${m.pivotDeg.toFixed(0)} | ${m.tookOff ? `${m.revolutions}Lo ${CALL[m.call]} (${m.shortDeg.toFixed(0)} deg short)${m.fell ? ", fell" : ""}` : "no takeoff"}`);
  }
  const g = base.gravity, need = g * REFERENCE.flight[0] / 2;
  console.log(`reference | ${COHORT.mass} | ${COHORT.height} | ${(REFERENCE.Lnorm[0] * COHORT.mass * COHORT.height ** 2).toFixed(1)} | ${(REFERENCE.Lnorm[0] * 1e3).toFixed(1)} | ${REFERENCE.flight[0]} | ${REFERENCE.airDeg[0]} | ${REFERENCE.airOmegaDeg[0]} | ${(REFERENCE.Lnorm[0] * COHORT.mass * COHORT.height ** 2 / (REFERENCE.airOmegaDeg[0] * Math.PI / 180)).toFixed(2)} | ${need.toFixed(2)} (for 0.443 s) | ${(COHORT.mass * need).toFixed(0)} | — | — |`);
}
