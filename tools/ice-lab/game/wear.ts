// game/wear.ts — what falling does to a career skater's body, and which hip a fall lands on.
//
// The owner, 2026-11-02: she should take a fall on her hip side and outer thigh as often as
// possible, and in career the more falls you take the more it affects long-term performance,
// eventually causing injuries. It follows jump rust's rule (game/training.ts, settled
// 2026-11-01): it acts through the skating and never a menu lock, and it can be won back at a
// real cost in weeks. It also takes nothing from the skater's trained stats, so it never moves
// `overall` or an event's gate: it lowers what they skate with, at a run's start, and reaches
// replays as ordinary params with no solver change.
//
// No dice: the same falls always do the same thing.
//
// THE NUMBERS ARE AUTHORED, NOT MEASURED. No source says how much a fall costs a skater. What
// they do to the skating is measured in test/wear.test.ts.
import { FALL } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import type { SkaterProfile, StatName } from "../sim/profile.ts";

/** Each part of the body a fall can hurt, and the skills it takes from. */
export const BODY_REGIONS = [
  { id: "hip", title: "Hips", injury: "Bruised hip", stats: ["balance", "edgeControl"], blurb: "Takes most falls. Costs balance and edge control." },
  { id: "knee", title: "Knees", injury: "Jarred knee", stats: ["spring", "stamina"], blurb: "Takes failed landings. Costs spring and stamina." },
  { id: "shoulder", title: "Shoulder", injury: "Knocked shoulder", stats: ["strength"], blurb: "Takes the boards. Costs push power." },
] as const satisfies readonly { id: string; title: string; injury: string; stats: readonly StatName[]; blurb: string }[];
export type BodyRegion = typeof BODY_REGIONS[number]["id"];
export type Wear = Record<BodyRegion, number>;
export type Injured = Record<BodyRegion, boolean>;

export const noWear = (): Wear => ({ hip: 0, knee: 0, shoulder: 0 });
export const noInjury = (): Injured => ({ hip: false, knee: false, shoulder: false });

/** Wear from one fall at WEAR_REFERENCE_SPEED. Authored: an event of three falls is about 0.15-0.2 on a region. */
export const FALL_WEAR: Record<BodyRegion, number> = { hip: 0.05, knee: 0.08, shoulder: 0.1 };
/** m/s at which a fall costs FALL_WEAR; faster falls cost more, up to 1.5 times, slower down to half. Authored. */
export const WEAR_REFERENCE_SPEED = 5;
/** Wear at which a region becomes an injury, and the wear it must come back under to heal. Authored. */
export const INJURED_AT = 1, HEALED_UNDER = 0.5;
/** Stat points a region costs at full wear, and on top while injured. Authored. */
export const WEAR_COST = 10, INJURY_COST = 12;
/** Wear one training week of rest takes off a region. Authored: an injury needs three weeks at least. */
export const REST_PER_WEEK = 0.2;

export interface FallHit { region: BodyRegion; wear: number }

/** Where a fall lands, by how the sim called it. */
export function fallRegion(reason: number): BodyRegion {
  return reason === FALL.Landing ? "knee" : reason === FALL.Collision ? "shoulder" : "hip";
}

/** What one fall costs, from how it happened. */
export function fallHit(reason: number, speed: number): FallHit {
  const region = fallRegion(reason);
  const scale = Math.max(0.5, Math.min(1.5, speed / WEAR_REFERENCE_SPEED));
  return { region, wear: FALL_WEAR[region] * scale };
}

/** Reports each fall once, as it happens. */
export class FallWatch {
  private down = false;
  sample(s: Readonly<SkaterState>): FallHit | null {
    const fell = s.fallen && !this.down;
    this.down = s.fallen;
    return fell ? fallHit(s.fallReason, Math.hypot(s.vel.x, s.vel.y)) : null;
  }
}

/** The skater this body can skate as today. Their trained stats and XP are untouched. */
export function wornProfile(profile: SkaterProfile, wear: Wear, injured: Injured): SkaterProfile {
  const stats = { ...profile.stats };
  for (const r of BODY_REGIONS) {
    const cost = Math.round(WEAR_COST * Math.min(1, wear[r.id])) + (injured[r.id] ? INJURY_COST : 0);
    for (const stat of r.stats) stats[stat] = Math.max(0, stats[stat] - cost);
  }
  return { ...profile, stats };
}

/**
 * Which hip takes the fall, +1 the skater's left and -1 their right: the side they were
 * already going down on, or their skating foot's when they were upright. A forward or
 * backward fall rolls onto that hip too, so she rarely lands on her front. Read it once, when
 * the fall begins. scripts/skater.gd's track_fall is this rule's native twin.
 */
export function fallSide(s: Readonly<Pick<SkaterState, "lean" | "supportFoot">>): number {
  return Math.abs(s.lean) > 0.02 ? Math.sign(s.lean) : s.supportFoot === 0 ? 1 : -1;
}

/**
 * What a run's falls did to the body, in words, for the result screen; empty
 * when nothing changed. Added 2026-11-02 from play: a fall left no word there.
 */
export function wearNote(before: Wear, after: Wear): string {
  const hit = BODY_REGIONS.filter(r => after[r.id] > before[r.id] + 1e-9);
  if (!hit.length) return "";
  const pct = (n: number) => Math.round(n * 100);
  const parts = hit.map(r => `${r.title.toLowerCase()} +${Math.max(1, pct(after[r.id] - before[r.id]))}% (now ${pct(after[r.id])}%)`);
  const costs = [...new Set(hit.flatMap(r => r.stats))].map(s => s.replace(/[A-Z]/g, c => " " + c.toLowerCase()));
  return `The falls wore your ${parts.join(" and ")}. Until you rest it on the Season page, it costs ${costs.join(", ")}.`;
}
