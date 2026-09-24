// app/hophint.ts — why that takeoff was a hop, in plain words, for the HUD.
//
// The operator's first session on scheme C (2026-09-24) was a string of hops
// with no rotation and nothing on screen said why: the HUD printed "hop" and
// the rev count, and the reason — which foot, which way, which edge, whether
// the pick went in, whether the arms did — was all in the state and none of
// it in words. This turns the last landing into a sentence.
//
// It reads, and never writes. Every fact comes from what the solver already
// keeps: the landed record (sim/types.ts JumpResult), the takeoff's own
// reading, which sim/jump.ts leaves on the JumpState after the landing (kind,
// takeoffCode), and the knee asked for on the touchdown tick. The wording is
// the lab's; the rules it explains are sim/jump.ts's identify() and JUMP_DEFS,
// asked again here rather than restated, so the day the data changes the
// hints follow it.
//
// The HUD is developer-facing, and ?playtest=1 never shows jumps at all, so a
// hint may name the buttons. It never names a scheme.

import type { JumpResult } from "../sim/types.ts";
import { DIR, EDGE, EDGE_CODE_NONE, FOOT, codeDir, codeFoot, codeSide } from "../sim/types.ts";
import { JUMP, JUMP_DEFS, JUMP_MODE, JUMP_NONE, identify } from "../sim/jump.ts";
import { JUMP_WORDS } from "./jumps.ts";

/** What the takeoff read, as sim/jump.ts left it on the JumpState. */
export interface TakeoffReading {
  /** JumpState.kind: what identify() called the takeoff, before rotation was counted. */
  kind: number;
  /** JumpState.takeoffCode: the edge the blade was on at the release. */
  code: number;
}

/**
 * The share of landing quality one unit of knee is worth at touchdown:
 * sim/jump.ts's `0.50 * (1 - absorb)`. Restated because the solver keeps the
 * sum and not the parts; test/hophint.test.ts holds it to a real landing.
 */
export const ABSORB_WEIGHT = 0.5;

/** Below this, sim/jump.ts calls the landing a fall. */
const FALL_BELOW = 0.18;

/** A touchdown knee costing less than this is not worth a line: RT at half or more is a knee held, not let go. */
const KNEE_HINT_COST = 0.25;

const foot = (f: number): string => (f === FOOT.Left ? "left" : "right");
const side = (e: number): string => (e === EDGE.Outside ? "outside" : "inside");

/**
 * Up to two lines: why the last takeoff identified no jump, and what the knee
 * cost the landing. Empty before the first landing, and for a named jump
 * landed with the knee held.
 */
export function hopHint(landed: JumpResult, takeoff: TakeoffReading, jumpMode: number, kneeAtTouchdown: number): string[] {
  if (landed.tick < 0) return [];
  const out: string[] = [];
  if (landed.kind === JUMP_NONE) out.push(hopReason(landed, takeoff, jumpMode));
  const knee = kneeHint(landed, kneeAtTouchdown);
  if (knee) out.push(knee);
  return out;
}

/** Why a landing came back as a hop. */
export function hopReason(landed: JumpResult, takeoff: TakeoffReading, jumpMode: number): string {
  if (jumpMode < JUMP_MODE.Full) return "hop: jumps are on hop only — J / D-pad ↑ for full jumps";
  // The takeoff named a jump and the air did not turn enough of it.
  if (takeoff.kind !== JUMP_NONE) {
    const word = JUMP_WORDS[takeoff.kind];
    const short = takeoff.kind === JUMP.Axel ? "past the axel's half" : "to count";
    return `${a(word)} takeoff, but ${landed.turned.toFixed(2)} rev is too little ${short} — `
      + "arms out through the release, then pull them in: the arms are most of the turn";
  }
  const c = takeoff.code;
  if (c === EDGE_CODE_NONE) return "hop: no edge under you at the release — glide on one foot into it";
  const f = codeFoot(c), d = codeDir(c), e = codeSide(c);
  if (d !== DIR.Forward && d !== DIR.Backward) return "hop: no travel at the release — a jump leaves from a moving edge";
  const way = d === DIR.Forward ? "forward" : "backward";
  if (e !== EDGE.Outside && e !== EDGE.Inside) {
    return `${way} on the ${foot(f)} flat: no jump leaves a flat — lean onto an edge through the knee bend`;
  }
  // The blade was on a jump's edge at the release, but identify() reads the
  // edge held over the whole knee bend, and that read the other one.
  const onEdge = identify(f, d, e, landed.toe);
  if (onEdge !== JUMP_NONE) {
    return `${way} on the ${foot(f)} ${side(e)} edge at the release, but the knee bend read the other edge — `
      + `hold the ${side(e)} edge through the whole bend for the ${JUMP_WORDS[onEdge]}`;
  }
  // The right edge, the wrong pick.
  const otherToe = identify(f, d, e, !landed.toe);
  if (otherToe !== JUMP_NONE) {
    return landed.toe
      ? `${way} on the ${foot(f)} ${side(e)} edge with the pick: no jump leaves here — leave the pick out for the ${JUMP_WORDS[otherToe]}`
      : `${way} on the ${foot(f)} ${side(e)} edge without the pick: that is the ${JUMP_WORDS[otherToe]}'s edge — tap the pick in the knee bend`;
  }
  // Nothing leaves this edge. Say what this foot does leave from, going this way.
  const same = JUMP_DEFS.map((j, k) => ({ j, k })).filter(({ j }) => j.foot === f && j.dir === d);
  if (same.length > 0) {
    const others = same.map(({ k }) => JUMP_WORDS[k]).join(", ");
    return `${way} on the ${foot(f)} ${side(e)} edge: no jump leaves here — the ${foot(f)} foot jumps ${way} `
      + `from its ${side(same[0].j.side)} edge (${others})`;
  }
  if (d === DIR.Forward) {
    return `forward on the ${foot(f)} foot: no jump leaves here — skate backward (a three-turn) `
      + "or take off from the left outside edge for an axel";
  }
  return `${way} on the ${foot(f)} ${side(e)} edge: no jump leaves here`;
}

/** What letting the knee go before touchdown cost the landing, when it cost enough to say. */
export function kneeHint(landed: JumpResult, kneeAtTouchdown: number): string {
  const knee = Math.max(0, Math.min(1, Number.isFinite(kneeAtTouchdown) ? kneeAtTouchdown : 0));
  const cost = ABSORB_WEIGHT * (1 - knee);
  if (cost < KNEE_HINT_COST) return "";
  // The landing quality is unsaturated whenever it is above zero, so adding
  // the knee's share back is exactly what a held knee would have scored.
  const alone = landed.fall && landed.landingQuality > 0 && landed.shortBy <= 0.7
    && landed.landingQuality + cost >= FALL_BELOW;
  return `knee ${knee.toFixed(2)} at touchdown cost ${cost.toFixed(2)} of landing quality`
    + `${alone ? ", and that was the fall" : ""} — keep RT (Shift) pulled as you land`;
}

const a = (word: string): string => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
