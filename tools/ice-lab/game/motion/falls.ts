// game/motion/falls.ts — what a fall looks like: a library of falls, and the choice of one from the sim's own fall.
//
// The sim decides THAT she falls and why (sim/types.ts FALL: lean exceeded, balance lost, toe pick,
// landing, the boards, pitched) and to which side; this only says how it looks, the way skater.gd's
// hip-first fall pose already does. Each fall is built from the physical phases a real one passes
// through: the tip (still on the blades, the body past what they hold), the buckle (knees give, arms
// react), the impact (the first part to take the ice), and the settle (where she ends). An IMPACT
// names which part takes the ice and where the body goes; it is written for her left side, mirrored
// for her right, and played with one of three arm reactions (brace toward the ice, tuck in, fling
// out), so every combination is its own distinct fall. Then a short library of getting up.
//
// AUTHORED shapes and timings, judged by eye against skating footage, not measured. Per the design
// bible's anti-goals a fall is ordinary and never shamed; the getting-up clips are part of the program.

import { clip, dir, mirrorClip, turnPose, UP } from "./types.ts";
import type { Clip, Key, Pose, Segment, Vec3 } from "./types.ts";
import { FALL } from "../../sim/types.ts";

type Arms = "brace" | "tuck" | "fling";
const ARMS: readonly Arms[] = ["brace", "tuck", "fling"];

/** Arm segments for a reaction, given where the body is going (bearing) and how close to the ice. */
function arms(react: Arms, toward: number, low: number): Partial<Record<Segment, Vec3>> {
  switch (react) {
    // Hands reach for the ice in the direction of the fall.
    case "brace": return {
      upperArmL: dir(toward - 25, -35 - 30 * low), forearmL: dir(toward - 15, -50 - 30 * low),
      upperArmR: dir(toward + 25, -35 - 30 * low), forearmR: dir(toward + 15, -50 - 30 * low),
    };
    // Forearms across the chest, elbows in: protecting the face and wrists.
    case "tuck": return {
      upperArmL: dir(-30, -55), forearmL: dir(60, 20),
      upperArmR: dir(30, -55), forearmR: dir(-60, 20),
    };
    // Thrown up and away from the fall, for balance that is no longer there.
    case "fling": return {
      upperArmL: dir(toward + 180 - 50, 35 - 25 * low), forearmL: dir(toward + 180 - 60, 50 - 20 * low),
      upperArmR: dir(toward + 180 + 50, 35 - 25 * low), forearmR: dir(toward + 180 + 60, 50 - 20 * low),
    };
  }
}

interface Impact {
  id: string; name: string;
  /** Bearing the body falls toward (degrees, 0 her front, -90 her left). Written for the left side. */
  toward: number;
  /** Seconds to the impact and to the settle, at an ordinary speed. */
  impactAt: number; settleAt: number;
  tags: string[]; note: string;
  /** Pelvis height and segments at the buckle, the impact and the settle (arms come from the reaction). */
  buckle: Pose; impact: Pose; settle: Pose;
  /** Symmetric falls (straight forward or back) get one mirror at a slight angle, not a true left/right. */
  symmetric?: boolean;
}

// Shorthands for legs.
const legs = (thighL: Vec3, shinL: Vec3, thighR: Vec3, shinR: Vec3, footL: Vec3 = dir(0, -20), footR: Vec3 = dir(0, -20)) =>
  ({ thighL, shinL, thighR, shinR, footL, footR });
const knees = (bend: number, bearing = 0) => legs(dir(bearing, -90 + bend), dir(bearing + 180, -90 + bend * 0.9), dir(bearing, -90 + bend), dir(bearing + 180, -90 + bend * 0.9));

