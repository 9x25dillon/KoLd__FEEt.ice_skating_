// tools/ice-lab/sim/profile.ts — who is skating, as a layer over Params.
//
// The solver is a pure function of state, input, ice and a Params set, and
// that stays true. A SkaterProfile never reaches the solver: it is BAKED into a
// Params set by `applyProfile`, exactly the way a UE5 tuning asset would be
// baked, and the solver never learns that the number it was handed came from a
// person rather than a slider.
//
// Three kinds of thing live on a profile, and they move at three speeds:
//
//   body    mass, height           set once, or by a career's off-season
//   blade   wear since sharpening  grows with every minute on the ice
//   stats   five 0..100 numbers    move only when the career layer trains them
//
// The career module (training, mini-games, the season) owns the moving of
// them. This file owns what they DO, and the arithmetic of what they cost, so
// that the two can be balanced against the scoring system in one place.
//
// BALANCE IN ONE PARAGRAPH. Every stat is 0..100 and 50 is the reference
// skater: DEFAULT_PARAMS exactly, so nothing recorded against `spec` moves. The
// bottom half buys back a handicap linearly; the top half buys a bonus with
// diminishing returns (a (2x-1)^0.75 curve), so the 90th point is worth less
// than the 60th and a maxed stat is never a different sport. The XP price of a
// point rises quadratically with the stat, so the same diminishing curve is
// paid for on the way up. Everything a stat touches is a multiplier on a
// Params field, bounded here in one table (STAT_EFFECTS), and the whole span
// of a stat is a lever the test suite measures — see test/profile.test.ts.

import { DEFAULT_PARAMS, validate } from "./params.ts";
import type { Params } from "./params.ts";

export const STAT_NAMES = ["strength", "spring", "edgeControl", "balance", "stamina"] as const;
export type StatName = typeof STAT_NAMES[number];
export type Stats = Record<StatName, number>;

export interface SkaterProfile {
  name: string;
  /** kg. The bible's reference skater is 55 kg; DEFAULT_PARAMS.mass. */
  massKg: number;
  /** m. Scales comHeight (the pendulum length) and, weakly, frontal area. */
  heightM: number;
  /** 0..100 each. 50 is the reference skater on every axis. */
  stats: Stats;
  /**
   * Blade wear since the last sharpening, 0 (fresh) .. 1 (dull). Design bible
   * §4: "sharp blades bite harder and skid less, and dull ones are a career
   * resource". It grows with ice time (`wearBlade`) and `sharpen` resets it.
   */
  bladeWear: number;
  /** Unspent training. The career layer earns it; `train` spends it. */
  xp: number;
}

/** The reference skater: DEFAULT_PARAMS with a name on it. */
export const REFERENCE_MASS = 55.0;
export const REFERENCE_HEIGHT = 1.65;

export const STAT_MIN = 0;
export const STAT_MAX = 100;
export const STAT_NEUTRAL = 50;

/**
 * A stat's position on the balance curve, -1..+1: 0 at the neutral 50.
 * Linear below, concave above. `curve(100) === 1` and `curve(0) === -1`.
 */
export function curve(stat: number): number {
  const x = clampStat(stat) / STAT_MAX;
  if (x <= 0.5) return 2 * x - 1;
  // t^0.75 from square roots alone: sim/ may not call Math.pow, because the
  // bake feeds a replay and pow is not specified to the bit (boundary test).
  const t = 2 * x - 1;
  return Math.sqrt(t) * Math.sqrt(Math.sqrt(t));
}

export function clampStat(v: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, v));
}

/** One thing a stat does: a field, and how far it moves at 0 and at 100. */
export interface StatEffect {
  key: keyof Params;
  /** Multiplier on the base value at stat 0. */
  atMin: number;
  /** Multiplier at stat 100. */
  atMax: number;
}

/**
 * The whole of what a stat can do to the physics. Bounds are the design
 * bible's where it has one, and otherwise are the widest span the rig's own
 * envelope tests still pass at (see test/profile.test.ts, "a maxed skater
 * still validates and still skates").
 *
 *   strength     the push. strokePower is the bible's `k` in J = m k knee dt.
 *   spring       the take-off: vertical impulse and how fast the arms come in.
 *                The bible's fatigue span on jump height is 1.00 -> 0.82, and
 *                the same span is used upward.
 *   edgeControl  ankle, knee and hip: angulation, and how quickly the tilt
 *                command is answered. The assist tier buys latency the same way.
 *   balance      lean damping and the arms' proportional authority.
 *   stamina      conditioning: one representative drain rate per pool (bible
 *                §2.8's Wind and Legs, `sim/solver.ts`'s `staminaMode`) — a
 *                stat-100 skater's baseline Wind drain and per-push Legs cost
 *                both run at half a neutral skater's, a stat-0 skater's at
 *                one and a half. Inert while `staminaMode` is 0, the same way
 *                every other row here is inert until its own system is live;
 *                the pools' *recovery* rates are deliberately left alone, so
 *                training buys a longer program, not a faster bounce-back.
 */
