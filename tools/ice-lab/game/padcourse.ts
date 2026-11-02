// game/padcourse.ts — one short course per controller configuration, and the
// words a career uses for each element on the pad in the player's hands.
//
// game/tutorial.ts teaches skating: balance, edges, stops, the air. These teach
// the instrument. Each setup puts the same body under very different hands, so
// each course walks only what is distinctive about its own mapping, in the same
// order the Tutorial keeps: stability on the ice first, the air last.
//
// The rules are the Tutorial's and it runs them: every pass condition reads only
// solver state, and test/padcourse.test.ts plays every step through the setup's
// real mapping, on every feet layout it depends on. Nothing here touches the
// skater, the input or the physics.

import { MOVE } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { STEPS, EDGE_SPEED, settled, speed } from "./tutorial.ts";
import type { HowContext, TutorialStep } from "./tutorial.ts";
import { BUTTON_NAMES, PADDLE_BUTTONS, PADDLE_POSITIONS, bindingLabel, paddleLayer } from "./full-controls.ts";
import type { ControllerProfile, PaddleAction } from "./full-controls.ts";
import type { Setup } from "./setups.ts";
import type { ElementId } from "./career.ts";

/** The words' context for a setup on a controller profile. */
export function howContext(setup: Setup | null, profile: ControllerProfile): HowContext {
  const layer = setup === "experimental" || setup === "simulation" ? paddleLayer(profile, setup) : null;
  return {
    setup, push: bindingLabel(profile, "push"), three: bindingLabel(profile, "three"),
    modifier: BUTTON_NAMES[profile.modifier], feet: profile.feet ?? "dpad",
    paddle: (action: PaddleAction) => {
      const b = layer && PADDLE_BUTTONS.find(x => layer[x] === action);
      return b ? `${PADDLE_POSITIONS[b]} paddle` : null;
    },
  };
}

const exp = (c: HowContext) => c.setup === "experimental" || c.setup === "diggate";
const both = (c: HowContext) => c.setup === "simulation" || exp(c);
const from = (id: string, patch: Partial<TutorialStep> = {}): TutorialStep => ({ ...STEPS.find(x => x.id === id)!, ...patch });

// ── measured thresholds ─────────────────────────────────────────────────────

/** rad of trunk twist that is the arms swinging: X / B reach 0.57, a third of a stick about 0.2 (measured). */
export const ARMS_TWIST = 0.15;
/** Share of the load that is standing on a foot. */
const ON_FOOT = 0.9;
/** rad between the blades' tilts when one stick moves alone: 0.09 at 0.6 (measured). */
export const SPLIT_TILT = 0.05;
/** rad of each foot's toe-in that reads as toes in: the three layouts reach 0.40-0.60 (measured). */
export const TOES_IN = 0.3;
/** rad either way that reads as straight again. */
export const FEET_STRAIGHT = 0.1;
/** rad between the feet that is both turned one way: a half-second nudge reaches about 1.0 (measured). */
export const FEET_TURNED = 0.3;
/** rad of the free leg's swing that reads as a lift (freeLegMode). */
export const FREE_SWING = 0.2;

const feet = (s: SkaterState) => s.footAngle ?? [0, 0];

// ── the steps these courses add ─────────────────────────────────────────────

const armsStep: TutorialStep = {
  id: "arms", stage: "balance", title: "Your arms turn your shoulders", hold: 0.75,
  prose: "Arms carry the shoulders, and the shoulders try to carry the rest of you. Feel it gently, gliding straight: a hard twist held too long will take your feet.",
  how: c => exp(c)
    ? "Hold B: the weight goes right and the arms swing right. Let it settle, then let go."
    : c.setup === "simulation"
      ? `Hold ${c.modifier} and ease the right stick a third of the way to one side. Hold it a moment, then let both go.`
      : "Ease the right stick a third of the way to one side. Hold it a moment, then let go.",
  keys: () => "Keyboard: C opens the arms.",
  trust: "That pull is yours to spend. It is where a jump's turn starts.",
  check: s => settled(s) && Math.abs(s.twist ?? 0) >= ARMS_TWIST && speed(s) >= 0.8,
};