export const IMPACTS: readonly Impact[] = [
  {
    id: "hip-slide", name: "Hip slide", toward: -90, impactAt: 0.42, settleAt: 1.15,
    tags: ["side", "hip"], note: "The everyday fall: the edge washes out and she goes down on her hip and slides.",
    buckle: { pelvis: 0.72, pelvisUp: dir(-90, 72), seg: { trunk: dir(-90, 65), head: dir(-70, 75), ...knees(40) } },
    impact: { pelvis: 0.16, pelvisUp: dir(-90, 30), pelvisRight: dir(90, 55), seg: { trunk: dir(-100, 40), head: dir(-80, 55), ...legs(dir(-30, -20), dir(10, -35), dir(10, -5), dir(20, -30)) } },
    settle: { pelvis: 0.13, pelvisUp: dir(-90, 25), pelvisRight: dir(90, 60), seg: { trunk: dir(-120, 25), head: dir(-100, 40), ...legs(dir(-10, -12), dir(0, -15), dir(10, -2), dir(10, -12)) } },
  },
  {
    id: "sit-back", name: "Sit down", toward: 180, impactAt: 0.38, settleAt: 0.95, symmetric: true,
    tags: ["back", "seat"], note: "Weight too far back on a flat: knees fold and she sits straight down.",
    buckle: { pelvis: 0.6, seg: { trunk: dir(0, 70), head: dir(0, 80), ...knees(70) } },
    impact: { pelvis: 0.13, seg: { trunk: dir(180, 70), head: dir(0, 85), ...legs(dir(0, 20), dir(0, -40), dir(0, 20), dir(0, -40)) } },
    settle: { pelvis: 0.12, seg: { trunk: dir(180, 55), head: dir(10, 70), ...legs(dir(-8, 5), dir(-5, -15), dir(8, 5), dir(5, -15)) } },
  },
  {
    id: "knee-drop", name: "Knee drop", toward: 0, impactAt: 0.36, settleAt: 0.9, symmetric: true,
    tags: ["forward", "knees"], note: "Pitched forward at low speed: down onto both knees, upright from them.",
    buckle: { pelvis: 0.66, seg: { trunk: dir(0, 70), head: dir(0, 60), ...knees(60) } },
    impact: { pelvis: 0.46, seg: { trunk: dir(0, 75), head: dir(0, 70), ...legs(dir(0, -80), dir(180, -5), dir(0, -80), dir(180, -5), dir(180, 0), dir(180, 0)) } },
    settle: { pelvis: 0.4, seg: { trunk: dir(0, 80), head: dir(0, 80), ...legs(dir(0, -65), dir(180, -2), dir(0, -65), dir(180, -2), dir(180, 0), dir(180, 0)) } },
  },
  {
    id: "hands-knees", name: "Hands and knees", toward: 0, impactAt: 0.34, settleAt: 0.9, symmetric: true,
    tags: ["forward", "knees", "hands"], note: "A toe pick catches: she goes forward onto hands and knees.",
    buckle: { pelvis: 0.6, seg: { trunk: dir(0, 40), head: dir(0, 30), ...knees(55) } },
    impact: { pelvis: 0.4, seg: { trunk: dir(0, 5), head: dir(0, 0), ...legs(dir(0, -85), dir(180, -3), dir(0, -85), dir(180, -3), dir(180, 0), dir(180, 0)) } },
    settle: { pelvis: 0.42, seg: { trunk: dir(0, 0), head: dir(0, -10), ...legs(dir(0, -88), dir(180, 0), dir(0, -88), dir(180, 0), dir(180, 0), dir(180, 0)) } },
  },
  {
    id: "belly-slide", name: "Belly slide", toward: 0, impactAt: 0.4, settleAt: 1.3, symmetric: true,
    tags: ["forward", "prone", "slide"], note: "Forward at speed: she lands flat and slides on her front.",
    buckle: { pelvis: 0.62, seg: { trunk: dir(0, 30), head: dir(0, 25), ...knees(45) } },
    impact: { pelvis: 0.14, seg: { trunk: dir(0, 4), head: dir(0, 15), ...legs(dir(180, -12), dir(180, -6), dir(180, -12), dir(180, -6), dir(180, 10), dir(180, 10)) } },
    settle: { pelvis: 0.12, seg: { trunk: dir(0, 2), head: dir(0, 20), ...legs(dir(170, -10), dir(175, -4), dir(190, -10), dir(185, -4), dir(180, 15), dir(180, 15)) } },
  },
  {
    id: "back-slide", name: "Back slide", toward: 180, impactAt: 0.4, settleAt: 1.3, symmetric: true,
    tags: ["back", "supine", "slide"], note: "Both feet go out in front at speed: down on her back, sliding.",
    buckle: { pelvis: 0.6, seg: { trunk: dir(180, 75), head: dir(0, 80), ...legs(dir(0, -50), dir(0, -70), dir(0, -50), dir(0, -70)) } },
    impact: { pelvis: 0.13, seg: { trunk: dir(180, 18), head: dir(180, 45), ...legs(dir(0, 15), dir(0, -5), dir(0, 15), dir(0, -5)) } },
    settle: { pelvis: 0.12, seg: { trunk: dir(180, 5), head: dir(180, 30), ...legs(dir(-6, 8), dir(-6, -2), dir(6, 8), dir(6, -2)) } },
  },
  {
    id: "shoulder-roll", name: "Shoulder roll", toward: -90, impactAt: 0.4, settleAt: 1.4,
    tags: ["side", "hip", "roll"], note: "Hard to the side at speed: hip, then shoulder, rolling onto her back.",
    buckle: { pelvis: 0.68, pelvisUp: dir(-90, 65), seg: { trunk: dir(-90, 55), head: dir(-80, 60), ...knees(45) } },
    impact: { pelvis: 0.15, pelvisUp: dir(-90, 20), pelvisRight: dir(90, 70), seg: { trunk: dir(-90, 10), head: dir(-90, 20), ...legs(dir(-20, -10), dir(0, -20), dir(20, 10), dir(10, -10)) } },
    settle: { pelvis: 0.12, pelvisUp: dir(180, 10), pelvisRight: dir(90, 0), seg: { trunk: dir(170, 6), head: dir(170, 25), ...legs(dir(-15, 20), dir(-15, -5), dir(25, 30), dir(25, 0)) } },
  },
  {
    id: "split-out", name: "Split out", toward: 180, impactAt: 0.36, settleAt: 1.0,
    tags: ["back", "seat", "split"], note: "The feet run apart: she sits into a split, one leg forward, one back.",
    buckle: { pelvis: 0.6, seg: { trunk: dir(0, 75), head: dir(0, 80), ...legs(dir(0, -55), dir(0, -80), dir(180, -60), dir(180, -80)) } },
    impact: { pelvis: 0.15, seg: { trunk: dir(-10, 75), head: dir(0, 75), ...legs(dir(0, -8), dir(0, -10), dir(180, -10), dir(180, -12), dir(0, 10), dir(180, -20)) } },
    settle: { pelvis: 0.13, seg: { trunk: dir(-25, 65), head: dir(-10, 70), ...legs(dir(0, -6), dir(0, -8), dir(180, -6), dir(180, -10), dir(0, 15), dir(180, -10)) } },
  },
  {
    id: "landing-under", name: "Under-rotated landing", toward: -135, impactAt: 0.3, settleAt: 1.1,
    tags: ["jump", "landing", "hip", "twist"], note: "Short of rotation: a two-foot touch, the rotation carries on, down on the hip.",
    buckle: { pelvis: 0.7, pelvisRight: dir(70, 0), seg: { trunk: dir(-150, 70), head: dir(-120, 75), ...legs(dir(-30, -60), dir(-30, -80), dir(30, -60), dir(30, -80)) } },
    impact: { pelvis: 0.16, pelvisUp: dir(-120, 35), pelvisRight: dir(50, 40), seg: { trunk: dir(-150, 35), head: dir(-120, 50), ...legs(dir(-40, -10), dir(-10, -25), dir(20, 0), dir(30, -20)) } },
    settle: { pelvis: 0.13, pelvisUp: dir(-120, 25), pelvisRight: dir(40, 50), seg: { trunk: dir(-160, 20), head: dir(-130, 40), ...legs(dir(-30, -8), dir(-20, -12), dir(10, 0), dir(15, -10)) } },
  },
  {
    id: "spin-out", name: "Spin-out", toward: -60, impactAt: 0.45, settleAt: 1.25,
    tags: ["spin", "hip", "twist"], note: "A spin travels off its centre: thrown out sideways, still turning, onto the hip.",
    buckle: { pelvis: 0.74, pelvisRight: dir(45, 0), seg: { trunk: dir(-60, 70), head: dir(-30, 72), ...legs(dir(-20, -80), dir(-20, -85), dir(60, -30), dir(90, -60)) } },
    impact: { pelvis: 0.16, pelvisUp: dir(-70, 30), pelvisRight: dir(20, 55), seg: { trunk: dir(-80, 30), head: dir(-50, 45), ...legs(dir(-20, -15), dir(10, -30), dir(40, 5), dir(60, -20)) } },
    settle: { pelvis: 0.13, pelvisUp: dir(-80, 25), pelvisRight: dir(10, 60), seg: { trunk: dir(-100, 18), head: dir(-70, 35), ...legs(dir(-10, -10), dir(0, -15), dir(30, -5), dir(40, -12)) } },
  },
  {
    id: "boards", name: "Into the boards", toward: 0, impactAt: 0.28, settleAt: 1.2, symmetric: true,
    tags: ["forward", "boards", "seat"], note: "Too fast into the boards: hands to the barrier, then a slump to sitting.",
    buckle: { pelvis: 0.82, seg: { trunk: dir(0, 60), head: dir(0, 60), ...knees(30) } },
    impact: { pelvis: 0.7, seg: { trunk: dir(0, 50), head: dir(0, 45), ...knees(45) } },
    settle: { pelvis: 0.14, seg: { trunk: dir(180, 75), head: dir(0, 75), ...legs(dir(0, 25), dir(0, -35), dir(0, 25), dir(0, -35)) } },
  },
  {
    id: "edge-washout", name: "Edge wash-out", toward: 180, impactAt: 0.3, settleAt: 0.95,
    tags: ["back", "seat", "edge"], note: "An outside edge washes out underneath: the feet shoot forward, down hard on the seat.",
    buckle: { pelvis: 0.66, seg: { trunk: dir(180, 70), head: dir(0, 75), ...legs(dir(0, -45), dir(0, -60), dir(0, -50), dir(0, -65)) } },
    impact: { pelvis: 0.13, seg: { trunk: dir(180, 45), head: dir(0, 60), ...legs(dir(0, 12), dir(0, -8), dir(0, 12), dir(0, -8)) } },
    settle: { pelvis: 0.12, seg: { trunk: dir(180, 60), head: dir(0, 70), ...legs(dir(-10, 8), dir(-10, -10), dir(10, 8), dir(10, -10)) } },
    symmetric: true,
  },
  {
    id: "heel-pitch", name: "Heel pitch", toward: 180, impactAt: 0.42, settleAt: 1.1, symmetric: true,
    tags: ["back", "pitched", "seat"], note: "Pitched back past the heel of the blade: a slow topple onto the seat and back.",
    buckle: { pelvis: 0.8, seg: { trunk: dir(180, 75), head: dir(0, 80), ...legs(dir(0, -75), dir(0, -85), dir(0, -75), dir(0, -85)) } },
    impact: { pelvis: 0.14, seg: { trunk: dir(180, 40), head: dir(0, 50), ...legs(dir(0, 30), dir(0, 0), dir(0, 30), dir(0, 0)) } },
    settle: { pelvis: 0.12, seg: { trunk: dir(180, 15), head: dir(180, 50), ...legs(dir(-5, 25), dir(-5, 0), dir(5, 25), dir(5, 0)) } },
  },
  {
    id: "toe-pitch", name: "Toe pitch", toward: 0, impactAt: 0.3, settleAt: 1.0, symmetric: true,
    tags: ["forward", "pitched", "hands", "prone"], note: "Pitched over the toe pick: a quick fall forward, caught on the forearms.",
    buckle: { pelvis: 0.78, seg: { trunk: dir(0, 55), head: dir(0, 45), ...legs(dir(0, -80), dir(180, -80), dir(0, -80), dir(180, -80)) } },
    impact: { pelvis: 0.2, seg: { trunk: dir(0, 12), head: dir(0, 20), ...legs(dir(180, -40), dir(180, -10), dir(180, -40), dir(180, -10), dir(180, 0), dir(180, 0)) } },
    settle: { pelvis: 0.14, seg: { trunk: dir(0, 8), head: dir(0, 25), ...legs(dir(180, -15), dir(180, -5), dir(180, -15), dir(180, -5), dir(180, 10), dir(180, 10)) } },
  },
  {
    id: "knee-slide", name: "Knee slide", toward: -30, impactAt: 0.35, settleAt: 1.2,
    tags: ["forward", "knee", "slide"], note: "Down on one knee and sliding on it, the other foot still on its blade.",
    buckle: { pelvis: 0.62, seg: { trunk: dir(-20, 75), head: dir(-10, 75), ...legs(dir(0, -45), dir(180, -60), dir(0, -60), dir(180, -75)) } },
    impact: { pelvis: 0.45, seg: { trunk: dir(-15, 78), head: dir(0, 78), ...legs(dir(0, -80), dir(180, -3), dir(10, -10), dir(10, -80), dir(180, 0), dir(0, -20)) } },
    settle: { pelvis: 0.43, seg: { trunk: dir(-10, 80), head: dir(0, 80), ...legs(dir(0, -78), dir(180, -2), dir(10, -5), dir(10, -82), dir(180, 0), dir(0, -20)) } },
  },
  {
    id: "turn-collapse", name: "Turn collapse", toward: -150, impactAt: 0.5, settleAt: 1.3,
    tags: ["turn", "twist", "seat"], note: "Out of a twizzle or a bracket the turn keeps going: she spirals down to the ice.",
    buckle: { pelvis: 0.74, pelvisRight: dir(120, 0), seg: { trunk: dir(-160, 75), head: dir(-90, 80), ...legs(dir(-30, -75), dir(-30, -85), dir(60, -70), dir(60, -85)) } },
    impact: { pelvis: 0.15, pelvisUp: dir(-150, 45), pelvisRight: dir(150, 20), seg: { trunk: dir(-170, 50), head: dir(-140, 60), ...legs(dir(-60, 5), dir(-40, -20), dir(40, 10), dir(50, -20)) } },
    settle: { pelvis: 0.12, pelvisUp: dir(-160, 40), pelvisRight: dir(160, 10), seg: { trunk: dir(-170, 40), head: dir(-150, 55), ...legs(dir(-50, 5), dir(-40, -10), dir(30, 5), dir(40, -10)) } },
  },
  {
    id: "touchdown", name: "Hand down", toward: -100, impactAt: 0.3, settleAt: 0.75,
    tags: ["side", "touchdown", "hand"], note: "Not quite a fall: a hand to the ice to save a landing, still on the blades.",
    buckle: { pelvis: 0.7, pelvisUp: dir(-90, 75), seg: { trunk: dir(-90, 60), head: dir(-60, 70), ...knees(50) } },
    impact: { pelvis: 0.55, pelvisUp: dir(-90, 65), seg: { trunk: dir(-95, 40), head: dir(-60, 55), ...knees(70) } },
    settle: { pelvis: 0.6, pelvisUp: dir(-90, 75), seg: { trunk: dir(-80, 55), head: dir(-40, 70), ...knees(62) } },
  },
  {
    id: "two-foot-sit", name: "Two-foot sit", toward: 180, impactAt: 0.5, settleAt: 1.1, symmetric: true,
    tags: ["landing", "seat", "slow"], note: "A landing on two feet that sinks and keeps sinking until she is sitting.",
    buckle: { pelvis: 0.55, seg: { trunk: dir(0, 60), head: dir(0, 70), ...knees(80) } },
    impact: { pelvis: 0.18, seg: { trunk: dir(0, 80), head: dir(0, 80), ...legs(dir(-10, 30), dir(-10, -60), dir(10, 30), dir(10, -60)) } },
    settle: { pelvis: 0.13, seg: { trunk: dir(180, 80), head: dir(0, 80), ...legs(dir(-10, 15), dir(-10, -40), dir(10, 15), dir(10, -40)) } },
  },
];

