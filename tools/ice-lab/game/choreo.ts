// game/choreo.ts — the skater's choreography: what her arms, free leg, trunk and head do on top
// of the pose the physics gives.
//
// The owner's ask, 2026-11-06: a lot of different falls; hand and arm movement in ballet styles;
// landings that differ by jump, by combination, by how well the jump was done; differences by
// style and by physique. docs/choreography.md is the design and its history.
//
// It reads the states the solver left and writes nothing back, so it is presentation only, and a
// replay (the same states) dances the same: every choice comes from the state, the landing record
// or the tick, never from an unseeded random number. The trunk's height and lean, the blades, the
// heading and the jump's flight stay the solver's; this layer shapes what the solver leaves free.
//
// It hands the clients PLANS: short keyframe timelines in the skater's body frame (skater.gd's:
// x right, y up, z back, metres). A client eases each plan in and out and lerps its own procedural
// pose toward it, so with no plan the pose is exactly what it was before this module existed.
//
// THE POSITIONS, TIMINGS AND THRESHOLDS ARE AUTHORED (L3): judged from stills and from what a
// skater's coach would recognise, not measured from motion capture. Retune from play.
//
// Rules kept (the owner's, from earlier sessions):
// - falls land her on her hip side and outer thigh, never her front;
// - nobody holds arms level for a program;
// - the physics decides what happened; this only decides how it looks.

import type { JumpResult, SkaterState } from "../sim/types.ts";
import { FALL, MOVE } from "../sim/types.ts";
import { EDGE_CALL, JUMP, JUMP_NONE, JUMP_PHASE, ROTATION_CALL } from "../sim/jump.ts";
import type { SkaterProfile } from "../sim/profile.ts";

// ── shapes ───────────────────────────────────────────────────────────────────

export type V3 = [number, number, number];

/**
 * One arm, as skater.gd poses it: the elbow's direction from the shoulder and the hand's point from
 * the shoulder, metres, x OUTWARD on that arm's own side (the client multiplies x by the side).
 * `w` is the wrist, 0 soft (it droops) to 1 long (allongé, the line carried through the fingers).
 * `ice`: the hand's y is its height above the ice, not its drop from the shoulder (a hand down).
 */
export interface ArmShape { e: V3; h: V3; w: number; ice?: boolean }

/**
 * The trunk and head, radians. pitch: forward bend at the hips (+ forward); roll: side bend toward
 * the plan's side A; twist: side A's shoulder carried back against the hips; chin: + lifts the head;
 * turn: the head turned toward side A.
 */
export interface Trunk { pitch: number; roll: number; twist: number; chin: number; turn: number }

/**
 * A fall's whole trunk on the ice, body-frame points with x toward the side she falls on (the
 * client multiplies x by her fall side): hip, spine, neck and head (only the directions between
 * them are used: the bones keep their lengths), the fall-side foot (`under`) and the other foot.
 */
export interface FallFrame { hip: V3; spine: V3; neck: V3; head: V3; under: V3; other: V3 }

/** One moment of a plan. Every key of a plan carries the same channels (the builder fills them). */
export interface Key {
  t: number;
  /** Side A's arm and side B's arm (see Plan.rel). */
  armA?: ArmShape;
  armB?: ArmShape;
  /** The free foot, body frame, x outward on the free leg's side; and how pointed its toe is, 0..1. */
  leg?: V3;
  point?: number;
  trunk?: Trunk;
  fall?: FallFrame;
}

export type PlanKind = "phrase" | "spin" | "spiral" | "landing" | "rebound" | "fall" | "rise" | "bow";
/**
 * Which side is A. "support": the skating foot's side (a landing: the support arm goes to the side,
 * the free arm leads); "fall": the side she is falling to; "left" / "right": as named.
 */
export type Rel = "left" | "right" | "support" | "fall";

export interface Plan {
  id: number;
  kind: PlanKind;
  /** For people: "Flowing exit · Triple Lutz · Classical". */
  label: string;
  rel: Rel;
  /** Engine seconds when it began. */
  start: number;
  dur: number;
  blendIn: number;
  blendOut: number;
  /** How much of the plan shows at full blend, 0..1 (a phrase carries the arm style's share). */
  weight: number;
  keys: Key[];
}

/** What a snapshot carries: the plan as of now. */
export interface PlanView extends Omit<Plan, "start"> { at: number }

export interface ChoreoView {
  style: StyleId;
  base: PlanView | null;
  top: PlanView | null;
}

const v = (x: number, y: number, z: number): V3 => [x, y, z];
const arm = (e: V3, h: V3, w = 0.5): ArmShape => ({ e, h, w });
const still = (): Trunk => ({ pitch: 0, roll: 0, twist: 0, chin: 0, turn: 0 });

/** The port de bras and the skating positions, for one arm, x outward. AUTHORED (L3). */
export const POSITIONS = {
  /** Hanging, soft: what the procedural pose does unasked. */
  rest: arm(v(0.10, -0.26, 0.01), v(0.14, -0.46, -0.10), 0.3),
  /** Bras bas: low and rounded, the hands near each other in front of the hips. */
  brasBas: arm(v(0.09, -0.24, -0.08), v(-0.07, -0.42, -0.15), 0.4),
  /** First: rounded in front at the stomach. */
  first: arm(v(0.16, -0.12, -0.17), v(-0.06, -0.20, -0.34), 0.4),
  /** Demi-seconde: halfway open, low. */
  demiSeconde: arm(v(0.20, -0.17, -0.06), v(0.34, -0.33, -0.12), 0.5),
  /** Second: open to the side, a little below the shoulder and in front of it, rounded. */
  second: arm(v(0.27, -0.07, -0.08), v(0.47, -0.14, -0.16), 0.5),
  /** Allongé: second lengthened, the line through the fingers. */
  allonge: arm(v(0.30, -0.03, -0.02), v(0.52, -0.05, -0.04), 1),
  /** Fifth en haut: rounded overhead, the hands in front of the crown. */
  fifthHigh: arm(v(0.16, 0.18, -0.09), v(-0.06, 0.43, -0.12), 0.4),
  /** Arabesque: the front arm forward at the shoulder, the back arm long behind the side. */
  arabesqueFront: arm(v(0.05, 0.01, -0.28), v(0.03, 0.06, -0.53), 1),
  arabesqueBack: arm(v(0.26, 0, 0.10), v(0.46, 0.02, 0.24), 1),
  /** The landing check: the free side's arm leads forward, the skating side's goes to the side. */
  checkFront: arm(v(0.10, -0.04, -0.26), v(0.06, -0.06, -0.50), 0.9),
  checkSide: arm(v(0.29, -0.02, 0.03), v(0.51, -0.04, 0.08), 0.9),
  /** A V overhead. */
  victory: arm(v(0.17, 0.21, -0.03), v(0.32, 0.45, -0.05), 0.8),
  /** A hand to the heart. */
  heart: arm(v(0.12, -0.15, -0.10), v(-0.14, -0.08, -0.15), 0.3),
  /** Contemporary: a reach up and forward; a low sweep behind. */
  reachUp: arm(v(0.08, 0.22, -0.10), v(0.05, 0.48, -0.22), 1),
  sweepLow: arm(v(0.22, -0.18, 0.06), v(0.36, -0.36, 0.14), 0.8),
  /** Athletic: a fist at the shoulder. */
  fist: arm(v(0.20, -0.04, -0.16), v(0.16, 0.10, -0.24), 0),
  /** Showman: an arm presented to the crowd; a wave. */
  present: arm(v(0.22, -0.04, -0.18), v(0.40, 0.02, -0.36), 1),
  wave: arm(v(0.24, 0.14, -0.08), v(0.30, 0.40, -0.10), 0.6),
  /** Gathered for a combination's next takeoff: in, compact. */
  gather: arm(v(0.13, -0.16, -0.12), v(-0.08, -0.14, -0.22), 0.2),
  /** Trouble: braced out, braced forward, flung up. */
  braceSide: arm(v(0.24, -0.12, 0.02), v(0.40, -0.30, 0.04), 0.2),
  braceFront: arm(v(0.18, -0.10, -0.18), v(0.26, -0.30, -0.30), 0.2),
  flail: arm(v(0.26, 0.10, 0.02), v(0.40, 0.30, 0.10), 0),
  /** The révérence's sweep, out and down. */
  bowSweep: arm(v(0.26, -0.10, -0.06), v(0.44, -0.26, -0.10), 0.9),
} satisfies Record<string, ArmShape>;
export type PositionId = keyof typeof POSITIONS;
const P = POSITIONS;

