// game/pilot.ts: the computer skates a program through Simulation's pad, and the sim decides the rest.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProgramPilot, showcaseProgram, PILOT_ELEMENTS } from "../game/pilot.ts";
import { Choreography, type ElementId } from "../game/career.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { IceGrid } from "../sim/ice.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import { resolveRinkCollision } from "../game/rink.ts";
import type { Controls } from "../app/pad.ts";
import type { EdgeEvent } from "../sim/types.ts";

test("a showcase skates what the pilot was measured on, and says what it left out", () => {
  assert.deepEqual(showcaseProgram(["glide", "step", "jump", "spiral", "combo", "pose"]),
    { skated: ["glide", "jump", "pose"], left: ["step", "spiral", "combo"] });
  assert.deepEqual(showcaseProgram([...PILOT_ELEMENTS]).left, []);
});

/** One showcase run, as the bridge plays it: the pilot's pad through Simulation's mapping. */
function skate(routine: ElementId[], seconds: number) {
  const params = setupParams("simulation"), state = createState(params, 4.5), ice = new IceGrid(params.rinkHalfLength, params.rinkHalfWidth);
  const r = new Choreography({ id: "showcase", title: "Showcase", venue: "", seconds, routine }, undefined, undefined, undefined, undefined, ice);
  const pilot = new ProgramPilot(), steer = newSchemeState(), profile = defaultControllerProfile();
  let falls = 0, wasFallen = false;
  for (let k = 0; k < (seconds + 5) / SIM_DT && !r.done; k++) {
    const pad = pilot.pad(state, r.current, SIM_DT);
    const mapped = setupInput({ hardware: pad } as unknown as Controls, state, "simulation", steer, params, profile);
    const events: EdgeEvent[] = [];
    step(state, mapped.input, params, SIM_DT, events, ice);
    resolveRinkCollision(state, events);
    r.sample(state, mapped.cantilever, SIM_DT, events);
    if (state.fallen && !wasFallen) falls++;
    wasFallen = state.fallen;
  }
  return { r, falls, state };
}

test("the pilot skates a jumpless program to its end, every element in order", () => {
  const { r, state } = skate(["glide", "edge", "crossover", "pose"], 60);
  assert.ok(r.complete, `stopped at element ${r.index} (${r.current})`);
  for (const v of [state.pos.x, state.pos.y, state.vel.x, state.vel.y]) assert.ok(Number.isFinite(v));
});

test("the pilot is deterministic: the same program skates the same way twice", () => {
  const a = skate(["glide", "edge", "jump", "pose"], 40), b = skate(["glide", "edge", "jump", "pose"], 40);
  assert.equal(a.r.index, b.r.index);
  assert.equal(a.falls, b.falls);
  assert.deepEqual(a.state.pos, b.state.pos);
});
