// game/ghost.ts — an AI ghost that skates beside the player and shows the
// tricks (the operator's request, 2026-09-24: "an ai ghost that i can skate
// next to and watch do the tricks").
//
// The ghost is a second skater on the same solver, and it plays a virtual
// pad through the same setup mapping the player's pad goes through: nothing
// it does is scripted motion — every move is a button sequence the physics
// performs or refuses, exactly as it would for the player.
//
// SKATED INTO FROM THE PLAYER'S STRIDE (the operator, 2026-09-24): a trick
// spawns beside the player travelling their way at their speed (a gentle
// glide if they stand), and its pad builds the entry the way a skater does —
// strokes for speed, a three-turn to go backward, the edge set, then the
// trick. The pad reads the ghost's own skater (speed, direction, edge, how
// far round it is in the air: what a player sees and feels) to time each
// step; it never reads or writes anything else. Every routine is measured
// from a range of player speeds and pinned in test/ghost.test.ts. A trick
// whose entry could not be made reliable keeps the old way — spawn at its
// entry state, as its source test starts — and says so where it is defined
// (`entry` absent).
//
// Live gameplay only: the ghost never touches the player's state, replay or
// score.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT, MOVE } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { rotate, dot } from "../sim/math.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { newSchemeState } from "../app/schemes.ts";
import { setupParams, setupInput } from "./setups.ts";
import type { Setup } from "./setups.ts";
import { defaultControllerProfile } from "./full-controls.ts";
import type { GameControlState } from "./full-controls.ts";
import { rinkHit } from "./rink.ts";

/** What a trick's pad script can see: its own clock, its own skater, and a scratch memory for this run. */
export interface TrickClock {
  /** Ticks and s since this trick spawned. */
  i: number; t: number;
  /** s since spawn the ghost took off, and landed; -1 before. */
  tookAt: number; landedAt: number;
  /** The ghost's own skater, read-only — what a player sees and feels. */
  s: Readonly<SkaterState>;
  /** Cleared at every spawn: where a routine keeps its place. */
  mem: Record<string, number>;
}

export interface Trick {
  id: string;
  name: string;
  /** How to do it, in the pad's words — shown while the ghost does it. */
  how: string;
  setup: Setup;
  /**
   * Entry speed, m/s; negative is backward (the tests' createState): where a
   * trick that spawns at its entry starts. A stride routine starts at the
   * player's speed instead.
   */
  speed: number;
  /** s from spawn to the end of the trick, before the linger. A stride routine's cap: it is over by then, done or not. */
  duration: number;
  /** Press the pad for tick `c.i`; `h` arrives released. A stride routine returns true once it is done. */
  pad: (h: ControllerHardware, c: TrickClock) => boolean | void;
  /**
   * "stride": spawn at the player's speed and skate into the trick on the
   * pad; the pad keeps its last step (the run-out) through the linger.
   * Absent: spawn at the entry state, the pad released after `duration`.
   */
  entry?: "stride";
}

// ── routines: a trick as steps, each held until the skater is ready ─────────

/** A routine step's clock: the trick's, plus s into this step. */
export interface StepClock extends TrickClock { pt: number }
export interface Step {
  name: string;
  pad: (h: ControllerHardware, c: StepClock) => void;
  /** Done when this holds (checked before the step's pad each tick)… */
  until?: (c: StepClock) => boolean;
  /** …or after this many s. */
  for?: number;
  /** s an `until` step may take before the routine gives up. */
  max?: number;
}

/**
 * A pad script that runs `steps` in turn. It returns true once the last step
 * is reached — its pad keeps playing: the run-out — or when a step waits past
 * its `max`: then `mem.failed` is that step's number, from 1, and the pad is
 * released.
 */
