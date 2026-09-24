// game/ghost.ts — an AI ghost that skates beside the player and shows the
// tricks (the operator's request, 2026-09-24: "an ai ghost that i can skate
// next to and watch do the tricks").
//
// The ghost is a second skater on the same solver, and it plays a virtual
// pad through the same setup mapping the player's pad goes through: nothing
// it does is scripted motion — every move is a button sequence the physics
// performs or refuses, exactly as it would for the player. Its routines are
// the pad scripts the test suite already plays and pins (test/setups.test.ts,
// test/backjump.test.ts, test/diggate.test.ts), so what it shows is known to
// work. Each trick spawns beside the player, travelling their way, at the
// entry speed and direction its test starts from; it runs, lingers, fades,
// and the next one spawns beside the player again.
//
// Live gameplay only: the ghost never touches the player's state, replay or
// score.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT } from "../sim/types.ts";
import type { SkaterState, EdgeEvent } from "../sim/types.ts";
import { rotate } from "../sim/math.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { newSchemeState } from "../app/schemes.ts";
import { setupParams, setupInput } from "./setups.ts";
import type { Setup } from "./setups.ts";
import { defaultControllerProfile } from "./full-controls.ts";
import type { GameControlState } from "./full-controls.ts";
import { rinkHit } from "./rink.ts";

/** What a trick's pad script can see: its own clock, and when it took off. */
export interface TrickClock { i: number; t: number; tookAt: number }

export interface Trick {
  id: string;
  name: string;
  /** How to do it, in the pad's words — shown while the ghost does it. */
  how: string;
  setup: Setup;
  /** Entry speed, m/s; negative is backward (the tests' createState). */
  speed: number;
  /** s from spawn to the end of the trick, before the linger. */
  duration: number;
  /** Press the pad for tick `c.i`; `h` arrives released. */
  pad: (h: ControllerHardware, c: TrickClock) => void;
}

export const TRICKS: readonly Trick[] = [
  {
    // test/setups.test.ts "strokes switch feet": 4.09 m/s from 3, straight.
    id: "strokes", name: "Stroking", setup: "experimental", speed: 3, duration: 3,
    how: "Experimental · B puts you on the right foot, then snap LT, RT, LT… — each snap pushes from the standing leg and the weight goes across",
    pad: (h, { i }) => {
      if (i >= 2 && i < 4) h.buttons[1] = 1;
      if (i >= 10 && (i - 10) % 60 < 8) h.buttons[Math.floor((i - 10) / 60) % 2 ? 7 : 6] = 1;
    },
  },
  {
    // test/diggate.test.ts: backward, the dig winds the body the way it curves.
    id: "dig", name: "Dig (Dig Gate)", setup: "diggate", speed: -5, duration: 3.6,
    how: "Dig Gate · skating backward on a curve (both sticks a little right), hold LB + RB: lean to the toe, the feet turn across, the lean eases out",
    pad: (h, { i, t }) => {
      h.axes = [0.3, 0, 0.3, 0];
      if (i < 2) h.buttons[1] = h.buttons[2] = 1;
      if (t >= 0.25 && t < 2.5) h.buttons[4] = h.buttons[5] = 1;
    },
  },
  {
    // test/backjump.test.ts: a backward double loop, checked 0.4 s into the air, landed clean.
    id: "loop", name: "Backward double loop", setup: "experimental", speed: -7, duration: 3.2,
    how: "Experimental · backward on the right back outside edge (right stick a little left), B for the right foot; RT + B + right stick back (heel) for 0.35 s, let go to take off, B again 0.4 s into the air to check",
    pad: (h, { i, t, tookAt }) => {
      h.axes = [0, 0, -0.6, 0];
      if (i < 2) h.buttons[1] = 1;
      if (t >= 1 && t < 1.35) { h.buttons[7] = 1; h.axes[3] = 1; h.buttons[1] = 1; }
      if (tookAt >= 0) { h.axes = [0, 0, 0, 0]; h.buttons[7] = 0.7; h.buttons[1] = t - tookAt >= 0.4 ? 1 : 0; }
    },
  },
  {
    // test/setups.test.ts: the pad snowplow on inside edges, 5 -> 2.79 m/s in 3 s, standing.
    id: "snowplow", name: "Snowplow stop", setup: "simulation", speed: 5, duration: 3.5,
    how: "Simulation · both bumpers (shared weight), hold L3 + D-pad ← for 1 s to toe both feet in, then ease both sticks apart: inside edges",
    pad: (h, { i }) => {
      h.buttons[7] = 0.5;
      h.buttons[4] = h.buttons[5] = i < 2 ? 1 : 0;
      h.buttons[10] = h.buttons[14] = i < 120 ? 1 : 0;
      const k = i < 120 ? 0 : Math.min(1, (i - 119) / 18);
      h.axes = [-k, 0, k, 0];
    },
  },
];

/** s the ghost lingers after a trick, fading, before the next one spawns. */
export const GHOST_LINGER = 1.2;
/** m to the player's right the ghost spawns. */
export const GHOST_BESIDE = 2.5;

export class Ghost {
  s: SkaterState;
  p: Params;
  trick: Trick;
  index = 0;
  /** s since this trick spawned. */
  t = 0;
  /** 0..1, how visible — fades in at spawn, out over the linger. */
  alpha = 0;
  /** What the ghost's virtual pad is pressing this tick, for the HUD. */
  pressing = "";
  private st: GameControlState = newSchemeState();
  private h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  private profile = defaultControllerProfile();
  private tookAt = -1;
  private i = 0;

  constructor(player: SkaterState, start = 0) {
    this.index = start % TRICKS.length;
    this.trick = TRICKS[this.index];
    this.p = setupParams(this.trick.setup);
    this.s = createState(this.p, this.trick.speed);
    this.spawn(player);
  }

  /** Put this trick's entry state beside the player, travelling their way. */
  spawn(player: SkaterState): void {
    this.trick = TRICKS[this.index];
    this.p = setupParams(this.trick.setup);
    const s = createState(this.p, this.trick.speed);
    const pv = player.vel, ps = Math.hypot(pv.x, pv.y);
    // The player's travel (their heading when standing), and the entry's own.
    const travel = ps > 0.3 ? Math.atan2(pv.y, pv.x) : Math.atan2(player.heading.y, player.heading.x);
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
    this.t = 0; this.i = 0; this.tookAt = -1; this.alpha = 0;
  }

  /** One solver tick: the virtual pad, the setup's mapping, the physics. */
  tick(player: SkaterState): void {
    const T = this.trick.duration, end = this.s.fallen ? Math.min(T, this.t) : T;
    if (this.t >= end + GHOST_LINGER || rinkHit(this.s.pos.x, this.s.pos.y)) {
      this.index = (this.index + 1) % TRICKS.length;
      this.spawn(player);
    }
    const h = this.h;
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    if (this.t < T && !this.s.fallen) this.trick.pad(h, { i: this.i, t: this.t, tookAt: this.tookAt });
    this.pressing = padWords(h);
    const { input } = setupInput({ hardware: h } as Controls, this.s, this.trick.setup, this.st, this.p, this.profile);
    const events: EdgeEvent[] = [];
    step(this.s, input, this.p, SIM_DT, events);
    if (this.tookAt < 0 && events.some(e => e.type === EVENT.Takeoff)) this.tookAt = this.t;
    this.t += SIM_DT; this.i++;
    this.alpha = Math.min(1, this.t / 0.4, Math.max(0, (end + GHOST_LINGER - this.t) / GHOST_LINGER));
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