const weightStep: TutorialStep = {
  id: "weight", stage: "balance", title: "One foot, then the other", hold: 0.5,
  prose: "Everything in skating is decided by which foot holds you. Stand on one, feel the other go light, then cross over.",
  how: c => exp(c)
    ? "Hold X for a second: the left foot. Then hold B: the right. Each one swings the arms that way too."
    : "Press LB: the left foot, and it stays. Press RB: the right. Press both to share the weight again.",
  keys: () => "Keyboard: Q, then E.",
  trust: "Your weight goes where you send it, and it stays there.",
  check: (s, m) => {
    if (!settled(s) || speed(s) < EDGE_SPEED) return false;
    if (s.blade[0].weight >= ON_FOOT) m.sides |= 1;
    if (s.blade[1].weight >= ON_FOOT) m.sides |= 2;
    return m.sides === 3;
  },
};

const oneBladeStep: TutorialStep = {
  id: "oneblade", stage: "edges", title: "Each stick is one blade", hold: 1.5,
  prose: "You have two blades and they do not have to agree. Tip only one, and feel how little it asks of you.",
  how: () => "Move only the left stick a little past halfway, and leave the right alone: only the left blade tips. Hold it, then let go.",
  keys: () => "Keyboard: hold D alone (the arrows are the other blade).",
  trust: "Two blades, two sticks. Most of what you will ever do comes from here.",
  check: s => settled(s) && Math.abs(s.blade[0].tilt - s.blade[1].tilt) >= SPLIT_TILT,
};

function toesHow(c: HowContext): string {
  const down = exp(c) ? "X + B" : "both bumpers";
  const hold = exp(c) ? "LB" : c.modifier;
  if (c.feet === "stickY") return `Press ${down} for both feet. Your feet are on the sticks' up and down: pull both sticks down for toes in, then let them go and they straighten.`;
  if (c.feet === "modifier") return `Press ${down} for both feet. Hold ${hold} and pull the left stick down for a second: toes in. Then, still holding ${hold}, push it up until they are straight.`;
  return `Press ${down} for both feet. Hold ${hold} + D-pad ← for a second: toes in. Let go, then tap D-pad ↑: they straighten.`;
}
const feetStep: TutorialStep = {
  id: "feet", stage: "scrape", title: "Your feet turn in your hips", hold: 0.5,
  prose: "Your feet do not have to point the way you are going. Turn them in and straighten them, gently, and you have the start of every stop you will make.",
  how: toesHow,
  keys: () => "Keyboard: hold - for toes in, then \\ to straighten.",
  trust: "Toes in, toes straight. Every stop you make starts with that.",
  available: setup => setup === "simulation" || setup === "experimental" || setup === "diggate",
  check: (s, m) => {
    const [l, r] = feet(s);
    if (l <= -TOES_IN && r <= -TOES_IN) m.armed = true;
    return m.armed && !s.fallen && Math.abs(l) < FEET_STRAIGHT && Math.abs(r) < FEET_STRAIGHT;
  },
};

const strokeStep: TutorialStep = {
  id: "stroke", stage: "balance", title: "Your thumb can push too", hold: 1,
  prose: "A push can start in your hand as well as your leg. Sweep the blade's stick from the heel to the toe, and that leg drives. Clean sweeps push hardest.",
  how: () => "Press B for the right foot. Pull the right stick down, then sweep it straight up in one quick move: you push. Then the left stick, for the other foot. Two sweeps, then glide 1 s.",
  trust: "Trigger or thumb: both are the leg. Together they add.",
  check: (s, m) => {
    const stroking = s.strokeTime > 0;
    if (stroking && !m.stroking) m.pushes++;
    m.stroking = stroking;
    return m.pushes >= 2 && !stroking && settled(s) && speed(s) >= EDGE_SPEED;
  },
};

