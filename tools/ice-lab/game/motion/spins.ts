// game/motion/spins.ts — spin positions: the reference poses data/spin-positions.json names, and more.
//
// data/spin-positions.json declares every playable spin position with a `reference_pose`
// (SP_Upright_Basic ... SP_Camel_Twisted) that no asset ever filled. These are those poses, by
// those names, so a client can draw the position the sim has declared; and a few positions,
// entries and exits the catalogue does not list yet (marked `uncatalogued`), for presentation.
// A spin's speed and its inertia stay the catalogue's and the sim's: these are shapes only.
//
// Written for a counter-clockwise spinner on her left foot (the skating leg), free leg the right;
// a clockwise spinner plays the mirror. AUTHORED shapes, judged by eye.

import { clip, dir, mirrorClip, DOWN, UP } from "./types.ts";
import type { Clip, Pose, Segment, Vec3 } from "./types.ts";

type Segs = Partial<Record<Segment, Vec3>>;
const STAND_L = { thighL: DOWN, shinL: DOWN, footL: dir(0, -20) };
const sitL = (depth: number) => ({ thighL: dir(0, -90 + depth), shinL: dir(180, -90 + depth * 0.55), footL: dir(0, -15) });
const hold = (id: string, name: string, pelvis: number, seg: Segs, tags: string[], note: string, extra: Partial<Pose> = {}): Clip =>
  clip(id, name, "spin", [{ t: 0, pose: { pelvis, ...extra, seg } }], { loop: true, duration: 1, tags: ["spin", ...tags], note });
const armsIn = { upperArmL: dir(-30, -60), forearmL: dir(60, -10), upperArmR: dir(30, -60), forearmR: dir(-60, -10) };
const armsUp = { upperArmL: dir(-15, 75), forearmL: dir(20, 85), upperArmR: dir(15, 75), forearmR: dir(-20, 85) };
const armsOpen = { upperArmL: dir(-90, -10), forearmL: dir(-90, -15), upperArmR: dir(90, -10), forearmR: dir(90, -15) };
const armsForward = { upperArmL: dir(-20, -10), forearmL: dir(-10, -5), upperArmR: dir(20, -10), forearmR: dir(10, -5) };
const H = 0.89; // standing pelvis

