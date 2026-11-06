// game/steady.ts — the steadying hand: a coach's hand at the player's elbow,
// on the INPUT, never the physics. The owner's ask, 2026-11-05: "features that
// help keep the skater upright"; and their pick of the plan: on every setup, Off
// by default where the setup promises minimal assistance (Simulation and
// Experimental, and Dig Gate, which is Experimental's athlete), Light elsewhere.
//
// What it does was chosen by measurement (test/steady.test.ts): a novice on the
// pad — sticks slammed or wandering, pushing when slow, getting up after a fall
// — falls almost always by asking for more lean than the speed can hold. On a
// sheet at 1.5 m/s the edge carries about 4° of lean; a novice asks for 45° and
// is on the ice half a second later (LeanExceeded, not the balance timer). So
// the hand does one thing: it never lets the asked lean past what the edge can
// hold at this speed, the speed-aware limit Blade Explorer already applies
// (game/full-controls.ts leanAssist), here on every setup and at the player's
// strength. Firm holds to that limit; Light lets 1.25 times it through.
//
// Tried and dropped, for want of effect on the measured falls: the asked lean
// following the body's when it tips; easing fore-aft pressure near a pitch fall
// (the novice never fell that way); holding back pushes at a standstill (the
// one cause it cannot reach: Experimental's falls come at 0 m/s, where no lean
// limit helps).
//
// It reads only the skater's speed and writes only the SkatingInput it is
// handed, the way game/beginner.ts's coach and game/training.ts's rust gate do;
// a replay records what it handed on, so a replay still verifies.

import type { Params } from "../sim/params.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Setup } from "./setups.ts";

export const STEADY_LEVELS = [
  { id: "off", name: "Off", strength: 0 },
  { id: "light", name: "Light", strength: 0.5 },
  { id: "firm", name: "Firm", strength: 1 },
] as const;
export type SteadyLevel = typeof STEADY_LEVELS[number]["id"];
export const isSteadyLevel = (v: unknown): v is SteadyLevel => STEADY_LEVELS.some(l => l.id === v);
export const steadyStrength = (level: SteadyLevel) => STEADY_LEVELS.find(l => l.id === level)!.strength;
export const steadyName = (level: SteadyLevel) => STEADY_LEVELS.find(l => l.id === level)!.name;

/** The owner's pick (2026-11-05): Off where the setup promises minimal assistance, Light elsewhere. */
export function steadyDefault(setup: Setup | null): SteadyLevel {
  return setup === "simulation" || setup === "experimental" || setup === "diggate" ? "off" : "light";
}

/** AUTHORED (Explorer's leanAssist): the share of the lean an edge can hold at this speed that the limit allows. */
export const SAFE_SHARE = 0.75;
/** AUTHORED, then measured against 1.5 and 2 (test/steady.test.ts): how much looser than Firm the limit is at strength 0. */
export const LOOSE = 0.5;

/** The lean, as a share of maxLean, that an edge at this speed can hold with some to spare. */
export function safeLean(s: SkaterState, p: Params): number {
  const speed = Math.hypot(s.vel.x, s.vel.y);
  return SAFE_SHARE * Math.atan2(speed * speed * Math.sin(p.maxTilt) / p.rocker, p.gravity) / p.maxLean;
}

export class SteadyHand {
  strength: number;
  /** 0..1: how much of the asked lean it held back on the last tick, for the HUD. */
  held = 0;
  constructor(strength = 0) { this.strength = strength; }

  /** The limit at this strength, as a share of maxLean: Firm the safe lean, Light 1.25 times it. */
  limit(s: SkaterState, p: Params): number {
    return safeLean(s, p) * (1 + (1 - this.strength) * LOOSE);
  }

  /** The input it hands on: the player's own, its lean held to what the edge can carry. Never touches `s`. */
  apply(input: SkatingInput, s: SkaterState, p: Params): SkatingInput {
    this.held = 0;
    // Out of the way: off, down, in the air or loading a jump, and inside a move the player asked for.
    if (this.strength <= 0 || s.fallen || s.jump.phase !== JUMP_PHASE.None || s.move !== MOVE.None
      || input.turn || input.bracket || input.spin || input.twizzle || input.inaBauer) return input;
    const limit = this.limit(s, p);
    if (Math.abs(input.lean) <= limit) return input;
    const lean = Math.sign(input.lean) * limit;
    this.held = Math.min(1, (Math.abs(input.lean) - limit) / Math.max(0.05, Math.abs(input.lean)));
    return { ...input, lean };
  }
}
