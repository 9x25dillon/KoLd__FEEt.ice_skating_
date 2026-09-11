// app/jumps.ts — the jump challenge: the six jumps, scored from data/.
//
// A game layer like the others (app/course.ts): it reads the state and never
// writes it, and ?playtest=1 never shows it. And it is off by default the way
// jumps are: the lab only offers it while jumps are on (J to full), and jumps
// themselves stay off in every preset and forced off in playtest.
//
// One attempt is one jump. Pick the target with 1-6; the attempt starts the
// skater the way that jump leaves the ice — backward for five of them, forward
// for the axel, the one forward takeoff — at a fixed 5 m/s, so two scores are
// the same task. The panel gives the takeoff the data file gives
// (data/jump-definitions.csv, through sim/jump.ts's JUMP_DEFS), and the edge
// you are on now. The landing is scored by sim/score.ts from the data — base
// value, rotation and edge calls, a seeded nine-judge GOE panel — and a fall
// takes the data's fall deduction as well.
//
// A jump goes on the board under the jump it WAS. If you meant a Lutz and
// took off from an inside edge, the resolver called it a flip, and the board
// files it as a flip: the challenge is to make the edge you meant.

import type { SkaterState, JumpResult } from "../sim/types.ts";
import { codeToString, EDGE, DIR, FOOT } from "../sim/types.ts";
import { JUMP_CODE, JUMP_DEFS, JUMP_NONE, JUMP_PHASE } from "../sim/jump.ts";
import { scoreJump, fallDeduction, round2 } from "../sim/score.ts";
import type { ScoreTables, JumpScore } from "../sim/score.ts";
import type { Course, CourseResult, RunState, Best, PanelLine } from "./course.ts";
import { edgeWords, INK, DIM, GOLD, JADE, RED } from "./course.ts";

export const JUMP_WORDS = ["toe loop", "Salchow", "loop", "flip", "Lutz", "axel"] as const;

/** Approach speed, m/s: a balance lever, and the speed the jump tests fly from. */
export const APPROACH_SPEED = 5;

/** Backward for every jump but the axel. Signed, as createState takes it. */
export const startSpeed = (target: number): number =>
  (JUMP_DEFS[target].dir === DIR.Forward ? 1 : -1) * APPROACH_SPEED;

export const jumpBestKey = (kind: number): string => `edgework-jump-best-${JUMP_CODE[kind]}/1`;

/** The takeoff edge the data gives a jump, as the rig spells edges: Lz -> LBO. */
export function takeoffCode(kind: number): string {
  const d = JUMP_DEFS[kind];
  return (d.foot === FOOT.Right ? "R" : "L") + (d.dir === DIR.Forward ? "F" : "B")
    + (d.side === EDGE.Outside ? "O" : "I");
}

/** The takeoff in words: "left backward outside, toe pick (F)". */
export function recipe(kind: number): string {
  return edgeWords(takeoffCode(kind)) + (JUMP_DEFS[kind].toe ? ", toe pick (F)" : "");
}

export interface JumpAttemptResult extends CourseResult {
  landed: JumpResult | null;
  scored: JumpScore | null;
  /** Element score less the fall deduction if it came down. What the board keeps. */
  points: number;
  deduction: number;
  /** It was the jump the challenge asked for. */
  hit: boolean;
  tookOff: boolean;
}

export class JumpAttempt implements Course {
  state: RunState = "running";
  ticks = 0;
  tookOff = false;
  landed: JumpResult | null = null;
  scored: JumpScore | null = null;
  readonly target: number;
  private readonly tables: ScoreTables | null;
  /** The landing already on the state when the attempt began, so it is not this one. */
  private readonly before: number;
  private dt = 0;

  constructor(s: SkaterState, target: number, tables: ScoreTables | null) {
    this.target = target;
    this.tables = tables;
    this.before = s.landed.tick;
  }

  /** In the air: where a race would take its split. */
  get pastHalf(): boolean { return this.tookOff; }