const moveStep = (id: string, title: string, move: number, prose: string, trust: string, how: TutorialStep["how"], hold = 1): TutorialStep => ({
  id, stage: "edges", title, hold, prose, trust, how,
  check: s => !s.fallen && s.move === move,
});
const spiralStep = moveStep("spiral", "A long line on one foot", MOVE.Spiral,
  "Hold your edge and reach. A spiral asks nothing but that you stay over the foot you chose.",
  "Long and quiet. Balance has a look to it.",
  c => exp(c)
    ? "On a gentle curve, hold RB + Y for a second or two. Let go to come out."
    : `On a gentle curve, hold ${c.modifier} + Y for a second or two. Let go to come out.`);
const twizzleStep = moveStep("twizzle", "Turn on the move", MOVE.Twizzle,
  "A twizzle turns you over and over while you keep travelling. The speed it spends is the speed you brought.",
  "Round and still moving. You can always go again.",
  c => exp(c) ? "On a gentle curve, hold LB + Y for a moment." : "On a gentle curve, hold X for a moment.", 0.5);
const spinStep = moveStep("spinhold", "Stay in one place, turning", MOVE.Spin,
  "A spin is your edge wound up into a point. Come in on a curve and let it tighten: speed goes in, turning comes out.",
  "All that speed, and you stayed exactly where you were.",
  () => "On a curve, hold Y and keep holding. Let go to come out.");

const paddleName = (c: HowContext, a: PaddleAction) => c.paddle?.(a) ?? "paddle";
const paddleFeet: TutorialStep = {
  id: "paddlefeet", stage: "scrape", title: "Your feet, without your thumbs", hold: 0.5,
  prose: "This is what the paddles are for. Your thumbs stay on the blades, and your feet turn underneath them.",
  how: c => `${exp(c) ? "X + B" : "Both bumpers"} for both feet. Hold the ${paddleName(c, "feetClockwise")} for half a second, D-pad ↑ to straighten; then the same with the ${paddleName(c, "feetAnticlockwise")}. Keep your thumbs where they are.`,
  trust: "Feet on your fingers, edges on your thumbs. Now a stop can do both at once.",
  check: (s, m) => {
    const [l, r] = feet(s);
    if (r - l >= FEET_TURNED) m.sides |= 1;
    if (l - r >= FEET_TURNED) m.sides |= 2;
    return m.sides === 3 && !s.fallen;
  },
};
const paddleFreeLeg: TutorialStep = {
  id: "paddleleg", stage: "edges", title: "Your free leg, at a touch", hold: 0.25,
  prose: "Stand on one foot and the other is free. Its paddle swings it straight away, with no trigger to confuse with a push.",
  how: c => `Hold B to stand on your right foot, then hold the ${paddleName(c, "freeLegLeft")} for a moment: your left leg swings forward. Let go and it rests.`,
  trust: "Your free leg is weight you can throw. It's part of every turn you make.",
  available: setup => setup === "experimental",
  check: s => settled(s) && Math.abs(s.freeSwing ?? 0) >= FREE_SWING,
};
const paddleWeight: TutorialStep = {
  ...weightStep, id: "paddleweight",
  how: c => `Press the ${paddleName(c, "weightLeft")}: the left foot. Press the ${paddleName(c, "weightRight")}: the right. Your thumbs never leave the blades.`,
  available: setup => setup === "simulation",
};

// ── the courses ─────────────────────────────────────────────────────────────

export interface PadCourse { id: string; title: string; blurb: string; setups: readonly Setup[]; steps: readonly TutorialStep[] }

