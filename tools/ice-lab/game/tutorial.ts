// game/tutorial.ts — the Tutorial: balance, then edges, then travel, then
// scrape and dig, then the air (the operator, 2026-09-23: "every thing you learn about moving
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
//
// Travel (the owner, 2026-11-05: "teaches the player to navigate and travel"):
// a step may place targets on the ice when it begins — a marker to reach, a cone
// to round, checkpoints to pass — from where the skater is, inside the boards.
// Clients draw them (Tutorial.targets); the pass conditions still read only the
// solver's state, now measured against those places.

import { MOVE, REGIME } from "../sim/types.ts";
import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Setup } from "./setups.ts";
import { RINK } from "./rink.ts";
import type { FeetLayout, PaddleAction } from "./full-controls.ts";
import { Ghost, TRICKS } from "./ghost.ts";

export const STAGES = [
  { id: "balance", name: "Balance", line: "Everything starts with standing still on something that moves." },
  { id: "edges", name: "Edges", line: "The blade is a curve. Lean, and the ice answers." },
  { id: "travel", name: "Travel", line: "Where you look is where you go. Lean early, arrive upright." },
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
  /** Where an Elite paddle action lives ("top-right paddle"), for game/padcourse.ts; absent where none does. */
  paddle?: (action: PaddleAction) => string | null;
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
  /** game/padcourse.ts: which of a step's two sides have been seen, as bits. */
  sides: number;
  /** Travel: how many of the step's targets have been passed, in order. */
  reached: number;
  /** Travel: rad the skater has gone round the step's cone, and the bearing last seen from it. */
  swept: number;
  bearing: number | null;
}
const freshMemory = (): StepMemory => ({ pushes: 0, stroking: false, armed: false, scraped: false, wind: 0, quiet: 0, wound: false, landedBase: null, landed: false, sides: 0, reached: 0, swept: 0, bearing: null });

/** A place on the ice a step asks for: a marker to reach, a cone to round, a checkpoint to pass; r in metres. */
export interface TutorialTarget { x: number; y: number; r: number; kind: "marker" | "cone" | "checkpoint" }

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
  /** Travel: the targets this step puts on the ice, placed once as it begins, from where the skater is. */
  place?: (s: SkaterState, t: Tutorial) => TutorialTarget[];
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

export const speed = (s: SkaterState) => Math.hypot(s.vel.x, s.vel.y);
const backward = (s: SkaterState) => s.vel.x * s.heading.x + s.vel.y * s.heading.y < -0.5;
const onIce = (s: SkaterState) => !s.fallen && s.jump.phase !== JUMP_PHASE.Air;
export const settled = (s: SkaterState) => !s.fallen && s.jump.phase === JUMP_PHASE.None && s.move === MOVE.None;
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

// ── travel ──────────────────────────────────────────────────────────────────

