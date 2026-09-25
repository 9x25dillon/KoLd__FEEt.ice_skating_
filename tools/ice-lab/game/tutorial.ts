// game/tutorial.ts — the Tutorial: balance, then edges, then scrape and dig,
// then the air (the operator, 2026-09-23: "every thing you learn about moving
// across such a pristine beautiful perfect surface goes directly into your
// faith in the intuition of your inner ears ability to keep you upright...
// drill into the player how to stay stable and keep stable with your learned
// control on the ice and then your directed to release it into the air").
//
// Like practice.ts, every pass condition reads ONLY solver state: the tutorial
// never touches the skater, the input or the physics — it watches what the
// blades did. Stability first: every step is a condition HELD for a time, and a
// fall wipes the current step's progress and asks the skater to stand still a
// moment (SETTLE_S) before it counts again — the re-drill.
//
// Each step's numbers were measured on the solver with a scripted pad, the
// way the test suite plays (test/tutorial.test.ts pins them per setup).

import { MOVE, REGIME } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Setup } from "./setups.ts";
import type { FeetLayout } from "./full-controls.ts";
import { Ghost, TRICKS } from "./ghost.ts";

export const STAGES = [
  { id: "balance", name: "Balance", line: "Everything starts with standing still on something that moves." },
  { id: "edges", name: "Edges", line: "The blade is a curve. Lean, and the ice answers." },
  { id: "scrape", name: "Scrape & dig", line: "Control is knowing how to spend your speed." },
  { id: "air", name: "Air", line: "You trust the ice now. Let go of it." },
] as const;
export type StageId = typeof STAGES[number]["id"];

/** What the words for a setup's controls need: the setup, and the profile's own labels. */
export interface HowContext {
  setup: Setup | null;
  /** bindingLabel(profile, "push"), e.g. "A / Cross". */
  push: string;
  /** bindingLabel(profile, "three"), e.g. "B / Circle". */
  three: string;
  /** The profile's modifier button, e.g. "L3". */
  modifier: string;
  /** Where the feet live on the pad (Simulation's profile; Experimental reads it too). */
  feet: FeetLayout;
}

/** A step's own memory; wiped when the step starts and after a fall. */
export interface StepMemory {
  pushes: number;
  stroking: boolean;
  armed: boolean;
  scraped: boolean;
  /** N m s the current scrape has wound the body (SkaterState.digL, summed). */
  wind: number;
  /** s since a blade last scraped. */
  quiet: number;
  wound: boolean;
  /** s.landed.tick when the step (re)started: a landing after it is this step's. */
  landedBase: number | null;
  landed: boolean;
}
const freshMemory = (): StepMemory => ({ pushes: 0, stroking: false, armed: false, scraped: false, wind: 0, quiet: 0, wound: false, landedBase: null, landed: false });

export interface TutorialStep {
  id: string;
  stage: StageId;
  title: string;
  /** One line in the operator's spirit: trust, stability, the ice. */
  prose: string;
  /** What to do, on this setup's pad. */
  how: (c: HowContext) => string;
  /** What to do on the keyboard, where it is simple enough to say. */
  keys?: (c: HowContext) => string;
  /** s the condition must hold without a break. */
  hold: number;
  /** A game/ghost.ts trick that shows it, by id. */
  ghost?: string;
  /** Said on passing. */
  trust: string;
  /** Whether this setup's physics can do it at all (absent: every setup). */
  available?: (setup: Setup | null) => boolean;
  /** True while the step's condition holds this tick. Reads only solver state. */
  check: (s: SkaterState, m: StepMemory, t: Tutorial, dt: number) => boolean;
}

// ── measured thresholds ─────────────────────────────────────────────────────

/** rad: standing tall. A straight glide sits at 0.000 (measured, both setups). */
export const TALL_LEAN = 0.1;
/** s a skater must stand steady after getting up before a step counts again. */
export const SETTLE_S = 1.5;
/** rad of lean that is an edge: a curve on sticks at 0.5 holds 0.20 (measured). */
export const EDGE_LEAN = 0.12;
/** rad/s of turning that proves the edge is carving: sticks at 0.5 turn 0.50. */
export const EDGE_YAW = 0.2;
/** m/s an edge or a turn needs to count. */
export const EDGE_SPEED = 1.5;
/** 0..1 knee bend that is soft knees: triggers at 0.55 reach 0.53 (measured); the keyboard's resting knee is 0.35. */
export const SOFT_KNEE = 0.3;
/** Pushes the push step asks for. */
export const PUSHES = 3;
/** m/s a stop must start from, and come under. */
export const STOP_FROM = 2.5, STOP_UNDER = 1;
/** N m s of winding one scrape must give to be a dig. A pad dig backward winds 1.1–1.6 (measured); a snowplow 0.00. */
export const DIG_WIND = 0.5;
/** s without a scrape that ends one. */
export const SCRAPE_GAP = 0.3;
/** Revolutions a turning jump must turn. */
export const AIR_TURN = 0.5;

