// The double loop from blade-off to half a second on the ice: was the landing
// doomed at blade-off, or did it become so on the ice?
//
//   node test/air-posture.ts [--set key=value ...]
//
// Three takeoffs (test/takeoff-budget.ts's held loop, checked out at the
// check that lands it best — 2 revolutions first, then the touchdown's
// score — with the knee bent to 0.8 from the check to absorb):
// the calibration's (test/loop-calibration.ts: the free leg swung back 0.5 s
// into the load), and the committed edge's best, onto the toe with the hook,
// at edgeCommitTime 0.05 and 0.2 s. The push-off, normalLoadMode, the
// takeoff-and-air call, edge commitment and airPostureMode are on unless a
// --set says 0.
//
// For each: a row at blade-off, the apex, the last tick in the air, the
// touchdown and +100, +250, +500, +1000 ms — the lean and its rate (the roll), the
// pitch and its rate, the centre of mass across the blade, the blade's tilt,
// the grip left (bite less the lateral force), the knee, the lean the landing
// edge balances and the error from it. The model has no roll or pitch
// inertia (the lateral pendulum is a point mass at leg length; the tuck moves
// the yaw inertia alone), so the roll's angular momentum is shown as its rate:
// in this model the two are conserved together.
//
// Then the fork, in the model's own terms (a landing rides out when it is
// still up a second after the touchdown):
//   roll out   the same run with the lean's rate zeroed at blade-off (the
//              pre-airPostureMode takeoff) — the roll launched, taken away;
//   pitch out  the pitch's rate zeroed at blade-off;
//   catch      landing inputs swept (the lean asked -0.6 .. 0.6, the knee
//              0.35 and 0.8): does any ride out 1 s?
// If the landing holds with the roll out and no input catches it with the
// roll in, the roll launched at blade-off is what dooms it; if some input
// catches it, the takeoff was survivable and the landing is the question.
//
// No reference for the tilt: the Frontiers 2025 double loop reports the
// vertical axis only, and the one study found with a measured take-off tilt
// (MDPI Proceedings 49:124) is not open to fetch. Coaching sources say only
// that a tilt taken off with is not straightened in the air — which is what
// torque-free flight gives.

import type { Params } from "../sim/params.ts";
import { FALL_NAME } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt } from "./takeoff-budget.ts";
import type { Frame, Outcome, Variation } from "./takeoff-budget.ts";
import { overridden } from "./loop-comparison.ts";

export const RIDE_OUT = 1;
const CALL = ["clean", "q", "<", "<<"];

export const TAKEOFFS: [string, Partial<Params>, Variation][] = [
  ["calibration (free leg back)", {}, { freeLegAt: 0.5, freeLegTo: 0 }],
  ["toe + hook, commit 0.05 s", { edgeCommitTime: 0.05 }, { freeLegAt: 0.5, freeLegTo: 0, toe: 1, toeAt: 0, hook: 0.2 }],
  ["toe + hook, commit 0.2 s", { edgeCommitTime: 0.2 }, { freeLegAt: 0.5, freeLegTo: 0, toe: 1, toeAt: 0, hook: 0.2 }],
];

/** The base Params: the calibration's modes and airPostureMode on unless a --set turned one off. */
export function postureBase(args: string[]): Params {
  const base = { ...overridden(args) } as unknown as Record<string, number>;
  for (const k of ["pushOffMode", "normalLoadMode", "rotationCallMode", "edgeCommitMode", "airPostureMode"])
    if (!args.includes(`${k}=0`)) base[k] = 1;
  return base as unknown as Params;
}

export const LAND_KNEE = 0.8;

/** One takeoff, checked at `check` s after blade-off, ridden out RIDE_OUT s past the touchdown. */
export function ride(p: Params, v: Variation, check: number, extra: Variation = {}): Outcome {
  return attempt("held", p, check, { landKnee: LAND_KNEE, ...v, rideOut: RIDE_OUT, ...extra });
}

/** s: the check, 0.1-0.45 by 0.025, whose touchdown is best — a double first, then the landing's score. */
export function bestCheck(p: Params, v: Variation): number {
  let best = Infinity, score = -Infinity;
  for (let check = 0.1; check <= 0.45 + 1e-9; check += 0.025) {
    const j = attempt("held", p, check, { landKnee: LAND_KNEE, ...v }).result;
    const sc = (j.revolutions === 2 ? 10 : 0) + j.landingQuality - (j.fall ? 5 : 0);
    if (sc > score) { score = sc; best = check; }
  }
  return best;
}

