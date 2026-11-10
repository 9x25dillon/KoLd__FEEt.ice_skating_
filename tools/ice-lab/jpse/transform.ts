// tools/ice-lab/jpse/transform.ts — the four entrance candidates.
//
// Issue #74, JPSE first slice. A candidate is an INPUT PROGRAM: the stream of
// SkatingInput the solver is fed, one per tick, plus the speed it starts
// with. The transforms rewrite that stream and nothing else. No candidate
// writes solver state, so Ice Lab alone decides what each one does.
//
// The two transforms, defined on the ice:
//
//   mirror   Reflect the whole entrance across its own entry line. The left
//            foot does what the right did and every lateral quantity changes
//            sign: lean, the blades' tilt/pitch/knee/toe-out split, the arms'
//            wind-up (a mirrored skater rotates clockwise). The trace on the
//            ice comes out as (x, -y).
//
//   reverse  Travel the other way in the same stance: the same foot, the same
//            lean, the same blade pointing the same way, but moving forward
//            where the canonical moved backward (or the reverse). This is
//            P(L - s) from the issue made into a skating instruction: the
//            curve on the ice is traversed the other way round.
//
// Neither transform claims technique equivalence (the owner's review, issue
// #74). A mirrored loop is a clockwise skater's loop, which this solver does
// not model (sim/jump.ts, the rotation note). A reversed back-outside entry
// is a forward-outside one, which no CCW jump takes off except the axel, from
// the other foot. These are geometric coverage cases. Each one keeps the
// canonical's jump-definition constraints and is judged against them.

import type { SkatingInput } from "../sim/types.ts";

export interface Transform { mirror: boolean; reverse: boolean }

export const CANDIDATES: ReadonlyArray<{ id: string; transform: Transform }> = [
  { id: "canonical", transform: { mirror: false, reverse: false } },
  { id: "mirror", transform: { mirror: true, reverse: false } },
  { id: "reverse", transform: { mirror: false, reverse: true } },
  { id: "mirror+reverse", transform: { mirror: true, reverse: true } },
];

/** SkatingInput fields that change sign under the mirror. Everything else is unchanged. */
const MIRROR_NEGATE = ["lean", "leanSplit", "pitchSplit", "kneeSplit", "toeOutSplit", "windup"] as const;

export function mirrorInput(i: SkatingInput): SkatingInput {
  const o: SkatingInput = { ...i, weight: 1 - i.weight };
  for (const k of MIRROR_NEGATE) {
    const v = i[k];
    if (v !== undefined) o[k] = v === 0 ? 0 : -v;   // never write -0: it changes a digest
  }
  if (i.pushFoot !== undefined) o.pushFoot = 1 - i.pushFoot;
  return o;
}

export interface Program { speed: number; inputs: readonly SkatingInput[] }

export function applyTransform(prog: Program, t: Transform): Program {
  return {
    speed: t.reverse ? -prog.speed : prog.speed,
    inputs: t.mirror ? prog.inputs.map(mirrorInput) : prog.inputs.map((i) => ({ ...i })),
  };
}
