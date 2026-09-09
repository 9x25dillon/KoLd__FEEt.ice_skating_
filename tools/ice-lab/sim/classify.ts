// tools/ice-lab/sim/classify.ts — continuous blade state -> the discrete
// vocabulary that scoring, coaching and element validation read.
//
// This is the layer everything downstream depends on being honest. A jump's
// takeoff-edge call, a step sequence's turn inventory, the Skating Skills
// proxy and every coaching line of the form "your edge flattened 180 ms before
// takeoff" are all queries over what this module emits. If the edges are
// approximated here, nothing above can be exact.

import { EDGE, DIR, DEPTH, EDGE_CODE_NONE, makeCode, codeSide, codeDir } from "./types.ts";
import type { Foot, Edge, Dir, Depth } from "./types.ts";
import type { Params } from "./params.ts";

/**
 * Which side of the hollow is engaged.
 *
 * THE RULE, ONCE:
 *   tilt > 0 means the top of the blade leans toward perpLeft(tangent).
 *   The LEFT foot leaning left leans AWAY from the body's midline  -> OUTSIDE.
 *   The RIGHT foot leaning left leans TOWARD the body's midline    -> INSIDE.
 *
 * so `outside = (foot is Left) === (tilt > 0)`.
 *
 * Hysteresis is applied to the MAGNITUDE only, and the side is always read
 * from the current sign. That distinction matters: holding the previously
 * committed side through the dead band — which is what a naive reading of the
 * engineering package does — reports the wrong edge whenever the tilt crosses
 * through zero to the other side while still inside the band. A skater rolling
 * from an outside to an inside edge would be told they were still on the
 * outside one for as long as the roll took, which is exactly the moment a
 * three-turn or a rocker needs to be timed from.
 */
export function classifyEdgeSide(
  foot: Foot, tilt: number, prevCode: number, p: Params,
): Edge {
  const wasFlat = prevCode === EDGE_CODE_NONE || codeSide(prevCode) === EDGE.Flat;
  const enter = p.flatThreshold + p.flatHysteresis;
  const leave = p.flatThreshold - p.flatHysteresis;
  const a = Math.abs(tilt);
  if (wasFlat ? a <= enter : a <= leave) return EDGE.Flat;
  const leansLeft = tilt > 0;
  return ((foot === 0) === leansLeft) ? EDGE.Outside : EDGE.Inside;
}

/** Forward or backward, with a dead band that holds the previous answer. */
export function classifyDir(longSpeed: number, prevCode: number, p: Params): Dir {
  if (longSpeed > p.dirSpeedEps) return DIR.Forward;
  if (longSpeed < -p.dirSpeedEps) return DIR.Backward;
  return prevCode === EDGE_CODE_NONE ? DIR.Stationary : codeDir(prevCode);
}

export function classifyDepth(tilt: number, p: Params): Depth {
  const a = Math.abs(tilt);
  if (a < p.flatThreshold) return DEPTH.Flat;
  if (a < p.depthShallow) return DEPTH.Shallow;
  if (a < p.depthDeep) return DEPTH.Moderate;
  return DEPTH.Deep;
}

/** The whole code in one call. Pure, so the tests can drive it directly. */
export function classifyCode(
  foot: Foot, tilt: number, longSpeed: number, prevCode: number, p: Params,
): number {
  return makeCode(foot, classifyDir(longSpeed, prevCode, p),
    classifyEdgeSide(foot, tilt, prevCode, p));
}
