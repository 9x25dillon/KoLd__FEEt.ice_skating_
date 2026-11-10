// tools/ice-lab/jpse/baseline.ts — the one canonical entrance of the first slice.
//
// Not authored here. It is test/backjump.test.ts's measured clean double loop
// on the Experimental setup (2026-11-02: from 7 m/s backward on a deep back
// outside edge, RT half then full with B wound and X swung, checked 0.40 s
// into the air; 1.994 revolutions, called clean, standing through a 1.2 s
// run-out). The pad script is run once through the game's own mapping
// (game/setups.ts setupInput) and the SkatingInput it produces each tick is
// kept. From then on that input stream IS the entrance: open-loop, exactly
// replayable, and something every transform can rewrite field by field.
//
// Open loop is deliberate for this slice. A closed-loop pilot would correct a
// transformed entrance back toward success and hide what the geometry alone
// does, which is the question issue #74 asks first.

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { EVENT } from "../sim/types.ts";
import type { EdgeEvent, SkatingInput } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import type { Program } from "./transform.ts";

/** The canonical entrance's jump and setup, and where its numbers come from. */
export const BASELINE = {
  jump: JUMP.Loop,
  setup: "experimental",
  speed: -7,
  /** s: RT half, then the load. test/backjump.test.ts's LOAD_AT, LOAD, SWING_AT. */
  loadAt: 1.5, load: 0.5, swingAt: 0.1,
  /** s into the air when B checks the rotation: the only clean check measured. */
  checkAt: 0.4,
  /** Ticks of run-out after touchdown: backjump.test.ts's RUN_OUT, "still standing after 1.2 s". */
  runOut: 144,
  source: "test/backjump.test.ts, measured 2026-11-02",
} as const;

export function baselineParams(): Params { return setupParams(BASELINE.setup); }

/** Run the pad script once and keep what the solver was fed. Deterministic. */
export function loopBaselineProgram(): Program {
  const p = baselineParams(), s = createState(p, BASELINE.speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const inputs: SkatingInput[] = [];
  let took = -1, landed = false;
  const tick = (press: () => void): EdgeEvent[] => {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    press();
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    inputs.push({ ...input });
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events);
    return events;
  };
  const { loadAt, load, swingAt, checkAt } = BASELINE;
  for (let i = 0; i < 480 && !s.fallen && !landed; i++) {
    const t = i * SIM_DT;
    const events = tick(() => {
      if (took >= 0) { h.buttons[7] = 0.7; h.buttons[1] = t - took >= checkAt ? 1 : 0; return; }
      if (i < 2) h.buttons[1] = 1;
      h.axes[0] = h.axes[2] = -Math.min(1, t / 0.5);
      if (t < loadAt) h.buttons[7] = 0.5;
      if (t >= loadAt && t < loadAt + load) { h.buttons[7] = 1; h.buttons[t - loadAt < swingAt ? 1 : 2] = 1; }
    });
    if (took < 0 && events.some((e) => e.type === EVENT.Takeoff)) took = t;
    if (events.some((e) => e.type === EVENT.Landing)) landed = true;
  }
  if (landed) for (let i = 0; i < BASELINE.runOut && !s.fallen; i++) tick(() => {
    h.buttons[7] = 0.5; h.buttons[1] = 1;
    if (i >= 18) { h.buttons[6] = 0.5; h.buttons[2] = 1; }
  });
  return { speed: BASELINE.speed, inputs };
}
