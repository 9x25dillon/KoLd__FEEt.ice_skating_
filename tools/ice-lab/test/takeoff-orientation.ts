// node test/takeoff-orientation.ts [--ticks] [--set key=value ...]
// Orientation audit, not a target pose or a takeoff actuator. The reference
// 470.5 degrees is SHOULDER rotation (Yamaguchi & Sakurai 2025, section 2.3).
// It does not measure blade pre-rotation or a required takeoff facing angle.

import { JUMP_PHASE } from "../sim/jump.ts";
import type { LandingBudget } from "../sim/types.ts";
import type { Frame, Outcome } from "./takeoff-budget.ts";
import { chainParams, chainRun, contactOffBackward, offBackward } from "./landing-chain.ts";

const DEG = 180 / Math.PI;
/** Signed principal angle, for comparing orientations, not counting turns. */
export const principal = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
type Heading = "heading" | "bladeHeading" | "shoulderHeading" | "travel";

/** Unwrap tick by tick: an airborne double must not collapse to its remainder. */
export function turnOf(frames: readonly Frame[], key: Heading): number {
  let turn = 0;
  for (let i = 1; i < frames.length; i++) turn += principal(frames[i][key] - frames[i - 1][key]);
  return turn * DEG;
}

export function orientation(r: Outcome, lb: LandingBudget) {
  const load = r.frames.findIndex(f => f.phase === JUMP_PHASE.Load);
  const off = r.frames.findIndex(f => f.phase === JUMP_PHASE.Air);
  const td = r.frames.findIndex(f => f.tick === lb.tick);
  if (load < 0 || off < load || td <= off) throw Error("orientation needs load, blade-off and first touchdown frames");
  const ground = r.frames.slice(load, off + 1), air = r.frames.slice(off, td + 1);
  const bo = r.frames[off], last = r.frames[td - 1], touchdown = r.frames[td];
  const hips = turnOf(air, "heading"), shoulders = turnOf(air, "shoulderHeading");
  const preTravel = Math.atan2(lb.velPre.y, lb.velPre.x);
  const offDeg = offBackward(bo), contactDeg = contactOffBackward(lb);
  const travelAir = principal(preTravel - bo.travel) * DEG;
  const predicted = principal((offDeg + hips - travelAir) / DEG) * DEG;
  return {
    load: ground[0], bo, last, touchdown,
    groundBody: turnOf(ground, "heading"), groundBlade: turnOf(ground, "bladeHeading"),
    groundShoulders: turnOf(ground, "shoulderHeading"), groundTravel: turnOf(ground, "travel"),
    groundRelative: turnOf(ground, "heading") - turnOf(ground, "travel"),
    offBody: offDeg, offBlade: offBackward({ heading: bo.bladeHeading, travel: bo.travel }),
    offShoulders: offBackward({ heading: bo.shoulderHeading, travel: bo.travel }),
    airBody: hips, airShoulders: shoulders, airTravel: travelAir,
    twistAtOff: (bo.shoulderHeading - bo.heading) * DEG,
    twistAtContact: (touchdown.shoulderHeading - touchdown.heading) * DEG,
    contactBody: contactDeg,
    contactShoulders: offBackward({ heading: touchdown.shoulderHeading, travel: preTravel }),
    lastAirBody: offBackward(last),
    closure: principal((contactDeg - predicted) / DEG) * DEG,
    checkDeg: lb.checkErr * 180,
    // A geometric counterfactual under this model's rigid airborne heading;
    // NOT a measured takeoff angle. No state is changed to produce it.
    requiredOffForRigidBackward: principal((-hips + travelAir) / DEG) * DEG,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2), p = chainParams(args);
  const variants = [
    ["held / swing-through", {}],
    ["held / free leg resting", { swing: undefined }],
    ["toe + hook / swing-through", { toe: 1, toeAt: 0, hook: 0.2 }],
  ] as const;
  console.log("degrees, CCW positive; check opens at 0.375 s; physics/controls unchanged by this tool");
  console.log("scenario | ground body / blade / shoulders / travel | body minus travel | BO body / blade / shoulders off backward | air body / shoulders | contact off backward | check error | closure");
  for (const [name, v] of variants) {
    const { r, lb } = chainRun(p, 0.375, v);
    if (!lb) { console.log(`${name} | no touchdown`); continue; }
    const a = orientation(r, lb), f = (n: number) => n.toFixed(3);
    console.log(`${name} | ${[a.groundBody, a.groundBlade, a.groundShoulders, a.groundTravel].map(f).join(" / ")} | ${f(a.groundRelative)} | ${[a.offBody, a.offBlade, a.offShoulders].map(f).join(" / ")} | ${f(a.airBody)} / ${f(a.airShoulders)} | ${f(a.contactBody)} | ${f(a.checkDeg)} | ${a.closure.toExponential(2)}`);
    if (name === variants[0][0]) {
      console.log(`  touchdown tick ${lb.tick}, last-air tick ${a.last.tick}: ${f(a.contactBody)} vs ${f(a.lastAirBody)} deg off backward`);
      console.log(`  trunk twist at BO / contact: ${f(a.twistAtOff)} / ${f(a.twistAtContact)} deg (air currently freezes the relative pose)`);
      console.log(`  rigid-body counterfactual: BO offset ${f(a.requiredOffForRigidBackward)} deg would align this air rotation; NOT an observed angle or a physics prescription`);
      console.log(`  shoulder reference: 470.5 +/- 23.9 deg; its endpoints relative to the blade/travel are not reported`);
      if (args.includes("--ticks")) {
        console.log("  tick | phase | body | blade | shoulders | travel | body off backward");
        for (const x of r.frames.filter(x => x.tick >= a.load.tick && x.tick <= lb.tick)) {
          const travel = x.tick === lb.tick ? Math.atan2(lb.velPre.y, lb.velPre.x) : x.travel;
          console.log(`  ${x.tick} | ${x.phase} | ${[x.heading, x.bladeHeading, x.shoulderHeading, travel].map(x => f(x * DEG)).join(" | ")} | ${f(offBackward({ heading: x.heading, travel }))}`);
        }
      }
    }
  }
}