/** A standing-on-the-blades start, tipped a little toward the fall. */
function tip(toward: number): Pose {
  return { pelvis: 0.88, seg: { trunk: dir(toward, 82), head: dir(toward, 85), ...knees(18) } };
}

function build(im: Impact, react: Arms, side: "left" | "right" | "centre"): Clip {
  const k = (t: number, p: Pose, low: number, ease?: Key["ease"]): Key => ({ t, ease, pose: { ...p, seg: { ...p.seg, ...arms(react, im.toward, low) } } });
  const keys: Key[] = [
    k(0, tip(im.toward), 0),
    k(im.impactAt * 0.45, im.buckle, 0.3, "in"),
    k(im.impactAt, im.impact, 1, "in"),
    k(im.settleAt, im.settle, 1, "out"),
  ];
  const id = `fall.${im.id}.${react}`;
  const left = clip(`${id}${side === "centre" ? "" : ".left"}`, `${im.name} (${react}${side === "centre" ? "" : ", left"})`, "fall", keys,
    { tags: [...im.tags, react, ...(side === "centre" ? [] : ["left"])], note: im.note });
  return left;
}

/** Every fall: each impact, each arm reaction, on each side (or straight, with a slight-angle twin). */
export const FALLS: readonly Clip[] = IMPACTS.flatMap(im => ARMS.flatMap(react => {
  if (im.symmetric) {
    const straight = build(im, react, "centre");
    // A straight fall's twin: the body turned 25 degrees so one shoulder leads, then mirrored,
    // so it really is the other shoulder (a mirror alone of a symmetric fall changes nothing).
    const turned = { ...straight, keys: straight.keys.map(k => ({ ...k, pose: turnPose(k.pose, 25) })) };
    return [straight, mirrorClip(turned, `${straight.id}.mirror`, `${straight.name.replace(")", ", other shoulder)")}`)];
  }
  const left = build(im, react, "left");
  return [left, mirrorClip(left, left.id.replace(".left", ".right"), left.name.replace("left", "right"))];
}));

