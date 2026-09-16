import { PRESETS } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import type { Controls } from "../app/pad.ts";
import { applyScheme, SCHEME } from "../app/schemes.ts";
import type { Scheme, SchemeState } from "../app/schemes.ts";

export const GAME_PARAMS = { ...PRESETS.assisted, movesMode: 1, jumpMode: 2, musicMode: 1 };
export const CONTROL_NAMES = ["Lean & load", "Assisted steering", "Two-foot control"];

/** Game-only mapping; the lab's blind control schemes and replay contract stay intact. */
export function gameInput(c: Controls, s: SkaterState, scheme: Scheme, st: SchemeState, lowPose = false, params: Params = GAME_PARAMS) {
  const backward = s.vel.x * s.heading.x + s.vel.y * s.heading.y < -0.1;
  const heading = scheme === SCHEME.B && backward ? { x: -s.heading.x, y: -s.heading.y } : s.heading;
  // Digital direct-lean controls need a manageable shallow edge. Analog retains full range.
  const mapped = scheme === SCHEME.B ? c : { ...c,
    kx: c.kx * 0.35, kPrimaryX: c.kPrimaryX * 0.35, kAltX: c.kAltX * 0.35 };
  const input = applyScheme(scheme, mapped, heading, s.vel, s.yawRate, params, st, s.flips);
  // A low pose cannot also arm the wind-up assist, including on a controller.
  if (lowPose) input.windup = 0;
  if (scheme === SCHEME.B && backward) input.lean *= -1;
  // Right-stick forward can select camel on a controller, too.
  if (c.spin || s.move === MOVE.Spin) input.pitch = Math.max(input.pitch, c.ry);
  // A simplified cantilever pose over a two-foot glide, not a new balance solver.
  // Below the load threshold so releasing the pose cannot accidentally launch a jump.
  const cantilever = lowPose && !s.fallen && s.move === MOVE.None && s.jump.phase === JUMP_PHASE.None
    && Math.hypot(s.vel.x, s.vel.y) >= 1 && !c.turn && !c.bracket && !c.spin && !c.twizzle && !c.inaBauer;
  if (cantilever) {
    input.knee = 0.65; input.weight = 0.5; input.pitch = -0.25;
    input.push = false; input.toe = false; input.carriage = 1;
  }
  return { input, cantilever };
}
