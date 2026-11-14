// game/motion/footwork.ts — the step sequence's own vocabulary: toe steps, chassés, rolls,
// accents. The library's turns (move.three-turn, .mohawk, .choctaw, .bracket, .rocker, .counter,
// .loop, .twizzle) already live in transitions.ts; these are the steps between them that a step
// sequence and a choreographic sequence are made of.
//
// The sim scores a step sequence from its own turns and edges (sim/stepLevel.ts); nothing here
// counts toward a level. A client plays these as presentation over a step sequence's skating, as
// it plays the turns. Written leading with the left foot where a side matters, each with its
// mirror. AUTHORED shapes and timings, judged by eye (2026-11-14).

import { clip, dir, mirrorClip, UP } from "./types.ts";
import type { Clip, Key, Pose, Segment, Vec3 } from "./types.ts";

type Segs = Partial<Record<Segment, Vec3>>;
const L_KNEE = (b: number): Segs => ({ thighL: dir(0, -90 + b), shinL: dir(180, -90 + b * 0.8), footL: dir(0, -20) });
const R_KNEE = (b: number): Segs => ({ thighR: dir(0, -90 + b), shinR: dir(180, -90 + b * 0.8), footR: dir(0, -20) });
const armsOpen: Segs = { upperArmL: dir(-90, -15), forearmL: dir(-90, -20), upperArmR: dir(90, -15), forearmR: dir(90, -20) };
const armsLow: Segs = { upperArmL: dir(-110, -50), forearmL: dir(-100, -45), upperArmR: dir(110, -50), forearmR: dir(100, -45) };
const p = (pelvis: number, seg: Segs, extra: Partial<Pose> = {}): Pose => ({ pelvis, ...extra, seg: { trunk: UP, head: UP, ...seg } });
const step = (id: string, name: string, keys: Key[], tags: string[], note: string, o: { loop?: boolean; duration?: number } = {}): Clip =>
  clip(id, name, "step", keys, { ...o, tags: ["step", ...tags], note });

/** A knee driven up in front, the shin hanging: a toe step's or a march's lifted leg. */
const liftL: Segs = { thighL: dir(0, -25), shinL: dir(0, -85), footL: dir(0, -60) };
const liftR: Segs = { thighR: dir(0, -25), shinR: dir(0, -85), footR: dir(0, -60) };
/** On the toe pick: the foot pointed down under a soft knee. */
const pickL: Segs = { thighL: dir(0, -80), shinL: dir(180, -82), footL: dir(0, -75) };
const pickR: Segs = { thighR: dir(0, -80), shinR: dir(180, -82), footR: dir(0, -75) };