export function routine(steps: readonly Step[]): Trick["pad"] {
  return (h, c) => {
    const m = c.mem;
    m.step ??= 0; m.at ??= 0;
    if (m.failed) return true;
    while (m.step < steps.length - 1) {
      const st = steps[m.step], sc = { ...c, pt: c.t - m.at };
      const ready = st.until ? st.until(sc) : sc.pt >= (st.for ?? 0) - 1e-9;
      if (!ready) {
        if (st.until && sc.pt >= (st.max ?? 20)) { m.failed = m.step + 1; return true; }
        break;
      }
      m.step++; m.at = c.t;
    }
    steps[m.step].pad(h, { ...c, pt: c.t - m.at });
    return m.step === steps.length - 1;
  };
}

// The Experimental pad, by foot: 1 the right (B, the right stick, RT), 0 the left (X, the left stick, LT).
const WEIGHT = [2, 1], STICK = [0, 2], TRIGGER = [6, 7];
const A = 0, Y = 3, LB = 4, RB = 5;
const ticks = (c: StepClock) => Math.round(c.pt / SIM_DT);
const speedOf = (s: Readonly<SkaterState>) => Math.hypot(s.vel.x, s.vel.y);
const backward = (s: Readonly<SkaterState>) => dot(s.vel, s.heading) < -0.3;

/** Ticks from one trigger snap to the next while stroking: 0.3 s, the quickest that measured best (3 -> 5.3 m/s in 3 s). */
const STROKE_TICKS = 36;
/**
 * Stroking in Experimental: LT, RT, LT… snapped, each push from the standing
 * leg, both sticks at `curve` so the stroking circles rather than runs for
 * the boards. Checked only between strokes, so no push is cut short, and
 * then a glide lets the last push's weight transfer finish.
 */
export function strokesTo(speed: number, curve: number): Step[] {
  return [
    { name: "stroke", max: 14,
      pad: (h, c) => {
        const i = ticks(c);
        if (i >= 2 && (i - 2) % STROKE_TICKS < 8) h.buttons[TRIGGER[Math.floor((i - 2) / STROKE_TICKS) % 2]] = 1;
        h.axes[0] = h.axes[2] = curve;
      },
      until: c => { const i = ticks(c); return (i === 0 || (i >= 2 && (i - 2) % STROKE_TICKS === 0)) && speedOf(c.s) >= speed; } },
    { name: "glide", for: 0.4, pad: h => { h.axes[0] = h.axes[2] = curve; } },
  ];
}

/**
 * Onto foot `f` (X / B tapped), its stick at `edge` (+ leans left) until the
 * blade has the edge, then A for the three-turn, the stick held through the
 * cusp (the mapping mirrors it, so the skater keeps the circle). Then
 * `settle` s on the new edge.
 */
export function threeTurn(f: number, edge: number, settle: number): Step[] {
  const side = Math.sign(edge);
  return [
    { name: "edge", max: 2,
      pad: (h, c) => { if (c.pt < 0.02) h.buttons[WEIGHT[f]] = 1; h.axes[STICK[f]] = edge; },
      until: c => { const b = c.s.blade[f]; return c.pt >= 0.1 && c.s.supportFoot === f && b.inContact && side * b.tilt >= 0.1; } },
    { name: "three-turn", max: 2,
      pad: (h, c) => { h.axes[STICK[f]] = edge; if (c.pt < 0.08) h.buttons[A] = 1; },
      until: c => c.pt > 0.1 && backward(c.s) && c.s.move === MOVE.None },
    { name: "back edge", for: settle,
      pad: (h, c) => { h.axes[STICK[f]] = edge; if (c.pt < 0.02) h.buttons[WEIGHT[f]] = 1; } },
  ];
}