/** The timeline's frames: blade-off, apex, pre-touchdown, touchdown, +100, +250, +500, +1000 ms. */
export function timeline(r: Outcome): [string, Frame | null][] {
  const at = (t: number) => r.frames.find(f => f.t >= t - 1e-9) ?? null;
  const air = r.frames.filter(f => f.phase === JUMP_PHASE.Air);
  const td = r.landedAt >= 0 ? at(r.landedAt) : null;
  const after = (ms: number) => r.landedAt >= 0 && (r.fallAt < 0 || r.fallAt >= r.landedAt + ms / 1000 - 1e-9) ? at(r.landedAt + ms / 1000) : null;
  const apexT = r.takeoff >= 0 && r.result.airTime > 0 ? r.takeoff + r.result.airTime / 2 : -1;
  return [
    ["blade-off", r.takeoff >= 0 ? at(r.takeoff) : null],
    ["apex", apexT >= 0 ? at(apexT) : null],
    ["pre-touchdown", air.at(-1) ?? null],
    ["touchdown", td],
    ["+100 ms", after(100)],
    ["+250 ms", after(250)],
    ["+500 ms", after(500)],
    ["+1000 ms", after(1000)],
  ];
}

/** How it ended, in a phrase. */
export function verdict(r: Outcome): string {
  if (r.takeoff < 0) return r.fallen ? "fell on the ice before takeoff" : "no takeoff";
  const j = r.result, call = `${j.revolutions}Lo ${CALL[j.rotationCall]}`;
  if (r.landedAt < 0) return `${call}, no touchdown`;
  if (!r.fallen) return `${call}, rode out ${RIDE_OUT} s`;
  const when = r.fallAt - r.landedAt;
  return `${call}, fell ${when < 1e-9 ? "at touchdown (the landing's score)" : `+${(when * 1000).toFixed(0)} ms (${FALL_NAME[r.fallReason]})`}`;
}

const fx = (v: number, d = 2) => (v >= 0 ? " " : "") + v.toFixed(d);

function printTimeline(r: Outcome): void {
  console.log("  point | t s | lean | lean rate | pitch | pitch rate | CoM across m | blade tilt | grip left N | knee | leanEq | balance err | yaw rate");
  for (const [name, f] of timeline(r)) {
    if (!f) { console.log(`  ${name} | —`); continue; }
    const t = f.t - (r.landedAt >= 0 && f.t >= r.landedAt ? r.landedAt : r.takeoff);
    console.log(`  ${name} | ${fx(t, 3)} | ${fx(f.lean)} | ${fx(f.leanRate)} | ${fx(f.pitch)} | ${fx(f.pitchRate)} | ${fx(f.comAcross)} | ${fx(f.tilt)} | ${fx(f.bite - Math.abs(f.latForce), 0)} | ${fx(f.knee)} | ${fx(f.leanEq)} | ${fx(f.balanceError)} | ${fx(f.yawRate)}`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2), base = postureBase(args);
  for (const [name, over, v] of TAKEOFFS) {
    const p = { ...base, ...over };
    const check = bestCheck(p, v), r = ride(p, v, check);
    console.log(`\n${name}: checked at ${check.toFixed(3)} s, touchdown score ${r.result.landingQuality.toFixed(2)}, takeoff L ${r.L.toFixed(1)}, flight ${r.result.airTime.toFixed(3)} s, takeoff balance error ${fx(r.frames.filter(f => f.phase !== JUMP_PHASE.Air && f.t < r.takeoff).at(-1)?.balanceError ?? 0)} — ${verdict(r)}`);
    printTimeline(r);
    const rollOut = ride(p, v, check, { atTakeoff: (s: SkaterState) => { s.leanRate = 0; } });
    const pitchOut = ride(p, v, check, { atTakeoff: (s: SkaterState) => { if (s.pitchRate !== undefined) s.pitchRate = 0; } });
    const bothOut = ride(p, v, check, { atTakeoff: (s: SkaterState) => { s.leanRate = 0; if (s.pitchRate !== undefined) s.pitchRate = 0; } });
    console.log(`  roll out: ${verdict(rollOut)} | pitch out: ${verdict(pitchOut)} | both out: ${verdict(bothOut)}`);
    const caught: string[] = [];
    for (const landLean of [-0.6, -0.3, 0, 0.3, 0.6]) for (const landKnee of [0.35, 0.8]) {
      const c = ride(p, v, check, { landLean, landKnee });
      caught.push(`${landLean}/${landKnee}: ${c.landedAt >= 0 && !c.fallen ? "rode out" : c.fallAt >= 0 && c.landedAt >= 0 ? `+${((c.fallAt - c.landedAt) * 1000).toFixed(0)} ms ${FALL_NAME[c.fallReason] || ""}`.trim() : verdict(c)}`);
    }
    console.log(`  catch (lean asked / knee): ${caught.join(" · ")}`);
  }
}