export const COURSES: readonly PadCourse[] = [
  { id: "explorer", title: "Blade Explorer: one stick, one trigger", setups: ["explorer"],
    blurb: "The way in. The left stick is the whole skater, the right stick is your arms, and balance has help.",
    steps: [from("edge"), from("other"), from("push"), armsStep, from("plow"), from("turn"), from("hop")] },
  { id: "simulation", title: "Simulation: a stick per blade", setups: ["simulation"],
    blurb: "One stick per blade, one trigger per knee, the feet in the hips. Almost no help.",
    steps: [from("edge"), oneBladeStep, weightStep, from("knees"), from("push"), armsStep, feetStep, from("hop")] },
  { id: "experimental", title: "Experimental: legs on the triggers", setups: ["experimental"],
    blurb: "Triggers are legs, thumbs are blades, face buttons only ask. The physics decides.",
    steps: [weightStep, from("push"), strokeStep, from("edge"), from("knees"), from("turn"), feetStep, spiralStep, spinStep, from("hop")] },
  { id: "diggate", title: "Dig Gate: a dig on a gate", setups: ["diggate"],
    blurb: "Experimental's body, with the dig timed for you. Learn what it asks of your skating.",
    steps: [weightStep, from("push"), from("edge"), from("turn"), from("dig"), from("hop")] },
  { id: "repertoire", title: "Full Repertoire: a button for every move", setups: ["repertoire"],
    blurb: "Every turn and glide has its own button, with balance help and an optional landing coach.",
    steps: [from("edge"), from("push"), from("turn"), twizzleStep, spiralStep, spinStep, from("hop")] },
  { id: "paddles", title: "Elite paddles: the lower-body layer", setups: ["experimental", "simulation"],
    blurb: "Top paddles turn the feet. The bottom two are the free leg in Experimental, the weight in Simulation. Put the Elite on its default profile, profile LEDs off, with the feet on the D-pad or modifier layout.",
    steps: [paddleFeet, paddleFreeLeg, paddleWeight] },
];

export const courseById = (id: string) => COURSES.find(c => c.id === id);
/** A course's steps on a setup, without the ones its setup has no use for. */
export const courseSteps = (course: PadCourse, setup: Setup | null) =>
  course.steps.filter(x => !x.available || x.available(setup));

// ── the career's words for an element, on this pad ──────────────────────────

/** How to get up. In Experimental A only asks for turns, so a push is a pump or a thumb stroke. */
export function recoverHow(c: HowContext): string {
  return exp(c) ? "Snap a trigger to get up." : `Tap ${c.push} to get up.`;
}

/** What to do for a career element on this setup's pad; the same words the courses use. */
export function elementHow(id: ElementId, c: HowContext): string {
  const push = exp(c) ? "Snap LT and RT in turn to push" : `Tap ${c.push} to push`;
  const lean = both(c) ? "both sticks a little to one side" : "the left stick a little to one side";
  const one = exp(c) ? "RB + Y" : `${c.modifier} + Y`;
  switch (id) {
    case "glide": return `${push}, then stand tall and glide above 3 m/s for 3 seconds.`;
    case "edge": return `Skating above 2 m/s, hold ${lean} for 2 seconds.`;
    case "crossover": return exp(c)
      ? `On a curve (${lean}), tap A to turn backward. Then lean a little deeper with soft knees, LT and RT about halfway: the crossovers come by themselves, on the beat.`
      : `Carve with ${lean} above 2 m/s and tap ${c.push} through the curve.`;
    case "jump": return c.setup === "simulation"
      ? "With speed, squeeze LT + RT deep for a third of a second, then let go. Land on soft knees, without a fall or step-out."
      : exp(c) ? "With speed, press B for the right foot, hold RT deep for a third of a second and let go. Land without a fall or step-out."
      : "With speed, squeeze RT deep for a third of a second, then let go. Land without a fall or step-out.";
    case "spin": return `Carve with ${lean} at speed, then hold Y for a new full rotation. Let go to come out.`;
    case "step": return exp(c)
      ? "Chain five different steps, on both feet, inside 12 seconds. A asks for a turn; LB + A a bracket; LB + Y a twizzle."
      : "Chain five different steps, on both feet, inside 12 seconds: turns, twizzles, crossovers, changes of edge.";
    case "spiral": return `Carve on one foot, then hold ${one}. Hold it for 2 seconds.`;
    case "combo": return "Land a jump clean, stay on that back outside edge, and load again straight away: no push, turn or foot change between.";
    case "pose": return exp(c)
      ? "Gliding above 2 m/s, hold RB + A for 2 seconds."
      : `Gliding above 2 m/s, hold ${c.modifier} + A for 2 seconds.`;
  }
}
