// game/kisscry.ts — the kiss-and-cry after a career program: the skater on the bench, waiting for
// the marks, then her reaction to them, then a wave, before the podium.
//
// Real competitions put the kiss-and-cry before the ceremony; this does too. The clips are the
// motion library's (game/motion/ceremony.ts kc.*). Which reaction is read off the result the sim
// and the career already made: nothing here scores. AUTHORED: the rule and the timings.

import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { CLIP_BY_ID } from "./motion/library.ts";
import { PODIUM_AT } from "./podium.ts";

export type Reaction = "joy" | "relief" | "disappointed";
export interface KissAndCry {
  reaction: Reaction;
  /** Clips in order, each for its seconds: the wait, the reaction, then a wave until the podium. */
  sequence: { clip: string; seconds: number }[];
  /** A settled standing state on the bench's spot, facing the camera, for a client that poses from one. */
  state: SkaterState;
}

/** Seconds on the bench before the marks come. AUTHORED (a broadcast holds it longer). */
export const WAIT_SECONDS = 3.5;
/** Seconds of waving after the reaction, before the podium. AUTHORED. */
export const WAVE_SECONDS = 2.4;
const CLIP: Record<Reaction, string> = { joy: "kc.joy", relief: "kc.relief", disappointed: "kc.disappointed" };

/**
 * The reaction: joy at a win or a personal best (a better score than the event's best before
 * this run; a first completion is not one), relief on the podium, disappointment off it or with
 * the program left unfinished.
 */
export function reactionTo(o: { complete: boolean; place: number | null; score: number; bestBefore: number | null }): Reaction {
  if (!o.complete) return "disappointed";
  if (o.place === 1 || (o.bestBefore !== null && o.score > o.bestBefore)) return "joy";
  return o.place !== null && o.place <= 3 ? "relief" : "disappointed";
}

export function kissAndCry(o: { complete: boolean; place: number | null; score: number; bestBefore: number | null }, params: Params): KissAndCry {
  const reaction = reactionTo(o), clip = CLIP[reaction];
  const sequence = [
    { clip: "kc.wait", seconds: WAIT_SECONDS },
    { clip, seconds: CLIP_BY_ID.get(clip)!.duration },
    // A wave after a good mark; after a bad one she stays as the reaction left her.
    ...(reaction === "disappointed" ? [] : [{ clip: "kc.wave", seconds: WAVE_SECONDS }]),
  ];
  // Settled as the podium's skaters are (game/podium.ts), on the sheet's centre, facing sim -y.
  const s = createState(params, 0);
  for (let i = 0; i < 30; i++) step(s, NEUTRAL_INPUT, params, SIM_DT, []);
  const from = { ...s.pos }, turn = (v: { x: number; y: number }) => ({ x: v.y, y: -v.x });
  s.heading = turn(s.heading);
  s.vel = { x: 0, y: 0 };
  for (const b of s.blade) {
    const rel = turn({ x: b.contact.x - from.x, y: b.contact.y - from.y });
    b.contact = { x: PODIUM_AT.x + rel.x, y: PODIUM_AT.y + rel.y };
    b.tangent = turn(b.tangent);
  }
  s.pos = { ...PODIUM_AT };
  return { reaction, sequence, state: s };
}

/** Seconds the whole kiss-and-cry runs. */
export const kissAndCrySeconds = (k: KissAndCry) => k.sequence.reduce((t, x) => t + x.seconds, 0);
