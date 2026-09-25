// The takeoff's torque budget (SkaterState.torqueBudget, test/takeoff-budget.ts)
// is observability: attached, it changes nothing the skater does; and what it
// records adds up — the ice gives all the trunk needs while the edges hold,
// and only the scrape's share of their grip once the feet pivot.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step, checksum } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { attempt, budgetParams } from "./takeoff-budget.ts";

const p60 = budgetParams().armsWhipTorque;

test("the torque budget is never there unless a tool attaches it, and attached it moves nothing", () => {
  const p = budgetParams();
  assert.equal(createState(p, -6).torqueBudget, undefined);
  const input = { ...NEUTRAL_INPUT, lean: -0.8, weight: 1, knee: 1, windup: -0.7, carriage: 1 };
  const bare = createState(p, -6), watched = createState(p, -6);
  watched.torqueBudget = { armsAsked: 0, arms: 0, trunk: 0, leg: 0, need: 0, cap: 0, ice: 0, pivoting: false, Il: 0, Iu: 0 };
  for (let i = 0; i < 240; i++) {
    step(bare, input, p, SIM_DT, []);
    step(watched, input, p, SIM_DT, []);
    assert.equal(checksum(watched), checksum(bare), `tick ${i}`);
  }
  assert.ok(watched.torqueBudget!.Il > 0, "the trunk solve filled it");
});

test("the budget adds up: held, the ice gives what is needed; pivoting, the scrape's share of the grip", () => {
  let held = 0, pivoted = 0;
  for (const kind of ["pad", "direct"] as const) {
    const r = attempt(kind, budgetParams());
    for (const f of r.frames) {
      const b = f.budget;
      if (!b || f.phase === JUMP_PHASE.Air) continue;
      if (!b.pivoting) {
        held++;
        assert.ok(Math.abs(b.need) <= b.cap + 1e-9 && b.ice === b.need, `held at ${f.t.toFixed(3)}`);
      } else {
        pivoted++;
        assert.ok(Math.abs(b.need) > b.cap && Math.abs(b.ice) < b.cap && Math.sign(b.ice) === Math.sign(b.need), `pivoting at ${f.t.toFixed(3)}`);
      }
      assert.ok(Math.abs(b.arms) <= p60 + 1e-9 && Math.abs(b.arms) <= Math.abs(b.armsAsked) + 1e-9);
    }
  }
  assert.ok(held > 0 && pivoted > 0, `both regimes seen: ${held} held, ${pivoted} pivoting`);
});