/** s until the blade meets the ice, from the jump's height and climb. */
function airLeft(s: Readonly<SkaterState>, p: Params): number {
  const j = s.jump;
  return (j.vz + Math.sqrt(Math.max(0, j.vz * j.vz + 2 * p.gravity * j.z))) / p.gravity;
}
/**
 * Revolutions the jump will have turned at the landing if the arms go out
 * now: turned so far, plus what the takeoff's angular momentum still turns in
 * the air left. MEASURED (144 jumps, loops and lutzes from 3.5-8 m/s, L
 * 22-38, checked 0.33-0.48 s up): the rest is L x (0.0731 x air left +
 * 0.00353) revolutions, within 0.07.
 */
export function landingTurns(s: Readonly<SkaterState>, p: Params): number {
  return s.jump.rotation / (2 * Math.PI) + s.jump.angMomentum * (0.0731 * airLeft(s, p) + 0.00353);
}
/** The check: B (arms out, weight to the right foot) once the landing will have turned this far. */
const CHECK_AT = 1.95;

/**
 * A jump off foot `f`'s back outside edge: load its trigger fully with its
 * stick back (heel), X / B held (the weight, the arms out that side) for
 * 0.35 s, let go — the takeoff. `edge` is held on the foot's stick, or on
 * both sticks when `both` (a deeper lean: the body leans on the mean of the
 * two). In the air B, once the landing will have
 * turned CHECK_AT: arms out, landing on the right foot. The run-out: B held,
 * and 0.15 s after the landing X too — the free foot down, knees at half.
 */
export function jumpOff(f: number, edge: number, p: Params, both = false): Step[] {
  const hold = (h: ControllerHardware) => { h.axes[STICK[f]] = edge; if (both) h.axes[STICK[1 - f]] = edge; };
  return [
    { name: "load", for: 0.35,
      pad: h => { hold(h); h.axes[STICK[f] + 1] = f ? 1 : -1; h.buttons[TRIGGER[f]] = 1; h.buttons[WEIGHT[f]] = 1; } },
    { name: "air", max: 1.5,
      pad: (h, c) => {
        if (c.tookAt < 0) { hold(h); return; }
        h.buttons[7] = 0.7;
        if (c.mem.checked || landingTurns(c.s, p) >= CHECK_AT) { c.mem.checked = 1; h.buttons[1] = 1; }
      },
      until: c => c.landedAt >= 0 },
    { name: "run-out",
      pad: (h, c) => {
        h.buttons[7] = 0.5; h.buttons[1] = 1;
        if (c.t - c.landedAt > 0.15) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
      } },
  ];
}

const EXPERIMENTAL = setupParams("experimental");
/**
 * Both sticks for the loop's held back outside edge: body lean -0.24..-0.28
 * at a 4.9-6.6 m/s takeoff. MEASURED from 0-8 m/s player speeds: 0.6 lands
 * as reliably as the old single-stick edge (-0.10..-0.15); 0.7 (lean to
 * -0.40) landed from 19 of 33 starts, full sticks (to -0.8) from under half —
 * short of rotation and down in the run-out — and 7 m/s backward was never
 * reached from a three-turn entry (the turn costs ~1 m/s, and above ~8 m/s
 * forward the blade barely takes the edge to turn on).
 */
const LOOP_EDGE = 0.5;