const speed = (s: SkaterState) => Math.hypot(s.vel.x, s.vel.y);
const backward = (s: SkaterState) => s.vel.x * s.heading.x + s.vel.y * s.heading.y < -0.5;
const onIce = (s: SkaterState) => !s.fallen && s.jump.phase !== JUMP_PHASE.Air;
const settled = (s: SkaterState) => !s.fallen && s.jump.phase === JUMP_PHASE.None && s.move === MOVE.None;
const skidding = (s: SkaterState) => s.blade.some(b => b.inContact && b.regime === REGIME.Skid);
/** Setups whose stops come from the feet: the pad has no brake there, so a brake is not a scrape. */
const feetSetup = (setup: Setup | null) => setup === "simulation" || setup === "experimental" || setup === "diggate";
const exp = (c: HowContext) => c.setup === "experimental" || c.setup === "diggate";
/** The setups with the fore-aft pendulum (pitchMode), the only ones whose blades can dig (SkaterState.digL). */
const canDig = (setup: Setup | null) => feetSetup(setup);

/** How to toe both feet in, by setup and feet layout. */
function toesIn(c: HowContext): string {
  const hold = exp(c) ? "LB" : c.modifier;
  if (c.feet === "stickY") return "pull both sticks down (toes in) and keep them there";
  if (c.feet === "modifier") return `hold ${hold} and pull the left stick down for a second (toes in)`;
  return `hold ${hold} + D-pad ← for a second (toes in)`;
}
function turnFeet(c: HowContext): string {
  if (c.feet === "stickY") return "push one stick up and the other down, toward your lean, for half a second";
  if (c.feet === "modifier") return `hold ${exp(c) ? "LB" : c.modifier} and push the left stick toward your lean for half a second`;
  return "hold the D-pad toward your lean (→ if the sticks lean right) for half a second";
}
const straighten = (c: HowContext) => c.feet === "dpad" ? " D-pad ↑ straightens the feet after." : "";

