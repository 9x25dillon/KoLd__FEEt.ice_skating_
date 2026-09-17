// tools/ice-lab/sim/ice.ts — the sheet itself: a resurfaced rink takes wear.
//
// design-bible.md §3.2: "A 2D grid over the rink at roughly 12 cm resolution
// storing damage and snow. Every blade pass writes to it; damage raises
// local friction and lowers bite, and snow accumulates in ridges at stops.
// Resurfaced between skaters... The same grid is the tracing buffer (§04,
// §09). One system, two payoffs, and it means the visual and the simulation
// can never disagree."
//
// EXPLICIT STATE, NOT A HIDDEN GLOBAL. solver.ts's step() is "state in, state
// out... no hidden globals" because replays, ghosts and server verification
// depend on it — so a grid this persistent cannot live inside the solver. It
// is passed into step() as an optional argument instead, the same reason
// SkaterState is passed rather than owned: with none passed, or with
// `iceGridMode` 0, friction and bite read exactly what they did before this
// file existed, and a replay never needs to serialize the grid at all — the
// same recorded inputs chew the same ice on any machine that replays them.
//
// Damage and snow are not modelled apart once they reach the solver: both
// alike raise friction and cost bite (`condition`, below), because the rig
// has no way yet to tell a judge a chewed patch from a snow ridge. They stay
// two separate arrays only because a resurface, or a future rendering of one
// against the other, needs them apart.

import type { Vec2 } from "./math.ts";
import type { Params } from "./params.ts";

/** m, bible §3.2: "roughly 12 cm resolution". */
export const ICE_CELL = 0.12;

export class IceGrid {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly damage: Float32Array;
  private readonly snow: Float32Array;

  constructor(halfLength: number, halfWidth: number, cell = ICE_CELL) {
    this.halfLength = halfLength;
    this.halfWidth = halfWidth;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil((2 * halfLength) / cell));
    this.rows = Math.max(1, Math.ceil((2 * halfWidth) / cell));
    this.damage = new Float32Array(this.cols * this.rows);
    this.snow = new Float32Array(this.cols * this.rows);
  }

  /** -1 off the sheet: a fresh boards' worth of ice with nothing to read. */
  private index(pos: Vec2): number {
    const col = Math.floor((pos.x + this.halfLength) / this.cell);
    const row = Math.floor((pos.y + this.halfWidth) / this.cell);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  /** damage + snow at a point, saturating: what friction and bite read. */
  condition(pos: Vec2): number {
    const i = this.index(pos);
    return i < 0 ? 0 : Math.min(1, this.damage[i] + this.snow[i]);
  }

  /** For the tracing draw: damage and snow apart, off the sheet as zero. */
  sample(pos: Vec2): { damage: number; snow: number } {
    const i = this.index(pos);
    return i < 0 ? { damage: 0, snow: 0 } : { damage: this.damage[i], snow: this.snow[i] };
  }

  /**
   * One blade, one tick. `scrub` is the tick's `latSlipAccel` (m/s^2 of
   * demand the edge could not hold) — the same quantity solver.ts's own
   * comment names as "where the snow comes from", deposited here instead of
   * only being spent as a speed loss.
   *
   * Off the sheet, a no-op: there is no cell to write.
   */
  deposit(pos: Vec2, scrub: number, dt: number, p: Params): void {
    const i = this.index(pos);
    if (i < 0) return;
    this.damage[i] = Math.min(1, this.damage[i] + p.iceDamagePerPass);
    if (scrub > 0) this.snow[i] = Math.min(1, this.snow[i] + p.iceSnowPerScrub * scrub * dt);
  }

  /** Between skaters: the ice board's own resurfacer. */
  resurface(): void {
    this.damage.fill(0);
    this.snow.fill(0);
  }
}