/** AUTHORED: m ahead a marker goes, and m to the middle's side; the reach is the ring a client draws. */
export const MARKER_AHEAD = 12, MARKER_ASIDE = 5, MARKER_REACH = 1.8;
/** AUTHORED: m to the side a cone goes, and how far round it (rad) counts as rounding it. MEASURED: sticks at 0.5 curve about 7 m round at 3.7 m/s. */
export const CONE_ASIDE = 6, CONE_SWEEP = 1.5 * Math.PI, CONE_LEASH = 12;
/** AUTHORED: the far marker's reach, and the least distance across it is placed. */
export const FAR_REACH = 2.5, FAR_LEAST = 20;
/** AUTHORED: a checkpoint's reach, and m from the boards that is touching them. */
export const CHECKPOINT_REACH = 4, TOUCH_BOARDS = 0.6;
/** AUTHORED: how close to the mark a stop must end. */
export const SPOT_REACH = 2;
const CENTRE = { x: (RINK.minX + RINK.maxX) / 2, y: (RINK.minY + RINK.maxY) / 2 };
/** The half lap's checkpoints, anticlockwise round the sheet, 12 m in from each end's boards. */
export const CHECKPOINTS = [{ x: 16, y: CENTRE.y - 16 }, { x: 16, y: CENTRE.y + 16 }, { x: -16, y: CENTRE.y + 16 }, { x: -16, y: CENTRE.y - 16 }];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** m inside game/rink.ts's boards (negative: past them): its rounded rectangle as a distance field. */
export function insideBoards(x: number, y: number): number {
  const { minX, maxX, minY, maxY, corner } = RINK;
  const x0 = minX + corner, x1 = maxX - corner, y0 = minY + corner, y1 = maxY - corner;
  const d = Math.hypot(x - clamp(x, x0, x1), y - clamp(y, y0, y1));
  return d > 0 ? corner - d : corner + Math.min(x - x0, x1 - x, y - y0, y1 - y);
}
/** The point, pulled in toward the middle until it is `margin` m inside the boards. */
export function insideBy(x: number, y: number, margin: number): { x: number; y: number } {
  if (insideBoards(x, y) >= margin) return { x, y };
  const { minX, maxX, minY, maxY, corner } = RINK;
  const x0 = minX + corner, x1 = maxX - corner, y0 = minY + corner, y1 = maxY - corner, r = corner - margin;
  if (r < 0) return { x: clamp(x, x0 - r, x1 + r), y: clamp(y, y0 - r, y1 + r) };
  const cx = clamp(x, x0, x1), cy = clamp(y, y0, y1), d = Math.hypot(x - cx, y - cy);
  return { x: cx + (x - cx) / d * r, y: cy + (y - cy) / d * r };
}
/** Which way the skater is going: along the velocity when moving, else facing. */
function along(s: SkaterState): { x: number; y: number } {
  const v = speed(s);
  return v > 0.5 ? { x: s.vel.x / v, y: s.vel.y / v } : { x: s.heading.x, y: s.heading.y };
}
/** +1 if the middle of the sheet is to the left of the way the skater is going, else -1. */
function middleSide(s: SkaterState, d: { x: number; y: number }): number {
  return d.x * (CENTRE.y - s.pos.y) - d.y * (CENTRE.x - s.pos.x) >= 0 ? 1 : -1;
}
const near = (s: SkaterState, t: TutorialTarget | undefined) => !!t && Math.hypot(s.pos.x - t.x, s.pos.y - t.y) <= t.r;
/** A marker ahead and to the middle's side, at least 7 m off (else past the middle). */
function ahead(s: SkaterState, forward: number, aside: number, margin: number): { x: number; y: number } {
  const d = along(s), side = middleSide(s, d);
  let p = insideBy(s.pos.x + d.x * forward - d.y * aside * side, s.pos.y + d.y * forward + d.x * aside * side, margin);
  if (Math.hypot(p.x - s.pos.x, p.y - s.pos.y) < 7) p = insideBy(2 * CENTRE.x - s.pos.x, 2 * CENTRE.y - s.pos.y, margin);
  return p;
}
const twoSticks = (c: HowContext) => c.setup === "simulation" || exp(c);
const pushWords = (c: HowContext) => exp(c) ? "snap LT, then RT, to push" : `tap ${c.push} to push`;
const Push = (c: HowContext) => { const w = pushWords(c); return w[0].toUpperCase() + w.slice(1); };
// MEASURED (both two-stick setups and Explorer): a stick pushed right, or D, curves the skater anticlockwise,
// to her own left. The words name no side: the client points at the target, and the edge steps have taught
// which way a side curves.
const steerWords = (c: HowContext) => twoSticks(c) ? "both sticks a little to one side" : "the left stick a little to one side";
const steerKeys = (c: HowContext) => twoSticks(c) ? "Keyboard: D and → together curve one way, A and ← the other; Space pushes." : "Keyboard: D or A curves; Space pushes.";

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
  // ── Travel ──
  {
    id: "marker", stage: "travel", title: "Go where you look", hold: 0.25,
    prose: "A marker glows on the ice. Look at it, lean toward it early and gently, and let the edge carry you round to it. Arriving upright is the whole trick of getting anywhere.",
    how: c => `Skating forward (a three-turn brings you round if you're going backward): ${steerWords(c)}, the side that curves you toward the marker; centre ${twoSticks(c) ? "them" : "it"} to straighten, and ${pushWords(c)} if you slow. Arrive inside the ring.`,
    keys: steerKeys,
    trust: "You went where you meant to. That's skating.",
    place: s => [{ ...ahead(s, MARKER_AHEAD, MARKER_ASIDE, 5), r: MARKER_REACH, kind: "marker" }],
    check: (s, _m, t) => settled(s) && near(s, t.targets[0]),
  },
  {
    id: "cone", stage: "travel", title: "Round the cone", hold: 0.25,
    prose: "To come back you don't stop and turn round: you keep the curve. Hold one edge round the cone, and the ice brings you home.",
    how: c => `Hold ${steerWords(c)}, the side whose curve keeps the cone inside it, and go round it three quarters of the way, upright. ${Push(c)} across the curve if you slow down.`,
    keys: c => twoSticks(c) ? "Keyboard: hold D and → (or A and ←), whichever keeps the cone inside your curve; Space pushes." : "Keyboard: hold D (or A), whichever keeps the cone inside your curve; Space pushes.",
    trust: "One edge took you round. Direction is only a lean held long enough.",
    // The cone 6 m to the middle's side, 9 m in from the boards: a 7 m curve round it stays on the ice.
    place: s => { const d = along(s), side = middleSide(s, d); return [{ ...insideBy(s.pos.x - d.y * CONE_ASIDE * side, s.pos.y + d.x * CONE_ASIDE * side, 9), r: 0.4, kind: "cone" }]; },
    check: (s, m, t) => {
      const c = t.targets[0];
      if (!c) return false;
      const dx = s.pos.x - c.x, dy = s.pos.y - c.y;
      // Wandered off: start the circle again.
      if (Math.hypot(dx, dy) > CONE_LEASH) { m.swept = 0; m.bearing = null; return false; }
      const b = Math.atan2(dy, dx);
      if (m.bearing !== null) m.swept += wrap(b - m.bearing);
      m.bearing = b;
      return Math.abs(m.swept) >= CONE_SWEEP && settled(s);
    },
  },
  {
    id: "cross", stage: "travel", title: "Across the ice", hold: 0.25,
    prose: "The sheet is yours. Build speed with a few pushes, find the far marker, and carry your balance all the way there.",
    how: c => `${Push(c)} a few times, then steer for the far marker (${steerWords(c)}, then centred) and reach it upright.`,
    keys: steerKeys,
    trust: "Across the ice and still upright. Distance is only balance, kept.",
    // Across the middle from where the skater is; from near the middle, straight on.
    place: s => {
      let p = insideBy(2 * CENTRE.x - s.pos.x, 2 * CENTRE.y - s.pos.y, 6);
      if (Math.hypot(p.x - s.pos.x, p.y - s.pos.y) < FAR_LEAST) { const d = along(s); p = insideBy(s.pos.x + d.x * 22, s.pos.y + d.y * 22, 6); }
      return [{ ...p, r: FAR_REACH, kind: "marker" }];
    },
    check: (s, _m, t) => settled(s) && near(s, t.targets[0]),
  },
  {
    id: "lap", stage: "travel", title: "Half a lap", hold: 0.25,
    prose: "Skaters travel round the rink, not across it: down the side, round the end, along the next. Keep a few metres off the boards and carry your speed through the curve.",
    how: c => `Skate through the two glowing checkpoints in turn, round the end of the rink: ${pushWords(c)} on the straight, and hold ${steerWords(c)} through the corner. Touching the boards starts it again.`,
    keys: steerKeys,
    trust: "Round the end and down the side. You can go anywhere on this ice now.",
    // The next two checkpoints the way the skater is already going round the sheet (anticlockwise when still).
    place: s => {
      const d = along(s), turning = (s.pos.x - CENTRE.x) * d.y - (s.pos.y - CENTRE.y) * d.x >= 0 || speed(s) <= 0.5 ? 1 : -1;
      const at = Math.atan2(s.pos.y - CENTRE.y, s.pos.x - CENTRE.x);
      const ahead = CHECKPOINTS.map((c, i) => ({ i, a: ((Math.atan2(c.y - CENTRE.y, c.x - CENTRE.x) - at) * turning % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) }))
        .filter(c => c.a > 0.35).sort((a, b) => a.a - b.a);
      const first = ahead[0].i, second = (first + turning + 4) % 4;
      return [first, second].map(i => ({ ...CHECKPOINTS[i], r: CHECKPOINT_REACH, kind: "checkpoint" as const }));
    },
    check: (s, m, t) => {
      if (insideBoards(s.pos.x, s.pos.y) < TOUCH_BOARDS) { m.reached = 0; return false; }
      if (near(s, t.targets[m.reached])) m.reached++;
      return m.reached >= t.targets.length && settled(s);
    },
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
    id: "spot", stage: "scrape", title: "Stop on the mark", hold: 1,
    prose: "Going somewhere means arriving. Build a little speed and stop with your blades on the mark: not short of it, not past it.",
    how: c => feetSetup(c.setup)
      ? `Skate at the mark faster than 2.5 m/s, then snowplow as you just did (${c.setup === "simulation" ? "both bumpers" : "X + B"}, toes in, sticks eased apart) so you stop inside the ring. Stay still 1 s.`
      : "Skate at the mark faster than 2.5 m/s, then hold LT to brake so you stop inside the ring. Stay still 1 s.",
    keys: c => feetSetup(c.setup) ? "Keyboard: Space pushes; Q + E, hold - a second, then A and → to plow." : "Keyboard: Space pushes; hold X to brake.",
    trust: "Right where you meant to stop. That's control.",
    place: s => [{ ...ahead(s, MARKER_AHEAD, 0, 5), r: SPOT_REACH, kind: "marker" }],
    check: (s, m, t) => {
      if (speed(s) >= STOP_FROM) m.armed = true;
      return m.armed && onIce(s) && s.jump.phase === JUMP_PHASE.None && speed(s) < STOP_UNDER && near(s, t.targets[0]);
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
    prose: "Rotation is balance you carry off the ice, and the ice only gives it to an edge that holds. Take off from a curve, let the arms pull against that edge, and trust your landing to catch you.",
    // MEASURED 2026-11-01, armsWhipMode on: from a straight glide the arms give nothing (best 0.06 rev), so a
    // turning jump starts on an edge. Simulation holds from 3 to 5.5 m/s; Experimental only near 4.5 m/s at full
    // lean (3 of 1,080 tried); Blade Explorer's best clean landing was 0.03 rev in 4,320 tried.
    how: c => c.setup === "simulation"
      ? `On a curve, both sticks halfway to one side. Hold ${c.modifier} and push the right stick halfway the same way (the arms), and squeeze LT + RT deep for a third of a second. Let everything go, then squeeze the triggers about halfway for soft knees. Land and glide 2 s.`
      : exp(c) ? "The narrowest step here. At about your starting speed, press B for the right foot and hold both sticks all the way to one side. Hold B + RT for a third of a second, then let go of everything and squeeze RT well past halfway for soft knees. Land and glide 2 s."
      : "On a curve, push the right stick the way you are leaning as you load RT, then let go of both: half a turn or more. Land clean and glide 2 s.",
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
  /** The course: this tutorial's own, unless game/padcourse.ts hands it another. */
  readonly steps: readonly TutorialStep[];
  /** steps index of the current step; steps.length when done. */
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
  /** Travel: what the current step put on the ice (TutorialStep.place); empty for the others. */
  targets: TutorialTarget[] = [];
  private placed = false;
  private wasFallen = false;

  constructor(setup: Setup | null, start = 0, steps: readonly TutorialStep[] = STEPS) {
    this.setup = setup;
    this.steps = steps;
    this.index = start;
    this.skipUnavailable();
  }
  get done() { return this.index >= this.steps.length; }
  get step(): TutorialStep | null { return this.steps[this.index] ?? null; }
  get stage() { return this.step ? STAGES.findIndex(g => g.id === this.step!.stage) : STAGES.length; }
  /** 0..1 through the current step's hold. */
  get fraction() { return this.step ? Math.min(1, this.progress / this.step.hold) : 1; }
  /** The target to make for next: the first not yet passed. */
  get target(): TutorialTarget | null { return this.targets[Math.min(this.memory.reached, this.targets.length - 1)] ?? null; }

  /** Watch one solver tick. Never writes to `s`. */
  sample(s: SkaterState, dt: number): void {
    this.toast = Math.max(0, this.toast - dt);
    const step = this.step;
    if (!step) return;
    // Placed once, from where the skater is as the step begins; a fall keeps them where they are.
    if (step.place && !this.placed) { this.targets = step.place(s, this); this.placed = true; }
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
    this.targets = []; this.placed = false;
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
    const passed = this.targets.length > 1 ? ` · ${this.memory.reached} / ${this.targets.length} checkpoints` : "";
    return `${(Math.min(this.progress, this.step.hold)).toFixed(1)} / ${this.step.hold} s${passed}${this.falls ? ` · ${this.falls} fall${this.falls > 1 ? "s" : ""}` : ""}`;
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