// ── getting up ────────────────────────────────────────────────────────────────

const kneelOnRight: Pose = { pelvis: 0.48, seg: { trunk: dir(0, 80), head: dir(0, 80), ...legs(dir(0, 0), dir(0, -90), dir(0, -85), dir(180, 0), dir(0, -20), dir(180, 0)) } };
const standing: Pose = { pelvis: 0.86, seg: { trunk: UP, head: UP, ...knees(15) } };
const sitting: Pose = { pelvis: 0.13, seg: { trunk: dir(180, 65), head: dir(0, 75), ...legs(dir(-8, 5), dir(-5, -15), dir(8, 5), dir(5, -15)) } };
const lyingSide: Pose = { pelvis: 0.13, pelvisUp: dir(-90, 25), pelvisRight: dir(90, 60), seg: { trunk: dir(-120, 25), head: dir(-100, 40), ...legs(dir(-10, -12), dir(0, -15), dir(10, -2), dir(10, -12)) } };
const allFours: Pose = { pelvis: 0.42, seg: { trunk: dir(0, 0), head: dir(0, -10), ...legs(dir(0, -88), dir(180, 0), dir(0, -88), dir(180, 0), dir(180, 0), dir(180, 0)) } };
const handsDown = { upperArmL: dir(-20, -80), forearmL: dir(-10, -85), upperArmR: dir(20, -80), forearmR: dir(10, -85) };
const armsOut = { upperArmL: dir(-90, -40), forearmL: dir(-80, -30), upperArmR: dir(90, -40), forearmR: dir(80, -30) };
const withArms = (p: Pose, a: Partial<Record<Segment, Vec3>>): Pose => ({ ...p, seg: { ...p.seg, ...a } });