export const SPIN_POSES: readonly Clip[] = [
  // Upright
  // 2026-11-14: the free knee raised forward and the shin folded back so the blade rests at the skating
  // knee. As first written (thighR dir(15, -55), shin straight down) the free boot hung a hand's width
  // off the ice and the spin read as two-footed in the clients (PR #97's stills).
  hold("SP_Upright_Basic", "Upright", H, { trunk: UP, head: UP, ...STAND_L, thighR: dir(-5, -45), shinR: dir(-151, -41), footR: dir(-150, -70), ...armsIn }, ["upright", "catalogued"], "Free knee raised in front, its blade drawn in to the skating knee, arms drawn in."),
  hold("SP_Upright_Crossfoot", "Crossfoot", H, { trunk: UP, head: UP, ...STAND_L, thighR: dir(-10, -88), shinR: dir(-15, -88), footR: dir(-10, -30), upperArmL: dir(-20, -50), forearmL: dir(70, 0), upperArmR: dir(20, -50), forearmR: dir(-70, 0) }, ["upright", "catalogued"], "The scratch: both blades crossed, arms folded tight; the fastest spin there is."),
  hold("SP_Upright_Layback", "Layback", H - 0.03, { trunk: dir(180, 45), head: dir(180, 20), ...STAND_L, thighR: dir(160, -45), shinR: dir(100, -80), footR: dir(150, -10), upperArmL: dir(-150, 30), forearmL: dir(-170, 30), upperArmR: dir(150, 30), forearmR: dir(170, 30) }, ["upright", "catalogued", "back"], "The back arched over the free leg, arms trailing behind."),
  hold("SP_Upright_Biellmann", "Biellmann", H - 0.02, { trunk: dir(180, 75), head: dir(0, 85), ...STAND_L, thighR: dir(180, 20), shinR: dir(180, 75), footR: dir(0, 80), upperArmL: dir(-20, 85), forearmL: dir(160, 60), upperArmR: dir(20, 85), forearmR: dir(-160, 60) }, ["upright", "catalogued", "flexibility"], "The free blade pulled up from behind, over the head, both hands holding it."),
  hold("SP_Upright_CatchFoot", "Catch-foot", H, { trunk: dir(0, 85), head: UP, ...STAND_L, thighR: dir(180, -30), shinR: dir(180, 60), footR: dir(0, 60), upperArmL: dir(-40, -20), forearmL: dir(-80, -20), upperArmR: dir(140, -20), forearmR: dir(170, 10) }, ["upright", "catalogued", "flexibility"], "One hand catches the free blade behind and pulls it up."),
  hold("SP_Upright_Haircutter", "Haircutter", H - 0.04, { trunk: dir(180, 60), head: dir(180, 50), ...STAND_L, thighR: dir(180, -10), shinR: dir(180, 30), footR: dir(0, 70), upperArmL: dir(-160, 50), forearmL: dir(170, 60), upperArmR: dir(160, 50), forearmR: dir(-170, 60) }, ["upright", "catalogued", "back", "flexibility"], "Arched back, the free blade held by the head: it looks like a haircut."),
  hold("SP_Upright_SideLean", "Side lean", H - 0.03, { trunk: dir(90, 50), head: dir(90, 40), ...STAND_L, thighR: dir(180, -40), shinR: dir(140, -70), footR: dir(180, -10), upperArmL: dir(80, 70), forearmL: dir(100, 60), upperArmR: dir(100, 10), forearmR: dir(110, 0) }, ["upright", "catalogued", "side"], "Bent sideways at the waist over the skating hip."),
  hold("SP_Upright_Attitude", "Attitude", H, { trunk: dir(0, 85), head: UP, ...STAND_L, thighR: dir(180, 0), shinR: dir(140, -40), footR: dir(120, -30), ...armsUp }, ["upright", "catalogued", "free leg"], "Free knee raised behind at hip height, bent; arms above the head (game/free-leg raise)."),
  hold("SP_Upright_IPosition", "I position", H, { trunk: UP, head: UP, ...STAND_L, thighR: dir(0, 88), shinR: dir(0, 88), footR: dir(0, 80), upperArmL: dir(0, 85), forearmL: dir(10, 88), upperArmR: dir(80, -10), forearmR: dir(60, -20) }, ["upright", "catalogued", "free leg", "flexibility"], "The standing split: free leg straight up the front of the body, held."),
  // Sit
  hold("SP_Sit_Basic", "Sit", 0.45, { trunk: dir(0, 60), head: dir(0, 75), ...sitL(85), thighR: dir(5, 0), shinR: dir(5, -5), footR: dir(0, 10), ...armsForward }, ["sit", "catalogued"], "Skating thigh level with the ice, free leg out in front."),
  hold("SP_Sit_Pancake", "Pancake", 0.42, { trunk: dir(0, 65), head: dir(0, 75), ...sitL(90), thighR: dir(-80, -10), shinR: dir(-80, -10), footR: dir(-80, 0), upperArmL: dir(-60, -40), forearmL: dir(-80, -50), upperArmR: dir(40, -20), forearmR: dir(-40, -30) }, ["sit", "catalogued"], "The free ankle laid across the skating knee: flat as a pancake."),
  hold("SP_Sit_BrokenLeg", "Broken leg", 0.44, { trunk: dir(0, 65), head: dir(0, 70), ...sitL(85), thighR: dir(90, -20), shinR: dir(160, -30), footR: dir(150, -20), ...armsOpen }, ["sit", "catalogued"], "The free leg out to the side, bent back at the knee."),
  hold("SP_Sit_Cannonball", "Cannonball", 0.4, { trunk: dir(0, 40), head: dir(0, 40), ...sitL(92), thighR: dir(0, 30), shinR: dir(0, 20), footR: dir(0, 30), upperArmL: dir(-10, -20), forearmL: dir(30, -10), upperArmR: dir(10, -20), forearmR: dir(-30, -10) }, ["sit", "catalogued"], "Folded over a free leg raised in front, holding the blade: a ball."),
  hold("SP_Sit_TuckBehind", "Tuck behind", 0.43, { trunk: dir(0, 55), head: dir(0, 70), ...sitL(88), thighR: dir(170, -60), shinR: dir(170, -10), footR: dir(180, 0), ...armsForward }, ["sit", "catalogued"], "The free leg tucked behind the skating leg."),
  hold("SP_Sit_Twisted", "Twisted sit", 0.44, { trunk: dir(60, 60), head: dir(80, 70), ...sitL(85), thighR: dir(-30, 0), shinR: dir(-30, -5), footR: dir(-30, 10), upperArmL: dir(80, -20), forearmL: dir(100, -30), upperArmR: dir(120, 0), forearmR: dir(130, 10) }, ["sit", "catalogued", "twist"], "The trunk turned across the free leg."),
  // Camel
  hold("SP_Camel_Basic", "Camel", 0.86, { trunk: dir(0, 5), head: dir(0, 15), ...STAND_L, thighR: dir(180, 5), shinR: dir(180, 5), footR: dir(180, 10), ...armsOpen }, ["camel", "catalogued"], "Body and free leg in one line, level with the ice: the slow spin."),
  hold("SP_Camel_CatchFoot", "Catch-foot camel", 0.86, { trunk: dir(0, 10), head: dir(0, 30), ...STAND_L, thighR: dir(180, 10), shinR: dir(180, 70), footR: dir(0, 40), upperArmL: dir(-90, -20), forearmL: dir(-90, -20), upperArmR: dir(160, 30), forearmR: dir(170, 40) }, ["camel", "catalogued", "flexibility"], "From the camel, the free blade caught and pulled toward the head."),
  hold("SP_Camel_Donut", "Doughnut", 0.86, { trunk: dir(0, 20), head: dir(180, 30), ...STAND_L, thighR: dir(180, 30), shinR: dir(180, 80), footR: dir(0, 50), upperArmL: dir(-160, 30), forearmL: dir(160, 40), upperArmR: dir(160, 30), forearmR: dir(-160, 40) }, ["camel", "catalogued", "flexibility"], "Head back to meet the free blade: a ring."),
  hold("SP_Camel_Layover", "Layover", 0.86, { trunk: dir(-90, 5), head: dir(-90, 20), ...STAND_L, thighR: dir(180, 30), shinR: dir(180, 30), footR: dir(180, 30), upperArmL: dir(-90, 50), forearmL: dir(-80, 60), upperArmR: dir(90, -60), forearmR: dir(80, -70) }, ["camel", "catalogued", "side"], "Rolled open to face the roof, free leg up behind."),
  hold("SP_Camel_Side", "Side camel", 0.86, { trunk: dir(-90, 5), head: dir(-90, 10), ...STAND_L, thighR: dir(90, 10), shinR: dir(90, 10), footR: dir(90, 10), upperArmL: dir(-90, 0), forearmL: dir(-90, 0), upperArmR: dir(90, 0), forearmR: dir(90, 0) }, ["camel", "catalogued", "side"], "The body level out to one side instead of forward."),
  hold("SP_Camel_Twisted", "Twisted camel", 0.86, { trunk: dir(0, 5), head: dir(-90, 10), ...STAND_L, thighR: dir(180, 5), shinR: dir(180, 5), footR: dir(180, 10), upperArmL: dir(-90, 40), forearmL: dir(-90, 50), upperArmR: dir(0, -40), forearmR: dir(0, -50) }, ["camel", "catalogued", "twist"], "Level, with the shoulders turned up and open."),
  // Uncatalogued positions
  hold("spin.y-spin", "Y-spin", H, { trunk: dir(-20, 85), head: UP, ...STAND_L, thighR: dir(80, 70), shinR: dir(80, 80), footR: dir(80, 80), upperArmL: dir(-90, 10), forearmL: dir(-90, 20), upperArmR: dir(80, 60), forearmR: dir(90, 75) }, ["upright", "uncatalogued", "flexibility"], "Free leg held straight up to the side: a Y."),
  hold("spin.scratch-arms-up", "Scratch, arms up", H, { trunk: UP, head: UP, ...STAND_L, thighR: dir(-10, -88), shinR: dir(-15, -88), footR: dir(-10, -30), ...armsUp }, ["upright", "uncatalogued"], "The crossfoot with the arms pulled straight overhead: faster still."),
  hold("spin.pearl", "Pearl", 0.86, { trunk: dir(0, 25), head: dir(180, 40), ...STAND_L, thighR: dir(180, 40), shinR: dir(180, 85), footR: dir(0, 60), upperArmL: dir(180, 60), forearmL: dir(0, 70), upperArmR: dir(180, 60), forearmR: dir(0, 70) }, ["camel", "uncatalogued", "flexibility"], "A Biellmann laid forward into a camel: the pearl."),
  hold("spin.illusion-down", "Illusion (down)", 0.8, { trunk: dir(0, -60), head: dir(0, -50), ...STAND_L, thighR: dir(180, 60), shinR: dir(180, 60), footR: dir(180, 60), upperArmL: dir(-10, -80), forearmL: dir(0, -85), upperArmR: dir(10, -80), forearmR: dir(0, -85) }, ["camel", "uncatalogued", "illusion"], "The low point of an illusion: head to the ice, free leg to the roof."),
  hold("spin.shotgun", "Shotgun sit", 0.4, { trunk: dir(0, 50), head: dir(0, 60), ...sitL(92), thighR: dir(0, 10), shinR: dir(0, 10), footR: dir(0, 20), upperArmL: dir(-5, -5), forearmL: dir(0, 5), upperArmR: dir(5, -5), forearmR: dir(0, 5) }, ["sit", "uncatalogued"], "Low sit with both hands reaching along the free leg."),
];

