// The beat crossovers and the jump load (Hand_off.md open question 2).
//
// beatCrossoverHoldSuppress (sim/params.ts, default 0) is the owner's option:
// the standing trigger held toward a load stops the beat's automatic
// crossovers (game/full-controls.ts, the loading guard). The full sweep — the
// canonical clean 2Lo entrance with its load shifted across one beat period in
// 1-tick steps, off and on — is bench/beatcross.ts, measured 2026-11-18 in
// docs/beatcross-2026-11.{md,json}. These tests pin the guard's semantics and a
// few representative offsets of that sweep; the JSON holds all 57.
//
// MEASURED 2026-11-18 on the ice grid (iceGridMode 1), Experimental:
// off, offset 0 is the canonical clean double loop (L 24.18, 713.4° in the air,
// stood the 1.2 s run-out) and its load begins two-footed (right share 0.621)
// 12 ticks after the beat at 169; on, the hold keeps every load one-footed
// (share 1) with no crossovers, but the entrance loses the pushes it rode in on
// and every load falls LEAN EXCEEDED before the release.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { SETUPS, setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { runOffset } from "../bench/beatcross.ts";
import { BASELINE } from "../jpse/baseline.ts";

const off = (): Params => setupParams(BASELINE.setup);
const on = (): Params => ({ ...off(), beatCrossoverHoldSuppress: 1 });

test("the param is 0 by default, in every setup, and valid only as 0 or 1", () => {
  assert.equal(DEFAULT_PARAMS.beatCrossoverHoldSuppress, 0);
  for (const s of SETUPS) assert.equal(setupParams(s.id).beatCrossoverHoldSuppress, 0, s.id);
  assert.equal(validate({ ...DEFAULT_PARAMS, beatCrossoverHoldSuppress: 0 }).length, 0);
  assert.equal(validate({ ...DEFAULT_PARAMS, beatCrossoverHoldSuppress: 1 }).length, 0);
  assert.ok(validate({ ...DEFAULT_PARAMS, beatCrossoverHoldSuppress: 2 }).length > 0);
});

/** A backward glide on the deep edge, counting automatic crossover starts. */
function glideCrossovers(p: Params, hold: boolean, ticks = 200): number[] {
  const s = createState(p, BASELINE.speed);
  const ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const crossSpan = Math.round(p.strokeDuration / SIM_DT);
  const starts: number[] = [];
  for (let i = 0; i < ticks && !s.fallen; i++) {
    h.buttons.fill(0);
    h.axes[0] = h.axes[2] = -Math.min(1, (i * SIM_DT) / 0.5);
    if (hold) h.buttons[7] = 0.5;
    const input = setupInput({ hardware: h } as Controls, s, BASELINE.setup, st, p, profile).input;
    if (st.full?.crossUntil === s.tick + crossSpan) starts.push(s.tick);
    step(s, input, p, SIM_DT, [], ice);
  }
  return starts;
}

test("the guard is the hold, not the crossover: triggers released, the beat crossovers the same at 0 and 1", () => {
  const a = glideCrossovers(off(), false), b = glideCrossovers(on(), false);
  assert.ok(a.length > 0, "the released glide crossovers");
  assert.deepEqual(b, a);
});

test("the standing trigger held toward a load stops the beat's crossovers at 1, not at 0", () => {
  const held0 = glideCrossovers(off(), true), held1 = glideCrossovers(on(), true);
  assert.ok(held0.length > 0, "at 0 the half-trigger hold still crossovers");
  assert.equal(held1.length, 0, "at 1 the hold suppresses them");
});

test("off, offset 0: the canonical clean 2Lo, its load two-footed just after the beat", () => {
  const r = runOffset(0, off());
  assert.equal(r.verified, true);
  assert.equal(r.completed, true);
  assert.ok(Math.abs(r.takeoffL - 24.18) < 0.05, `L ${r.takeoffL.toFixed(3)}`);
  assert.ok(Math.abs(r.airborneDeg - 713.4) < 1, `airborne ${r.airborneDeg.toFixed(1)}`);
  assert.equal(r.revolutions, 2);
  assert.equal(r.rotationCall, "clean");
  // The load begins 12 ticks after the crossover at 169, still sharing the load.
  assert.ok(Math.abs(r.shareAtLoadStart - 0.621) < 0.01, `share@load ${r.shareAtLoadStart.toFixed(3)}`);
  assert.equal(r.shareAtBladeOff, 1);
  assert.ok(r.crossoverTicks.includes(113) && r.crossoverTicks.includes(169));
});

test("off, offset 36: a load later in the carve falls in the load itself, lean exceeded", () => {
  const r = runOffset(36, off());
  assert.equal(r.outcome, "fell-entry");
  assert.equal(r.fallReason, "LEAN EXCEEDED");
  assert.ok(Math.abs(r.shareAtLoadStart - 0.906) < 0.01, `share@load ${r.shareAtLoadStart.toFixed(3)}`);
});

test("on: the hold keeps the load one-footed with no crossovers, and the entrance no longer stands", () => {
  for (const k of [0, 21, 36]) {
    const r = runOffset(k, on());
    assert.equal(r.shareAtLoadStart, 1, `offset ${k} share@load`);
    assert.equal(r.crossoverTicks.length, 0, `offset ${k} crossovers`);
    assert.equal(r.outcome, "fell-entry", `offset ${k} outcome`);
    assert.equal(r.fallReason, "LEAN EXCEEDED", `offset ${k} reason`);
  }
});

test("the sweep is deterministic: the same offset twice is the same run, digest and all", () => {
  assert.deepEqual(runOffset(5, off()), runOffset(5, off()));
  assert.deepEqual(runOffset(5, on()), runOffset(5, on()));
});