export const TRICKS: readonly Trick[] = [
  {
    // test/setups.test.ts "strokes switch feet": LT, RT, LT… every 0.5 s,
    // from whatever speed the player had.
    id: "strokes", name: "Stroking", setup: "experimental", speed: 3, duration: 5, entry: "stride",
    how: "Experimental · B puts you on the right foot, then snap LT, RT, LT… — each snap pushes from the standing leg and the weight goes across",
    pad: routine([
      { name: "stroke", for: 3,
        pad: (h, c) => {
          const i = ticks(c);
          if (i >= 2 && i < 4) h.buttons[1] = 1;
          if (i >= 10 && (i - 10) % 60 < 8) h.buttons[Math.floor((i - 10) / 60) % 2 ? 7 : 6] = 1;
        } },
      { name: "glide", pad: () => {} },
    ]),
  },
  {
    // test/diggate.test.ts: backward, the dig winds the body the way it
    // curves. Into it: strokes, a right forward inside three-turn to skate
    // backward, both sticks a little left to curve, then the dig.
    id: "dig", name: "Dig (Dig Gate)", setup: "diggate", speed: -5, duration: 14, entry: "stride",
    how: "Dig Gate · stroke up, three-turn to skate backward, both sticks a little to the curve's side, then hold LB + RB: lean to the toe, the feet turn across, the lean eases out",
    pad: routine([
      ...strokesTo(4, 0.5),
      ...threeTurn(1, 0.6, 0),
      { name: "curve", for: 0.4, pad: (h, c) => { if (c.pt >= 0.05) h.axes[0] = h.axes[2] = -0.3; } },
      { name: "dig", for: 2.25, pad: h => { h.axes[0] = h.axes[2] = -0.3; h.buttons[LB] = h.buttons[RB] = 1; } },
      { name: "glide", pad: h => { h.axes[0] = h.axes[2] = -0.3; } },
    ]),
  },
  {
    // test/backjump.test.ts: a backward double loop, landed clean — here
    // skated into: strokes on a left curve to 6 m/s, a right forward inside
    // three-turn onto the back outside edge, then the edge deepened on both
    // sticks and held 1 s before the takeoff (the takeoff on a held edge, not
    // the flat one the backjump script leaves from). MEASURED: see
    // test/ghost.test.ts; deeper than this did not hold (the report on the
    // PR, and LOOP_EDGE).
    id: "loop", name: "Backward double loop", setup: "experimental", speed: -7, duration: 18, entry: "stride",
    how: "Experimental · stroke up (LT, RT…), B + right stick right: forward inside edge, A: three-turn onto the back outside edge; both sticks left to deepen the edge and hold it; RT + B + right stick back (heel) for 0.35 s, let go to take off, B in the air to check",
    pad: routine([
      ...strokesTo(5.5, 0.5),
      ...threeTurn(1, 0.6, 0),
      { name: "deepen", for: 1,
        pad: (h, c) => { if (c.pt >= 0.02) h.axes[0] = h.axes[2] = -LOOP_EDGE * Math.min(1, c.pt / 0.5); h.buttons[7] = 0.5; if (c.pt < 0.05) h.buttons[1] = 1; } },
      ...jumpOff(1, -LOOP_EDGE, EXPERIMENTAL, true),
    ]),
  },
  {
    // test/setups.test.ts: the pad snowplow on inside edges, standing.
    id: "snowplow", name: "Snowplow stop", setup: "simulation", speed: 5, duration: 10, entry: "stride",
    how: "Simulation · A to push up to speed, then both bumpers (shared weight), hold L3 + D-pad ← for 1 s to toe both feet in, then ease both sticks apart: inside edges",
    pad: routine([
      { name: "push", max: 8,
        pad: (h, c) => { h.buttons[6] = h.buttons[7] = 0.65; if (ticks(c) % 60 < 3) h.buttons[A] = 1; },
        until: c => ticks(c) % 60 === 59 && speedOf(c.s) >= 3.5 },
      { name: "snowplow", for: 3.5,
        pad: (h, c) => {
          const i = ticks(c);
          h.buttons[7] = 0.5;
          h.buttons[LB] = h.buttons[RB] = i < 2 ? 1 : 0;
          h.buttons[10] = h.buttons[14] = i < 120 ? 1 : 0;
          const k = i < 120 ? 0 : Math.min(1, (i - 119) / 18);
          h.axes = [-k, 0, k, 0];
        } },
      { name: "hold", pad: h => { h.buttons[7] = 0.5; h.axes = [-1, 0, 1, 0]; } },
    ]),
  },
  {
    // test/spin.test.ts's entry (a left forward outside carve, then the spin
    // button) on the Experimental pad: Y is the spin family.
    id: "spin", name: "Upright spin", setup: "experimental", speed: 4.5, duration: 14, entry: "stride",
    how: "Experimental · stroke up, X + left stick right: onto the left forward outside edge, hold Y for 3 s: the edge hooks into a spin; let go to check out backward",
    pad: routine([
      ...strokesTo(4.5, 0.5),
      { name: "edge", max: 2,
        pad: (h, c) => { if (c.pt < 0.02) h.buttons[2] = 1; h.axes[0] = 0.6; },
        until: c => { const b = c.s.blade[0]; return c.pt >= 0.1 && c.s.supportFoot === 0 && b.inContact && b.tilt >= 0.1; } },
      { name: "spin", for: 3, pad: h => { h.axes[0] = 0.6; h.buttons[Y] = 1; } },
      { name: "glide", pad: () => {} },
    ]),
  },
  {
    // test/turns.test.ts's LFO three-turn onto LBI — the salchow's entry —
    // on the Experimental pad, out of strokes on a left curve.
    id: "three", name: "Three-turn", setup: "experimental", speed: 4, duration: 12, entry: "stride",
    how: "Experimental · stroke up, X + left stick right: the left forward outside edge; tap A: the blade turns on the rocker and you skate on backward on the inside edge",
    pad: routine([
      ...strokesTo(4, 0.5),
      ...threeTurn(0, 0.6, 1.5),
      { name: "glide", pad: () => {} },
    ]),
  },
];

