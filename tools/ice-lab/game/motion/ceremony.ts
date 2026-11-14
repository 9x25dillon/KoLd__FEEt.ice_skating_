// game/motion/ceremony.ts — everything around the program: the kiss-and-cry, the bows, the podium,
// and the warm-up and idle a skater does at the boards.
//
// The owner, 2026-11-14: "start building more character animation models, build resources". The
// library had falls, spins, moves in the field and dance arms, and nothing for the minutes either
// side of a program. These are full-body clips (pelvis, trunk, legs and arms), off the clock of
// any element: no sim state drives them, so a client can play them wherever the skater is not
// skating (the kiss-and-cry bench, the podium, the warm-up at the boards).
//
// Seated clips put the pelvis at a bench's height and the boots on the floor. Written right-handed
// where a side matters (the right hand waves); each one-sided clip has its mirror. AUTHORED
// shapes and timings, judged by eye on the contact sheets (docs/presentation/motion).

import { clip, dir, mirrorClip, DOWN, UP } from "./types.ts";
import type { Clip, Key, Pose, Segment, Vec3 } from "./types.ts";

type Segs = Partial<Record<Segment, Vec3>>;
const H = 0.89; // standing pelvis
const SEAT = 0.47; // a bench
const STAND: Segs = { thighL: DOWN, shinL: DOWN, footL: dir(-5, -20), thighR: DOWN, shinR: DOWN, footR: dir(5, -20) };
const SEATED: Segs = { thighL: dir(-8, -8), shinL: dir(-5, -82), footL: dir(-5, -20), thighR: dir(8, -8), shinR: dir(5, -82), footR: dir(5, -20) };
const armsDown: Segs = { upperArmL: dir(-100, -82), forearmL: dir(-30, -80), upperArmR: dir(100, -82), forearmR: dir(30, -80) };
const handsOnKnees: Segs = { upperArmL: dir(-10, -60), forearmL: dir(-5, -40), upperArmR: dir(10, -60), forearmR: dir(5, -40) };
const handsInLap: Segs = { upperArmL: dir(-15, -75), forearmL: dir(30, -20), upperArmR: dir(15, -75), forearmR: dir(-30, -20) };
const handsOnHips: Segs = { upperArmL: dir(-120, -45), forearmL: dir(40, -25), upperArmR: dir(120, -45), forearmR: dir(-40, -25) };
const handsToFace: Segs = { upperArmL: dir(-20, -30), forearmL: dir(10, 75), upperArmR: dir(20, -30), forearmR: dir(-10, 75) };

const p = (pelvis: number, seg: Segs, extra: Partial<Pose> = {}): Pose => ({ pelvis, ...extra, seg: { trunk: UP, head: UP, ...seg } });
const sat = (seg: Segs, extra: Partial<Pose> = {}): Pose => p(SEAT, { trunk: dir(180, 84), ...SEATED, ...seg }, extra);
const stood = (seg: Segs, extra: Partial<Pose> = {}): Pose => p(H, { ...STAND, ...seg }, extra);
const make = (category: "ceremony" | "idle") => (id: string, name: string, keys: Key[], tags: string[], note: string, o: { loop?: boolean; duration?: number } = {}): Clip =>
  clip(id, name, category, keys, { ...o, tags, note });
const ceremony = make("ceremony");
const idle = make("idle");

// ── the kiss-and-cry: on the bench, waiting for the marks ─────────────────────