export const STEPS: readonly TutorialStep[] = [
  // ── Balance ──
  {
    id: "glide", stage: "balance", title: "Stand tall, let it carry you", hold: 4,
    prose: "Perfect ice, and you on two thin blades. Don't fight it. Stand tall, go quiet, and let the glide carry you — your inner ear already knows how.",
    how: () => "Let go of the sticks and triggers. Glide upright for 4 seconds.",
    keys: () => "Keyboard: hands off.",
    trust: "That stillness is yours. Keep it with you.",
    // MEASURED: from the game's 4.5 m/s, hands off, lean 0.000 and 3.71 m/s at 5 s.
    check: s => settled(s) && Math.abs(s.lean) < TALL_LEAN && speed(s) >= 0.8,
  },
  {
    id: "push", stage: "balance", title: "Push, then be still again", hold: 2, ghost: "strokes",
    prose: "Speed is only worth what your balance can carry. Push — and between pushes, come back to that same quiet glide.",
    how: c => exp(c)
      ? "B puts you on the right foot. Snap LT, then RT, then LT — pull and let go quickly; each snap pushes from the leg you stand on and the weight goes across. Three pushes, then X + B — both feet under you — and glide 2 s."
      : `Tap ${c.push} three times: each push comes from the leg you stand on, then the weight goes across. Then glide 2 s without pushing.`,
    keys: () => "Keyboard: Space pushes.",
    trust: "Push and settle, push and settle. That rhythm is your balance.",
    check: (s, m) => {
      const stroking = s.strokeTime > 0;
      if (stroking && !m.stroking) m.pushes++;
      m.stroking = stroking;
      return m.pushes >= PUSHES && !stroking && settled(s) && Math.abs(s.lean) < TALL_LEAN && speed(s) >= EDGE_SPEED;
    },
  },
  {
    id: "knees", stage: "balance", title: "Soft knees", hold: 3,
    prose: "Straight legs are brittle. Bend a little and the ice's small bumps disappear into you. Low and soft is where balance lives.",
    how: c => c.setup === "simulation"
      ? "Squeeze LT and RT about halfway — one trigger per knee — and hold them 3 s. Much deeper loads a jump."
      : exp(c) ? "X + B together puts both feet down. Then squeeze LT and RT about halfway, slowly, and hold them 3 s — a quick snap is a push, a deep squeeze loads a jump."
      : "Squeeze RT about halfway and hold it 3 s. Much deeper loads a jump.",
    keys: () => "Keyboard: your knees already rest soft — just glide.",
    trust: "Soft knees, quiet head. You'll come back to this all the time.",
    check: s => settled(s) && s.knee >= SOFT_KNEE && Math.abs(s.lean) < TALL_LEAN && speed(s) >= 0.8,
  },
  // ── Edges ──
  {
    id: "edge", stage: "edges", title: "Lean into a curve", hold: 3,
    prose: "Tip the blades and the ice turns you. Don't steer — lean, trust the edge to hold, and ride the curve it draws.",
    how: c => c.setup === "simulation" || exp(c)
      ? "Push both sticks a little to one side, together, and hold them: both blades tip onto their edges and you curve. Hold it 3 s, clean, no skid. Push first if you have slowed."
      : "Push the left stick a little to one side and hold it 3 s. Push first if you have slowed.",
    keys: c => c.setup === "simulation" || exp(c) ? "Keyboard: hold D and → together (or A and ←)." : "Keyboard: hold D (or A).",
    trust: "The edge held you. It will again.",
    check: (s, _m, t) => {
      const on = settled(s) && Math.abs(s.lean) >= EDGE_LEAN && Math.abs(s.yawRate) >= EDGE_YAW && speed(s) >= EDGE_SPEED && !skidding(s);
      if (on) t.side = Math.sign(s.lean);
      return on;
    },
  },
  {
    id: "other", stage: "edges", title: "Now the other edge", hold: 3,
    prose: "Balance is symmetric, even if you aren't. Find the same trust leaning the other way.",
    how: c => c.setup === "simulation" || exp(c) ? "Now both sticks the other way. Hold that curve 3 s." : "Now the stick the other way. Hold that curve 3 s.",
    keys: c => c.setup === "simulation" || exp(c) ? "Keyboard: the other pair — A and ← (or D and →)." : "Keyboard: the other key.",
    trust: "Both edges. The ice is the same on either side of you.",
    check: (s, _m, t) => settled(s) && Math.abs(s.lean) >= EDGE_LEAN && Math.sign(s.lean) === -(t.side || 1)
      && Math.abs(s.yawRate) >= EDGE_YAW && speed(s) >= EDGE_SPEED && !skidding(s),
  },
  {
    id: "turn", stage: "edges", title: "Turn around", hold: 2,
    prose: "A three-turn spins you to face where you've been, and you keep travelling. Stay over the blade and let the turn happen under you.",
    how: c => exp(c)
      ? "On a curve (both sticks a little to one side), tap A: a three-turn. Then ease the sticks back and glide backward 2 s."
      : `On a curve${c.setup === "simulation" ? " (both sticks a little to one side)" : ""}, tap ${c.three}: a three-turn. Then ease back and glide backward 2 s.`,
    keys: () => "Keyboard: on a curve, tap B.",
    trust: "Backward, and still upright. The ice doesn't care which way you face.",
    // MEASURED (both setups): from 4.5 m/s, sticks 0.5, the turn tapped at 2 s: backward at 2.30 s, 3.26 m/s.
    check: s => settled(s) && backward(s) && speed(s) >= 1,
  },
  // ── Scrape & dig ──
  {
    id: "plow", stage: "scrape", title: "Snowplow to a stop", hold: 1.5, ghost: "snowplow",
    prose: "Stopping is balance too. Turn your toes in, press the inside edges, and let the scrape take your speed — gently, and you stay over your feet.",
    how: c => c.setup === "simulation"
      ? `Skating forward faster than 2.5 m/s: both bumpers (both feet), ${toesIn(c)}, then ease both sticks apart — the inside edges scrape. Stay up once you're under 1 m/s for 1.5 s.${straighten(c)}`
      : exp(c) ? `Skating forward faster than 2.5 m/s: X + B (both feet), ${toesIn(c)}, then ease both sticks apart — the inside edges scrape. Stay up once you're under 1 m/s for 1.5 s.${straighten(c)}`
      : "Skating faster than 2.5 m/s, hold LT to brake. Stay up once you're under 1 m/s for 1.5 s.",
    keys: c => feetSetup(c.setup) ? "Keyboard: Q + E, hold - a second (toes in), then hold A and →." : "Keyboard: hold X.",
    trust: "You can stop. That's what makes speed safe.",
    check: (s, m, t) => {
      if (speed(s) >= STOP_FROM) m.armed = true;
      if (m.armed && (skidding(s) || (!feetSetup(t.setup) && s.blade.some(b => b.regime === REGIME.Brake)))) m.scraped = true;
      return m.armed && m.scraped && onIce(s) && s.jump.phase === JUMP_PHASE.None && speed(s) < STOP_UNDER;
    },
  },
  {
    id: "dig", stage: "scrape", title: "Dig", hold: 1, ghost: "dig",
    prose: "A dig is a scrape with intent: lean onto the toe first, then turn the feet across, and the ice winds you up. Lean early — the body follows the contact, not the stick.",
    how: c => c.setup === "diggate"
      ? "Skating backward on a gentle curve (both sticks a little to one side), hold LB + RB: the gate leans you onto the toe, turns the feet across and eases you back out. Stay up 1 s after."
      : `Skating backward on a gentle curve (both sticks a little to one side), push both sticks half forward — onto the toes — and hold. After a breath, ${turnFeet(c)}: the feet turn across and the blades dig. Stay up 1 s.${straighten(c)}`,
    keys: () => "Keyboard: backward on a curve, W for the toes, then ] or [ for half a second; \\ straightens.",
    trust: "You felt the ice wind you. That's where rotation comes from.",
    available: canDig,
    check: (s, m, _t, dt) => {
      if (skidding(s)) { m.wind += s.digL ?? 0; m.quiet = 0; }
      else if ((m.quiet += dt) > SCRAPE_GAP && !m.wound) m.wind = 0;
      if (Math.abs(m.wind) >= DIG_WIND) m.wound = true;
      return m.wound && onIce(s);
    },
  },
  // ── Air ──
  {
    id: "hop", stage: "air", title: "First flight", hold: 2,
    prose: "Everything you've trusted on the ice comes with you into the air. Bend, let the legs straighten, and come back down onto the same quiet glide.",
    how: c => c.setup === "simulation"
      ? "Squeeze LT + RT deep for about a third of a second, then let go: the legs straighten and you leave the ice. Land on soft knees and glide 2 s."
      : exp(c) ? "B puts you on the right foot. Hold RT deep for about a third of a second and let go: the standing leg drives you up. Land and glide 2 s."
      : "Squeeze RT deep for about a third of a second, then let go. Land and glide 2 s.",
    keys: () => "Keyboard: hold Shift a third of a second, let go.",
    trust: "Up, and back to the ice — and it was still there for you.",
    check: (s, m) => landedClean(s, m, 0),
  },
  {
    id: "spin", stage: "air", title: "Turn in the air", hold: 2, ghost: "loop",
    prose: "Rotation is balance you carry off the ice. Open the arms, let them take you round as you leave, and trust your landing edge to catch you.",
    how: c => c.setup === "simulation"
      ? `Hold ${c.modifier} and push the right stick most of the way right (the arms open), squeeze LT + RT a third of a second, let the triggers go and ease the stick to halfway: half a turn or more. Squeeze the triggers a little again in the air for soft knees, and once you've landed bring the arms in slowly — a snap twists you off your feet. Glide 2 s.`
      : exp(c) ? "Hold B (right foot, arms swing right) and RT together for a quick quarter-second, then let both go: the arms whip you round, twice or more. Squeeze RT a little in the air for soft knees to land. Glide 2 s."
      : "Open the arms (right stick) as you load RT, let go of both: half a turn or more. Land clean and glide 2 s.",
    trust: "You left the ice turning and came back to it standing. It's yours now.",
    check: (s, m) => landedClean(s, m, AIR_TURN),
  },
];

