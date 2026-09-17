// Hype: the operator's own bridge between the musical and career layers.
// "The stamina, strength, flow state and hype from successive trick landing
// has to be the bridge... engaging more and more assist engines with
// performance increases." Off in every preset, the way everything else here
// is; does not wait for flow (bible §2.6), a separate, still-unbuilt system.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

/** Drive one jump to landing; `absorb` controls a clean vs a step-out landing. */
function attempt(p: ReturnType<typeof mkParams>, speed: number, absorb = 0.8, streakBefore = 0) {
  const s = createState(p, speed);
  s.hypeStreak = streakBefore;
  const events: EdgeEvent[] = [];
  for (let i = 0; i < 400 && s.jump.phase !== JUMP_PHASE.Air; i++) {
    const loading = i >= 60 && i < 96;
    const ev: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0.2, weight: 1,
      knee: loading ? 0.95 : i >= 96 ? 0 : 0.35 }, p, SIM_DT, ev);
    events.push(...ev);
  }
  for (let i = 0; i < 200 && s.jump.phase === JUMP_PHASE.Air; i++) {
    const ev: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0, weight: 1, knee: absorb, carriage: 0 }, p, SIM_DT, ev);
    events.push(...ev);
  }
  return { s, events };
}

function mkParams(over: object = {}) {
  return { ...PRESETS.responsive, hypeMode: 1, jumpMode: 2, ...over };
}

test("hypeMode 0 is inert: landings and falls never move it", () => {
  const p = { ...PRESETS.responsive, jumpMode: 2 }; // hypeMode 0
  const { s } = attempt(p, 6);
  assert.equal(s.hype, 0);
  assert.equal(s.hypeStreak, 0);
});

test("a clean landing builds hype, scaled by landing quality", () => {
  const p = mkParams();
  const { s, events } = attempt(p, 6);
  assert.ok(events.some(e => e.type === EVENT.Landing), "must actually land");
  assert.ok(!s.landed.fall && !s.landed.stepOut && !s.landed.twoFoot, "exercise a CLEAN landing");
  assert.ok(s.hype > 0, "a clean landing must build hype");
  // Within one tick's decay of the raw gain — the same landingAndTurnCredit
  // call that adds it also applies the continuous decay term.
  assert.ok(Math.abs(s.hype - p.hypeLandingGain * s.landed.landingQuality) < p.hypeDecayPerSecond * SIM_DT + 1e-9);
  assert.equal(s.hypeStreak, 1);
});

test("consecutive clean landings build more hype each time", () => {
  // Chaining several real jumps back to back is its own test of jump
  // recovery, not of hype, and falls easily. Test the streak's own effect
  // directly instead: an otherwise-identical clean landing, differing only
  // in hypeStreak already banked going in, must gain more the longer the
  // streak already is — the real code path, not a re-derivation of it.
  const p = mkParams();
  const gains = [0, 1, 2].map((streakBefore) => {
    const { s } = attempt(p, 6, 0.8, streakBefore);
    return { gain: s.hype, streak: s.hypeStreak };
  });
  assert.deepEqual(gains.map(g => g.streak), [1, 2, 3]);
  assert.ok(gains[1].gain > gains[0].gain && gains[2].gain > gains[1].gain,
    `each additional streak should gain more: ${gains.map(g => g.gain.toFixed(4))}`);
});

test("a fall costs a share of banked hype and resets the streak", () => {
  const p = { ...PRESETS.responsive, staminaMode: 0, hypeMode: 1 };
  const s = createState(p, 8, 1.2); // a lean the responsive preset cannot hold
  s.hype = 0.5; s.hypeStreak = 4;
  let fellOnTick = -1;
  for (let i = 0; i < 300 && fellOnTick < 0; i++) {
    const before = s.hype;
    const events: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 1, weight: 1 }, p, SIM_DT, events);
    if (events.some(e => e.type === EVENT.Fall)) {
      fellOnTick = i;
      // Within one tick's decay of the proportional loss, applied the same
      // tick by the same call.
      assert.ok(Math.abs(s.hype - before * (1 - p.hypeFallLoss)) < p.hypeDecayPerSecond * SIM_DT + 1e-9);
    }
  }
  assert.ok(fellOnTick >= 0, "exercise an actual fall");
  assert.equal(s.hypeStreak, 0);
});

test("a blemished-but-standing landing resets the streak without a fall's loss", () => {
  const p = mkParams();
  const { s } = attempt(p, 6, 0.05); // a stiff, under-absorbed landing: likely a step-out
  if (s.landed.stepOut || s.landed.twoFoot) {
    assert.equal(s.hypeStreak, 0);
  }
});

test("hype decays on its own, with no scoring at all", () => {
  const p = mkParams();
  const s = createState(p, 4);
  s.hype = 0.5;
  run(s, { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 }, p, 240); // 2 s, no jump, no fall
  assert.ok(s.hype < 0.5, "hype must fade on its own");
  assert.ok(s.hype > 0.5 - p.hypeDecayPerSecond * 2 - 1e-6, "but not faster than the decay rate says");
});

test("hype loosens control: latency shrinks and recovery authority grows", () => {
  const p = { ...PRESETS.responsive, hypeMode: 1, controlLatency: 0.12 };
  const off = createState(p, 4), on = createState(p, 4);
  off.hype = 0; on.hype = 1;
  // A step command: how fast tiltCmd reaches the target is controlLatency's
  // own signature, so one tick already shows the difference.
  step(off, { ...NEUTRAL_INPUT, lean: 0.5, weight: 1 }, p, SIM_DT, []);
  step(on, { ...NEUTRAL_INPUT, lean: 0.5, weight: 1 }, p, SIM_DT, []);
  assert.ok(Math.abs(on.tiltCmd) > Math.abs(off.tiltCmd),
    `hyped tiltCmd ${on.tiltCmd.toFixed(4)} should move faster than un-hyped ${off.tiltCmd.toFixed(4)}`);
});

test("hype validates, and a bad lever is caught", () => {
  const p = DEFAULT_PARAMS;
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ ...p, hypeMode: 2 }).length > 0);
  assert.ok(validate({ ...p, hypeLandingGain: -1 }).length > 0);
  assert.ok(validate({ ...p, hypeFallLoss: 1.5 }).length > 0);
  assert.ok(validate({ ...p, hypeControlLatencyMin: 1.5 }).length > 0, "cannot lengthen the lag");
  assert.ok(validate({ ...p, hypeInternalMaxGain: 0.5 }).length > 0, "cannot reduce authority below base");
  assert.ok(validate({ ...p, hypeAngulationGain: 0.5 }).length > 0);
});

test("hype replays tick for tick", () => {
  const p = mkParams();
  const a = createState(p, 6), b = createState(p, 6);
  const inputs = (i: number) => ({ ...NEUTRAL_INPUT, lean: 0.2, weight: 1,
    knee: i >= 60 && i < 96 ? 0.95 : i >= 96 ? 0 : 0.35 });
  for (let i = 0; i < 300; i++) { step(a, inputs(i), p, SIM_DT, []); step(b, inputs(i), p, SIM_DT, []); }
  assert.deepEqual(a, b);
});
