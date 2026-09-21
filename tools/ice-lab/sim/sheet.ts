// tools/ice-lab/sim/sheet.ts — a program's jump protocol: elements, the
// repetition rule, fall deductions, and the segment score.
//
// Each landing is scored on its own (sim/score.ts); a landing that links to the
// last one (sim/combo.ts) joins that element instead of starting a new one. The
// sheet then applies design bible §2.7's repetition rule ("the Zayak rule"): no
// triple or quad may be attempted more than twice, and any jump repeated must
// appear in a combination — a violated repeat is marked `*` and scores zero
// (data/calls-and-deductions.csv's `validity,*` row, base value 0.00). Falls
// cost what that file's deduction schedule says (sim/score.ts fallDeduction).
//
// Not modelled, and said so: jump sequences (bible: steps between, 80% of the
// sum — sim/combo.ts has no bound on "linked"), the segment's element-count
// limits (data/segment-rules.csv's jump_elements), and the rule's ISU "+REP"
// refinement; the bible, which is this repo's spec, says `*`.
//
// Pure: the same landings in the same order always make the same sheet.

import type { JumpResult, SkaterState } from "./types.ts";
import { JUMP_CODE } from "./jump.ts";
import type { ScoreTables } from "./score.ts";
import { scoreJump, fallDeduction, round2 } from "./score.ts";
import { ComboTracker, jumpLabel } from "./combo.ts";

/** Bible §2.7: the repetition rule covers triples and quads. */
export const REPEAT_RULE_MIN_REVS = 3;
/** Bible §2.7: attempted at most twice. */
export const REPEAT_RULE_MAX_ATTEMPTS = 2;

export interface SheetJump { label: string; key: string; revolutions: number; score: number; invalid: boolean }
export interface SheetElement { jumps: SheetJump[] }

export class ProtocolSheet {
  readonly elements: SheetElement[] = [];
  private combo = new ComboTracker();
  private lastLanding = -1;

  private tables: ScoreTables;

  constructor(tables: ScoreTables) { this.tables = tables; }

  /** After each step; returns true on a tick that added a jump. */
  sample(s: SkaterState): boolean {
    const linked = this.combo.sample(s) !== "";
    const r = s.landed;
    if (r.tick < 0 || r.tick === this.lastLanding) return false;
    this.lastLanding = r.tick;
    const scored = scoreJump(this.tables, r);
    if (!scored) return false;
    const jump: SheetJump = { label: jumpLabel(r), key: repeatKey(r), revolutions: r.revolutions, score: scored.score, invalid: false };
    const last = this.elements[this.elements.length - 1];
    if (linked && last) last.jumps.push(jump); else this.elements.push({ jumps: [jump] });
    applyRepeatRule(this.elements);
    return true;
  }

  /** Technical elements score: every valid jump's own score. */
  get tes(): number {
    return round2(this.elements.reduce((sum, e) => sum + e.jumps.reduce((a, j) => a + (j.invalid ? 0 : j.score), 0), 0));
  }

  /** "3T+2T", "3Lz*", in program order. */
  get lines(): string[] {
    return this.elements.map((e) => e.jumps.map((j) => j.label + (j.invalid ? "*" : "")).join("+"));
  }

  deductions(falls: number): number { return fallDeduction(this.tables, falls); }
}

/** Same jump for the rule: the called revolutions and the code, "3T". */
const repeatKey = (r: JumpResult): string => `${r.revolutions}${JUMP_CODE[r.kind]}`;

/**
 * Re-marks every jump from scratch — a later combination can make an earlier
 * repeat legal, so marking cannot be done once, at landing time.
 */
export function applyRepeatRule(elements: SheetElement[]): void {
  const seen = new Map<string, Array<{ jump: SheetJump; inCombo: boolean }>>();
  for (const e of elements) for (const jump of e.jumps) {
    jump.invalid = false;
    if (jump.revolutions < REPEAT_RULE_MIN_REVS) continue;
    const list = seen.get(jump.key) ?? [];
    list.push({ jump, inCombo: e.jumps.length > 1 });
    seen.set(jump.key, list);
  }
  for (const list of seen.values()) {
    list.forEach((a, n) => { if (n >= REPEAT_RULE_MAX_ATTEMPTS) a.jump.invalid = true; });
    if (list.length >= 2 && !list[0].inCombo && !list[1].inCombo) list[1].jump.invalid = true;
  }
}

/** A segment's total, as the protocol prints it. */
export function segmentScore(tes: number, pcs: number, deductions: number): number {
  return round2(tes + pcs - deductions);
}
