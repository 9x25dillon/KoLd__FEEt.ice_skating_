// game/pilot.ts — the computer skates a program: Creation mode's showcase.
//
// The owner, 2026-11-11: programs and tricks "crafted and witnessed performed by
// the computer". The computer skates through a pad, as a player does: this is
// games/ice-run-godot/tools/rival_baseline.mjs's closed-loop pilot (the one that
// measured every rival BASELINE), moved here so the bridge can play it. It
// writes Simulation's buttons and sticks each tick from the skater's state and
// the program's current element; the sim decides everything after that, falls
// included. Nothing is animated or faked: a showcase run is an ordinary run whose
// hands are the pilot's.
//
// What the pilot can skate is what it was measured on: glide, edge, crossover,
// a half-turn jump, a spin and the pose. Step sequences, spirals and jump
// combinations have no measured pad yet (Hand_off.md, "measured pads"), so
// showcaseProgram() leaves them out and says which.
//
// A scripted pad is chaotic: a tenth of a second changes a landing. The radius
// and jump entry are the middle of rival_baseline.mjs's grid; a showcase falls
// sometimes, as the warm-up group does.

import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import type { ElementId } from "./career.ts";

export const PILOT_ELEMENTS: readonly ElementId[] = ["glide", "edge", "crossover", "jump", "spin", "pose"];
/** rival_baseline.mjs's middle radius (m) and entry speeds (m/s). */
export const PILOT_RADIUS = 12;
export const PILOT_ENTRY: Readonly<Record<string, number>> = { glide: 0, crossover: 0, edge: 3, pose: 3, jump: 3.3, spin: 4 };

/** A program the pilot can skate, and what it had to leave out. */
export function showcaseProgram(elements: readonly ElementId[]): { skated: ElementId[]; left: ElementId[] } {
  const skated: ElementId[] = [], left: ElementId[] = [];
  for (const e of elements) (PILOT_ELEMENTS.includes(e) ? skated : left).push(e);
  return { skated, left };
}

/** Pad indices (test/padcourse.test.ts's). */
const A = 0, B = 1, Y = 3, LT = 6, RT = 7, L3 = 10;
/** Simulation's lean through both sticks, as the default profile shapes it. */
const G = 9.81, CX = 0, CY = 18, MAX_LEAN = 1.13, GAIN = 0.7, DZ = 0.22, CURVE = 1.35;
function stickFor(lean: number): number {
  const shaped = Math.min(1, Math.abs(lean) / MAX_LEAN / GAIN);
  return shaped <= 0 ? 0 : Math.sign(lean) * (DZ + (1 - DZ) * Math.pow(shaped, 1 / CURVE));
}
const tap = (t: number, every: number) => Math.floor(t * 60) % Math.round(every * 60) < 3;
const backwardOf = (s: SkaterState) => s.vel.x * s.heading.x + s.vel.y * s.heading.y < 0;

export interface PilotPad { axes: number[]; buttons: number[]; keys: string[]; connected: true }

export class ProgramPilot {
  private t = 0;
  private dir: number | undefined;
  private cur: string | undefined;
  private prev: string | undefined;
  private readyAt: number | undefined;
  private free = false;
  readonly radius: number;
  readonly entry: Readonly<Record<string, number>>;
  constructor(radius = PILOT_RADIUS, entry: Readonly<Record<string, number>> = PILOT_ENTRY) { this.radius = radius; this.entry = entry; }

  /** This tick's pad for skater `s` on element `cur` (undefined once the program's elements are done). */
  pad(s: SkaterState, cur: string | undefined, dt: number): PilotPad {
    const h: PilotPad = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
    this.drive(h, s, cur, this.t);
    this.t += dt;
    return h;
  }

  private orbit(h: PilotPad, s: SkaterState, t: number, push: number) {
    const dx = s.pos.x - CX, dy = s.pos.y - CY, dist = Math.hypot(dx, dy) || 1e-6;
    const v = Math.hypot(s.vel.x, s.vel.y) || 1e-6, vx = s.vel.x / v, vy = s.vel.y / v;
    if (this.dir === undefined) this.dir = Math.sign(dx * vy - dy * vx) || 1;
    const dir = this.dir, tx = (dir < 0 ? dy : -dy) / dist, ty = (dir < 0 ? -dx : dx) / dist;
    const out = Math.atan2(vx * dx / dist + vy * dy / dist, vx * tx + vy * ty);
    const most = Math.atan(v * v / (G * Math.max(this.radius * 0.55, 1)));
    const phi = Math.max(0, Math.min(most, Math.atan(v * v / (G * this.radius)) + 0.04 * (dist - this.radius) + 0.4 * out));
    h.axes[0] = h.axes[2] = stickFor(dir * (backwardOf(s) ? -1 : 1) * phi);
    if (v < push && tap(t, push > 3 ? 0.6 : 1.2)) h.buttons[A] = 1;
  }

  private drive(h: PilotPad, s: SkaterState, cur: string | undefined, t: number) {
    const v = Math.hypot(s.vel.x, s.vel.y);
    if (s.fallen) { this.readyAt = undefined; this.dir = undefined; if (tap(t, 0.5)) h.buttons[A] = 1; return; }
    if (cur === undefined) { if (!this.free) { this.free = true; this.dir = undefined; } this.orbit(h, s, t, 3); return; }
    if (this.cur !== cur) { this.prev = this.cur; this.cur = cur; this.readyAt = undefined; this.dir = undefined; }
    if (this.readyAt === undefined) {
      // Out of a spin, turn forward first for anything but the pose; a crossover gets back to an edge's speed.
      const forward = cur !== "pose" && this.prev === "spin";
      const need = cur === "crossover" && this.prev === "spin" ? this.entry.edge : this.entry[cur] ?? 0;
      if (v < need || (forward && backwardOf(s))) {
        this.orbit(h, s, t, need + 0.3);
        if (forward && backwardOf(s) && v >= 2 && tap(t, 1)) { h.buttons[A] = 0; h.buttons[B] = 1; }
        return;
      }
      this.readyAt = t;
    }
    const lt = t - this.readyAt;
    if (cur === "glide") { if (v < 3.3 && tap(t, 4)) h.buttons[A] = 1; }
    if (cur === "edge") h.axes[0] = h.axes[2] = 0.5;
    if (cur === "crossover") { h.axes[0] = h.axes[2] = 0.6; if (tap(t, 1.5)) h.buttons[A] = 1; }
    if (cur === "jump") {
      const u = lt % 4;
      if (u < 1.3) h.axes[0] = h.axes[2] = 0.5;
      if (u >= 1 && u < 1.3) { h.buttons[L3] = 1; h.buttons[LT] = h.buttons[RT] = 1; }
      else if (u >= 1.4) h.buttons[LT] = h.buttons[RT] = 0.5;
      if (v < 3.5 && u > 3) h.buttons[A] = 1;
    }
    // A spin starts on a fresh press of Y: press until it starts, then hold it.
    if (cur === "spin") { h.axes[0] = h.axes[2] = 0.5; if (lt > 1 && (s.move === MOVE.Spin || lt % 1 < 0.5)) h.buttons[Y] = 1; }
    if (cur === "pose") { if (v < 2.5) { if (tap(t, 1)) h.buttons[A] = 1; } else { h.buttons[A] = 1; h.buttons[L3] = 1; } }
  }
}
