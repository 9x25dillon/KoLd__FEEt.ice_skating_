// game/motion/transitions.ts — leg and skate transitions: moves in the field, turns, steps, stops,
// and the free leg's positions.
//
// The sim performs every turn, edge and step (sim/moves.ts, sim/stepLevel.ts) and decides which
// one happened; these are what each looks like through the legs and carriage, for a client to
// play while the sim says the move is live, and for the Composer and dance styles to name.
// Written skating on the left foot where it matters (free leg the right); each one-sided move has
// its mirror. AUTHORED shapes and timings, judged by eye.

import { clip, dir, mirrorClip, trunkAsTwist, DOWN, UP } from "./types.ts";
import type { Clip, Key, Pose, Segment, Vec3 } from "./types.ts";

type Segs = Partial<Record<Segment, Vec3>>;
const L_SKATE = { thighL: DOWN, shinL: DOWN, footL: dir(0, -20) };
const L_KNEE = (b: number) => ({ thighL: dir(0, -90 + b), shinL: dir(180, -90 + b * 0.8), footL: dir(0, -20) });
const R_KNEE = (b: number) => ({ thighR: dir(0, -90 + b), shinR: dir(180, -90 + b * 0.8), footR: dir(0, -20) });
const armsOpen = { upperArmL: dir(-90, -15), forearmL: dir(-90, -20), upperArmR: dir(90, -15), forearmR: dir(90, -20) };
const armsCheck = { upperArmL: dir(-60, -20), forearmL: dir(-30, -20), upperArmR: dir(120, -20), forearmR: dir(150, -20) };
const p = (pelvis: number, seg: Segs, extra: Partial<Pose> = {}): Pose => ({ pelvis, ...extra, seg: { trunk: UP, head: UP, ...seg } });
const still = (id: string, name: string, category: "transition" | "leg", pose: Pose, tags: string[], note: string): Clip =>
  clip(id, name, category, [{ t: 0, pose }], { loop: true, duration: 1, tags, note });
const move = (id: string, name: string, keys: Key[], tags: string[], note: string, loop = false): Clip =>
  clip(id, name, "transition", keys, { loop, tags, note });

// ── the free leg (holds, over any skating foot) ──────────────────────────────

const freeLegLeft: Clip[] = [
  still("leg.free.extended-back", "Free leg extended back", "leg", p(0.86, { ...L_KNEE(15), thighR: dir(180, -55), shinR: dir(180, -60), footR: dir(180, -40) }), ["free leg", "glide"], "The ordinary gliding line: free leg stretched behind, toe pointed."),
  still("leg.free.extended-front", "Free leg extended front", "leg", p(0.86, { ...L_KNEE(15), thighR: dir(0, -50), shinR: dir(0, -55), footR: dir(0, -30) }), ["free leg", "back"], "Stretched in front: the line skating backward."),
  still("leg.free.passe", "Passé", "leg", p(0.88, { ...L_SKATE, thighR: dir(30, 0), shinR: dir(150, -70), footR: dir(-30, -60) }), ["free leg", "ballet"], "Free toe drawn to the skating knee."),
  still("leg.free.coupe", "Coupé", "leg", p(0.87, { ...L_KNEE(10), thighR: dir(20, -45), shinR: dir(170, -60), footR: dir(-20, -60) }), ["free leg", "ballet"], "Free toe at the skating ankle."),
  still("leg.free.attitude-front", "Attitude front", "leg", p(0.88, { ...L_SKATE, thighR: dir(0, 0), shinR: dir(0, -50), footR: dir(0, -30) }), ["free leg", "ballet"], "Raised in front, knee bent."),
  still("leg.free.attitude-back", "Attitude back", "leg", p(0.87, { trunk: dir(0, 80), ...L_SKATE, thighR: dir(180, 0), shinR: dir(140, -40), footR: dir(120, -30) }), ["free leg", "ballet"], "Raised behind, knee bent and turned out."),
  still("leg.free.arabesque", "Arabesque", "leg", p(0.87, { trunk: dir(0, 70), head: dir(0, 80), ...L_SKATE, thighR: dir(180, 10), shinR: dir(180, 10), footR: dir(180, 15) }), ["free leg", "ballet", "spiral"], "Straight behind above the hip: the spiral's line."),
  still("leg.free.developpe-side", "Développé to the side", "leg", p(0.88, { trunk: dir(-90, 85), ...L_SKATE, thighR: dir(90, 20), shinR: dir(90, 25), footR: dir(90, 30) }), ["free leg", "ballet", "flexibility"], "Unfolded straight out to the side, above the hip."),
  still("leg.free.tuck", "Tuck", "leg", p(0.86, { ...L_KNEE(20), thighR: dir(0, 20), shinR: dir(180, -80), footR: dir(0, -40) }), ["free leg"], "Knee pulled up to the chest."),
  still("leg.free.kick-back", "Kick back", "leg", p(0.86, { ...L_KNEE(15), thighR: dir(180, -70), shinR: dir(180, 30), footR: dir(180, 60) }), ["free leg", "jazz"], "Heel kicked up behind."),
  still("leg.free.crossed-behind", "Crossed behind", "leg", p(0.87, { ...L_KNEE(15), thighR: dir(-160, -80), shinR: dir(-150, -80), footR: dir(-120, -40) }), ["free leg"], "Free foot crossed behind the skating heel."),
  still("leg.free.flexed-foot", "Flexed foot", "leg", p(0.87, { ...L_KNEE(10), thighR: dir(0, -45), shinR: dir(0, -50), footR: dir(0, 20) }), ["free leg", "jazz", "character"], "Leg forward with the foot flexed up: character, not ballet."),
];