const kissAndCry: Clip[] = [
  ceremony("kc.wait", "Waiting for the marks", [
    { t: 0, pose: sat({ head: dir(0, 88), ...handsOnKnees }) },
    { t: 1.6, pose: sat({ trunk: dir(180, 86), head: dir(0, 84), ...handsOnKnees }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "breath"], "On the bench, hands on the knees, breathing out the program while the marks come.", { loop: true, duration: 3.2 }),
  ceremony("kc.listen", "Listening to the coach", [
    { t: 0, pose: sat({ trunk: dir(-60, 80), head: dir(-50, 80), ...handsInLap }) },
    { t: 0.6, pose: sat({ trunk: dir(-60, 80), head: dir(-50, 70), ...handsInLap }), ease: "inOut" },
    { t: 1.2, pose: sat({ trunk: dir(-60, 80), head: dir(-50, 80), ...handsInLap }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "coach"], "Turned toward the coach on her left, nodding along.", { loop: true, duration: 2.4 }),
  ceremony("kc.wave", "Wave to the camera", [
    { t: 0, pose: sat({ ...handsInLap, upperArmR: dir(60, 40), forearmR: dir(30, 85) }) },
    { t: 0.3, pose: sat({ ...handsInLap, upperArmR: dir(60, 40), forearmR: dir(75, 65) }), ease: "inOut" },
    { t: 0.6, pose: sat({ ...handsInLap, upperArmR: dir(60, 40), forearmR: dir(30, 85) }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "wave"], "The right hand up and waving at the camera in front of the bench.", { loop: true, duration: 1.2 }),
  ceremony("kc.blow-kiss", "Blow a kiss", [
    { t: 0, pose: sat({ ...handsInLap }) },
    { t: 0.5, pose: sat({ ...handsInLap, upperArmR: dir(20, -20), forearmR: dir(-40, 70) }), ease: "out" },
    { t: 0.9, pose: sat({ ...handsInLap, upperArmR: dir(20, -20), forearmR: dir(-40, 70) }) },
    { t: 1.4, pose: sat({ head: dir(0, 85), ...handsInLap, upperArmR: dir(30, 20), forearmR: dir(20, 30) }), ease: "out" },
  ], ["kiss-and-cry", "seated"], "Fingers to the lips, then the kiss sent out to the crowd.", { duration: 1.8 }),
  ceremony("kc.joy", "The marks: joy", [
    { t: 0, pose: sat({ ...handsOnKnees }) },
    { t: 0.35, pose: sat({ trunk: dir(180, 80), head: dir(180, 80), upperArmL: dir(-30, 70), forearmL: dir(-10, 85), upperArmR: dir(30, 70), forearmR: dir(10, 85) }), ease: "out" },
    { t: 1.2, pose: sat({ trunk: dir(0, 85), head: dir(0, 80), ...handsToFace }), ease: "inOut" },
    { t: 2.0, pose: sat({ trunk: dir(0, 85), head: UP, upperArmL: dir(-30, 70), forearmL: dir(-10, 85), upperArmR: dir(30, 70), forearmR: dir(10, 85) }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "reaction", "good"], "Both arms flung up, hands to the face, arms up again: a personal best.", { duration: 2.4 }),
  ceremony("kc.relief", "The marks: relief", [
    { t: 0, pose: sat({ ...handsOnKnees }) },
    { t: 0.5, pose: sat({ trunk: dir(0, 80), head: dir(0, 65), ...handsToFace }), ease: "out" },
    { t: 1.5, pose: sat({ trunk: dir(0, 80), head: dir(0, 65), ...handsToFace }) },
    { t: 2.4, pose: sat({ trunk: dir(180, 75), head: dir(180, 85), ...handsInLap }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "reaction", "good"], "Hands over the face, then a long breath out, leaning back.", { duration: 2.8 }),
  ceremony("kc.disappointed", "The marks: disappointed", [
    { t: 0, pose: sat({ ...handsOnKnees }) },
    { t: 0.8, pose: sat({ trunk: dir(0, 70), head: dir(0, 40), upperArmL: dir(-10, -70), forearmL: dir(0, -50), upperArmR: dir(10, -70), forearmR: dir(0, -50) }), ease: "inOut" },
    { t: 2.0, pose: sat({ trunk: dir(0, 72), head: dir(-20, 55), upperArmL: dir(-10, -70), forearmL: dir(0, -50), upperArmR: dir(10, -70), forearmR: dir(0, -50) }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "reaction", "bad"], "Shoulders drop, head down, a glance away: not the marks she wanted.", { duration: 2.4 }),
  ceremony("kc.heart", "Hands make a heart", [
    { t: 0, pose: sat({ ...handsInLap }) },
    { t: 0.5, pose: sat({ upperArmL: dir(-30, -35), forearmL: dir(30, 30), upperArmR: dir(30, -35), forearmR: dir(-30, 30) }), ease: "out" },
  ], ["kiss-and-cry", "seated"], "Both hands shaping a heart at the chest, held to the camera.", { duration: 1.5 }),
  ceremony("kc.wipe-eyes", "Wipe the eyes", [
    { t: 0, pose: sat({ ...handsInLap }) },
    { t: 0.5, pose: sat({ head: dir(0, 80), ...handsInLap, upperArmR: dir(10, -35), forearmR: dir(-25, 75) }), ease: "out" },
    { t: 1.2, pose: sat({ head: dir(0, 80), ...handsInLap, upperArmR: dir(15, -30), forearmR: dir(-35, 78) }), ease: "inOut" },
    { t: 1.8, pose: sat({ ...handsInLap }), ease: "inOut" },
  ], ["kiss-and-cry", "seated", "tears"], "The back of the hand to the eyes: it meant a lot.", { duration: 2.0 }),
  ceremony("kc.point", "Point at the camera", [
    { t: 0, pose: sat({ ...handsInLap }) },
    { t: 0.4, pose: sat({ head: dir(0, 88), ...handsInLap, upperArmR: dir(15, 10), forearmR: dir(5, 15) }), ease: "out" },
  ], ["kiss-and-cry", "seated"], "A grin and a finger straight at the camera: that one was for home.", { duration: 1.4 }),
];

// ── bows, the podium, skating on ──────────────────────────────────────────────

const freeBehind: Segs = { thighR: dir(160, -80), shinR: dir(170, -75), footR: dir(180, -10) };
const ceremonies: Clip[] = [
  ceremony("bow.reverence", "Reverence", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 0.9, pose: p(0.82, { trunk: dir(0, 80), head: dir(0, 70), thighL: dir(0, -75), shinL: dir(180, -78), footL: dir(-5, -20), ...freeBehind, upperArmL: dir(-110, -40), forearmL: dir(-130, -45), upperArmR: dir(80, 10), forearmR: dir(90, 0) }), ease: "inOut" },
    { t: 1.8, pose: p(0.8, { trunk: dir(0, 72), head: dir(0, 60), thighL: dir(0, -70), shinL: dir(180, -76), footL: dir(-5, -20), ...freeBehind, upperArmL: dir(-110, -50), forearmL: dir(-130, -55), upperArmR: dir(100, -40), forearmR: dir(120, -45) }), ease: "inOut" },
    { t: 3.0, pose: stood({ head: dir(0, 88), upperArmL: dir(-110, -50), forearmL: dir(-120, -55), upperArmR: dir(110, -50), forearmR: dir(120, -55) }), ease: "inOut" },
  ], ["bow", "curtsey", "ballet"], "The curtsey to the judges: the right foot behind, both knees soft, the trunk and the right arm sweeping down.", { duration: 3.0 }),
  ceremony("bow.deep", "Deep bow", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 1.0, pose: stood({ trunk: dir(0, 45), head: dir(0, 30), upperArmL: dir(-20, -80), forearmL: dir(0, -85), upperArmR: dir(20, -80), forearmR: dir(0, -85) }), ease: "inOut" },
    { t: 1.6, pose: stood({ trunk: dir(0, 45), head: dir(0, 30), upperArmL: dir(-20, -80), forearmL: dir(0, -85), upperArmR: dir(20, -80), forearmR: dir(0, -85) }) },
    { t: 2.6, pose: stood({ ...armsDown }), ease: "inOut" },
  ], ["bow"], "From the waist, arms falling straight, held a beat: for a home crowd.", { duration: 2.6 }),
  ceremony("bow.wave-crowd", "Wave to the stands", [
    { t: 0, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-80, -75), upperArmR: dir(80, 55), forearmR: dir(70, 80) }, { twist: -25 }) },
    { t: 1.0, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-80, -75), upperArmR: dir(110, 55), forearmR: dir(120, 80) }, { twist: 25 }), ease: "inOut" },
    { t: 2.0, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-80, -75), upperArmR: dir(80, 55), forearmR: dir(70, 80) }, { twist: -25 }), ease: "inOut" },
  ], ["bow", "wave", "crowd"], "The right arm high, the shoulders turning from one end of the stands to the other.", { loop: true, duration: 2.0 }),
  ceremony("podium.step-up", "Step up to the podium", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 0.5, pose: p(0.86, { thighL: dir(0, -20), shinL: dir(0, -85), footL: dir(0, -15), thighR: DOWN, shinR: DOWN, footR: dir(5, -20), upperArmL: dir(-110, -60), forearmL: dir(-100, -55), upperArmR: dir(110, -60), forearmR: dir(100, -55) }), ease: "out" },
    { t: 1.2, pose: stood({ ...armsDown }), ease: "inOut" },
  ], ["podium"], "The left knee lifts onto the block, the weight goes up and over it, she stands tall.", { duration: 1.2 }),
  ceremony("podium.wave", "Wave from the podium", [
    { t: 0, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-60, -78), upperArmR: dir(40, 75), forearmR: dir(20, 88) }) },
    { t: 0.4, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-60, -78), upperArmR: dir(40, 75), forearmR: dir(70, 75) }), ease: "inOut" },
    { t: 0.8, pose: stood({ upperArmL: dir(-100, -80), forearmL: dir(-60, -78), upperArmR: dir(40, 75), forearmR: dir(20, 88) }), ease: "inOut" },
  ], ["podium", "wave"], "Tall on the block, the right hand high and waving.", { loop: true, duration: 1.6 }),
  ceremony("podium.medal", "Looking at the medal", [
    { t: 0, pose: stood({ head: dir(0, 50), upperArmL: dir(-20, -60), forearmL: dir(30, 0), upperArmR: dir(20, -60), forearmR: dir(-30, 0) }) },
    { t: 1.2, pose: stood({ head: dir(0, 50), upperArmL: dir(-20, -60), forearmL: dir(30, 0), upperArmR: dir(20, -60), forearmR: dir(-30, 0) }) },
    { t: 2.0, pose: stood({ head: dir(0, 88), upperArmL: dir(-20, -60), forearmL: dir(30, 10), upperArmR: dir(20, -60), forearmR: dir(-30, 10) }), ease: "inOut" },
  ], ["podium", "medal"], "The medal held in both hands at the chest, looked at, then lifted for the cameras.", { duration: 2.4 }),
  ceremony("podium.flowers", "Flowers and a wave", [
    { t: 0, pose: stood({ upperArmL: dir(-30, -55), forearmL: dir(40, 10), upperArmR: dir(60, 50), forearmR: dir(30, 85) }) },
    { t: 0.4, pose: stood({ upperArmL: dir(-30, -55), forearmL: dir(40, 10), upperArmR: dir(60, 50), forearmR: dir(75, 70) }), ease: "inOut" },
    { t: 0.8, pose: stood({ upperArmL: dir(-30, -55), forearmL: dir(40, 10), upperArmR: dir(60, 50), forearmR: dir(30, 85) }), ease: "inOut" },
  ], ["podium", "wave", "flowers"], "The bouquet cradled in the left arm, the right hand waving.", { loop: true, duration: 1.6 }),
  ceremony("ceremony.skate-on", "Skating on, arm raised", [
    { t: 0, pose: p(0.87, { trunk: dir(0, 86), thighL: DOWN, shinL: DOWN, footL: dir(0, -20), thighR: dir(180, -55), shinR: dir(180, -62), footR: dir(180, -35), upperArmL: dir(-100, -40), forearmL: dir(-100, -40), upperArmR: dir(30, 70), forearmR: dir(20, 85) }) },
  ], ["ceremony", "glide", "wave"], "A victory lap's glide: the free leg extended behind, the right arm raised to the crowd.", { loop: true, duration: 1 }),
];