/** A landing after the step began, clean — no fall, no step-out — and turned at least `turn` revolutions; then back on the ice. */
function landedClean(s: SkaterState, m: StepMemory, turn: number): boolean {
  if (m.landedBase === null) m.landedBase = s.landed.tick;
  if (s.landed.tick !== m.landedBase) {
    const L = s.landed;
    m.landedBase = L.tick;
    m.landed = !L.fall && !L.stepOut && Math.abs(L.turned) >= turn;
  }
  return m.landed && settled(s);
}

export class Tutorial {
  readonly setup: Setup | null;
  /** STEPS index of the current step; STEPS.length when done. */
  index = 0;
  /** s the current step's condition has held. */
  progress = 0;
  /** s of steady standing still owed after a fall. */
  settle = 0;
  falls = 0;
  /** The side of the first edge (sign of the lean), for the second. */
  side = 0;
  /** The last trust message, and how long it stays up. */
  message = "";
  toast = 0;
  /** Steps skipped by hand or because this setup cannot do them. */
  skipped: string[] = [];
  memory: StepMemory = freshMemory();
  private wasFallen = false;

  constructor(setup: Setup | null, start = 0) {
    this.setup = setup;
    this.index = start;
    this.skipUnavailable();
  }
  get done() { return this.index >= STEPS.length; }
  get step(): TutorialStep | null { return STEPS[this.index] ?? null; }
  get stage() { return this.step ? STAGES.findIndex(g => g.id === this.step!.stage) : STAGES.length; }
  /** 0..1 through the current step's hold. */
  get fraction() { return this.step ? Math.min(1, this.progress / this.step.hold) : 1; }