// ── moves in the field (holds) ───────────────────────────────────────────────

const fieldLeft: Clip[] = [
  still("move.spiral.forward", "Forward spiral", "transition", p(0.87, { trunk: dir(0, 15), head: dir(0, 35), ...L_SKATE, thighR: dir(180, 25), shinR: dir(180, 25), footR: dir(180, 30), ...armsOpen }), ["spiral", "field"], "Free leg above the hip, body level in front: the spiral (game/free-leg raise)."),
  still("move.spiral.back", "Back spiral", "transition", p(0.87, { trunk: dir(0, 20), head: dir(180, 45), ...L_SKATE, thighR: dir(180, 25), shinR: dir(180, 25), footR: dir(180, 30), ...armsOpen }), ["spiral", "field", "back"], "The same line skated backward, looking over the shoulder."),
  still("move.spiral.y", "Y spiral", "transition", p(0.88, { trunk: dir(-30, 75), ...L_SKATE, thighR: dir(70, 70), shinR: dir(70, 80), footR: dir(70, 85), upperArmL: dir(-90, 0), forearmL: dir(-90, 5), upperArmR: dir(70, 60), forearmR: dir(80, 75) }), ["spiral", "field", "flexibility"], "Free leg held straight up to the side."),
  still("move.spiral.catch-foot", "Catch-foot spiral", "transition", p(0.87, { trunk: dir(0, 30), head: dir(0, 50), ...L_SKATE, thighR: dir(180, 45), shinR: dir(180, 80), footR: dir(0, 60), upperArmL: dir(-90, -10), forearmL: dir(-90, -10), upperArmR: dir(170, 50), forearmR: dir(175, 60) }), ["spiral", "field", "flexibility"], "Free blade caught behind and pulled up."),
  still("move.spiral.biellmann", "Biellmann spiral", "transition", p(0.87, { trunk: dir(180, 75), ...L_SKATE, thighR: dir(180, 20), shinR: dir(180, 75), footR: dir(0, 80), upperArmL: dir(-20, 85), forearmL: dir(160, 60), upperArmR: dir(20, 85), forearmR: dir(-160, 60) }), ["spiral", "field", "flexibility"], "The Biellmann line held on a travelling edge."),
  still("move.spread-eagle.outside", "Outside spread eagle", "transition", p(0.84, { trunk: dir(180, 80), head: dir(180, 85), thighL: dir(-90, -70), shinL: dir(-90, -78), footL: dir(-90, -10), thighR: dir(90, -70), shinR: dir(90, -78), footR: dir(90, -10), ...armsOpen }), ["field", "two-foot"], "Heels together, toes out, both blades on outside edges, leaning back."),
  still("move.spread-eagle.inside", "Inside spread eagle", "transition", p(0.84, { trunk: dir(0, 80), head: dir(0, 85), thighL: dir(-90, -70), shinL: dir(-90, -78), footL: dir(-90, -10), thighR: dir(90, -70), shinR: dir(90, -78), footR: dir(90, -10), upperArmL: dir(-120, 10), forearmL: dir(-130, 15), upperArmR: dir(120, 10), forearmR: dir(130, 15) }), ["field", "two-foot"], "The same turnout on inside edges, leaning in toward the centre."),
  still("move.ina-bauer", "Ina Bauer", "transition", p(0.8, { trunk: dir(180, 65), head: dir(180, 55), thighL: dir(-20, -70), shinL: dir(-15, -88), footL: dir(-20, -15), thighR: dir(160, -60), shinR: dir(170, -82), footR: dir(150, -10), upperArmL: dir(-150, 40), forearmL: dir(-160, 50), upperArmR: dir(150, 40), forearmR: dir(160, 50) }), ["field", "two-foot", "back"], "Feet on parallel tracks, one forward and one back, the back arched."),
  still("move.hydroblade", "Hydroblade", "transition", p(0.28, { trunk: dir(-90, 15), head: dir(-80, 25), thighL: dir(0, -10), shinL: dir(180, -75), footL: dir(0, -15), thighR: dir(120, -15), shinR: dir(130, -10), footR: dir(130, 0), upperArmL: dir(-100, -60), forearmL: dir(-100, -80), upperArmR: dir(90, 30), forearmR: dir(95, 40) }), ["field", "low", "edge"], "Laid almost flat on a deep edge, a hand trailing on the ice."),
  still("move.cantilever", "Cantilever", "transition", p(0.66, { trunk: dir(180, 5), head: dir(180, 10), thighL: dir(0, -40), shinL: dir(180, -55), footL: dir(-80, -10), thighR: dir(0, -40), shinR: dir(180, -55), footR: dir(80, -10), upperArmL: dir(-150, 0), forearmL: dir(-160, 0), upperArmR: dir(150, 0), forearmR: dir(160, 0) }), ["field", "two-foot", "back"], "Spread-eagle feet with the body laid back level from the knees."),
  still("move.lunge", "Lunge", "transition", p(0.5, { trunk: dir(0, 80), head: dir(0, 85), thighL: dir(0, -5), shinL: dir(180, -80), footL: dir(0, -20), thighR: dir(180, -60), shinR: dir(180, -5), footR: dir(180, 0), ...armsOpen }), ["field", "low"], "Deep on the skating knee, the free leg trailing with its boot on the ice."),
  still("move.shoot-the-duck", "Shoot the duck", "transition", p(0.36, { trunk: dir(0, 60), head: dir(0, 70), thighL: dir(0, 5), shinL: dir(180, -85), footL: dir(0, -10), thighR: dir(0, 5), shinR: dir(0, 5), footR: dir(0, 15), upperArmL: dir(-10, -5), forearmL: dir(0, 0), upperArmR: dir(10, -5), forearmR: dir(0, 0) }), ["field", "low"], "Crouched on one foot, the other leg straight out in front."),
  still("move.charlotte", "Charlotte", "transition", p(0.86, { trunk: dir(0, -55), head: dir(0, -45), ...L_SKATE, thighR: dir(180, 70), shinR: dir(180, 70), footR: dir(180, 75), upperArmL: dir(-10, -80), forearmL: dir(0, -85), upperArmR: dir(10, -80), forearmR: dir(0, -85) }), ["spiral", "field", "flexibility"], "Body folded down the skating leg, free leg to the roof."),
  still("move.split-jump-pose", "Split jump pose", "transition", p(1.1, { trunk: dir(0, 85), thighL: dir(-90, 0), shinL: dir(-90, 0), footL: dir(-90, 5), thighR: dir(90, 0), shinR: dir(90, 0), footR: dir(90, 5), ...armsOpen }), ["air", "jump", "flexibility"], "In the air, legs in a side split, arms to the toes."),
  still("move.stag-pose", "Stag jump pose", "transition", p(1.1, { trunk: dir(0, 85), thighL: dir(0, 0), shinL: dir(180, -40), footL: dir(0, -30), thighR: dir(180, -20), shinR: dir(180, -15), footR: dir(180, 0), upperArmL: dir(-20, 60), forearmL: dir(-10, 75), upperArmR: dir(120, 10), forearmR: dir(130, 15) }), ["air", "jump"], "In the air, front knee bent, back leg straight: a stag."),
];