/** Entries and exits: moving, one-shot. */
export const SPIN_MOVES: readonly Clip[] = [
  clip("spin.entry.windup", "Spin entry wind-up", "spin", [
    { t: 0, pose: { pelvis: 0.82, seg: { trunk: dir(-30, 85), head: dir(-30, 85), upperArmL: dir(-120, 0), forearmL: dir(-130, 0), upperArmR: dir(40, 0), forearmR: dir(30, 0) } } },
    { t: 0.6, pose: { pelvis: 0.78, seg: { trunk: dir(20, 80), head: dir(20, 82), ...armsOpen } } },
    { t: 1.0, pose: { pelvis: 0.86, seg: { trunk: UP, head: UP, ...armsIn } }, ease: "in" },
  ], { tags: ["spin", "entry"], note: "The back-crossover wind-up and the arms pulling in on the entry edge." }),
  clip("spin.entry.flying-camel", "Flying camel entry", "spin", [
    { t: 0, pose: { pelvis: 0.8, seg: { trunk: dir(0, 70), ...sitL(40), thighR: dir(180, -40), shinR: dir(180, -60), ...armsOpen } } },
    { t: 0.3, pose: { pelvis: 1.1, seg: { trunk: dir(0, 20), thighL: dir(0, -60), shinL: dir(180, -60), thighR: dir(180, 0), shinR: dir(180, 0), ...armsOpen } } },
    { t: 0.6, pose: { pelvis: 0.86, seg: { trunk: dir(0, 5), head: dir(0, 15), ...STAND_L, thighR: dir(180, 5), shinR: dir(180, 5), ...armsOpen } }, ease: "out" },
  ], { tags: ["spin", "entry", "flying"], note: "Off one foot, the legs swap in the air, landing straight into the camel." }),
  clip("spin.entry.flying-sit", "Flying sit entry", "spin", [
    { t: 0, pose: { pelvis: 0.78, seg: { trunk: dir(0, 70), ...sitL(40), ...armsOpen } } },
    { t: 0.3, pose: { pelvis: 1.15, seg: { trunk: dir(0, 70), thighL: dir(0, 0), shinL: dir(0, -80), thighR: dir(0, -10), shinR: dir(0, -90), ...armsForward } } },
    { t: 0.65, pose: { pelvis: 0.45, seg: { trunk: dir(0, 60), head: dir(0, 75), ...sitL(85), thighR: dir(5, 0), shinR: dir(5, -5), ...armsForward } }, ease: "in" },
  ], { tags: ["spin", "entry", "flying"], note: "A jump with the legs tucked, landing low in the sit." }),
  clip("spin.entry.death-drop", "Death drop", "spin", [
    { t: 0, pose: { pelvis: 0.78, seg: { trunk: dir(0, 70), ...sitL(40), ...armsOpen } } },
    { t: 0.35, pose: { pelvis: 1.2, seg: { trunk: dir(0, 5), thighL: dir(180, 0), shinL: dir(180, 0), thighR: dir(0, 0), shinR: dir(0, 0), ...armsOpen } } },
    { t: 0.7, pose: { pelvis: 0.44, seg: { trunk: dir(0, 60), ...sitL(85), thighR: dir(5, 0), shinR: dir(5, -5), ...armsForward } }, ease: "in" },
  ], { tags: ["spin", "entry", "flying"], note: "Laid out level in the air, dropping straight down into a back sit." }),
  clip("spin.entry.butterfly", "Butterfly", "spin", [
    { t: 0, pose: { pelvis: 0.6, seg: { trunk: dir(0, 30), ...sitL(70), ...armsOpen } } },
    { t: 0.35, pose: { pelvis: 1.0, seg: { trunk: dir(0, 0), thighL: dir(-150, -10), shinL: dir(-150, -10), thighR: dir(150, 10), shinR: dir(150, 10), ...armsOpen } } },
    { t: 0.7, pose: { pelvis: 0.6, seg: { trunk: dir(0, 30), ...sitL(70), ...armsOpen } }, ease: "in" },
  ], { tags: ["spin", "entry", "flying"], note: "Horizontal in the air, legs scissoring: a butterfly into the spin." }),
  clip("spin.change-foot", "Change of foot", "spin", [
    { t: 0, pose: { pelvis: 0.45, seg: { trunk: dir(0, 60), ...sitL(85), thighR: dir(5, 0), shinR: dir(5, -5), ...armsForward } } },
    { t: 0.4, pose: { pelvis: 0.75, seg: { trunk: dir(0, 80), thighL: dir(0, -70), shinL: dir(0, -85), thighR: dir(0, -70), shinR: dir(0, -85), ...armsOpen } } },
    { t: 0.8, pose: { pelvis: 0.45, seg: { trunk: dir(0, 60), thighR: dir(0, 5), shinR: dir(180, -40), thighL: dir(-5, 0), shinL: dir(-5, -5), ...armsForward } }, ease: "in" },
  ], { tags: ["spin", "change"], note: "Up out of the sit, a step to the other foot, down again." }),
  clip("spin.exit", "Spin exit", "spin", [
    { t: 0, pose: { pelvis: H, seg: { trunk: UP, head: UP, ...armsIn } } },
    { t: 0.5, pose: { pelvis: 0.82, seg: { trunk: dir(180, 85), head: dir(180, 88), thighR: dir(180, -40), shinR: dir(180, -60), ...armsOpen } }, ease: "out" },
    { t: 1.0, pose: { pelvis: 0.86, seg: { trunk: dir(180, 80), head: dir(180, 85), thighR: dir(160, -35), shinR: dir(160, -55), upperArmL: dir(-110, 20), forearmL: dir(-120, 25), upperArmR: dir(110, 20), forearmR: dir(120, 25) } } },
  ], { tags: ["spin", "exit"], note: "Arms flung open to check the rotation, out backward on the free leg's edge." }),
  clip("spin.illusion", "Illusion cycle", "spin", [
    { t: 0, pose: { pelvis: 0.86, seg: { trunk: dir(0, 5), head: dir(0, 15), ...STAND_L, thighR: dir(180, 5), shinR: dir(180, 5), ...armsOpen } } },
    { t: 0.5, pose: { pelvis: 0.8, seg: { trunk: dir(0, -60), head: dir(0, -50), ...STAND_L, thighR: dir(180, 60), shinR: dir(180, 60), upperArmL: dir(-10, -80), forearmL: dir(0, -85), upperArmR: dir(10, -80), forearmR: dir(0, -85) } } },
    { t: 1.0, pose: { pelvis: 0.86, seg: { trunk: dir(0, 5), head: dir(0, 15), ...STAND_L, thighR: dir(180, 5), shinR: dir(180, 5), ...armsOpen } } },
  ], { loop: true, tags: ["spin", "camel", "illusion"], note: "Down through the illusion and back up to the camel, every revolution." }),
];

/** Counter-clockwise as written; the clockwise twin of each (a skater who spins the other way). */
export const SPINS: readonly Clip[] = [
  ...SPIN_POSES, ...SPIN_MOVES,
  ...[...SPIN_POSES, ...SPIN_MOVES].map(c => mirrorClip(c, `${c.id}.cw`, `${c.name} (clockwise)`)),
];
