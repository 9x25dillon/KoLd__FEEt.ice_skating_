// game/backstart.ts — backward skating from a stop (the owner, 2026-11-27: "stick back + A").
//
// From a stop, the left stick pulled back (onto the heels; keyboard S) together with a push asks
// the solver for a backward push, a C-cut start (SkatingInput.pushBack). It is the solver's own
// backward stroke, at its measured strength (backPushScale 0.91, data/motion-primitives.json),
// just started from rest; the solver ignores the ask once she is moving, so it cannot flip the
// direction mid-skate. Every setup and scheme maps through here, so it reads the same everywhere.

import type { Params } from "../sim/params.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { MOVE } from "../sim/types.ts";

/** How far back the stick must be (pitch, -1 heel .. 1 toe). AUTHORED: half travel, clear of a resting thumb. */
export const BACK_START_PITCH = -0.5;

/** Whether this tick's input, on this skater, is a backward start from a stop. */
export function isBackStart(input: SkatingInput, s: SkaterState, p: Params): boolean {
  if (!input.push || s.fallen || s.jump.phase !== JUMP_PHASE.None || s.move !== MOVE.None) return false;
  if (input.pitch > BACK_START_PITCH) return false;
  return Math.abs(s.vel.x * s.heading.x + s.vel.y * s.heading.y) < p.dirSpeedEps;
}

/** The input with `pushBack` set when it is a backward start; otherwise the same object, untouched. */
export function withBackStart<T extends { input: SkatingInput }>(mapped: T, s: SkaterState, p: Params): T {
  if (isBackStart(mapped.input, s, p)) mapped.input.pushBack = true;
  return mapped;
}