/** The free foot's places, body frame, x outward. AUTHORED (L3). */
export const LEGS = {
  /** Trailing low behind, the plain glide. */
  trail: v(0.14, 0.22, 0.55),
  /** Extended behind, long and straight: the landing line. (The leg is about 0.77 m; a foot this far from the hip straightens the knee.) */
  extended: v(0.15, 0.36, 0.74),
  /** Arabesque: high behind, the knee straight. */
  arabesque: v(0.12, 0.66, 0.72),
  /** A loop's crossed legs, the free foot in front of the skating one. */
  crossed: v(-0.10, 0.28, -0.08),
  /** Drawn in beside the skating ankle. */
  beside: v(0.06, 0.26, 0.08),
  /** Down on the ice: a step-out. */
  stepDown: v(0.20, 0.10, 0.30),
  /** Both feet down. */
  twoFoot: v(0.18, 0.09, 0.04),
  /** A Salchow's swing, out to the side. */
  swingSide: v(0.34, 0.26, 0.18),
  /** Tucked for a combination's next takeoff. */
  tucked: v(0.04, 0.36, 0.06),
  /** The curtsey: behind and across. */
  curtsey: v(-0.08, 0.10, 0.30),
} satisfies Record<string, V3>;

// ── styles ───────────────────────────────────────────────────────────────────

export type StyleId = "classical" | "contemporary" | "athletic" | "showman";

/** One step of a phrase: side A's arm, side B's arm, how many beats it is held, and the trunk and head. */
interface Step { a: PositionId; b: PositionId; beats: number; trunk?: Partial<Trunk> }

export interface Style {
  id: StyleId;
  title: string;
  blurb: string;
  /** How much of the phrases' line shows (an athletic skater's arms mostly work). */
  phraseWeight: number;
  /** The head's carriage in a held line, radians of lift. */
  chin: number;
  /** Wrist lengthening on top of each position's own, -1..1. */
  wrist: number;
  phrases: Step[][];
  /** The open arms of an upright spin, a camel, a sit spin, and a spiral's line: [A, B]. */
  spin: [PositionId, PositionId];
  camel: [PositionId, PositionId];
  sit: [PositionId, PositionId];
  spiral: [PositionId, PositionId];
}

/** AUTHORED (L3). */
export const STYLES: readonly Style[] = [
  {
    id: "classical", title: "Classical",
    blurb: "Ballet: rounded arms through the positions, soft wrists, long held lines, a curtsey.",
    phraseWeight: 1, chin: 0.12, wrist: 0,
    phrases: [
      [{ a: "brasBas", b: "brasBas", beats: 2 }, { a: "first", b: "first", beats: 2 }, { a: "second", b: "second", beats: 2 }, { a: "allonge", b: "allonge", beats: 1 }, { a: "demiSeconde", b: "demiSeconde", beats: 1 }],
      [{ a: "second", b: "second", beats: 2 }, { a: "fifthHigh", b: "second", beats: 2, trunk: { turn: 0.25, chin: 0.1 } }, { a: "fifthHigh", b: "fifthHigh", beats: 2, trunk: { chin: 0.15 } }, { a: "allonge", b: "allonge", beats: 2 }],
      [{ a: "first", b: "first", beats: 1 }, { a: "arabesqueFront", b: "arabesqueBack", beats: 3, trunk: { turn: 0.2 } }, { a: "allonge", b: "allonge", beats: 2 }, { a: "demiSeconde", b: "demiSeconde", beats: 2 }],
    ],
    spin: ["second", "second"], camel: ["allonge", "allonge"], sit: ["first", "first"], spiral: ["arabesqueFront", "arabesqueBack"],
  },
  {
    id: "contemporary", title: "Contemporary",
    blurb: "Asymmetric and flowing: one arm reaching while the other sweeps, the head following the hand.",
    phraseWeight: 1, chin: 0.06, wrist: 0.2,
    phrases: [
      [{ a: "reachUp", b: "sweepLow", beats: 2, trunk: { roll: 0.12, turn: 0.3, chin: 0.15 } }, { a: "sweepLow", b: "reachUp", beats: 2, trunk: { roll: -0.12, turn: -0.3, chin: 0.15 } }, { a: "heart", b: "second", beats: 2, trunk: { turn: -0.15 } }, { a: "allonge", b: "allonge", beats: 2 }],
      [{ a: "first", b: "heart", beats: 1 }, { a: "reachUp", b: "second", beats: 2, trunk: { roll: 0.1, turn: 0.25 } }, { a: "sweepLow", b: "sweepLow", beats: 2, trunk: { pitch: 0.08 } }, { a: "demiSeconde", b: "reachUp", beats: 2, trunk: { turn: -0.25, chin: 0.12 } }],
    ],
    spin: ["fifthHigh", "second"], camel: ["arabesqueFront", "arabesqueBack"], sit: ["heart", "first"], spiral: ["reachUp", "arabesqueBack"],
  },
  {
    id: "athletic", title: "Athletic",
    blurb: "Compact and efficient: the arms work, the checks are firm, a fist for a clean triple.",
    phraseWeight: 0.55, chin: 0.04, wrist: -0.3,
    phrases: [
      [{ a: "demiSeconde", b: "demiSeconde", beats: 4 }, { a: "second", b: "second", beats: 4 }],
      [{ a: "second", b: "demiSeconde", beats: 4 }, { a: "demiSeconde", b: "second", beats: 4 }],
    ],
    spin: ["demiSeconde", "demiSeconde"], camel: ["second", "second"], sit: ["first", "first"], spiral: ["allonge", "allonge"],
  },
  {
    id: "showman", title: "Showman",
    blurb: "Big lines to the crowd: arms presented, a V for a clean jump, a wave from the bow.",
    phraseWeight: 1, chin: 0.18, wrist: 0.3,
    phrases: [
      [{ a: "second", b: "second", beats: 2 }, { a: "present", b: "second", beats: 2, trunk: { turn: 0.4, chin: 0.15 } }, { a: "victory", b: "victory", beats: 2, trunk: { chin: 0.2 } }, { a: "allonge", b: "allonge", beats: 2 }],
      [{ a: "wave", b: "demiSeconde", beats: 2, trunk: { turn: 0.45 } }, { a: "present", b: "present", beats: 2, trunk: { chin: 0.12 } }, { a: "second", b: "second", beats: 2 }],
    ],
    spin: ["victory", "victory"], camel: ["allonge", "allonge"], sit: ["present", "first"], spiral: ["present", "arabesqueBack"],
  },
];

