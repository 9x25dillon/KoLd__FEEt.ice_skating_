// The flow scalar, design-bible.md §2.6: "a single value in [0,1], integrated
// continuously." Only the ground-based rises-with/falls-with terms and the
// beat-grid bonus are modelled — "alternating lobes", "repeated lobes in the
// same direction" and "dead air between elements" are not. Off in every
// preset, the way everything else here is.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step, run } from "../sim/solver.ts";
import { NEUTRAL_INPUT, REGIME } from "../sim/types.ts";
import { IceGrid } from "../sim/ice.ts";
import { v2 } from "../sim/math.ts";

const glide = { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 };
const deg = (d: number): number => (d * Math.PI) / 180;
const mk = (): Params => ({ ...PRESETS.responsive, flowMode: 1 });
const holding = (leanRad: number, p: Params, weight = 1) =>
  ({ ...NEUTRAL_INPUT, lean: leanRad / p.maxLean, weight });

test("flowMode 0 is inert: nothing moves it, however the skater skates", () => {
  const p = PRESETS.responsive;
  const s = createState(p, 6);
  run(s, { ...NEUTRAL_INPUT, lean: 0.4, weight: 1 }, p, 300);
  assert.equal(s.flow, 0);
});

test("a real held edge builds flow", () => {
  const p = mk();
  const s = createState(p, 5);
  run(s, { ...NEUTRAL_INPUT, lean: 0.3, weight: 1 }, p, 240);
  const regime = s.blade[s.supportFoot].regime;
  assert.ok(regime === REGIME.Edge || regime === REGIME.Carve, `exercise a real held edge, got regime ${regime}`);
  assert.ok(s.flow > 0, "a held carve must build flow");
});

test("a flat blade costs flow: skating on flat feet", () => {
  const p = mk();
  const s = createState(p, 5);
  s.flow = 0.5;
  run(s, glide, p, 120);
  assert.equal(s.blade[s.supportFoot].regime, REGIME.Glide);
  assert.ok(s.flow < 0.5, "a flat blade must cost flow");
});

test("a skid costs flow: skids and chops", () => {
  const p = { ...mk(), controlLatency: 0 };
  const s = createState(p, 10, deg(30));
  run(s, holding(deg(30), p), p, 10);
  assert.equal(s.blade[s.supportFoot].regime, REGIME.Skid, "exercise a real skid, the same setup bite.test.ts uses");
  assert.ok(s.flow < 1, "a skid from a fresh (1.0) flow must have cost some");
});

test("stopping costs flow, and a standstill never builds any", () => {
  const p = mk();
  const s = createState(p, 0);
  s.flow = 0.5;
  run(s, { ...NEUTRAL_INPUT, lean: 0, weight: 0.5 }, p, 240);
  assert.ok(s.flow < 0.5, "standing still must cost flow, not build it");
});

test("re-crossing damaged ice costs flow against the same carve, only while the ice grid is in play", () => {
  // A modifier alongside carving, not a veto: a good edge still gains flow
  // on chewed ice, just less of it — the comparative test the ice grid's
  // own "last skater in a warm-up group" case uses.
  const p = { ...mk(), iceGridMode: 1 }; // default iceDamagePerPass: the skater's OWN glide barely marks fresh ice in 30 ticks
  const grid = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  // Damage the whole strip the skater is about to glide straight down, not
  // just the origin — a moving skater crosses many 12 cm cells in 30 ticks —
  // heavily enough that it stays past the threshold despite each pass being small.
  for (let x = -1; x <= 3; x += 0.1) for (let y = -0.3; y <= 0.3; y += 0.1)
    for (let n = 0; n < 200; n++) grid.deposit(v2(x, y), 0, 1, p);

  const damaged = createState(p, 3);
  run(damaged, { ...NEUTRAL_INPUT, lean: 0.3, weight: 1 }, p, 30, [], grid);

  const fresh = createState(p, 3);
  run(fresh, { ...NEUTRAL_INPUT, lean: 0.3, weight: 1 }, p, 30, [], new IceGrid(p.rinkHalfLength, p.rinkHalfWidth));

  assert.ok(damaged.flow < fresh.flow,
    `damaged ${damaged.flow.toFixed(4)} should gain less flow than fresh ${fresh.flow.toFixed(4)} on the same carve`);

  const noGrid = createState(p, 3);
  run(noGrid, { ...NEUTRAL_INPUT, lean: 0.3, weight: 1 }, p, 30); // no grid passed at all
  assert.equal(noGrid.flow, fresh.flow, "with no grid, damaged ice cannot be read, so it must match the fresh case exactly");
});

test("high flow makes stamina cheaper: Wind drains slower the more flow is banked", () => {
  const p = { ...mk(), staminaMode: 1 };
  const low = createState(p, 6); low.flow = 0;
  const high = createState(p, 6); high.flow = 1;
  run(low, { ...NEUTRAL_INPUT, lean: 0.35, weight: 0.5 }, p, 600);
  run(high, { ...NEUTRAL_INPUT, lean: 0.35, weight: 0.5 }, p, 600);
  assert.ok(high.wind > low.wind,
    `full flow (${high.wind.toFixed(4)}) should drain Wind slower than none (${low.wind.toFixed(4)})`);
});

test("flow validates, and a bad lever is caught", () => {
  const p = DEFAULT_PARAMS;
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ ...p, flowMode: 2 }).length > 0);
  assert.ok(validate({ ...p, flowCarveGain: -1 }).length > 0);
  assert.ok(validate({ ...p, flowDamagedIceThreshold: 1.5 }).length > 0);
  assert.ok(validate({ ...p, flowStaminaEfficiencyMin: 0 }).length > 0);
  assert.ok(validate({ ...p, flowStaminaEfficiencyMin: 1.5 }).length > 0);
});

test("flow replays tick for tick", () => {
  const p = { ...mk(), staminaMode: 1 };
  const a = createState(p, 5), b = createState(p, 5);
  const input = (i: number) => ({ ...NEUTRAL_INPUT, lean: 0.3 * Math.sin(i * 0.03), weight: 1, push: i % 90 === 0 });
  for (let i = 0; i < 400; i++) { step(a, input(i), p, SIM_DT, []); step(b, input(i), p, SIM_DT, []); }
  assert.deepEqual(a, b);
});