// ── turns, steps, stops (moving) ─────────────────────────────────────────────

const turnsLeft: Clip[] = [
  move("move.three-turn", "Three-turn", [
    { t: 0, pose: p(0.84, { trunk: dir(-30, 88), ...L_KNEE(25), thighR: dir(180, -60), shinR: dir(180, -65), ...armsCheck }) },
    { t: 0.3, pose: p(0.88, { trunk: dir(60, 88), ...L_KNEE(8), thighR: dir(30, -80), shinR: dir(30, -85), ...armsOpen }), ease: "inOut" },
    { t: 0.6, pose: p(0.83, { trunk: dir(150, 88), ...L_KNEE(28), thighR: dir(0, -60), shinR: dir(0, -65), upperArmL: dir(-120, -20), forearmL: dir(-150, -20), upperArmR: dir(60, -20), forearmR: dir(30, -20) }), ease: "out" },
  ], ["turn", "one-foot"], "Rise, turn the shoulders through, the blade turns forward to backward, check."),
  move("move.mohawk", "Mohawk", [
    { t: 0, pose: p(0.85, { ...L_KNEE(20), thighR: dir(70, -70), shinR: dir(90, -80), footR: dir(150, -20), ...armsOpen }) },
    { t: 0.3, pose: p(0.85, { thighL: dir(-70, -70), shinL: dir(-90, -80), footL: dir(-30, -20), ...R_KNEE(20), ...armsCheck }) },
    { t: 0.6, pose: p(0.84, { trunk: dir(180, 88), ...R_KNEE(22), thighL: dir(0, -60), shinL: dir(0, -65), ...armsOpen }), ease: "out" },
  ], ["turn", "step"], "Heel to instep, the free foot placed turned out: forward to backward, foot to foot."),
  move("move.choctaw", "Choctaw", [
    { t: 0, pose: p(0.83, { trunk: dir(-20, 88), ...L_KNEE(25), thighR: dir(60, -70), shinR: dir(90, -80), ...armsOpen }) },
    { t: 0.3, pose: p(0.82, { trunk: dir(60, 86), thighL: dir(-100, -70), shinL: dir(-90, -80), ...R_KNEE(26), ...armsCheck }) },
    { t: 0.6, pose: p(0.83, { trunk: dir(180, 86), ...R_KNEE(24), thighL: dir(-20, -60), shinL: dir(-20, -65), ...armsOpen }), ease: "out" },
  ], ["turn", "step"], "Foot to foot with a change of edge: the curve swaps direction."),
  move("move.bracket", "Bracket", [
    { t: 0, pose: p(0.84, { trunk: dir(30, 88), ...L_KNEE(25), thighR: dir(180, -65), shinR: dir(180, -70), ...armsCheck }) },
    { t: 0.3, pose: p(0.89, { trunk: dir(-60, 88), ...L_KNEE(6), thighR: dir(-30, -80), shinR: dir(-30, -85), ...armsOpen }) },
    { t: 0.6, pose: p(0.83, { trunk: dir(-150, 88), ...L_KNEE(28), thighR: dir(0, -60), shinR: dir(0, -65), ...armsCheck }), ease: "out" },
  ], ["turn", "one-foot"], "A three-turn turned the other way against the curve: the cusp points out."),
  move("move.rocker", "Rocker", [
    { t: 0, pose: p(0.84, { trunk: dir(-20, 88), ...L_KNEE(22), thighR: dir(160, -65), shinR: dir(160, -70), ...armsCheck }) },
    { t: 0.35, pose: p(0.88, { trunk: dir(-100, 86), ...L_KNEE(8), thighR: dir(-60, -85), shinR: dir(-60, -88), ...armsOpen }) },
    { t: 0.7, pose: p(0.83, { trunk: dir(-180, 88), ...L_KNEE(26), thighR: dir(20, -60), shinR: dir(20, -65), ...armsCheck }), ease: "out" },
  ], ["turn", "one-foot"], "A one-foot turn that keeps the edge but changes lobe."),
  move("move.counter", "Counter", [
    { t: 0, pose: p(0.84, { trunk: dir(20, 88), ...L_KNEE(22), thighR: dir(-160, -65), shinR: dir(-160, -70), ...armsCheck }) },
    { t: 0.35, pose: p(0.88, { trunk: dir(100, 86), ...L_KNEE(8), thighR: dir(60, -85), shinR: dir(60, -88), ...armsOpen }) },
    { t: 0.7, pose: p(0.83, { trunk: dir(180, 88), ...L_KNEE(26), thighR: dir(-20, -60), shinR: dir(-20, -65), ...armsCheck }), ease: "out" },
  ], ["turn", "one-foot"], "The rocker's twin, turned against the rotation."),
  move("move.loop", "Loop turn", [
    { t: 0, pose: p(0.82, { trunk: dir(-30, 84), ...L_KNEE(30), thighR: dir(160, -60), shinR: dir(160, -65), ...armsOpen }) },
    { t: 0.5, pose: p(0.8, { trunk: dir(-200, 82), ...L_KNEE(34), thighR: dir(-20, -60), shinR: dir(-20, -65), upperArmL: dir(-60, -40), forearmL: dir(-40, -40), upperArmR: dir(60, -40), forearmR: dir(40, -40) }) },
    { t: 1.0, pose: p(0.84, { trunk: dir(-360, 86), ...L_KNEE(26), thighR: dir(180, -60), shinR: dir(180, -65), ...armsOpen }), ease: "out" },
  ], ["turn", "one-foot", "loop"], "A small loop traced on one edge, coming out the way it went in."),
  move("move.twizzle", "Twizzle", [
    { t: 0, pose: p(0.85, { ...L_KNEE(18), thighR: dir(160, -70), shinR: dir(160, -75), ...armsOpen }) },
    { t: 0.15, pose: p(0.89, { trunk: dir(90, 90), ...L_KNEE(5), thighR: dir(-10, -85), shinR: dir(-10, -88), upperArmL: dir(-30, -60), forearmL: dir(60, -10), upperArmR: dir(30, -60), forearmR: dir(-60, -10) }) },
    { t: 0.3, pose: p(0.89, { trunk: dir(180, 90), ...L_KNEE(5), thighR: dir(-10, -85), shinR: dir(-10, -88), upperArmL: dir(-30, -60), forearmL: dir(60, -10), upperArmR: dir(30, -60), forearmR: dir(-60, -10) }) },
  ], ["turn", "one-foot", "rotation"], "A quick multi-rotation turn travelling on one foot, arms drawn in.", true),
  move("move.toe-step", "Toe steps", [
    { t: 0, pose: p(0.9, { trunk: dir(0, 88), thighL: dir(0, -80), shinL: dir(0, -88), footL: dir(0, -70), ...R_KNEE(30), ...armsOpen }) },
    { t: 0.25, pose: p(0.9, { trunk: dir(0, 88), ...L_KNEE(30), thighR: dir(0, -80), shinR: dir(0, -88), footR: dir(0, -70), ...armsOpen }) },
    { t: 0.5, pose: p(0.9, { trunk: dir(0, 88), thighL: dir(0, -80), shinL: dir(0, -88), footL: dir(0, -70), ...R_KNEE(30), ...armsOpen }) },
  ], ["step", "toe", "rhythm"], "Running on the toe picks: quick, on the beat.", true),
  move("move.chasse", "Chassé", [
    { t: 0, pose: p(0.84, { ...L_KNEE(25), ...R_KNEE(25), ...armsOpen }) },
    { t: 0.3, pose: p(0.86, { ...L_KNEE(20), thighR: dir(0, -70), shinR: dir(0, -80), footR: dir(0, -50), ...armsOpen }) },
    { t: 0.6, pose: p(0.84, { ...L_KNEE(25), ...R_KNEE(25), ...armsOpen }) },
  ], ["step", "two-foot"], "Feet together, the free one lifts and replaces: a gliding two-step.", true),
  move("move.crossover.forward", "Forward crossover", [
    { t: 0, pose: p(0.82, { trunk: dir(-20, 84), ...L_KNEE(30), thighR: dir(160, -55), shinR: dir(170, -60), ...armsOpen }) },
    { t: 0.35, pose: p(0.82, { trunk: dir(-20, 84), thighR: dir(-30, -65), shinR: dir(-40, -85), footR: dir(-30, -20), thighL: dir(80, -60), shinL: dir(80, -75), footL: dir(60, -30), ...armsOpen }) },
    { t: 0.7, pose: p(0.82, { trunk: dir(-20, 84), ...R_KNEE(30), thighL: dir(110, -55), shinL: dir(110, -60), ...armsOpen }) },
  ], ["crossover", "stroke"], "The outside foot crosses over the inside one round the curve: the way speed is built.", true),
  move("move.crossover.back", "Back crossover", [
    { t: 0, pose: p(0.82, { trunk: dir(160, 84), head: dir(-60, 88), ...L_KNEE(30), thighR: dir(20, -55), shinR: dir(10, -60), ...armsOpen }) },
    { t: 0.35, pose: p(0.82, { trunk: dir(160, 84), head: dir(-60, 88), thighR: dir(-150, -65), shinR: dir(-140, -85), thighL: dir(-80, -60), shinL: dir(-80, -75), ...armsOpen }) },
    { t: 0.7, pose: p(0.82, { trunk: dir(160, 84), head: dir(-60, 88), ...R_KNEE(30), thighL: dir(-70, -55), shinL: dir(-70, -60), ...armsOpen }) },
  ], ["crossover", "stroke", "back"], "Backward, looking where she is going: the crossover before most jumps.", true),
  move("move.stroke", "Forward stroke", [
    { t: 0, pose: p(0.82, { ...L_KNEE(30), ...R_KNEE(30), ...armsOpen }) },
    { t: 0.4, pose: p(0.8, { trunk: dir(0, 80), ...L_KNEE(35), thighR: dir(150, -45), shinR: dir(150, -50), footR: dir(150, -30), ...armsOpen }), ease: "out" },
    { t: 0.9, pose: p(0.86, { ...L_KNEE(18), thighR: dir(180, -60), shinR: dir(180, -65), ...armsOpen }) },
  ], ["stroke"], "A push from the inside edge, the free leg extending behind.", true),
  move("move.swizzle", "Swizzle", [
    { t: 0, pose: p(0.82, { thighL: dir(-20, -70), shinL: dir(-10, -80), footL: dir(-25, -20), thighR: dir(20, -70), shinR: dir(10, -80), footR: dir(25, -20), ...armsOpen }) },
    { t: 0.4, pose: p(0.86, { thighL: dir(-60, -75), shinL: dir(-80, -82), footL: dir(15, -20), thighR: dir(60, -75), shinR: dir(80, -82), footR: dir(-15, -20), ...armsOpen }) },
    { t: 0.8, pose: p(0.82, { thighL: dir(-20, -70), shinL: dir(-10, -80), footL: dir(-25, -20), thighR: dir(20, -70), shinR: dir(10, -80), footR: dir(25, -20), ...armsOpen }) },
  ], ["two-foot", "learn"], "Feet push apart and draw together: the first thing anyone learns.", true),
  move("move.hockey-stop", "Hockey stop", [
    { t: 0, pose: p(0.86, { ...L_KNEE(15), ...R_KNEE(15), ...armsOpen }) },
    { t: 0.25, pose: p(0.68, { trunk: dir(-80, 70), head: dir(0, 85), ...L_KNEE(55), ...R_KNEE(55), footL: dir(90, -20), footR: dir(90, -20), upperArmL: dir(-110, 0), forearmL: dir(-120, 5), upperArmR: dir(60, -30), forearmR: dir(40, -30) }), ease: "out" },
    { t: 0.7, pose: p(0.8, { trunk: dir(-30, 85), ...L_KNEE(30), ...R_KNEE(30), footL: dir(90, -20), footR: dir(90, -20), ...armsOpen }) },
  ], ["stop", "two-foot", "spray"], "Both blades turned across, the body sitting into the skid: snow flies."),
  move("move.t-stop", "T-stop", [
    { t: 0, pose: p(0.86, { ...L_KNEE(15), thighR: dir(180, -70), shinR: dir(180, -75), ...armsOpen }) },
    { t: 0.4, pose: p(0.76, { ...L_KNEE(40), thighR: dir(160, -70), shinR: dir(160, -80), footR: dir(90, -10), ...armsOpen }), ease: "out" },
  ], ["stop"], "The free blade set down behind at right angles, dragging to a stop."),
  move("move.snowplow", "Snowplow stop", [
    { t: 0, pose: p(0.86, { ...L_KNEE(15), ...R_KNEE(15), ...armsOpen }) },
    { t: 0.5, pose: p(0.78, { thighL: dir(-15, -60), shinL: dir(-15, -75), footL: dir(30, -20), thighR: dir(15, -60), shinR: dir(15, -75), footR: dir(-30, -20), ...armsOpen }), ease: "out" },
  ], ["stop", "two-foot", "learn"], "Toes in, heels out, scraping to a stop."),
  move("move.bunny-hop", "Bunny hop", [
    { t: 0, pose: p(0.82, { ...L_KNEE(30), thighR: dir(180, -60), shinR: dir(180, -65), ...armsOpen }) },
    { t: 0.2, pose: p(1.05, { trunk: dir(0, 85), thighL: dir(0, -70), shinL: dir(180, -80), thighR: dir(0, -20), shinR: dir(0, -40), footR: dir(0, -10), upperArmL: dir(-30, 40), forearmL: dir(-20, 55), upperArmR: dir(30, 40), forearmR: dir(20, 55) }), ease: "out" },
    { t: 0.45, pose: p(0.84, { ...R_KNEE(22), thighL: dir(180, -60), shinL: dir(180, -65), ...armsOpen }), ease: "in" },
  ], ["hop", "air", "step"], "A small hop off one foot onto the toe of the other and away."),
  move("move.waltz-prep", "Waltz jump preparation", [
    { t: 0, pose: p(0.84, { trunk: dir(160, 84), head: dir(0, 85), ...L_KNEE(25), thighR: dir(0, -60), shinR: dir(0, -70), upperArmL: dir(-160, -20), forearmL: dir(-170, -20), upperArmR: dir(40, -20), forearmR: dir(20, -20) }) },
    { t: 0.5, pose: p(0.8, { trunk: dir(0, 84), ...L_KNEE(40), thighR: dir(180, -60), shinR: dir(180, -65), upperArmL: dir(-130, -30), forearmL: dir(-150, -30), upperArmR: dir(130, -30), forearmR: dir(150, -30) }), ease: "inOut" },
  ], ["jump", "preparation"], "Stepping forward from backward onto the take-off edge, arms swung back."),
  move("move.landing-check", "Landing check", [
    { t: 0, pose: p(0.78, { trunk: dir(180, 82), thighR: dir(0, -50), shinR: dir(180, -70), thighL: dir(180, -50), shinL: dir(180, -55), upperArmL: dir(-60, -10), forearmL: dir(-40, -10), upperArmR: dir(60, -10), forearmR: dir(40, -10) }) },
    { t: 0.4, pose: p(0.84, { trunk: dir(180, 86), ...R_KNEE(22), thighL: dir(160, -50), shinL: dir(160, -55), footL: dir(160, -30), upperArmL: dir(-110, 10), forearmL: dir(-120, 15), upperArmR: dir(110, 10), forearmR: dir(120, 15) }), ease: "out" },
  ], ["jump", "landing"], "Down on the back outside edge, free leg stretched back, arms opening to stop the rotation."),
  move("move.edge-change", "Change of edge", [
    { t: 0, pose: p(0.84, { trunk: dir(-90, 84), ...L_KNEE(22), thighR: dir(180, -60), shinR: dir(180, -65), ...armsCheck }) },
    { t: 0.5, pose: p(0.87, { trunk: UP, ...L_KNEE(10), thighR: dir(170, -70), shinR: dir(170, -75), ...armsOpen }) },
    { t: 1.0, pose: p(0.84, { trunk: dir(90, 84), ...L_KNEE(22), thighR: dir(180, -60), shinR: dir(180, -65), upperArmL: dir(-120, -20), forearmL: dir(-150, -20), upperArmR: dir(60, -20), forearmR: dir(30, -20) }) },
  ], ["edge", "one-foot"], "Rocking over the blade from one edge to the other: a serpentine."),
  move("move.choreo-slide", "Knee slide (choreographic)", [
    { t: 0, pose: p(0.82, { ...L_KNEE(30), ...R_KNEE(30), ...armsOpen }) },
    { t: 0.5, pose: p(0.45, { trunk: dir(180, 75), head: dir(180, 70), thighL: dir(0, -80), shinL: dir(180, -3), footL: dir(180, 0), thighR: dir(0, -10), shinR: dir(180, -80), upperArmL: dir(-150, 50), forearmL: dir(-160, 60), upperArmR: dir(150, 50), forearmR: dir(160, 60) }), ease: "out" },
    { t: 1.5, pose: p(0.45, { trunk: dir(180, 70), head: dir(180, 60), thighL: dir(0, -80), shinL: dir(180, -3), footL: dir(180, 0), thighR: dir(0, -10), shinR: dir(180, -80), upperArmL: dir(-150, 60), forearmL: dir(-160, 70), upperArmR: dir(150, 60), forearmR: dir(160, 70) }) },
  ], ["choreographic", "low", "knee"], "Down onto a knee on purpose, sliding, arched back: a choreographic sequence's flourish."),
];

const ONE_SIDED = new Set(["move.three-turn", "move.mohawk", "move.choctaw", "move.bracket", "move.rocker", "move.counter", "move.loop", "move.twizzle", "move.crossover.forward", "move.crossover.back", "move.landing-check", "move.edge-change", "move.waltz-prep", "move.bunny-hop", "move.t-stop", "move.spiral.forward", "move.spiral.back", "move.spiral.y", "move.spiral.catch-foot", "move.lunge", "move.shoot-the-duck", "move.hydroblade", "move.charlotte"]);

// The turns' near-upright trunk bearings are shoulder twist (wind-up and check); the body's own
// rotation through a turn is the sim's heading. Field moves keep theirs (a lean is a lean).
const turnsTwisted = turnsLeft.map(c => trunkAsTwist(c, true));

export const LEGS: readonly Clip[] = [...freeLegLeft, ...freeLegLeft.map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other leg)`))];
export const TRANSITIONS: readonly Clip[] = [
  ...fieldLeft, ...turnsTwisted,
  ...[...fieldLeft, ...turnsTwisted].filter(c => ONE_SIDED.has(c.id)).map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other foot)`)),
];