export const STYLE_IDS = STYLES.map(s => s.id);
export const isStyle = (id: unknown): id is StyleId => typeof id === "string" && (STYLE_IDS as string[]).includes(id);
export const styleOf = (id: StyleId): Style => STYLES.find(s => s.id === id) ?? STYLES[0];

// ── physique ─────────────────────────────────────────────────────────────────

/** How a body changes the same choreography. AUTHORED (L3) mappings from the profile. */
export interface Physique {
  /** Line length, 0.9..1.1: balance and edge control lengthen the free leg and the reach. */
  reach: number;
  /** 0..1: balance damps the flail of a rough landing. */
  steadiness: number;
  /** 0.6..1: strength keeps the trunk upright through a landing's absorb. */
  absorb: number;
  /** Timing scale, 0.9..1.15: a heavier, taller body holds and recovers a little slower. */
  tempo: number;
  /** 0..1: strength and spring; a strong, springy skater pops up from a fall. */
  power: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function physiqueOf(p: SkaterProfile): Physique {
  const s = p.stats;
  return {
    reach: 0.9 + 0.2 * clamp((s.balance + s.edgeControl) / 200, 0, 1),
    steadiness: clamp(s.balance / 100, 0, 1),
    absorb: 0.6 + 0.4 * clamp(s.strength / 100, 0, 1),
    tempo: clamp(1 + (p.massKg - 55) * 0.006 + (p.heightM - 1.65) * 0.5, 0.9, 1.15),
    power: clamp((s.strength + s.spring) / 200, 0, 1),
  };
}

export const NEUTRAL_PHYSIQUE: Physique = { reach: 1, steadiness: 0.5, absorb: 0.8, tempo: 1, power: 0.5 };

// ── names ────────────────────────────────────────────────────────────────────

export const JUMP_NAMES = ["Toe loop", "Salchow", "Loop", "Flip", "Lutz", "Axel"] as const;
const REVS = ["", "Single", "Double", "Triple", "Quad", "Quint"];

/** "Triple Lutz"; "Hop" for a jump below a revolution. */
export function jumpName(r: Pick<JumpResult, "kind" | "revolutions">): string {
  if (r.kind === JUMP_NONE || r.revolutions < 1) return "Hop";
  return `${REVS[Math.min(r.revolutions, REVS.length - 1)]} ${JUMP_NAMES[r.kind] ?? "jump"}`;
}

// ── landings ─────────────────────────────────────────────────────────────────

export type LandingTier = "flow" | "solid" | "tight" | "stepout" | "twofoot" | "under" | "fall";

export const TIER_TITLES: Record<LandingTier, string> = {
  flow: "Flowing exit", solid: "Clean landing", tight: "Tight landing", stepout: "Step out",
  twofoot: "Two-footed", under: "Under-rotated", fall: "Fall",
};

/**
 * The landing's look, from the landing record alone (sim/jump.ts grades it): never from the judges,
 * whose panel carries noise. A clean flowing exit asks for a high landing quality and clean calls.
 */
export function landingTier(r: JumpResult): LandingTier {
  if (r.fall) return "fall";
  if (r.rotationCall >= ROTATION_CALL.UnderRotated) return "under";
  if (r.twoFoot) return "twofoot";
  if (r.stepOut) return "stepout";
  if (r.landingQuality >= 0.8 && r.rotationCall === ROTATION_CALL.Clean && r.edgeCall === EDGE_CALL.Clean) return "flow";
  if (r.landingQuality >= 0.55) return "solid";
  return "tight";
}

/** Each jump's own exit, AUTHORED (L3): where the arms and the free leg come from and go to. */
interface Signature { name: string; from?: [PositionId, PositionId]; legFrom?: V3; check: [PositionId, PositionId]; leg: V3; trunk: Partial<Trunk>; open: number; hold: number }
const SIGNATURES: Record<number, Signature> = {
  // Toe loop: the plain check, both arms extended, the free leg straight back.
  [JUMP.Toeloop]: { name: "the classic check", check: ["checkSide", "checkFront"], leg: LEGS.extended, trunk: { pitch: 0.04 }, open: 0.14, hold: 0 },
  // Salchow: the arms come out of the wrap and sweep wide; the free leg swings round from the side.
  [JUMP.Salchow]: { name: "the sweep", from: ["heart", "heart"], legFrom: LEGS.swingSide, check: ["allonge", "second"], leg: LEGS.extended, trunk: { pitch: 0.02 }, open: 0.34, hold: 0 },
  // Loop: the legs stay crossed a moment, as they were in the air, then the free leg releases.
  [JUMP.Loop]: { name: "the crossed release", from: ["first", "first"], legFrom: LEGS.crossed, check: ["checkSide", "checkFront"], leg: LEGS.extended, trunk: { pitch: 0.05 }, open: 0.42, hold: 0 },
  // Flip: a lifted line, the leading arm forward and up, the free leg high.
  [JUMP.Flip]: { name: "the lifted line", check: ["arabesqueBack", "arabesqueFront"], leg: v(0.12, 0.54, 0.74), trunk: { chin: 0.1 }, open: 0.18, hold: 0.1 },
  // Lutz: the counter check, shoulders held against the hips, the free leg high and turned out.
  [JUMP.Lutz]: { name: "the counter check", check: ["checkSide", "checkFront"], leg: v(0.18, 0.54, 0.72), trunk: { twist: 0.3, pitch: 0.03 }, open: 0.16, hold: 0.1 },
  // Axel: the forward carry, a deeper lean through the long glide its forward takeoff leaves.
  [JUMP.Axel]: { name: "the forward carry", check: ["allonge", "allonge"], leg: LEGS.extended, trunk: { pitch: 0.16 }, open: 0.16, hold: 0.3 },
};
const HOP: Signature = { name: "a light check", check: ["demiSeconde", "demiSeconde"], leg: LEGS.trail, trunk: {}, open: 0.12, hold: 0 };

/** Seconds a flowing exit is held, by the jump's revolutions. AUTHORED (L3). */
const FLOW_HOLD = [0.4, 0.45, 0.7, 0.95, 1.15, 1.25];

export interface LandingContext { style: Style; physique: Physique; fatigue: number; finale: boolean; combo: string }

/** A plan of keys for a landing that stayed up. Exported for the tests. */
export function landingPlanKeys(r: JumpResult, ctx: LandingContext): { keys: Key[]; dur: number; label: string; tier: LandingTier } {
  const tier = landingTier(r);
  const { style, physique: ph, fatigue } = ctx;
  const sig = r.kind === JUMP_NONE || r.revolutions < 1 ? HOP : SIGNATURES[r.kind] ?? HOP;
  const tempo = ph.tempo * (1 + 0.25 * fatigue);
  const keys: Key[] = [];
  const add = (t: number, a: PositionId | ArmShape, b: PositionId | ArmShape, leg: V3, trunk: Partial<Trunk>, point = 1) => {
    keys.push({ t, armA: shape(a, style, fatigue), armB: shape(b, style, fatigue), leg: scaleLeg(leg, ph.reach, fatigue), point, trunk: { ...still(), ...trunk } });
  };
  const absorbPitch = (p: number) => p * (1.4 - ph.absorb * 0.6);
  const flail = (1 - ph.steadiness) * 0.6 + 0.4;
  let label = `${TIER_TITLES[tier]} · ${jumpName(r)}`;
  switch (tier) {
    case "flow":
    case "solid": {
      const solid = tier === "solid" && !ctx.finale;
      const hold = (FLOW_HOLD[clamp(r.revolutions, 0, 5)] + sig.hold) * tempo * (solid ? 0.7 : 1) * (ctx.finale ? 1.3 : 1);
      const chin = style.chin + (sig.trunk.chin ?? 0);
      const trunk: Partial<Trunk> = { ...sig.trunk, pitch: absorbPitch(sig.trunk.pitch ?? 0), chin, twist: (sig.trunk.twist ?? 0) * (solid ? 0.6 : 1) };
      const leg = solid ? mixV(sig.leg, LEGS.trail, 0.35) : sig.leg;
      const [ca, cb] = sig.check;
      if (sig.from) add(0, sig.from[0], sig.from[1], sig.legFrom ?? LEGS.beside, { pitch: absorbPitch(0.08) });
      else add(0, ca, cb, LEGS.beside, { pitch: absorbPitch(0.1) });
      const open = sig.open * tempo;
      add(open, solid ? blendShape(ca, "second", 0.4) : ca, solid ? blendShape(cb, "second", 0.4) : cb, leg, trunk);
      add(open + hold, solid ? blendShape(ca, "second", 0.4) : ca, solid ? blendShape(cb, "second", 0.4) : cb, leg, trunk);
      let end = open + hold;
      if (!solid && (r.revolutions >= 2 || ctx.finale)) {
        end = flourish(add, end, style, leg, trunk, r.revolutions >= 3 || ctx.finale, tempo);
      }
      add(end + 0.45 * tempo, "demiSeconde", "demiSeconde", LEGS.trail, { chin: style.chin * 0.5 }, 0.6);
      label = `${ctx.finale ? "Combination finale" : TIER_TITLES[tier]} · ${ctx.finale && ctx.combo ? ctx.combo : jumpName(r)} · ${style.title}, ${sig.name}`;
      break;
    }
    case "tight":
      add(0, "flail", "second", LEGS.beside, { pitch: absorbPitch(0.2), chin: -0.1 });
      add(0.28 * tempo, "second", "second", LEGS.trail, { pitch: absorbPitch(0.12) });
      add(0.65 * tempo, "demiSeconde", "demiSeconde", LEGS.trail, {}, 0.6);
      break;
    case "stepout":
      add(0, "braceSide", blendShape("flail", "second", 1 - flail), LEGS.stepDown, { pitch: absorbPitch(0.26), chin: -0.15 }, 0.2);
      add(0.18 * tempo, "second", blendShape("flail", "allonge", 0.5), LEGS.stepDown, { pitch: absorbPitch(0.2), chin: -0.08 }, 0.2);
      add(0.45 * tempo, "second", "second", LEGS.trail, { pitch: absorbPitch(0.08) }, 0.5);
      add(0.85 * tempo, "demiSeconde", "demiSeconde", LEGS.trail, {}, 0.6);
      break;
    case "twofoot":
      add(0, "first", "first", LEGS.twoFoot, { pitch: absorbPitch(0.22), chin: -0.1 }, 0.1);
      add(0.5 * tempo, "demiSeconde", "demiSeconde", LEGS.beside, { pitch: absorbPitch(0.08) }, 0.4);
      add(0.85 * tempo, "demiSeconde", "demiSeconde", LEGS.trail, {}, 0.6);
      break;
    case "under":
      // On the quarter or short: the shoulders are still turning as the blade meets the ice.
      add(0, "braceSide", blendShape("flail", "second", 1 - flail), LEGS.swingSide, { pitch: absorbPitch(0.18), twist: -0.5 * flail }, 0.3);
      add(0.22 * tempo, "second", "flail", LEGS.swingSide, { pitch: absorbPitch(0.14), twist: -0.15 }, 0.3);
      add(0.5 * tempo, "second", "second", LEGS.trail, { pitch: absorbPitch(0.06) }, 0.5);
      add(0.9 * tempo, "demiSeconde", "demiSeconde", LEGS.trail, {}, 0.6);
      break;
    case "fall":
      break;
  }
  const dur = keys.length ? keys[keys.length - 1].t + 0.05 : 0;
  return { keys, dur, label, tier };
}

/** The style's flourish after a held landing; returns when it ends. AUTHORED (L3). */
function flourish(add: (t: number, a: PositionId, b: PositionId, leg: V3, trunk: Partial<Trunk>, point?: number) => void,
  from: number, style: Style, leg: V3, trunk: Partial<Trunk>, big: boolean, tempo: number): number {
  const at = (s: number) => from + s * tempo;
  switch (style.id) {
    case "classical":
      // The free arm rises through fifth while the other lengthens; then both open long.
      add(at(0.5), "allonge", "fifthHigh", leg, { ...trunk, chin: style.chin + 0.12, turn: -0.2 });
      add(at(1.0), "allonge", "allonge", leg, { ...trunk, chin: style.chin });
      return at(1.0);
    case "contemporary":
      // The free arm reaches up and sweeps down behind; the head follows the hand.
      add(at(0.4), "second", "reachUp", leg, { ...trunk, roll: -0.15, turn: -0.35, chin: 0.2 });
      add(at(0.9), "second", "sweepLow", leg, { ...trunk, roll: 0.05, turn: -0.1, chin: 0 });
      return at(0.9);
    case "athletic":
      if (!big) return from;
      // A fist for the clean one, then straight back to work.
      add(at(0.25), "fist", "second", leg, { ...trunk, chin: 0.2 });
      add(at(0.75), "second", "second", leg, { ...trunk, chin: 0.05 });
      return at(0.75);
    case "showman":
      // A V for the crowd, then both arms presented to it.
      add(at(0.35), "victory", "victory", leg, { ...trunk, chin: 0.25 });
      add(at(0.9), "present", "present", leg, { ...trunk, chin: 0.15, turn: 0.4 });
      return at(0.9);
  }
}

// ── falls ────────────────────────────────────────────────────────────────────

export type FallVariant = "washout" | "sitdown" | "spinout" | "toepick" | "hard" | "under" | "boards" | "collapse";

export const FALL_TITLES: Record<FallVariant, string> = {
  washout: "The edge washes out: down onto the hip",
  sitdown: "Sits down onto the hip",
  spinout: "Spins out onto the hip",
  toepick: "Caught by the toe pick: turns onto the outer thigh",
  hard: "A hard landing: down onto the hip",
  under: "Short of rotation: slides down onto the hip",
  boards: "Into the boards: sits against them",
  collapse: "Both feet go: folds down onto the hip",
};

export interface FallFacts {
  reason: number;
  speed: number;
  /** rad/s of spin when she went down. */
  yawRate: number;
  spinning: boolean;
  /** The landing that put her down, if it was one. */
  landed: JumpResult | null;
  /** Pitched toward the toe (+1) or the heel (-1), when the reason was a pitch. */
  pitch: number;
}

/** Which way she goes down, from what the physics did. Every variant lands on the hip side. */
export function fallVariant(f: FallFacts): FallVariant {
  if (f.reason === FALL.Collision) return "boards";
  if (f.spinning || Math.abs(f.yawRate) > 6) return "spinout";
  if (f.reason === FALL.ToePickTrip) return "toepick";
  if (f.reason === FALL.Pitched) return f.pitch > 0 ? "toepick" : "sitdown";
  if (f.reason === FALL.Landing && f.landed) {
    if (f.landed.twoFoot) return "collapse";
    if (f.landed.shortBy > 0.45) return "under";
    if (f.landed.height > 0.35 || f.landed.airTime > 0.5) return "hard";
  }
  if (f.reason === FALL.BalanceTimeout || f.speed < 1.5) return "sitdown";
  return "washout";
}

/** A fall frame from offsets, joint to joint: easier to author than points. */
function fallFrame(hip: V3, spine: V3, neck: V3, head: V3, under: V3, other: V3): FallFrame {
  const s = add3(hip, spine), n = add3(s, neck);
  return { hip, spine: s, neck: n, head: add3(n, head), under, other };
}

const ICE = (x: number, y: number, z: number): ArmShape => ({ e: v(x * 0.6, -0.25, z * 0.5), h: v(x, y, z), w: 0.2, ice: true });

/**
 * The fall's keys, authored for a fall to her right (the client mirrors). AUTHORED (L3).
 * The washout's numbers are the Unreal port's own fall, unchanged: the trunk up over the hip, then
 * over onto the forearm from 0.16 s to 0.62 s.
 */
export function fallKeys(variant: FallVariant, ph: Physique): Key[] {
  const k = (t: number, fall: FallFrame, a: ArmShape, b: ArmShape, trunk: Partial<Trunk> = {}): Key => ({ t, fall, armA: a, armB: b, trunk: { ...still(), ...trunk } });
  const otherKnee = arm(v(0.12, -0.16, -0.12), v(0.02, -0.28, -0.26), 0.3);
  const forearm = ICE(0.16, 0.03, 0.04);
  const up = fallFrame(v(0.16, 0.13, 0.02), v(-0.03, 0.20, -0.04), v(-0.02, 0.36, -0.02), v(-0.02, 0.10, -0.03), v(0.42, 0.08, 0.30), v(-0.10, 0.105, -0.50));
  const over = fallFrame(v(0.16, 0.13, 0.02), v(0.16, 0.14, 0.03), v(0.30, 0.22, 0.05), v(-0.02, 0.10, -0.03), v(0.42, 0.08, 0.30), v(-0.10, 0.105, -0.50));
  const bounce = (f: FallFrame, dy: number): FallFrame => ({ ...f, hip: add3(f.hip, v(0, dy, 0)), spine: add3(f.spine, v(0, dy, 0)), neck: add3(f.neck, v(0, dy, 0)), head: add3(f.head, v(0, dy, 0)) });
  switch (variant) {
    case "washout":
      return [k(0, up, P.braceSide, otherKnee), k(0.16, up, P.braceSide, otherKnee), k(0.26, bounce(up, -0.02), P.braceSide, otherKnee), k(0.62, over, forearm, otherKnee)];
    case "hard": {
      // The same, harder: a deeper bounce, and the free leg kicked up on the impact.
      const kicked = { ...up, other: v(0.0, 0.24, -0.42) };
      return [k(0, kicked, P.braceSide, P.flail), k(0.2, bounce(kicked, -0.035), P.braceSide, P.flail), k(0.36, up, P.braceSide, otherKnee), k(0.55, over, forearm, otherKnee)];
    }
    case "sitdown": {
      // Down onto the seat, rolled onto the hip, both hands behind on the ice, knees up.
      const sat = fallFrame(v(0.07, 0.14, 0.07), v(0.02, 0.20, 0.07), v(0.0, 0.35, 0.05), v(0.0, 0.10, -0.02), v(0.24, 0.10, -0.34), v(-0.10, 0.10, -0.40));
      const leaning = fallFrame(v(0.08, 0.13, 0.08), v(0.03, 0.19, 0.10), v(0.0, 0.34, 0.07), v(0.0, 0.10, -0.03), v(0.26, 0.10, -0.32), v(-0.08, 0.10, -0.38));
      const behind = ICE(0.22, 0.02, 0.26), behindOther = ICE(0.2, 0.02, 0.26);
      return [k(0, sat, P.braceSide, P.braceSide, { chin: -0.1 }), k(0.3 * ph.tempo, leaning, behind, behindOther), k(0.8 * ph.tempo, leaning, behind, behindOther, { chin: 0.05 })];
    }
    case "spinout": {
      // The spin carries on into the ice: arms flung, legs trailing round, then onto the forearm.
      const flung = fallFrame(v(0.18, 0.13, 0.0), v(0.06, 0.19, -0.02), v(0.12, 0.30, 0.04), v(0.02, 0.10, 0.0), v(0.45, 0.08, 0.22), v(0.32, 0.08, 0.46));
      const lying = fallFrame(v(0.18, 0.13, 0.02), v(0.16, 0.14, 0.03), v(0.28, 0.22, 0.06), v(-0.02, 0.10, -0.02), v(0.46, 0.08, 0.26), v(0.30, 0.09, 0.48));
      return [k(0, flung, P.flail, P.braceSide), k(0.22, flung, P.braceSide, P.flail), k(0.55, lying, forearm, P.second)];
    }
    case "toepick": {
      // Pitched forward: she turns as she goes, the outer thigh and hip meeting the ice, a hand
      // reaching ahead and to the side to take the rest, never her front.
      const turning = fallFrame(v(0.17, 0.13, -0.06), v(0.08, 0.17, -0.10), v(0.14, 0.28, -0.08), v(0.02, 0.09, -0.05), v(0.40, 0.08, 0.12), v(0.02, 0.11, -0.42));
      const onSide = fallFrame(v(0.17, 0.13, -0.02), v(0.16, 0.14, 0.0), v(0.28, 0.22, 0.04), v(-0.02, 0.10, -0.02), v(0.42, 0.08, 0.20), v(-0.04, 0.105, -0.46));
      const ahead = ICE(0.30, 0.03, -0.22);
      return [k(0, turning, P.braceFront, arm(v(0.10, -0.14, -0.16), v(-0.04, -0.24, -0.28), 0.2), { chin: -0.1 }), k(0.18, turning, ahead, otherKnee), k(0.5, onSide, forearm, otherKnee)];
    }
    case "under": {
      // Down from the heel's skid, the shoulders still turning, legs spread.
      const skid = fallFrame(v(0.15, 0.13, 0.05), v(0.05, 0.19, 0.02), v(0.18, 0.30, 0.04), v(0.0, 0.10, -0.02), v(0.44, 0.08, 0.26), v(0.12, 0.10, -0.46));
      return [k(0, skid, P.braceSide, P.flail), k(0.35, skid, P.braceSide, otherKnee), k(0.65, over, forearm, otherKnee)];
    }
    case "boards": {
      // Into the boards: a hand up against them, then sitting against them, knees up.
      const against = fallFrame(v(0.05, 0.13, 0.14), v(0.0, 0.21, 0.10), v(0.0, 0.35, 0.06), v(0.0, 0.10, -0.02), v(0.20, 0.10, -0.40), v(-0.10, 0.12, -0.38));
      return [k(0, against, ICE(0.3, 0.03, 0.10), arm(v(0.18, 0.02, -0.10), v(0.30, 0.10, -0.20), 0.3)), k(0.45, against, ICE(0.3, 0.03, 0.10), otherKnee, { chin: -0.05 })];
    }
    case "collapse": {
      // Both feet go: folded down, shins on the ice, a hand down either side, then onto the hip.
      const folded = fallFrame(v(0.10, 0.12, 0.04), v(0.03, 0.20, 0.02), v(0.04, 0.35, 0.0), v(0.0, 0.10, -0.03), v(0.30, 0.08, 0.18), v(0.02, 0.08, 0.26));
      const leaned = fallFrame(v(0.12, 0.12, 0.04), v(0.10, 0.17, 0.03), v(0.14, 0.30, 0.03), v(0.0, 0.10, -0.03), v(0.32, 0.08, 0.20), v(0.04, 0.08, 0.28));
      return [k(0, folded, ICE(0.26, 0.03, 0.02), ICE(0.18, 0.03, 0.04), { chin: -0.15 }), k(0.4, leaned, ICE(0.26, 0.03, 0.04), otherKnee)];
    }
  }
}

export type RiseVariant = "kneel" | "pop" | "slow";
export const RISE_TITLES: Record<RiseVariant, string> = { kneel: "Up by the knee", pop: "Pops straight up", slow: "Slowly back up" };

export function riseVariant(ph: Physique, fatigue: number): RiseVariant {
  if (fatigue > 0.55) return "slow";
  if (ph.power > 0.7 && fatigue < 0.3) return "pop";
  return "kneel";
}

/** The first moments back up: the trunk unfolds, a hand off the knee. AUTHORED (L3). */
export function riseKeys(variant: RiseVariant): Key[] {
  const k = (t: number, a: PositionId | ArmShape, b: PositionId | ArmShape, trunk: Partial<Trunk>): Key =>
    ({ t, armA: typeof a === "string" ? P[a] : a, armB: typeof b === "string" ? P[b] : b, trunk: { ...still(), ...trunk } });
  const knee = arm(v(0.12, -0.16, -0.12), v(0.04, -0.30, -0.24), 0.3);
  switch (variant) {
    case "pop": return [k(0, "braceSide", "second", { pitch: 0.12 }), k(0.3, "second", "second", { chin: 0.05 })];
    case "slow": return [k(0, "rest", knee, { pitch: 0.34, chin: -0.2 }), k(0.4, "rest", knee, { pitch: 0.22, chin: -0.1 }), k(0.75, "demiSeconde", "rest", { pitch: 0.06 })];
    case "kneel": return [k(0, "braceSide", knee, { pitch: 0.3, chin: -0.1 }), k(0.28, "demiSeconde", knee, { pitch: 0.14 }), k(0.5, "demiSeconde", "demiSeconde", {})];
  }
}

// ── the bow ──────────────────────────────────────────────────────────────────

/** The program's end: the final line held, then the style's bow. AUTHORED (L3). */
export function bowKeys(style: Style): Key[] {
  const k = (t: number, a: PositionId, b: PositionId, trunk: Partial<Trunk>, leg: V3 = LEGS.trail): Key =>
    ({ t, armA: shape(a, style, 0), armB: shape(b, style, 0), leg, point: 1, trunk: { ...still(), ...trunk } });
  switch (style.id) {
    case "classical":
      // The révérence: arms open, then a curtsey with the arms sweeping down, the head bowed.
      return [k(0, "allonge", "allonge", { chin: 0.15 }), k(0.6, "second", "second", { chin: 0.1 }), k(1.5, "bowSweep", "bowSweep", { pitch: 0.32, chin: -0.35 }, LEGS.curtsey), k(2.0, "brasBas", "brasBas", { pitch: 0.3, chin: -0.3 }, LEGS.curtsey), k(2.7, "demiSeconde", "demiSeconde", { chin: 0.05 })];
    case "contemporary":
      return [k(0, "reachUp", "sweepLow", { roll: 0.1, chin: 0.2 }), k(0.7, "reachUp", "reachUp", { chin: 0.25 }), k(1.4, "heart", "heart", { pitch: 0.25, chin: -0.4 }), k(2.1, "heart", "heart", { pitch: 0.22, chin: -0.35 }), k(2.7, "demiSeconde", "demiSeconde", {})];
    case "athletic":
      return [k(0, "second", "second", { chin: 0.1 }), k(0.8, "rest", "heart", { pitch: 0.42, chin: -0.3 }), k(1.5, "rest", "heart", { pitch: 0.4, chin: -0.3 }), k(2.1, "wave", "rest", { chin: 0.1, turn: 0.3 }), k(2.7, "demiSeconde", "demiSeconde", {})];
    case "showman":
      return [k(0, "victory", "victory", { chin: 0.3 }), k(0.8, "bowSweep", "bowSweep", { pitch: 0.5, chin: -0.3 }), k(1.4, "bowSweep", "bowSweep", { pitch: 0.48, chin: -0.25 }), k(2.0, "present", "second", { turn: 0.5, chin: 0.15 }), k(2.6, "second", "present", { turn: -0.5, chin: 0.15 }), k(3.1, "wave", "demiSeconde", { chin: 0.1 })];
  }
}

// ── phrases ──────────────────────────────────────────────────────────────────

/** A port de bras phrase on the beat: each position held for its beats, the move between taking at most 0.9 s. */
export function phraseKeys(steps: Step[], beat: number, style: Style, fatigue: number): Key[] {
  const keys: Key[] = [];
  let t = 0;
  let prev: Step | null = null;
  for (const step of steps) {
    const hold = step.beats * beat;
    const move = Math.min(0.9, hold * 0.45) * (1 + 0.5 * fatigue);
    const trunk = { ...still(), chin: style.chin, ...step.trunk };
    if (prev) keys.push({ t, armA: shape(prev.a, style, fatigue), armB: shape(prev.b, style, fatigue), trunk: { ...still(), chin: style.chin, ...prev.trunk } });
    keys.push({ t: t + (prev ? move : 0), armA: shape(step.a, style, fatigue), armB: shape(step.b, style, fatigue), trunk });
    t += hold;
    prev = step;
  }
  if (prev) keys.push({ t, armA: shape(prev.a, style, fatigue), armB: shape(prev.b, style, fatigue), trunk: { ...still(), chin: style.chin, ...prev.trunk } });
  return keys;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function add3(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mixV(a: V3, b: V3, t: number): V3 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mixArm(a: ArmShape, b: ArmShape, t: number): ArmShape { return { e: mixV(a.e, b.e, t), h: mixV(a.h, b.h, t), w: a.w + (b.w - a.w) * t }; }
function blendShape(a: PositionId, b: PositionId, t: number): ArmShape { return mixArm(P[a], P[b], t); }

/** A position as this style carries it, tired arms a little lower. */
function shape(p: PositionId | ArmShape, style: Style, fatigue: number): ArmShape {
  const s = typeof p === "string" ? P[p] : p;
  const drop = 0.07 * clamp(fatigue, 0, 1);
  return { e: v(s.e[0], s.e[1] - drop * 0.5, s.e[2]), h: v(s.h[0], s.h[1] - drop, s.h[2]), w: clamp(s.w + style.wrist * 0.3, 0, 1), ...(s.ice ? { ice: true } : {}) };
}

/** A free foot as this body reaches it: a longer line lifts it higher; a tired one lower. */
function scaleLeg(l: V3, reach: number, fatigue: number): V3 {
  const lift = Math.max(0, l[1] - 0.2) * (reach - 1) - 0.08 * clamp(fatigue, 0, 1) * Math.max(0, l[1] - 0.2);
  return [l[0], l[1] + lift, l[2] * (0.95 + 0.05 * reach)];
}

/** A whole key evaluated between its neighbours, for the tests and for clients that want it. */
export function sample(keys: Key[], at: number): Key | null {
  if (keys.length === 0) return null;
  if (at <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (at <= b.t) {
      const u = b.t > a.t ? (at - a.t) / (b.t - a.t) : 1;
      const s = u * u * (3 - 2 * u);
      return {
        t: at,
        armA: a.armA && b.armA ? mixArm(a.armA, b.armA, s) : b.armA,
        armB: a.armB && b.armB ? mixArm(a.armB, b.armB, s) : b.armB,
        leg: a.leg && b.leg ? mixV(a.leg, b.leg, s) : b.leg,
        point: a.point !== undefined && b.point !== undefined ? a.point + (b.point - a.point) * s : b.point,
        trunk: a.trunk && b.trunk ? mixTrunk(a.trunk, b.trunk, s) : b.trunk,
        fall: a.fall && b.fall ? mixFall(a.fall, b.fall, s) : b.fall,
      };
    }
  }
  return keys[keys.length - 1];
}
function mixTrunk(a: Trunk, b: Trunk, t: number): Trunk {
  const m = (x: number, y: number) => x + (y - x) * t;
  return { pitch: m(a.pitch, b.pitch), roll: m(a.roll, b.roll), twist: m(a.twist, b.twist), chin: m(a.chin, b.chin), turn: m(a.turn, b.turn) };
}
function mixFall(a: FallFrame, b: FallFrame, t: number): FallFrame {
  return { hip: mixV(a.hip, b.hip, t), spine: mixV(a.spine, b.spine, t), neck: mixV(a.neck, b.neck, t), head: mixV(a.head, b.head, t), under: mixV(a.under, b.under, t), other: mixV(a.other, b.other, t) };
}

// ── the choreographer ────────────────────────────────────────────────────────

/** The music's grid, as game/composer.ts's tracks carry it. */
export interface BeatGrid { bpm: number; offset: number }

export interface ChoreoContext {
  /** Engine seconds: the run's own clock. */
  time: number;
  /** The run's music, if any: phrases change on its beats. */
  beat?: BeatGrid | null;
  /**
   * The combo tracker's label (sim/combo.ts sample) at this tick: non-empty only on the landing of a
   * jump that extended a combination ("3Lz+3T"), which makes that landing the combination's finale.
   */
  combo: string;
  /** The run's arm style (game/armfocus.ts), 0 function .. 1 expression: how much the phrases show. */
  expression: number;
  /** The program has ended this tick or before. */
  finished: boolean;
  /** Whether the mode ends in a bow: a program that was skated to its end. */
  bows: boolean;
  /** The run's params.fallError: balance is judged against how far from a fall she is. Default 0.35. */
  fallError?: number;
}

/** A combination's next takeoff within this long of a landing turns the landing into a rebound. AUTHORED. */
export const REBOUND_WINDOW = 0.5;
/** Seconds of being free to dance before a phrase begins. AUTHORED. */
export const PHRASE_SETTLE = 0.4;
/**
 * The balance error, as a share of the fall threshold, below which a phrase may begin, and above
 * which it gives the arms back to balance. AUTHORED, from a measurement (2026-11-06): ordinary
 * carving sits at 0.2-0.34 rad of balance error against a 0.35 fall threshold, so a fixed small
 * threshold (0.08 rad, the first draft) kept the arms out of every phrase.
 */
export const PHRASE_BALANCE_START = 0.6;
export const PHRASE_BALANCE_KEEP = 0.85;

export class Choreographer {
  private style: Style;
  private physique: Physique;
  private nextId = 1;
  private base: Plan | null = null;
  private top: Plan | null = null;
  private landedTick = -1;
  private wasFallen = false;
  private wasAir = false;
  private wasMove = 0;
  private freeSince = -1;
  private phraseIndex = 0;
  private bowed = false;
  private lastLanding: { start: number; result: JumpResult } | null = null;
  private lastYaw = 0;
  private basePosition = -1;
  /** The last landing tier and fall variant chosen, for the HUD and the tests. */
  lastTier: LandingTier | null = null;
  lastFall: FallVariant | null = null;

  constructor(style: StyleId = "classical", physique: Physique = NEUTRAL_PHYSIQUE) {
    this.style = styleOf(style);
    this.physique = physique;
  }

  get styleId(): StyleId { return this.style.id; }
  setStyle(id: StyleId) { this.style = styleOf(id); }
  setPhysique(p: Physique) { this.physique = p; }

  /** After every solver tick (and every tick of a replay). */
  sample(s: SkaterState, ctx: ChoreoContext): void {
    const now = ctx.time;
    const fatigue = clamp(1 - Math.min(s.wind ?? 1, s.legs ?? 1), 0, 1);
    const air = s.jump.phase === JUMP_PHASE.Air;
    if (air || s.move === MOVE.Spin) this.lastYaw = s.yawRate;
    // The physics owns the arms in the air: whatever the top plan was, it lets go.
    if (air && !this.wasAir) this.cut("top", now, 0.1);
    // A takeoff loading soon after a landing: the landing becomes a combination's rebound.
    if (s.jump.phase === JUMP_PHASE.Load && this.top?.kind === "landing" && this.lastLanding && now - this.lastLanding.start < REBOUND_WINDOW) {
      this.top = this.plan("rebound", "Combination: gathering for the next jump", "support", now, 0.06, 0.12, 1, [
        { t: 0, armA: shape("gather", this.style, fatigue), armB: shape("gather", this.style, fatigue), leg: LEGS.tucked, point: 1, trunk: { ...still(), pitch: 0.08 } },
        { t: 0.4, armA: shape("gather", this.style, fatigue), armB: shape("gather", this.style, fatigue), leg: LEGS.tucked, point: 1, trunk: { ...still(), pitch: 0.06 } },
      ]);
    }
    // A landing she stayed up from: its own exit.
    const r = s.landed;
    if (r.tick >= 0 && r.tick !== this.landedTick) {
      this.landedTick = r.tick;
      if (!r.fall) {
        const finale = ctx.combo !== "";
        const built = landingPlanKeys(r, { style: this.style, physique: this.physique, fatigue, finale, combo: ctx.combo });
        this.lastTier = built.tier;
        this.top = this.plan("landing", built.label, "support", now, 0.06, 0.45, 1, built.keys, built.dur);
        this.lastLanding = { start: now, result: r };
      } else {
        this.lastTier = "fall";
      }
    }
    // Down: a way of going down that the physics chose, onto the hip.
    if (s.fallen && !this.wasFallen) {
      const landedFall = r.fall && r.tick === this.landedTick ? r : null;
      const variant = fallVariant({
        reason: s.fallReason, speed: Math.hypot(s.vel.x, s.vel.y), yawRate: this.lastYaw || s.yawRate,
        spinning: this.wasMove === MOVE.Spin, landed: landedFall, pitch: s.fallReason === FALL.Pitched ? Math.sign(s.pitch ?? 0) : 0,
      });
      this.lastFall = variant;
      const keys = fallKeys(variant, this.physique);
      this.top = this.plan("fall", FALL_TITLES[variant], "fall", now, 0.05, 0.2, 1, keys, 3600);
      this.cut("base", now, 0.1);
    }
    // Back up: the first moments of getting up.
    if (!s.fallen && this.wasFallen) {
      const variant = riseVariant(this.physique, fatigue);
      const keys = riseKeys(variant);
      this.top = this.plan("rise", RISE_TITLES[variant], "fall", now, 0.05, 0.3, 1, keys, keys[keys.length - 1].t + 0.1);
    }
    // The program's end: a bow, once.
    if (ctx.finished && ctx.bows && !this.bowed) {
      this.bowed = true;
      const keys = bowKeys(this.style);
      this.top = this.plan("bow", `The bow · ${this.style.title}`, "left", now, 0.25, 0.5, 1, keys, keys[keys.length - 1].t + 0.3);
    }
    // The base: a spin's or a spiral's line while it lasts, else the port de bras while she is free.
    const spin = s.move === MOVE.Spin, spiral = s.move === MOVE.Spiral || s.move === MOVE.InaBauer;
    if (spin || spiral) {
      const kind: PlanKind = spin ? "spin" : "spiral";
      if (this.base?.kind !== kind || s.move !== this.wasMove || s.spin.position !== this.basePosition) {
        this.basePosition = s.spin.position;
        const pair = spiral ? this.style.spiral : s.spin.position === 2 ? this.style.camel : s.spin.position === 1 ? this.style.sit : this.style.spin;
        const trunk = s.move === MOVE.InaBauer ? { ...still(), pitch: -0.25, chin: 0.3 } : { ...still(), chin: this.style.chin };
        const hold: Key = { t: 0, armA: shape(pair[0], this.style, fatigue), armB: shape(pair[1], this.style, fatigue), trunk, ...(spiral ? { leg: LEGS.arabesque, point: 1 } : {}) };
        const pos = s.move === MOVE.InaBauer ? "Ina Bauer" : spiral ? "spiral" : ["upright spin", "sit spin", "camel spin"][s.spin.position] ?? "spin";
        this.base = this.plan(kind, `${this.style.title} ${pos}`, "support", now, 0.25, 0.3, 1, [hold, { ...hold, t: 1 }], 3600);
      }
      this.freeSince = -1;
    } else {
      if (this.base && (this.base.kind === "spin" || this.base.kind === "spiral")) this.cut("base", now, 0.3);
      // Free to dance: on the ice, no move or jump, moving, and far enough from a fall that the arms are
      // not needed for balance. A push does not stop it: arms carry a line through crossovers too.
      const need = Math.abs(s.balanceError) / Math.max(ctx.fallError ?? 0.35, 1e-3);
      const moving = Math.hypot(s.vel.x, s.vel.y);
      const keep = !s.fallen && s.move === MOVE.None && s.jump.phase === JUMP_PHASE.None && moving > 0.6
        && need < PHRASE_BALANCE_KEEP && !this.topLive(now) && !ctx.finished;
      const free = keep && moving > 1.0 && need < PHRASE_BALANCE_START;
      if (!keep) {
        this.freeSince = -1;
        if (this.base?.kind === "phrase") this.cut("base", now, 0.35);
      } else if (!free && this.freeSince < 0) {
        // Kept, not yet started: waiting for a calmer moment to begin.
      } else {
        if (this.freeSince < 0) this.freeSince = now;
        const beat = 60 / clamp(ctx.beat?.bpm ?? 100, 40, 200);
        const onBeat = !ctx.beat || Math.abs(((now - (ctx.beat.offset ?? 0)) / beat) % 1) < (1 / 120) / beat * 1.01;
        if ((!this.base || !this.alive(this.base, now)) && now - this.freeSince >= PHRASE_SETTLE && onBeat && ctx.expression > 0.01) {
          const phrases = this.style.phrases;
          const steps = phrases[this.phraseIndex % phrases.length];
          const rel: Rel = this.phraseIndex % 2 === 0 ? "right" : "left";
          this.phraseIndex++;
          const keys = phraseKeys(steps, beat * (1 + 0.5 * fatigue), this.style, fatigue);
          const dur = keys[keys.length - 1].t;
          this.base = this.plan("phrase", `${this.style.title} port de bras ${((this.phraseIndex - 1) % phrases.length) + 1}`, rel, now, 0.5, 0.5, clamp(ctx.expression * this.style.phraseWeight, 0, 1), keys, dur);
        }
      }
    }
    if (this.top && !this.alive(this.top, now)) this.top = null;
    if (this.base && !this.alive(this.base, now)) this.base = null;
    this.wasFallen = s.fallen;
    this.wasAir = air;
    this.wasMove = s.move;
  }

  view(now: number): ChoreoView {
    const out = (p: Plan | null): PlanView | null => {
      if (!p) return null;
      const { start, ...rest } = p;
      return { ...rest, at: Math.max(0, now - start) };
    };
    return { style: this.style.id, base: out(this.base), top: out(this.top) };
  }

  /** Clears everything: a new run. */
  reset() {
    this.base = this.top = null;
    this.landedTick = -1;
    this.wasFallen = this.wasAir = false;
    this.wasMove = 0;
    this.freeSince = -1;
    this.phraseIndex = 0;
    this.bowed = false;
    this.lastLanding = null;
    this.lastYaw = 0;
    this.basePosition = -1;
    this.lastTier = null;
    this.lastFall = null;
  }

  private plan(kind: PlanKind, label: string, rel: Rel, start: number, blendIn: number, blendOut: number, weight: number, keys: Key[], dur = keys.length ? keys[keys.length - 1].t + 0.05 : 0): Plan {
    return { id: this.nextId++, kind, label, rel, start, dur, blendIn, blendOut, weight, keys };
  }
  private alive(p: Plan, now: number) { return now - p.start < p.dur; }
  private topLive(now: number) { return !!this.top && this.alive(this.top, now) && this.top.kind !== "bow"; }
  /** Ends a plan now, fading over `fade` seconds. */
  private cut(which: "base" | "top", now: number, fade: number) {
    const p = which === "base" ? this.base : this.top;
    if (!p) return;
    const left = now - p.start + fade;
    if (left < p.dur) {
      p.dur = left;
      p.blendOut = Math.min(p.blendOut, fade);
    }
  }
}