const steps: Clip[] = [
  step("step.toe-run", "Toe steps", [
    { t: 0, pose: p(0.9, { trunk: dir(0, 82), ...pickL, ...liftR, upperArmL: dir(-30, -30), forearmL: dir(0, 10), upperArmR: dir(150, -40), forearmR: dir(170, -30) }) },
    { t: 0.25, pose: p(0.9, { trunk: dir(0, 82), ...liftL, ...pickR, upperArmL: dir(-150, -40), forearmL: dir(-170, -30), upperArmR: dir(30, -30), forearmR: dir(0, 10) }), ease: "inOut" },
  ], ["toe", "run", "accent"], "Running on the toe picks, knees driving, the arms pumping against the legs.", { loop: true, duration: 0.5 }),
  step("step.chasse", "Chassé", [
    { t: 0, pose: p(0.86, { ...L_KNEE(25), ...R_KNEE(15), ...armsOpen }) },
    { t: 0.35, pose: p(0.87, { ...L_KNEE(25), thighR: dir(5, -78), shinR: dir(180, -75), footR: dir(0, -35), ...armsOpen }), ease: "out" },
    { t: 0.7, pose: p(0.86, { ...L_KNEE(25), ...R_KNEE(15), ...armsOpen }), ease: "in" },
  ], ["two-foot", "lift"], "The trailing foot lifts beside the skating foot and sets down again: a chassé.", { loop: true, duration: 1.0 }),
  step("step.cross-roll", "Cross roll", [
    { t: 0, pose: p(0.85, { ...L_KNEE(30), thighR: dir(-30, -70), shinR: dir(-45, -85), footR: dir(-40, -20), ...armsOpen }, { twist: -15 }) },
    { t: 0.8, pose: p(0.85, { ...R_KNEE(30), thighL: dir(30, -70), shinL: dir(45, -85), footL: dir(40, -20), ...armsOpen }, { twist: 15 }), ease: "inOut" },
  ], ["roll", "cross"], "Each stroke crossed over in front onto the new outside edge, the body rolling with it.", { loop: true, duration: 1.6 }),
  step("step.swing-roll", "Swing roll", [
    { t: 0, pose: p(0.86, { ...L_KNEE(20), thighR: dir(180, -60), shinR: dir(180, -65), footR: dir(180, -30), ...armsOpen }) },
    { t: 1.0, pose: p(0.87, { ...L_KNEE(15), thighR: dir(0, -50), shinR: dir(0, -60), footR: dir(0, -30), upperArmL: dir(-60, -10), forearmL: dir(-40, -10), upperArmR: dir(150, -10), forearmR: dir(160, -10) }), ease: "inOut" },
    { t: 2.0, pose: p(0.86, { ...L_KNEE(20), thighR: dir(180, -60), shinR: dir(180, -65), footR: dir(180, -30), ...armsOpen }), ease: "inOut" },
  ], ["roll", "free leg"], "One long outside edge, the free leg swinging slowly from behind to in front, the arms opposing it.", { loop: true, duration: 2.0 }),
  step("step.kick", "Kick accent", [
    { t: 0, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsLow }) },
    { t: 0.25, pose: p(0.88, { trunk: dir(180, 85), ...L_KNEE(10), thighR: dir(0, 10), shinR: dir(0, 15), footR: dir(0, 20), upperArmL: dir(-60, 30), forearmL: dir(-40, 40), upperArmR: dir(100, 20), forearmR: dir(110, 30) }), ease: "out" },
    { t: 0.7, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsLow }), ease: "inOut" },
  ], ["accent", "kick"], "A straight kick of the free leg in front on a hit in the music, the arms flung open.", { duration: 0.8 }),
  step("step.stamp", "Stamp accent", [
    { t: 0, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsLow }) },
    { t: 0.2, pose: p(0.87, { ...L_KNEE(15), ...liftR, upperArmL: dir(-100, 20), forearmL: dir(-100, 40), upperArmR: dir(100, 20), forearmR: dir(100, 40) }), ease: "out" },
    { t: 0.35, pose: p(0.84, { ...L_KNEE(30), ...R_KNEE(30), upperArmL: dir(-100, -40), forearmL: dir(-100, -50), upperArmR: dir(100, -40), forearmR: dir(100, -50) }), ease: "in" },
    { t: 0.8, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsLow }), ease: "inOut" },
  ], ["accent", "flamenco"], "The knee pulled up and the blade set down hard on the beat, the arms dropping with it.", { duration: 0.8 }),
  step("step.knee-drive", "Knee drive", [
    { t: 0, pose: p(0.87, { ...L_KNEE(15), ...R_KNEE(10), ...armsOpen }) },
    { t: 0.3, pose: p(0.89, { ...L_KNEE(5), thighR: dir(0, 0), shinR: dir(0, -80), footR: dir(0, -50), upperArmL: dir(-20, 30), forearmL: dir(-10, 70), upperArmR: dir(150, -40), forearmR: dir(170, -30) }), ease: "out" },
    { t: 0.8, pose: p(0.87, { ...L_KNEE(15), ...R_KNEE(10), ...armsOpen }), ease: "inOut" },
  ], ["accent", "free leg"], "The free knee driven up to the hip, the opposite arm punched up with it.", { duration: 0.8 }),
  step("step.hop", "Hop", [
    { t: 0, pose: p(0.82, { ...L_KNEE(40), ...R_KNEE(40), ...armsLow }) },
    { t: 0.2, pose: p(1.0, { ...L_KNEE(10), ...R_KNEE(30), upperArmL: dir(-80, 30), forearmL: dir(-70, 40), upperArmR: dir(80, 30), forearmR: dir(70, 40) }), ease: "out" },
    { t: 0.45, pose: p(0.82, { ...L_KNEE(40), ...R_KNEE(40), ...armsLow }), ease: "in" },
    { t: 0.7, pose: p(0.87, { ...L_KNEE(15), ...R_KNEE(15), ...armsOpen }), ease: "inOut" },
  ], ["accent", "air", "small"], "A small hop off one foot onto the same: a lift in the music, no rotation.", { duration: 0.7 }),
  step("step.toe-tap", "Toe tap", [
    { t: 0, pose: p(0.86, { ...L_KNEE(20), thighR: dir(180, -80), shinR: dir(180, -70), footR: dir(180, -80), ...armsOpen }) },
    { t: 0.25, pose: p(0.86, { ...L_KNEE(20), thighR: dir(180, -70), shinR: dir(180, -55), footR: dir(180, -60), ...armsOpen }), ease: "inOut" },
  ], ["toe", "accent"], "The free toe pick tapping the ice behind, on the beat.", { loop: true, duration: 0.5 }),
  step("step.slide", "Slide", [
    { t: 0, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsOpen }) },
    { t: 0.6, pose: p(0.55, { trunk: dir(-90, 70), head: dir(-80, 80), thighL: dir(0, -5), shinL: dir(180, -80), footL: dir(0, -20), thighR: dir(110, -35), shinR: dir(110, -10), footR: dir(110, 0), upperArmL: dir(-120, 30), forearmL: dir(-120, 40), upperArmR: dir(80, -20), forearmR: dir(70, -40) }), ease: "out" },
    { t: 1.1, pose: p(0.55, { trunk: dir(-90, 70), head: dir(-80, 80), thighL: dir(0, -5), shinL: dir(180, -80), footL: dir(0, -20), thighR: dir(110, -35), shinR: dir(110, -10), footR: dir(110, 0), upperArmL: dir(-120, 30), forearmL: dir(-120, 40), upperArmR: dir(80, -20), forearmR: dir(70, -40) }) },
    { t: 1.6, pose: p(0.86, { ...L_KNEE(20), ...R_KNEE(15), ...armsOpen }), ease: "inOut" },
  ], ["low", "accent"], "Down onto the skating knee with the free leg sliding out to the side, the body leaning away: a dramatic slide.", { duration: 1.6 }),
  step("step.arms-frame", "Arms frame", [
    { t: 0, pose: p(0.87, { ...L_KNEE(15), ...R_KNEE(10), upperArmL: dir(-70, 40), forearmL: dir(-20, 60), upperArmR: dir(110, 0), forearmR: dir(130, -10) }, { twist: -20 }) },
    { t: 0.5, pose: p(0.87, { ...L_KNEE(15), ...R_KNEE(10), upperArmL: dir(-110, 0), forearmL: dir(-130, -10), upperArmR: dir(70, 40), forearmR: dir(20, 60) }, { twist: 20 }), ease: "inOut" },
  ], ["arms", "accent"], "The arms framing the head on one side then the other, the shoulders turning with them.", { loop: true, duration: 1.0 }),
];

const ONE_SIDED = new Set(["step.cross-roll", "step.swing-roll", "step.kick", "step.stamp", "step.knee-drive", "step.toe-tap", "step.slide", "step.chasse"]);
export const FOOTWORK: readonly Clip[] = [...steps, ...steps.filter(c => ONE_SIDED.has(c.id)).map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other foot)`))];