/** s the ghost lingers after a trick, fading, before the next one spawns. */
export const GHOST_LINGER = 1.2;
/** m to the player's right the ghost spawns. */
export const GHOST_BESIDE = 2.5;
/** m/s a stride routine starts at when the player stands (below GHOST_STAND). */
export const GHOST_GLIDE = 1, GHOST_STAND = 0.3;
/** m/s a stride routine's spawn is capped at: faster, the blade barely takes an edge (measured: the three-turn's edge never comes above 8.4). */
export const GHOST_TOP = 8;

export class Ghost {
  s: SkaterState;
  p: Params;
  trick: Trick;
  index = 0;
  /** The tricks this ghost cycles through. */
  readonly routine: readonly Trick[];
  /** s since this trick spawned. */
  t = 0;
  /** 0..1, how visible — fades in at spawn, out over the linger. */
  alpha = 0;
  /** What the ghost's virtual pad is pressing this tick, for the HUD. */
  pressing = "";
  /** s since spawn this trick ended (done, fell, gave up or ran out of time); -1 while it runs. */
  over = -1;
  private st: GameControlState = newSchemeState();
  private h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  private profile = defaultControllerProfile();
  private tookAt = -1;
  private landedAt = -1;
  private mem: Record<string, number> = {};
  private i = 0;

  constructor(player: SkaterState, start = 0, routine: readonly Trick[] = TRICKS) {
    this.routine = routine.length ? routine : TRICKS;
    const n = this.routine.length;
    this.index = ((Math.trunc(start) % n) + n) % n;
    this.trick = this.routine[this.index];
    this.p = setupParams(this.trick.setup);
    this.s = createState(this.p, this.trick.speed);
    this.spawn(player);
  }

  /** The routine step this trick gave up waiting in, from 1; 0 if it did not. */
  get failed(): number { return this.mem.failed ?? 0; }