// ── warm-up and idle, at the boards or on the spot ────────────────────────────

const visualizeIn: Segs = { upperArmL: dir(-20, -40), forearmL: dir(60, -10), upperArmR: dir(20, -40), forearmR: dir(-60, -10) };
const idles: Clip[] = [
  idle("idle.breathe", "Standing, breathing", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 2.0, pose: stood({ trunk: dir(180, 88), head: dir(0, 89), upperArmL: dir(-100, -80), forearmL: dir(-35, -78), upperArmR: dir(100, -80), forearmR: dir(35, -78) }), ease: "inOut" },
  ], ["idle", "breath"], "Still, tall, a slow breath in and out: the default between everything.", { loop: true, duration: 4.0 }),
  idle("idle.hands-hips", "Hands on hips", [
    { t: 0, pose: stood({ ...handsOnHips }) },
    { t: 1.5, pose: stood({ head: dir(-25, 86), ...handsOnHips }), ease: "inOut" },
    { t: 3.0, pose: stood({ head: dir(25, 86), ...handsOnHips }), ease: "inOut" },
  ], ["idle", "breath"], "Hands on the hips, getting her breath back, looking round the rink.", { loop: true, duration: 4.5 }),
  idle("idle.look-around", "Looking round the rink", [
    { t: 0, pose: stood({ ...armsDown, head: dir(-60, 88) }) },
    { t: 1.5, pose: stood({ ...armsDown, head: dir(0, 85) }), ease: "inOut" },
    { t: 3.0, pose: stood({ ...armsDown, head: dir(60, 88) }), ease: "inOut" },
    { t: 4.5, pose: stood({ ...armsDown, head: dir(0, 85) }), ease: "inOut" },
  ], ["idle"], "The head turns slowly across the stands and back.", { loop: true, duration: 6.0 }),
  idle("idle.shake-legs", "Shaking out the legs", [
    { t: 0, pose: p(H, { ...armsDown, thighL: DOWN, shinL: DOWN, footL: dir(-5, -20), thighR: dir(5, -70), shinR: dir(10, -85), footR: dir(5, -50) }) },
    { t: 0.3, pose: p(H, { ...armsDown, thighL: DOWN, shinL: DOWN, footL: dir(-5, -20), thighR: dir(10, -75), shinR: dir(-10, -80), footR: dir(-5, -40) }), ease: "inOut" },
    { t: 0.6, pose: p(H, { ...armsDown, thighL: dir(-5, -70), shinL: dir(-10, -85), footL: dir(-5, -50), thighR: DOWN, shinR: DOWN, footR: dir(5, -20) }), ease: "inOut" },
    { t: 0.9, pose: p(H, { ...armsDown, thighL: dir(-10, -75), shinL: dir(10, -80), footL: dir(5, -40), thighR: DOWN, shinR: DOWN, footR: dir(5, -20) }), ease: "inOut" },
  ], ["idle", "warm-up"], "One foot then the other lifted and shaken loose.", { loop: true, duration: 1.2 }),
  idle("idle.arm-circles", "Arm circles", [
    { t: 0, pose: stood({ upperArmL: dir(-90, -60), forearmL: dir(-90, -60), upperArmR: dir(90, -60), forearmR: dir(90, -60) }) },
    { t: 0.4, pose: stood({ upperArmL: dir(-30, 20), forearmL: dir(-30, 20), upperArmR: dir(30, 20), forearmR: dir(30, 20) }) },
    { t: 0.8, pose: stood({ upperArmL: dir(-80, 85), forearmL: dir(-80, 85), upperArmR: dir(80, 85), forearmR: dir(80, 85) }) },
    { t: 1.2, pose: stood({ upperArmL: dir(-150, 10), forearmL: dir(-150, 10), upperArmR: dir(150, 10), forearmR: dir(150, 10) }) },
  ], ["idle", "warm-up"], "Both arms swung in big circles, forward and over.", { loop: true, duration: 1.6 }),
  idle("idle.quad-stretch", "Quad stretch", [
    { t: 0, pose: stood({ trunk: dir(0, 85), thighR: dir(180, -85), shinR: dir(180, 60), footR: dir(0, 40), upperArmR: dir(160, -55), forearmR: dir(175, -20), upperArmL: dir(-90, 0), forearmL: dir(-90, 0) }) },
  ], ["idle", "warm-up", "stretch"], "The right heel pulled up behind by the right hand, the left arm out for balance.", { loop: true, duration: 1 }),
  idle("idle.hamstring-fold", "Forward fold", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 1.2, pose: stood({ trunk: dir(0, -45), head: dir(0, -60), upperArmL: dir(-10, -80), forearmL: dir(0, -85), upperArmR: dir(10, -80), forearmR: dir(0, -85) }), ease: "inOut" },
    { t: 3.0, pose: stood({ trunk: dir(0, -45), head: dir(0, -60), upperArmL: dir(-10, -80), forearmL: dir(0, -85), upperArmR: dir(10, -80), forearmR: dir(0, -85) }) },
    { t: 4.0, pose: stood({ ...armsDown }), ease: "inOut" },
  ], ["idle", "warm-up", "stretch"], "Folded down over straight legs, hands toward the boots, and slowly back up.", { duration: 4.0 }),
  idle("idle.side-stretch", "Side stretch", [
    { t: 0, pose: stood({ trunk: dir(-90, 72), head: dir(-90, 70), upperArmR: dir(-60, 80), forearmR: dir(-90, 50), upperArmL: dir(-110, -60), forearmL: dir(30, -20) }) },
  ], ["idle", "warm-up", "stretch"], "The right arm over the head, bending to the left.", { loop: true, duration: 1 }),
  idle("idle.calf-stretch", "Calf stretch", [
    { t: 0, pose: p(0.8, { trunk: dir(0, 75), head: dir(0, 80), thighL: dir(0, -55), shinL: dir(0, -88), footL: dir(0, -20), thighR: dir(180, -60), shinR: dir(180, -62), footR: dir(0, -10), ...handsOnHips }) },
  ], ["idle", "warm-up", "stretch"], "A long step forward on the left, the right leg straight behind with its blade flat.", { loop: true, duration: 1 }),
  idle("idle.ankle-roll", "Ankle roll", [
    { t: 0, pose: stood({ ...handsOnHips, thighR: dir(0, -80), shinR: dir(180, -80), footR: dir(0, -80) }) },
    { t: 0.4, pose: stood({ ...handsOnHips, thighR: dir(0, -80), shinR: dir(180, -80), footR: dir(90, -70) }), ease: "inOut" },
    { t: 0.8, pose: stood({ ...handsOnHips, thighR: dir(0, -80), shinR: dir(180, -80), footR: dir(180, -80) }), ease: "inOut" },
    { t: 1.2, pose: stood({ ...handsOnHips, thighR: dir(0, -80), shinR: dir(180, -80), footR: dir(-90, -70) }), ease: "inOut" },
  ], ["idle", "warm-up"], "The right toe pick on the ice, the ankle circled round it.", { loop: true, duration: 1.6 }),
  idle("idle.boards-lean", "Leaning on the boards", [
    { t: 0, pose: stood({ trunk: dir(0, 55), head: dir(0, 70), upperArmL: dir(-20, 0), forearmL: dir(-10, -40), upperArmR: dir(20, 0), forearmR: dir(10, -40), thighR: dir(180, -85), shinR: dir(180, -80) }) },
    { t: 2.0, pose: stood({ trunk: dir(0, 57), head: dir(0, 80), upperArmL: dir(-20, 0), forearmL: dir(-10, -40), upperArmR: dir(20, 0), forearmR: dir(10, -40), thighR: dir(180, -85), shinR: dir(180, -80) }), ease: "inOut" },
  ], ["idle", "boards"], "Both hands on the boards' rail, leaning in, listening to the coach across them.", { loop: true, duration: 4.0 }),
  idle("idle.visualize", "Marking a jump", [
    { t: 0, pose: stood({ upperArmL: dir(-130, -10), forearmL: dir(-150, -10), upperArmR: dir(50, -10), forearmR: dir(30, -10) }, { twist: -35 }) },
    { t: 0.8, pose: stood({ ...visualizeIn }, { twist: 30 }), ease: "out" },
    { t: 1.6, pose: stood({ ...visualizeIn, head: dir(0, 80) }, { twist: 30 }) },
    { t: 2.4, pose: stood({ upperArmL: dir(-130, -10), forearmL: dir(-150, -10), upperArmR: dir(50, -10), forearmR: dir(30, -10) }, { twist: -35 }), ease: "inOut" },
  ], ["idle", "warm-up", "jump"], "Eyes down, walking a jump through with the arms: the wind-up, the pull-in, the check.", { loop: true, duration: 3.2 }),
  idle("idle.ponytail", "Fixing the hair", [
    { t: 0, pose: stood({ head: dir(0, 80), upperArmL: dir(-100, 50), forearmL: dir(160, 30), upperArmR: dir(100, 50), forearmR: dir(-160, 30) }) },
    { t: 1.0, pose: stood({ head: dir(0, 82), upperArmL: dir(-110, 45), forearmL: dir(170, 35), upperArmR: dir(110, 45), forearmR: dir(-170, 35) }), ease: "inOut" },
  ], ["idle"], "Both hands behind the head, tightening the ponytail.", { loop: true, duration: 2.0 }),
  idle("idle.fist", "Let's go", [
    { t: 0, pose: stood({ ...armsDown }) },
    { t: 0.3, pose: stood({ head: dir(0, 80), upperArmL: dir(-100, -80), forearmL: dir(-60, -75), upperArmR: dir(30, -60), forearmR: dir(-20, 40) }), ease: "out" },
    { t: 0.5, pose: stood({ head: dir(0, 80), upperArmL: dir(-100, -80), forearmL: dir(-60, -75), upperArmR: dir(30, -70), forearmR: dir(-20, 20) }) },
    { t: 1.0, pose: stood({ ...armsDown }), ease: "inOut" },
  ], ["idle", "warm-up"], "A short fist at the chest before she skates to the centre.", { duration: 1.0 }),
];

/** One-sided: a hand or a foot leads. Each gets its mirror. */
const ONE_SIDED = new Set(["kc.wave", "kc.blow-kiss", "kc.wipe-eyes", "kc.point", "kc.listen", "bow.reverence", "bow.wave-crowd", "podium.step-up", "podium.wave", "podium.flowers", "ceremony.skate-on", "idle.quad-stretch", "idle.side-stretch", "idle.calf-stretch", "idle.ankle-roll", "idle.fist", "idle.visualize"]);
const mirrored = (cs: Clip[]) => [...cs, ...cs.filter(c => ONE_SIDED.has(c.id)).map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other side)`))];

export const CEREMONY: readonly Clip[] = mirrored([...kissAndCry, ...ceremonies]);
export const IDLES: readonly Clip[] = mirrored(idles);
