// game/training.ts — what a season of training does to a skater's jumps.
//
// The owner's design (docs/open-decisions.md, settled 2026-11-01): a skater built
// around one family of jumps can lose touch with the other, and win it back at a
// real cost in weeks. It acts through skill, never a menu lock: every jump can still
// be tried, and a rusty one is harder, because the skater's own timing and edge have
// slipped. Career only; every other mode skates without rust.
//
// It works on the input, the way game/beginner.ts's coach does, so it reaches
// replays as ordinary recorded input and needs no solver change.
//
// THE NUMBERS ARE AUTHORED, NOT MEASURED. No source says how fast a jump goes rusty.
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { JUMP_DEFS, JUMP_PHASE } from "../sim/jump.ts";
import { SIM_DT } from "../sim/params.ts";

/** The panel's own split (sim/jump.ts JUMP_DEFS): a pick off the toe, or the edge alone. */
export const JUMP_FAMILIES = [
  { id: "toe", title: "Toe jumps", blurb: "Toe loop, flip, Lutz. Rust makes the pick late." },
  { id: "edge", title: "Edge jumps", blurb: "Salchow, loop, Axel. Rust makes the takeoff edge waver, and in the end cross over." },
] as const;
export type JumpFamily = typeof JUMP_FAMILIES[number]["id"];
export type Rust = Record<JumpFamily, number>;

/**
 * Revolutions a fully rusty family adds to what a career jump must turn: the owner's
 * call of 2026-11-02, after measurement showed rust on the input alone never made
 * jumps harder (108 half-turn takeoffs a level; Simulation 14, 14, 17, 14, 4 clean
 * from rust 0 to 1, Experimental 10 throughout). AUTHORED: sharp needs half a turn,
 * fully rusty three-quarters.
 */
export const RUST_TURN = 0.25;
/** A landing's family, by its call: a pick (T, F, Lz) is a toe jump; S, Lo, A and an uncalled landing are edge. */
export function landingFamily(kind: number): JumpFamily {
  return JUMP_DEFS[kind]?.toe ? "toe" : "edge";
}

/** Rust gained per season step on a family not drilled in that step, and lost per week drilled. */
export const RUST_PER_STEP = 0.25, RUST_PER_WEEK = 0.25;
/** s a fully rusty pick arrives late: past the end of a load, it is no pick at all. */
export const TOE_SLIP_S = 0.15;
/**
 * How far a rusty edge slips while a jump loads, as a share of the lean per unit of rust.
 * Past 1 it crosses onto the wrong edge, the fault a coach calls by name. Chosen by measurement,
 * Simulation, 324 takeoffs, clean with half a turn or more: rust 0, 22; 0.25, 16; 0.5, 14; 0.75, 7;
 * 1, 7. Easing the lean by 0.6 barely bit (22 to 15), and a weaker spring got easier, not harder.
 */
export const EDGE_SLIP = 1.6;

/**
 * One skater's rust, applied tick by tick. An edge jump is only known by the absence
 * of a pick, so edge rust acts until a pick is asked for. A late-tapped toe jump
 * therefore pays a little of it too: rust is not a clean ledger, and neither is a body.
 */
export class RustGate {
  rust: Rust;
  private lateToeAt = -1;
  private toeWas = false;
  constructor(rust: Rust) { this.rust = rust; }
  apply(input: SkatingInput, s: SkaterState): SkatingInput {
    const fresh = input.toe && !this.toeWas;
    this.toeWas = input.toe;
    const out = { ...input };
    if (s.jump.phase !== JUMP_PHASE.Load) { this.lateToeAt = -1; return out; }
    if (this.rust.toe > 0) {
      if (fresh && this.lateToeAt < 0) this.lateToeAt = s.tick + Math.round(this.rust.toe * TOE_SLIP_S / SIM_DT);
      out.toe = this.lateToeAt >= 0 && s.tick >= this.lateToeAt;
      if (out.toe) this.lateToeAt = -2;
    }
    if (this.rust.edge > 0 && !s.jump.toeInLoad && this.lateToeAt === -1 && !out.toe) {
      const keep = 1 - EDGE_SLIP * this.rust.edge;
      out.lean = input.lean * keep;
      if (input.leanSplit !== undefined) out.leanSplit = input.leanSplit * keep;
    }
    return out;
  }
}
