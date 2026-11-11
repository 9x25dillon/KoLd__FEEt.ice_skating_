// game/warmup.ts — the warm-up group: the event's field on the ice with you before a program.
//
// The owner, 2026-11-11: "put the rivals in the warm-up group". In competition a
// group warms up together before anyone skates. Here each rival of the event's
// field (game/rivals.ts, by season) is a whole simulated skater on Simulation's
// setup, driven by a pad through the same mapping the player's goes through: the
// closed-loop pilot games/ice-run-godot/tools/rival_baseline.mjs measures their
// scores with. Each circles their own lane round the rink at a speed they push to,
// and now and then tries the pilot's measured half-turn jump. A fall is the sim's,
// and they get up the way a player does (tap A). Nothing here scores, places or
// pays: the warm-up is skated before the program and the program starts fresh.
//
// AUTHORED: the lanes, the speeds and how often they jump. Skaters do not collide
// with each other or with you; the sim has no skater-to-skater contact.

import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import type { SkaterState } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { IceGrid } from "../sim/ice.ts";
import { setupParams, setupInput } from "./setups.ts";
import { defaultControllerProfile } from "./full-controls.ts";
import type { GameControlState } from "./full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls } from "../app/pad.ts";
import { resolveRinkCollision } from "./rink.ts";
import { RIVALS } from "./rivals.ts";

/** Seconds the warm-up runs before the program, unless skipped. AUTHORED (a real one is six minutes). */
export const WARMUP_SECONDS = 45;
/** Lanes: circle centres (sim metres; the sheet's centre is 0, 18) and radius. Clear of the player's start at 0, 0. */
export const LANES = [
  { x: -17, y: 30 }, { x: 17, y: 30 }, { x: -17, y: 8 }, { x: 17, y: 8 }, { x: 0, y: 36 }, { x: -6, y: 19 },
] as const;
export const LANE_RADIUS = 5.5;
/** Pad indices, test/padcourse.test.ts's. */
const A = 0, B = 1, LT = 6, RT = 7, L3 = 10;
/** Simulation's lean through both sticks, as the pilot shapes it (default profile: deadzone .22, curve 1.35, gain .7). */
const G = 9.81, MAX_LEAN = 1.13, GAIN = 0.7, DZ = 0.22, CURVE = 1.35;
function stickFor(lean: number): number {
  const shaped = Math.min(1, Math.abs(lean) / MAX_LEAN / GAIN);
  return shaped <= 0 ? 0 : Math.sign(lean) * (DZ + (1 - DZ) * Math.pow(shaped, 1 / CURVE));
}
const tap = (t: number, every: number) => Math.floor(t * 60) % Math.round(every * 60) < 3;

export interface WarmupSkater {
  name: string;
  state: SkaterState;
  /** Their own pad state and params: a rival skates Simulation whatever the player's setup. */
  readonly params: Params;
  readonly steering: GameControlState;
  readonly lane: { x: number; y: number };
  /** m/s they push back up to; s between jump tries, and when the next is due. */
  readonly cruise: number;
  readonly jumpEvery: number;
  jumpAt: number;
  jumpFrom: number;
  dir: number;
  falls: number;
}

export class WarmupGroup {
  readonly skaters: WarmupSkater[];
  elapsed = 0;
  private readonly profile = defaultControllerProfile();
  private readonly ice: IceGrid;
  readonly seconds: number;
  constructor(names: readonly string[], seconds = WARMUP_SECONDS) {
    this.seconds = seconds;
    this.skaters = names.slice(0, LANES.length).map((name, i) => {
      const params = setupParams("simulation");
      const lane = LANES[i];
      const rival = RIVALS.find(r => r.name === name);
      // A stronger skater cruises a little faster and tries more jumps. AUTHORED.
      const level = rival?.level ?? 1;
      const cruise = 3 + 0.8 * Math.min(1, Math.max(0, level - 0.8));
      const state = createState(params, cruise);
      // On their circle's near side, already moving round it anticlockwise.
      state.pos = { x: lane.x + LANE_RADIUS, y: lane.y };
      state.vel = { x: 0, y: cruise };
      state.heading = { x: 0, y: 1 };
      const jumpEvery = 14 - 4 * Math.min(1, Math.max(0, level - 0.8));
      return { name, state, params, steering: newSchemeState(), lane, cruise, jumpEvery, jumpAt: 4 + 2.5 * i, jumpFrom: -1, dir: 1, falls: 0 };
    });
    this.ice = new IceGrid(this.skaters[0]?.params.rinkHalfLength ?? 30, this.skaters[0]?.params.rinkHalfWidth ?? 15);
  }
  get done() { return this.elapsed >= this.seconds; }
  get secondsLeft() { return Math.max(0, this.seconds - this.elapsed); }