  /**
   * Beside the player, travelling their way: a stride routine at their speed
   * (a glide if they stand, capped at GHOST_TOP), a spawn-at-entry trick at
   * its entry state.
   */
  spawn(player: SkaterState): void {
    this.trick = this.routine[this.index];
    this.p = setupParams(this.trick.setup);
    const pv = player.vel, ps = Math.hypot(pv.x, pv.y);
    const stride = this.trick.entry === "stride";
    const s = createState(this.p, stride ? (ps < GHOST_STAND ? GHOST_GLIDE : Math.min(ps, GHOST_TOP)) : this.trick.speed);
    // The player's travel (their heading when standing), and the entry's own.
    const travel = ps > GHOST_STAND ? Math.atan2(pv.y, pv.x) : Math.atan2(player.heading.y, player.heading.x);
    const entry = Math.atan2(s.vel.y, s.vel.x);
    const a = travel - entry;
    s.heading = rotate(s.heading, a);
    s.vel = rotate(s.vel, a);
    for (const b of s.blade) b.tangent = rotate(b.tangent, a);
    const right = { x: Math.sin(travel), y: -Math.cos(travel) };
    let x = player.pos.x + right.x * GHOST_BESIDE, y = player.pos.y + right.y * GHOST_BESIDE;
    // Near the boards, beside the player on the ice instead.
    if (rinkHit(x, y)) { x = player.pos.x - right.x * GHOST_BESIDE; y = player.pos.y - right.y * GHOST_BESIDE; }
    s.pos = { x, y };
    this.s = s;
    this.st = newSchemeState();
    this.t = 0; this.i = 0; this.tookAt = -1; this.landedAt = -1; this.alpha = 0; this.over = -1; this.mem = {};
  }

  /** One solver tick: the virtual pad, the setup's mapping, the physics. */
  tick(player: SkaterState): void {
    if (this.over < 0 && this.t >= this.trick.duration - 1e-9) this.over = this.trick.duration;
    if ((this.over >= 0 && this.t >= this.over + GHOST_LINGER - 1e-9) || rinkHit(this.s.pos.x, this.s.pos.y)) {
      this.index = (this.index + 1) % this.routine.length;
      this.spawn(player);
    }
    const T = this.trick.duration, stride = this.trick.entry === "stride";
    const h = this.h;
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    // A spawn-at-entry trick's pad plays for its duration; a stride routine's
    // keeps its run-out through the linger, unless it gave up.
    const playing = !this.s.fallen && (stride ? !this.mem.failed && this.t < T + GHOST_LINGER : this.t < T);
    if (playing) {
      const done = this.trick.pad(h, { i: this.i, t: this.t, tookAt: this.tookAt, landedAt: this.landedAt, s: this.s, mem: this.mem });
      if (done === true && this.over < 0) this.over = this.t;
    }
    this.pressing = padWords(h);
    const { input } = setupInput({ hardware: h } as Controls, this.s, this.trick.setup, this.st, this.p, this.profile);
    const events: EdgeEvent[] = [];
    step(this.s, input, this.p, SIM_DT, events);
    if (this.tookAt < 0 && events.some(e => e.type === EVENT.Takeoff)) this.tookAt = this.t;
    if (this.landedAt < 0 && events.some(e => e.type === EVENT.Landing)) this.landedAt = this.t;
    if (this.over < 0 && this.s.fallen) this.over = this.t;
    this.t += SIM_DT; this.i++;
    this.alpha = Math.min(1, this.t / 0.4, this.over < 0 ? 1 : Math.max(0, (this.over + GHOST_LINGER - this.t) / GHOST_LINGER));
  }
}

const BUTTON = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "L3", "R3", "↑", "↓", "←", "→"];

/** The pad as words: held buttons, pulled triggers, pushed sticks. */
export function padWords(h: ControllerHardware): string {
  const out: string[] = [];
  h.buttons.forEach((v, b) => { if (v > 0.1) out.push(b === 6 || b === 7 ? `${BUTTON[b]} ${Math.round(v * 100)}%` : BUTTON[b]); });
  const stick = (name: string, x: number, y: number) => {
    if (Math.hypot(x, y) < 0.15) return;
    const dir = [y < -0.15 ? "up" : y > 0.15 ? "back" : "", x < -0.15 ? "left" : x > 0.15 ? "right" : ""].filter(Boolean).join("-");
    out.push(`${name} ${dir}`);
  };
  stick("L-stick", h.axes[0], h.axes[1]);
  stick("R-stick", h.axes[2], h.axes[3]);
  return out.join(" + ");
}
