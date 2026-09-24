// A fixed pad script for the three gameplay setups (game/setups.ts), and the
// golden record of what each setup maps it to: test/fixtures/setup-mapping-v1.json.
//
// One script, every setup: the same thumbs do different things in each, and
// that difference is exactly what the fixture pins. It runs closed-loop on
// the real solver, as the game does — the mapping reads the skater (flips,
// the move under way, speed for Explorer's lean assistance) — so a solver
// change that moves the skater can move the inputs too. Regenerate after an
// intended change, and say why in the commit:
//
//   node test/setup-script.ts --write
//
// Buttons are the Xbox layout game/full-controls.ts binds by default: A 0,
// B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, L3 10 (the modifier), R3 11,
// D-pad up/down/left/right 12-15.

import { writeFileSync } from "node:fs";
import { SETUPS, setupParams, setupInput } from "../game/setups.ts";
import type { Setup } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { EVENT, TURN_NAME } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { IceGrid } from "../sim/ice.ts";
import { REPLAY_SOLVER } from "../sim/replay.ts";

export const FIXTURE_URL = new URL("./fixtures/setup-mapping-v1.json", import.meta.url);
export const SCRIPT_TICKS = 1200;
export const SCRIPT_SPEED = 5;
export const SCRIPT_ASSISTANCE = 0.75;

/** What the thumbs are doing at tick i. */
export function pad(i: number): ControllerHardware {
  const axes = [-0.5, 0, 0, 0], buttons = Array(16).fill(0);
  const during = (from: number, to: number) => i >= from && i < to;
  buttons[7] = 0.38;                                   // RT: a soft knee throughout
  if (during(120, 130)) buttons[0] = 1;                // A tapped: one push
  if (during(180, 300)) buttons[0] = 1;                // A held: repeat pushes, where a setup allows them
  if (during(330, 336)) buttons[4] = 1;                // LB: left foot
  if (during(400, 406)) buttons[5] = 1;                // RB: right foot
  if (during(440, 446)) { buttons[4] = 1; buttons[5] = 1; } // both: two feet
  if (during(470, 476)) buttons[5] = 1;                // back to the right foot
  if (during(520, 530)) buttons[1] = 1;                // B tapped: three-turn
  if (during(600, 640)) { buttons[10] = 1; axes[2] = 0.8; axes[3] = -0.4; } // L3 + right stick: arms
  if (during(700, 706)) buttons[11] = 1;               // R3: toe
  if (during(760, 770)) buttons[15] = 1;               // D-pad right: rocker
  if (during(860, 870)) buttons[13] = 1;               // D-pad down: bracket
  if (during(940, 950)) { buttons[10] = 1; buttons[1] = 1; } // L3 + B: mohawk
  if (during(1040, 1076)) buttons[7] = 0.95;           // RT squeezed: load
  if (during(1076, 1079)) buttons[7] = 0;              // and let go: release
  if (during(1160, 1200)) buttons[6] = 0.8;            // LT: brake
  return { axes, buttons, keys: [], connected: true };
}

export interface ScriptRun {
  inputs: SkatingInput[];
  /** Turn kinds, falls and takeoffs, by tick: what the script actually did on the ice. */
  story: string[];
}

export function runScript(setup: Setup): ScriptRun {
  const p = setupParams(setup, SCRIPT_ASSISTANCE), s = createState(p, SCRIPT_SPEED), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const inputs: SkatingInput[] = [], story: string[] = [];
  for (let i = 0; i < SCRIPT_TICKS; i++) {
    const { input } = setupInput({ hardware: pad(i) } as Controls, s, setup, st, p, profile, SCRIPT_ASSISTANCE);
    inputs.push({ ...input });
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, ice);
    for (const e of events) {
      if (e.type === EVENT.Turn) story.push(`${i} ${TURN_NAME[e.value]}`);
      if (e.type === EVENT.Takeoff) story.push(`${i} takeoff`);
      if (e.type === EVENT.Fall) story.push(`${i} fall`);
    }
  }
  return { inputs, story };
}

/**
 * Only what changed since the previous tick, so a steady stick costs nothing:
 * [tick, {field: value}], tick 0 carrying every field.
 */
export function encode(inputs: SkatingInput[]): [number, Partial<SkatingInput>][] {
  const out: [number, Partial<SkatingInput>][] = [];
  let prev: Record<string, unknown> = {};
  inputs.forEach((input, i) => {
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) if (prev[k] !== v) changed[k] = v; // === , not Object.is: JSON cannot carry -0
    // A field that was there and is gone (a push's pushFoot, the tick after): null, which no input uses.
    for (const k of Object.keys(prev)) if (prev[k] !== undefined && (input as unknown as Record<string, unknown>)[k] === undefined) changed[k] = null;
    if (Object.keys(changed).length) out.push([i, changed as Partial<SkatingInput>]);
    prev = input as unknown as Record<string, unknown>;
  });
  return out;
}

export function decode(changes: [number, Partial<SkatingInput>][], ticks: number): SkatingInput[] {
  const out: SkatingInput[] = [];
  let at = 0, current = {} as SkatingInput;
  for (let i = 0; i < ticks; i++) {
    if (at < changes.length && changes[at][0] === i) {
      current = { ...current, ...changes[at++][1] };
      for (const [k, v] of Object.entries(current)) if (v === null) delete (current as unknown as Record<string, unknown>)[k];
    }
    out.push(current);
  }
  return out;
}

export function buildFixture() {
  return {
    note: "Golden per-tick inputs for game/setups.ts over test/setup-script.ts's pad script. Regenerate: node test/setup-script.ts --write",
    solver: REPLAY_SOLVER, ticks: SCRIPT_TICKS, speed: SCRIPT_SPEED, assistance: SCRIPT_ASSISTANCE,
    setups: Object.fromEntries(SETUPS.map(({ id }) => {
      const run = runScript(id);
      return [id, { story: run.story, inputs: encode(run.inputs) }];
    })),
  };
}

if (process.argv.includes("--write")) {
  writeFileSync(FIXTURE_URL, JSON.stringify(buildFixture()) + "\n");
  console.log(`wrote ${FIXTURE_URL.pathname}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  for (const { id } of SETUPS) console.log(id.padEnd(11), runScript(id).story.join(", "));
}