const RECOVERIES_LEFT: Clip[] = [
  clip("recover.kneel-up", "Up through a kneel", "recovery", [
    { t: 0, pose: withArms(sitting, handsDown) }, { t: 0.5, pose: withArms(allFours, handsDown) },
    { t: 1.0, pose: withArms(kneelOnRight, armsOut) }, { t: 1.6, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["seat", "kneel"], note: "From sitting: over onto hands and knees, one foot under her, up." }),
  clip("recover.push-up", "Push up off the hands", "recovery", [
    { t: 0, pose: withArms(allFours, handsDown) }, { t: 0.45, pose: withArms({ pelvis: 0.62, seg: { trunk: dir(0, 30), head: dir(0, 20), ...knees(80) } }, handsDown) },
    { t: 1.0, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["forward", "hands"], note: "From hands and knees: feet under, push off the ice, up." }),
  clip("recover.roll-to-knees", "Roll to the knees", "recovery", [
    { t: 0, pose: withArms(lyingSide, handsDown) }, { t: 0.6, pose: withArms(allFours, handsDown) },
    { t: 1.1, pose: withArms(kneelOnRight, armsOut) }, { t: 1.7, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["side", "hip", "left"], note: "From the hip: roll over onto the knees, then up through a kneel." }),
  clip("recover.quick-pop", "Quick pop up", "recovery", [
    { t: 0, pose: withArms(sitting, handsDown) }, { t: 0.35, pose: withArms({ pelvis: 0.5, seg: { trunk: dir(0, 50), head: dir(0, 60), ...knees(100) } }, handsDown) },
    { t: 0.8, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["seat", "fast"], note: "Straight back up out of a sit, the way a competitor does mid-program." }),
  clip("recover.hand-on-knee", "Slow rise, hand on knee", "recovery", [
    { t: 0, pose: withArms(kneelOnRight, handsDown) },
    { t: 0.8, pose: withArms({ pelvis: 0.66, seg: { trunk: dir(0, 55), head: dir(0, 60), ...legs(dir(0, -40), dir(180, -60), dir(0, -60), dir(180, -80)) } }, { upperArmL: dir(-20, -60), forearmL: dir(0, -80), upperArmR: dir(20, -60), forearmR: dir(0, -80) }) },
    { t: 1.6, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["kneel", "slow"], note: "A hand braced on her knee, a breath, then up: after a hard one." }),
  clip("recover.skate-out", "Skate it out", "recovery", [
    { t: 0, pose: withArms({ pelvis: 0.55, seg: { trunk: dir(-90, 50), head: dir(-60, 60), ...knees(70) } }, handsDown) },
    { t: 0.5, pose: withArms({ pelvis: 0.78, seg: { trunk: dir(0, 75), head: dir(0, 80), ...knees(35) } }, armsOut) },
    { t: 0.9, pose: withArms(standing, armsOut), ease: "out" },
  ], { tags: ["touchdown", "fast"], note: "After a hand down: straight back up and skating, never stopped." }),
];
export const RECOVERIES: readonly Clip[] = [
  ...RECOVERIES_LEFT,
  ...RECOVERIES_LEFT.filter(c => c.tags.includes("kneel") || c.tags.includes("left")).map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other side)`)),
];

// ── the choice ────────────────────────────────────────────────────────────────

export interface FallFacts {
  /** sim/types.ts FALL. */
  reason: number;
  /** Which way she went: the sign of the lean at the fall (+1 her right, -1 her left, 0 neither). */
  side: number;
  /** m/s over the ice at the fall. */
  speed: number;
  /** Whether it came out of a jump's landing or a spin. */
  jump?: boolean;
  spin?: boolean;
  /** Anything that varies by fall (the tick), so the same kind of fall is not always the same clip. */
  seed: number;
}

/** The impacts that fit a fall, most fitting first. AUTHORED mapping from the sim's reasons. */
function impactsFor(f: FallFacts): string[] {
  if (f.spin) return ["spin-out", "turn-collapse", "hip-slide"];
  switch (f.reason) {
    case FALL.Landing: return f.jump ? ["landing-under", "hip-slide", "two-foot-sit", "sit-back"] : ["sit-back", "two-foot-sit"];
    case FALL.LeanExceeded: return f.speed > 6 ? ["shoulder-roll", "hip-slide", "edge-washout"] : ["hip-slide", "edge-washout", "touchdown"];
    case FALL.BalanceTimeout: return ["sit-back", "knee-drop", "split-out", "turn-collapse"];
    case FALL.ToePickTrip: return f.speed > 5 ? ["belly-slide", "toe-pitch", "hands-knees"] : ["hands-knees", "knee-drop", "knee-slide"];
    case FALL.Collision: return ["boards"];
    case FALL.Pitched: return f.side >= 0 ? ["heel-pitch", "back-slide"] : ["toe-pitch", "hands-knees"];
    default: return ["hip-slide"];
  }
}
/** The clip for a fall the sim reports, and the getting-up that suits it. Deterministic in its facts. */
export function chooseFall(f: FallFacts): { fall: Clip; recover: Clip } {
  const options = impactsFor(f);
  const pick = (n: number, salt: number) => Math.abs(Math.imul(f.seed + salt, 2654435761) >>> 0) % n;
  const impact = options[pick(Math.min(options.length, 2), 7)];
  const react = ARMS[pick(ARMS.length, 13)];
  const side = f.side < 0 ? "left" : "right";
  const fall = FALLS.find(c => c.id === `fall.${impact}.${react}.${side}`)
    ?? FALLS.find(c => c.id === `fall.${impact}.${react}${f.side < 0 ? "" : ".mirror"}`)
    ?? FALLS.find(c => c.id.startsWith(`fall.${impact}.`))!;
  const tags = fall.tags;
  const recover = RECOVERIES.find(r => tags.includes("touchdown") ? r.id === "recover.skate-out"
    : tags.includes("prone") || tags.includes("hands") || tags.includes("knees") ? r.id === "recover.push-up"
      : tags.includes("hip") ? r.id === (side === "left" ? "recover.roll-to-knees" : "recover.roll-to-knees.mirror")
        : f.speed > 5 ? r.id === "recover.quick-pop" : r.id === "recover.kneel-up")!;
  return { fall, recover };
}
