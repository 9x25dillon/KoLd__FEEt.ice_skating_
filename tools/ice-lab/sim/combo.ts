// tools/ice-lab/sim/combo.ts — jump combinations, recognised from the
// physics rather than requested.
//
// Design bible §2.4, "Why combinations work the way they do": a combination's
// second jump takes off from the landing foot and edge of the first. Every
// jump lands RBO (data/jump-definitions.csv's landing_edge), so only the jumps
// whose own takeoff is RBO — the toe loop and the loop — can follow, and the
// player finds that out by skating it, not from a rules screen. Nothing here
// makes a second jump possible; the solver already lets a skater load and
// release straight off a landing. This only watches for it.
//
// The link between two jumps is the landing edge held unbroken: it breaks on
// a fall, a step-out or two-foot landing, a change of support foot (a stroke,
// a step), any move (a turn, a spin), or skating forward again. There is no
// time limit — the data has none, and an edge held long enough to reload the
// knee is still the landing edge. Up to three jumps (bible §2.7: a free skate
// may carry one three-jump combination); a fourth linked jump starts afresh.
//
// Scoring is not changed: each jump is already scored on its own landing, so
// the technical total already carries the sum of base values a combination
// is worth. The data defines no single-GOE rule for the combined element, so
// none is invented here. A jump sequence (linked by steps, 80% of the sum)
// is not recognised either: the data gives no bound on what "linked" means.
//
// Pure: a replay, fed tick by tick, always recognises the same combinations.

import type { JumpResult, SkaterState } from "./types.ts";
import { DIR, EDGE, FOOT, MOVE, codeDir, codeFoot, codeSide, makeCode } from "./types.ts";
import { JUMP_CODE, JUMP_DEFS, JUMP_NONE, JUMP_PHASE, ROTATION_MARK, EDGE_MARK } from "./jump.ts";

/** data/jump-definitions.csv's landing_edge, in JUMP order; test/combo.test.ts holds it to the file. */
export const JUMP_LANDING: readonly number[] = JUMP_DEFS.map(() => makeCode(FOOT.Right, DIR.Backward, EDGE.Outside));

export const MAX_COMBO_JUMPS = 3;

/** What a jump is called on the sheet: revolutions, code, and any call. */
export function jumpLabel(r: JumpResult): string {
  return `${r.revolutions}${JUMP_CODE[r.kind]}${ROTATION_MARK[r.rotationCall]}${EDGE_MARK[r.edgeCall]}`;
}

/** Whether jump `next` takes off from the edge jump `prev` lands on — data, not physics. */
export function canFollow(prev: number, next: number): boolean {
  const land = JUMP_LANDING[prev], d = JUMP_DEFS[next];
  return d.foot === codeFoot(land) && d.dir === codeDir(land) && d.side === codeSide(land);
}

export class ComboTracker {
  /** The jumps of the combination in progress, oldest first; one entry is a solo jump so far. */
  readonly jumps: JumpResult[] = [];
  /** Every finished combination of two or more, as labels. */
  readonly combos: string[][] = [];
  private linked = false;
  private foot = -1;
  private linkedAtTakeoff = false;
  private lastLanding = -1;
  private wasAir = false;

  reset(): void {
    this.jumps.length = 0; this.combos.length = 0;
    this.linked = false; this.foot = -1; this.linkedAtTakeoff = false; this.lastLanding = -1; this.wasAir = false;
  }

  /** The combination in progress, "3T+2Lo", or "" while it is one jump or none. */
  get label(): string { return this.jumps.length >= 2 ? this.jumps.map(jumpLabel).join("+") : ""; }

  /**
   * After each step. Returns the combination's label on the tick a landing
   * extends one to two or three jumps, otherwise "".
   */
  sample(s: SkaterState): string {
    const air = s.jump.phase === JUMP_PHASE.Air;
    if (air && !this.wasAir) this.linkedAtTakeoff = this.linked;
    this.wasAir = air;
    if (!air && this.linked && (s.fallen || s.supportFoot !== this.foot || s.move !== MOVE.None
      || s.strokeTime > 0 || s.blade[s.supportFoot].longSpeed > 0.05)) this.linked = false;

    const r = s.landed;
    if (r.tick < 0 || r.tick === this.lastLanding) return "";
    this.lastLanding = r.tick;
    const element = r.kind !== JUMP_NONE && r.revolutions >= 1;
    const prev = this.jumps[this.jumps.length - 1];
    const extends_ = element && this.linkedAtTakeoff && prev !== undefined
      && this.jumps.length < MAX_COMBO_JUMPS && canFollow(prev.kind, r.kind);
    if (!extends_) this.close();
    if (element) this.jumps.push({ ...r });
    this.linked = element && !r.fall && !r.stepOut && !r.twoFoot && !s.fallen;
    this.foot = s.supportFoot;
    this.linkedAtTakeoff = false;
    return extends_ ? this.label : "";
  }

  /** End the combination in progress, keeping it if it had two jumps or more. */
  close(): void {
    if (this.jumps.length >= 2) this.combos.push(this.jumps.map(jumpLabel));
    this.jumps.length = 0;
  }
}
