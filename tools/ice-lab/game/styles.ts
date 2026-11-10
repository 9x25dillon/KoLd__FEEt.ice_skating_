// tools/ice-lab/game/styles.ts — what kind of skater a career skater is.
//
// The owner, 2026-11-09: styles that "enhance a specific skating technique" with
// "advantages or disadvantages", for a personalized career skater. Power: quad
// ease, intense angular momentum, higher jumps, less precise entrances. Finesse:
// flow, chaining, transitions and dance, at slower speeds and with slightly
// weaker jump entrances. Technician and Endurance, the owner's picks of the two
// suggested from the stats the profile already has.
//
// A style is nothing but multipliers on Params at a run's start, the same road
// sim/profile.ts's stats and game/armfocus.ts's tiers take: it reaches replays
// as ordinary params and needs no solver change. What a style DOES is whatever
// the physics makes of those params; jpse/styles.ts measures it.
//
// THE NUMBERS ARE AUTHORED (L3), NOT MEASURED. No source says how much height a
// power skater buys with how much edge. They are small on purpose (each within
// the stat curves' own spans) and are the levers a tuning pass moves.
//
// Trained like the arms: choosing a style brings its cost at once and half its
// benefit; weeks of style drills bring the rest. Retraining is allowed: a style
// put down keeps what was drilled into it, but rusts at every season step like
// an undrilled jump family, and weeks win it back.

import type { Params } from "../sim/params.ts";

export interface StyleEffect { key: keyof Params; mul: number }

export interface Style {
  id: "power" | "finesse" | "technician" | "endurance";
  title: string;
  blurb: string;
  /** What the style is good at: scaled by mastery, half at the choice and the rest drilled. */
  gives: readonly StyleEffect[];
  /** What it costs: in full from the moment it is chosen. */
  costs: readonly StyleEffect[];
}

export const STYLES: readonly Style[] = [
  {
    id: "power", title: "Power",
    blurb: "Big takeoffs and a fast pull-in: height and rotation come easier. The edges answer slower, so entrances are harder to hold clean.",
    gives: [
      { key: "jumpImpulse", mul: 1.08 }, { key: "jumpWhip", mul: 1.10 },
      { key: "inertiaPullRate", mul: 1.10 }, { key: "strokePower", mul: 1.06 },
    ],
    costs: [{ key: "angulationLimit", mul: 0.92 }, { key: "controlLatency", mul: 1.15 }, { key: "balanceKd", mul: 0.94 }],
  },
  {
    id: "finesse", title: "Finesse",
    blurb: "Deep, quick edges, steady balance, and a free leg that goes where it is sent and higher than anyone's: spirals, the attitude and, drilled, the standing split. Slower across the ice, and the jumps leave a little lower.",
    gives: [
      { key: "angulationLimit", mul: 1.08 }, { key: "controlLatency", mul: 0.88 },
      { key: "balanceKd", mul: 1.08 }, { key: "internalGain", mul: 1.08 }, { key: "freeLegTorqueMax", mul: 1.15 },
      // The hip's range: 0.6 -> 0.9 drilled, the standing split's 0.9; 0.75 at the choice, a haircutter's.
      { key: "flexibility", mul: 1.5 },
    ],
    costs: [{ key: "strokePower", mul: 0.92 }, { key: "jumpImpulse", mul: 0.95 }],
  },
  {
    id: "technician", title: "Technician",
    blurb: "The edges first: the deepest angulation and the quickest answer, for clean calls, turns and steps. Less whip in the jumps, a little less push.",
    gives: [{ key: "angulationLimit", mul: 1.10 }, { key: "controlLatency", mul: 0.85 }],
    costs: [{ key: "jumpWhip", mul: 0.94 }, { key: "strokePower", mul: 0.96 }],
  },
  {
    id: "endurance", title: "Endurance",
    blurb: "Conditioning: wind and legs last a whole program, so the last jump is skated as the first. Each takeoff is a little smaller.",
    gives: [
      { key: "staminaWindTimeDrain", mul: 0.75 }, { key: "staminaLegsPerPush", mul: 0.75 }, { key: "staminaLegsPerJump", mul: 0.80 },
      { key: "staminaLegsPerLegHold", mul: 0.75 },
    ],
    costs: [{ key: "jumpImpulse", mul: 0.96 }, { key: "jumpWhip", mul: 0.96 }],
  },
];

export type StyleId = Style["id"];

/** Mastery a week of style drills adds, and what a put-down style loses at each season step. Authored. */
export const STYLE_PER_WEEK = 0.25;
export const STYLE_RUST_PER_STEP = 0.25;
/** Of a style's benefit, the share the choice brings before any drill. */
export const STYLE_CHOSEN_SHARE = 0.5;

/** How much of a style's benefit is live at this mastery, 0..1. */
export function styleStrength(mastery: number): number {
  const m = Math.max(0, Math.min(1, mastery));
  return STYLE_CHOSEN_SHARE + (1 - STYLE_CHOSEN_SHARE) * m;
}

/** A run's params under a style (index into STYLES, -1 for none) at its mastery. */
export function styleParams(base: Params, style: number, mastery: number): Params {
  const st = STYLES[style];
  if (!st) return base;
  const p = { ...base };
  const k = styleStrength(mastery);
  for (const e of st.gives) p[e.key] = (base[e.key] as number) * (1 + (e.mul - 1) * k);
  for (const e of st.costs) p[e.key] = (p[e.key] as number) * e.mul;
  return p;
}