  /** Watch one solver tick. Never writes to `s`. */
  sample(s: SkaterState, dt: number): void {
    this.toast = Math.max(0, this.toast - dt);
    const step = this.step;
    if (!step) return;
    if (s.fallen) {
      if (!this.wasFallen) {
        this.falls++;
        this.progress = 0; this.memory = freshMemory(); this.settle = SETTLE_S;
      }
      this.wasFallen = true;
      return;
    }
    this.wasFallen = false;
    // The re-drill: back up, stand still and steady before anything counts.
    if (this.settle > 0) {
      // (Snapped to zero within a microsecond: 1.5 s of 1/120 s ticks does not sum to exactly 1.5.)
      if (settled(s) && Math.abs(s.lean) < TALL_LEAN * 1.5) this.settle = this.settle - dt < 1e-6 ? 0 : this.settle - dt;
      else this.settle = SETTLE_S;
      return;
    }
    if (step.check(s, this.memory, this, dt)) this.progress += dt;
    else this.progress = 0;
    if (this.progress >= step.hold) this.pass();
  }

  /** Move on without passing (the player's choice). */
  skip(): void {
    if (!this.step) return;
    this.skipped.push(this.step.id);
    this.advance();
  }

  private pass(): void {
    this.message = this.step!.trust; this.toast = 3.5;
    this.advance();
  }

  private advance(): void {
    this.index++; this.progress = 0; this.settle = 0; this.memory = freshMemory();
    this.skipUnavailable();
  }

  private skipUnavailable(): void {
    while (this.step?.available && !this.step.available(this.setup)) { this.skipped.push(this.step.id); this.index++; }
  }

  /** The status line: re-drilling, or how far through the hold. */
  get status(): string {
    if (!this.step) return "Tutorial complete";
    if (this.wasFallen) return "Down is part of it. Get up when you're ready.";
    if (this.settle > 0) return `Back on your feet. Stand still a moment — ${this.settle.toFixed(1)} s — and let your balance come back.`;
    return `${(Math.min(this.progress, this.step.hold)).toFixed(1)} / ${this.step.hold} s${this.falls ? ` · ${this.falls} fall${this.falls > 1 ? "s" : ""}` : ""}`;
  }
}

/**
 * The tutorial's ghost, in one place: the current step's trick (game/ghost.ts,
 * its API as it is — `new Ghost(player, index)` and `ghost.trick.id`), or none.
 * The ghost moves on to its next trick by itself after a trick and its linger;
 * when it does, this puts the step's trick back beside the player, so a step
 * shows its one trick on a loop. Returns the ghost to keep.
 */
export function tutorialGhost(step: TutorialStep | null, ghost: Ghost | null, player: SkaterState, on: boolean): Ghost | null {
  const id = on ? step?.ghost : undefined;
  if (!id) return null;
  if (ghost && ghost.trick.id === id) return ghost;
  const index = TRICKS.findIndex(t => t.id === id);
  return index < 0 ? null : new Ghost(player, index);
}