export const STAT_EFFECTS: Readonly<Record<StatName, readonly StatEffect[]>> = {
  strength: [
    { key: "strokePower", atMin: 0.70, atMax: 1.30 },
  ],
  spring: [
    { key: "jumpImpulse", atMin: 0.82, atMax: 1.18 },
    { key: "inertiaPullRate", atMin: 0.80, atMax: 1.20 },
  ],
  edgeControl: [
    { key: "angulationLimit", atMin: 0.75, atMax: 1.35 },
    { key: "controlLatency", atMin: 1.40, atMax: 0.60 },
  ],
  balance: [
    { key: "balanceKd", atMin: 0.80, atMax: 1.30 },
    { key: "internalGain", atMin: 0.80, atMax: 1.25 },
  ],
  stamina: [
    { key: "staminaWindTimeDrain", atMin: 1.5, atMax: 0.5 },
    { key: "staminaLegsPerPush", atMin: 1.5, atMax: 0.5 },
  ],
};

/** The multiplier one effect applies at a given stat. Exactly 1 at 50. */
export function effectMultiplier(e: StatEffect, stat: number): number {
  const c = curve(stat);
  return c < 0 ? 1 + (1 - e.atMin) * c : 1 + (e.atMax - 1) * c;
}

/**
 * How dull a blade skates. Sharpness multiplies bite capacity (sim/blade.ts),
 * so a dull blade lets go of a deep edge sooner and skids more — which is the
 * bible's description. Fresh from the stone it is a touch above the reference;
 * a fully worn blade has lost a quarter of its bite. The reference skater is
 * at REFERENCE_WEAR, so a `spec` profile bakes to sharpness 1.0.
 */
export const SHARPNESS_FRESH = 1.05;
export const SHARPNESS_DULL = 0.80;
export const REFERENCE_WEAR = (SHARPNESS_FRESH - 1) / (SHARPNESS_FRESH - SHARPNESS_DULL);
export function sharpnessOf(wear: number): number {
  const w = Math.min(1, Math.max(0, wear));
  return SHARPNESS_FRESH - (SHARPNESS_FRESH - SHARPNESS_DULL) * w;
}

/** Hours of ice a fresh edge lasts before it is fully dull. A career knob. */
export const BLADE_LIFE_HOURS = 20;

/** The blade after `seconds` more on the ice. */
export function wearBlade(p: SkaterProfile, seconds: number): SkaterProfile {
  return { ...p, bladeWear: Math.min(1, p.bladeWear + seconds / (BLADE_LIFE_HOURS * 3600)) };
}

export function sharpen(p: SkaterProfile): SkaterProfile {
  return { ...p, bladeWear: 0 };
}

/**
 * Bake a profile over a base parameter set.
 *
 * The base is a preset (spec, responsive, assisted): the profile multiplies
 * what it finds, so an assist tier and a skater compose rather than fight.
 * Body first, then the stats, then the blade. Pure: returns a new object.
 *
 * On the body: mass goes straight in, and it does less than a player will
 * expect, because the rig's stroke, bite and lean all scale with the normal
 * load and so the mass cancels out of them — heavier skaters turn the same
 * arcs at the same lean. What mass does move is the two things that are not
 * proportional to it: air drag (a heavier skater keeps speed better) and
 * the jump, where the same leg drive lifts more kilograms less high. The
 * impulse is scaled by sqrt(reference / mass), a per-kilogram leg drive at
 * constant strength. Frontal area is height times width, and width goes as
 * sqrt(mass / height), so the area — and cdA with it — goes as
 * sqrt(mass * height). Square roots only, for the reason `curve` gives.
 */
export function applyProfile(base: Params, p: SkaterProfile): Params {
  const out: Params = { ...base };
  const massRatio = p.massKg / REFERENCE_MASS;
  out.mass = p.massKg;
  out.comHeight = base.comHeight * (p.heightM / REFERENCE_HEIGHT);
  out.cdA = base.cdA * Math.sqrt(massRatio * (p.heightM / REFERENCE_HEIGHT));
  out.jumpImpulse = base.jumpImpulse / Math.sqrt(massRatio);
  for (const name of STAT_NAMES) {
    for (const e of STAT_EFFECTS[name]) {
      (out[e.key] as number) = (out[e.key] as number) * effectMultiplier(e, p.stats[name]);
    }
  }
  out.sharpness = base.sharpness * sharpnessOf(p.bladeWear) / sharpnessOf(REFERENCE_WEAR);
  return out;
}

// ── progression ─────────────────────────────────────────────────────────────

/**
 * XP to raise a stat from `stat` to `stat + 1`. Quadratic in the stat, so the
 * last ten points cost about as much as the first fifty, and a career that
 * spreads its training buys more physics per hour than one that specialises.
 * That is the balancing lever: with a concave effect curve AND a convex price,
 * the marginal value of a point falls on both sides at once, and the
 * competitive scoring layer can price a season's XP knowing that no single
 * stat can run away with it.
 */
export const XP_BASE = 10;
export const XP_QUAD = 0.04;
export function xpToRaise(stat: number): number {
  const s = clampStat(stat);
  return Math.round(XP_BASE + XP_QUAD * s * s);
}

