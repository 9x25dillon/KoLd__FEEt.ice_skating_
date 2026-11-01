// tools/ice-lab/game/armfocus.ts — what a career skater's arms are for.
//
// The same two arms hold a skater up and carry the program's line, and they
// cannot fully do both until that has been drilled. Career asks which comes
// first; every other mode skates with both at once: full balance authority
// (these are the base params, nothing is added) and the expressive carriage.
//
// THE NUMBERS ARE AUTHORED (L3), NOT MEASURED. No source says how much balance
// an arm held for line gives up, or what a judge pays for it. They only act
// through `internalMax` at a run's start, so they reach replays as ordinary
// params and need no solver change, and through sim/pcs.ts's `armExpression`.
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";

export const ARM_FOCUS = [
  { id: "function", title: "Function", blurb: "Arms work for balance first. Full authority to save an edge; no credit for line.", authority: 1, expression: 0, style: 0 },
  { id: "shared", title: "Shared", blurb: "Half and half: some line, and a little less to catch yourself with.", authority: 0.82, expression: 0.5, style: 0.5 },
  { id: "expression", title: "Expression", blurb: "Arms carry the program. The panel sees it in Presentation, and you have less to save an edge with.", authority: 0.62, expression: 1, style: 1 },
] as const;

/** How much of a tier's trade-off the drills can ever remove: mastery nears free skate's "both" but never buys it outright. */
export const MASTERY_REACH = 0.8;

const share = (best: number) => Math.max(0, Math.min(100, best)) / 100;

/** A run's params under this focus; a drilled tier gives up less of the arms' authority. */
export function armParams(base: Params, focus: number, best: number): Params {
  const cost = 1 - ARM_FOCUS[focus].authority;
  return { ...base, internalMax: base.internalMax * (1 - cost * (1 - MASTERY_REACH * share(best))) };
}

/** What the panel sees, 0..1: half of a tier's expression comes with choosing it, the rest with drilling it. */
export function armExpression(focus: number, best: number): number {
  return ARM_FOCUS[focus].expression * (0.5 + 0.5 * share(best));
}

export const DRILL_SECONDS = 45;
/** Seconds of edge a Function drill needs before its steadiness counts in full. */
const EDGE_NEEDED = 15;
/** Seconds of arm prompts an Expression drill needs matched-or-missed before its match counts in full. */
const LINE_NEEDED = 20;
const PROMPT_SECONDS = 3;
const STEADY_ERROR = 0.12;  // rad of balance error an edge may carry and still be steady
const LINE_TOLERANCE = 0.3; // of carriage, 0 tucked .. 1 open
const FALL_COST = 15;

/**
 * The minigame: 45 seconds on the ice, on one tier's own terms. Function scores
 * how steady the skater stays on a real edge. Expression scores how well the
 * arms follow the called line while still skating. Shared scores both.
 */
export class ArmDrill {
  elapsed = 0;
  falls = 0;
  private edge = 0;
  private steady = 0;
  private line = 0;
  private matched = 0;
  private wasFallen = false;
  focus: number;
  constructor(focus: number) { this.focus = focus; }
  get done() { return this.elapsed >= DRILL_SECONDS; }
  get seconds() { return Math.max(0, DRILL_SECONDS - this.elapsed); }
  private get usesEdge() { return this.focus !== 2; }
  private get usesLine() { return this.focus !== 0; }
  /** The called line: 1 open, 0 drawn in. */
  get wanted() { return Math.floor(this.elapsed / PROMPT_SECONDS) % 2 === 0 ? 1 : 0; }
  get edgeScore() { return this.edge > 0 ? (this.steady / this.edge) * Math.min(1, this.edge / EDGE_NEEDED) : 0; }
  get lineScore() { return this.line > 0 ? (this.matched / this.line) * Math.min(1, this.line / LINE_NEEDED) : 0; }
  get score() {
    const parts = [...(this.usesEdge ? [this.edgeScore] : []), ...(this.usesLine ? [this.lineScore] : [])];
    const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.max(0, Math.round(100 * mean) - FALL_COST * this.falls);
  }
  get title() {
    if (this.usesLine && this.wanted === 1) return "Open the arms";
    if (this.usesLine) return "Draw them in";
    return "Hold a steady edge";
  }
  get hint() {
    const arms = "Right stick or C sets the arms.";
    if (this.focus === 0) return "Stay on a real edge and keep it quiet. Let the arms do the saving.";
    if (this.focus === 1) return `${arms} Follow the call and keep your edge steady.`;
    return `${arms} Follow the call while you keep skating.`;
  }
  sample(s: SkaterState, input: SkatingInput, dt: number) {
    if (s.fallen && !this.wasFallen) this.falls++;
    this.wasFallen = s.fallen;
    this.elapsed += dt;
    const moving = !s.fallen && Math.hypot(s.vel.x, s.vel.y) > 1.5;
    if (moving && Math.abs(s.lean) > 0.12) {
      this.edge += dt;
      if (Math.abs(s.balanceError) < STEADY_ERROR) this.steady += dt;
    }
    if (moving) {
      this.line += dt;
      if (Math.abs(input.carriage - this.wanted) < LINE_TOLERANCE) this.matched += dt;
    }
  }
}