  tick() {
    const t = this.elapsed;
    for (const k of this.skaters) {
      const h = { axes: [0, 0, 0, 0], buttons: Array(22).fill(0), keys: [] as string[], connected: true };
      this.pad(k, h, t);
      const mapped = setupInput({ hardware: h } as unknown as Controls, k.state, "simulation", k.steering, k.params, this.profile);
      const events: never[] = [];
      const wasFallen = k.state.fallen;
      step(k.state, mapped.input, k.params, SIM_DT, events, this.ice);
      resolveRinkCollision(k.state, events);
      if (k.state.fallen && !wasFallen) k.falls++;
    }
    this.elapsed += SIM_DT;
  }

  /** The pilot: round the lane, push below cruise, a jump when one is due; up again after a fall. */
  private pad(k: WarmupSkater, h: { axes: number[]; buttons: number[] }, t: number) {
    const s = k.state;
    if (s.fallen) { if (k.jumpFrom >= 0) k.jumpAt = t + k.jumpEvery; k.jumpFrom = -1; if (tap(t, 0.5)) h.buttons[A] = 1; return; }
    const v = Math.hypot(s.vel.x, s.vel.y) || 1e-6;
    const backward = s.vel.x * s.heading.x + s.vel.y * s.heading.y < 0;
    // rival_baseline.mjs's jump pad, from an edge: lean, load with both triggers and L3, soft knees after.
    if (k.jumpFrom < 0 && t >= k.jumpAt && v >= 3 && !backward && s.move === MOVE.None) k.jumpFrom = t;
    if (k.jumpFrom >= 0) {
      const u = t - k.jumpFrom;
      if (u < 1.3) h.axes[0] = h.axes[2] = 0.5;
      if (u >= 1 && u < 1.3) { h.buttons[L3] = 1; h.buttons[LT] = h.buttons[RT] = 1; }
      else if (u >= 1.4) h.buttons[LT] = h.buttons[RT] = 0.5;
      if (u >= 3 && s.jump.phase === JUMP_PHASE.None) { k.jumpFrom = -1; k.jumpAt = t + k.jumpEvery; }
      return;
    }
    // Landed backward: three-turn to forward on the curve (game/tutorial.ts: tap B), as the pilot does out of a spin.
    if (backward && v >= 2 && tap(t, 1)) { h.buttons[B] = 1; }
    this.orbit(k, h, t, v);
  }

  /** rival_baseline.mjs's orbit: the lean this speed holds on the lane's circle, corrected toward it; tap A below cruise. */
  private orbit(k: WarmupSkater, h: { axes: number[]; buttons: number[] }, t: number, v: number) {
    const s = k.state, R = LANE_RADIUS;
    const dx = s.pos.x - k.lane.x, dy = s.pos.y - k.lane.y, dist = Math.hypot(dx, dy) || 1e-6;
    const vx = s.vel.x / v, vy = s.vel.y / v;
    const tx = -dy / dist, ty = dx / dist;
    const out = Math.atan2(vx * dx / dist + vy * dy / dist, vx * tx + vy * ty);
    const most = Math.atan(v * v / (G * Math.max(R * 0.55, 1)));
    const phi = Math.max(0, Math.min(most, Math.atan(v * v / (G * R)) + 0.04 * (dist - R) + 0.4 * out));
    const backward = s.vel.x * s.heading.x + s.vel.y * s.heading.y < 0;
    h.axes[0] = h.axes[2] = stickFor(k.dir * (backward ? -1 : 1) * phi);
    if (v < k.cruise && tap(t, 1.2)) h.buttons[A] = 1;
  }

  /** For a client: each skater's name and whole state, the pairs partner's shape. */
  snapshot() {
    return { seconds: this.secondsLeft, skaters: this.skaters.map(k => ({ name: k.name, state: k.state, low: false, falls: k.falls })) };
  }
}