/** Total XP from 0 to `stat`, for pricing a whole skater. */
export function xpInvested(stat: number): number {
  let sum = 0;
  for (let s = 0; s < clampStat(stat); s++) sum += xpToRaise(s);
  return sum;
}

/**
 * Spend XP on one stat, as many whole points as it buys. Never overspends,
 * never passes STAT_MAX; returns the profile unchanged if the next point is
 * unaffordable. Pure.
 */
export function train(p: SkaterProfile, name: StatName, xp: number = p.xp): SkaterProfile {
  let budget = Math.min(xp, p.xp);
  let stat = p.stats[name];
  while (stat < STAT_MAX && budget >= xpToRaise(stat)) {
    budget -= xpToRaise(stat);
    stat += 1;
  }
  const spent = Math.min(xp, p.xp) - budget;
  return { ...p, xp: p.xp - spent, stats: { ...p.stats, [name]: stat } };
}

/**
 * One number for the whole skater, 0..100, for the tier ladder and, later, for
 * pairing a career skater with a competition field. Weighted, and the weights
 * say what this game thinks skating is: edges and balance are Skating Skills,
 * which the bible puts at the centre; spring is the jump layout; strength is
 * speed; stamina is the second-half bonus.
 */
export const OVERALL_WEIGHTS: Readonly<Stats> = {
  edgeControl: 0.28, balance: 0.22, spring: 0.20, strength: 0.15, stamina: 0.15,
};
export function overall(p: SkaterProfile): number {
  let sum = 0;
  for (const n of STAT_NAMES) sum += OVERALL_WEIGHTS[n] * clampStat(p.stats[n]);
  return sum;
}

/** Design bible §1: club -> regionals -> nationals -> Grand Prix -> Worlds. */
export const TIERS = [
  { name: "club", floor: 0 },
  { name: "regionals", floor: 40 },
  { name: "nationals", floor: 55 },
  { name: "grand prix", floor: 70 },
  { name: "worlds", floor: 85 },
] as const;
export type TierName = typeof TIERS[number]["name"];

export function tierOf(p: SkaterProfile): TierName {
  let t: TierName = TIERS[0].name;
  const o = overall(p);
  for (const tier of TIERS) if (o >= tier.floor) t = tier.name;
  return t;
}

/** Level: one per 25 XP invested across all stats, from 1. */
export const XP_PER_LEVEL = 25;
export function level(p: SkaterProfile): number {
  let invested = 0;
  for (const n of STAT_NAMES) invested += xpInvested(p.stats[n]);
  return 1 + Math.floor(invested / XP_PER_LEVEL);
}

// ── validation and samples ──────────────────────────────────────────────────

export function validateProfile(p: SkaterProfile, base: Params = DEFAULT_PARAMS): string[] {
  const errs: string[] = [];
  if (!(p.massKg >= 30 && p.massKg <= 120)) errs.push("massKg must be 30..120");
  if (!(p.heightM >= 1.2 && p.heightM <= 2.1)) errs.push("heightM must be 1.2..2.1");
  for (const n of STAT_NAMES) {
    const v = p.stats[n];
    if (!(Number.isInteger(v) && v >= STAT_MIN && v <= STAT_MAX))
      errs.push(`${n} must be a whole number ${STAT_MIN}..${STAT_MAX}`);
  }
  if (!(p.bladeWear >= 0 && p.bladeWear <= 1)) errs.push("bladeWear is 0..1");
  if (p.xp < 0) errs.push("xp must not be negative");
  if (errs.length === 0) for (const e of validate(applyProfile(base, p))) errs.push(`baked: ${e}`);
  return errs;
}

export function neutralStats(): Stats {
  return { strength: 50, spring: 50, edgeControl: 50, balance: 50, stamina: 50 };
}

export function makeProfile(name: string, over: Partial<Omit<SkaterProfile, "stats">>
  & { stats?: Partial<Stats> } = {}): SkaterProfile {
  return {
    name, massKg: REFERENCE_MASS, heightM: REFERENCE_HEIGHT, bladeWear: REFERENCE_WEAR, xp: 0,
    ...over, stats: { ...neutralStats(), ...(over.stats ?? {}) },
  };
}

/**
 * Sample skaters for the lab's P key. `reference` bakes to the base preset
 * untouched. The others are the ends of the ladder, so the span of the whole
 * system can be felt in two key presses.
 */
export const SAMPLE_PROFILES: readonly SkaterProfile[] = [
  makeProfile("reference"),
  makeProfile("club novice", {
    massKg: 48, heightM: 1.58, bladeWear: 0.85,
    stats: { strength: 20, spring: 15, edgeControl: 20, balance: 25, stamina: 25 },
  }),
  makeProfile("nationals senior", {
    massKg: 58, heightM: 1.68, bladeWear: 0.3,
    stats: { strength: 60, spring: 65, edgeControl: 62, balance: 58, stamina: 60 },
  }),
  makeProfile("worlds medallist", {
    massKg: 56, heightM: 1.66, bladeWear: 0.05,
    stats: { strength: 85, spring: 95, edgeControl: 92, balance: 88, stamina: 90 },
  }),
];