  sample(s: SkaterState, dt: number): void {
    if (this.state !== "running") return;
    this.ticks++;
    this.dt = dt;
    if (s.jump.phase === JUMP_PHASE.Air) this.tookOff = true;
    // A landing is checked before a fall: a fall ON landing is still a jump,
    // scored, with the fall's GOE and deduction.
    if (s.landed.tick >= 0 && s.landed.tick !== this.before) {
      this.landed = { ...s.landed };
      this.scored = this.tables && this.landed.kind !== JUMP_NONE ? scoreJump(this.tables, this.landed) : null;
      this.state = "done";
      return;
    }
    if (s.fallen) this.state = "fell";
  }

  result(): JumpAttemptResult {
    const l = this.landed, sc = this.scored;
    const deduction = l?.fall && this.tables ? Math.abs(fallDeduction(this.tables, 1)) : 0;
    const points = sc ? round2(sc.score - deduction) : 0;
    return {
      state: this.state, seconds: this.ticks * this.dt,
      progress: l ? 2 : this.tookOff ? 1 : 0,
      score: this.state === "done" ? points : 0,
      landed: l, scored: sc, points, deduction,
      hit: l !== null && l.kind === this.target, tookOff: this.tookOff,
    };
  }
}

/** The panel: the jump asked for and how it leaves the ice, the attempt, the board. */
export function jumpLines(attempt: JumpAttempt | null, s: SkaterState, target: number,
  bestOf: (kind: number) => Best | null, newBest: boolean, jumpsOn: boolean, hasTables: boolean): PanelLine[] {
  const lines: PanelLine[] = [["JUMP CHALLENGE (G) · 1-6 picks the jump", JADE]];
  if (!jumpsOn) lines.push(["jumps are off: press J until it says full", RED]);
  if (!hasTables) lines.push(["no scoring tables beside the page: nothing scores", RED]);
  lines.push([`${target + 1}. ${JUMP_WORDS[target]} (${JUMP_CODE[target]})`, GOLD]);
  lines.push([`take off ${recipe(target)}`, INK]);
  const r = attempt?.result();
  if (r?.state === "running") {
    const J = s.jump;
    if (J.phase === JUMP_PHASE.Air) {
      lines.push([`in the air · ${(J.rotation / (2 * Math.PI)).toFixed(2)} rev · let go of C to tuck`, JADE]);
    } else if (J.phase === JUMP_PHASE.Load) {
      lines.push([`loading ${J.t.toFixed(2)} s · release near 0.30 s`, GOLD]);
    } else {
      const b = s.blade[s.supportFoot];
      const on = b.inContact ? codeToString(b.code) : "---";
      lines.push([`you are on ${on} · ${edgeWords(on)}`, on === takeoffCode(target) ? JADE : DIM]);
      lines.push(["deep knee (Shift), then release · land on a bent knee", DIM]);
    }
  } else if (r?.state === "done" && r.landed) {
    if (r.landed.kind === JUMP_NONE) {
      lines.push(["a hop: no element · R to go again", DIM]);
    } else if (r.scored) {
      const sc = r.scored;
      lines.push([`${sc.label} · BV ${sc.baseValue.toFixed(2)} · GOE ${sc.goe >= 0 ? "+" : ""}${sc.goe.toFixed(2)}`
        + ` → ${r.points.toFixed(2)}${r.deduction ? ` (fall −${r.deduction.toFixed(2)})` : ""}`, GOLD]);
      if (newBest) lines.push([`NEW BEST ${JUMP_WORDS[r.landed.kind]}`, GOLD]);
    }
    if (r.landed.kind !== JUMP_NONE && !r.hit) {
      lines.push([`that was a ${JUMP_WORDS[r.landed.kind]}, not a ${JUMP_WORDS[target]}`, RED]);
    }
  } else if (r?.state === "fell") {
    lines.push(["down before the takeoff · R to go again", RED]);
  }
  const cell = (k: number): string => `${JUMP_CODE[k]} ${bestOf(k)?.score.toFixed(2) ?? "—"}`;
  const total = [0, 1, 2, 3, 4, 5].reduce((sum, k) => sum + (bestOf(k)?.score ?? 0), 0);
  lines.push([[0, 1, 2].map(cell).join(" · "), DIM]);
  lines.push([`${[3, 4, 5].map(cell).join(" · ")} · total ${total.toFixed(2)}`, DIM]);
  return lines;
}
