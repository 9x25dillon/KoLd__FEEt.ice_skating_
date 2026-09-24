// The Dig Gate setup (2026-09-24): Experimental's athlete with a phase-gated
// dig on LB + RB. The gate only asks — it eases the ankle onto the toe, waits
// for the contact the ankle actually has to arrive, turns the feet across,
// then eases the lean back out; the blades do the digging (test/dig.test.ts).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { setupParams, setupInput, SETUPS } from "../game/setups.ts";
import { defaultControllerProfile, digStatus, DIG_ASK } from "../game/full-controls.ts";
import type { GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";

/** From `speed` (negative: backward), both sticks at `lx`, LB + RB held over `hold` s; the gate's phases as they change. */
function dig(speed: number, lx: number, hold: [number, number] = [0.25, 2.5], T = 5) {
  const p = setupParams("diggate"), s = createState(p, speed), profile = defaultControllerProfile();
  const st: GameControlState = newSchemeState();
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const phases: string[] = [], status = new Set<string>();
  let winding = 0, leanDigL = 0, leanFeet = 0;
  for (let i = 0; i < T / SIM_DT && !s.fallen; i++) {
    const t = i * SIM_DT;
    h.buttons.fill(0); h.buttons[1] = h.buttons[2] = i < 2 ? 1 : 0; h.axes = [lx, 0, lx, 0];
    if (t >= hold[0] && t < hold[1]) h.buttons[4] = h.buttons[5] = 1;
    const { input } = setupInput({ hardware: h } as Controls, s, "diggate", st, p, profile);
    step(s, input, p, SIM_DT, []);
    const g = st.full!.dig;
    const phase = g?.phase ?? "idle";
    if (phases.at(-1)?.split("@")[0] !== phase) phases.push(`${phase}@${t.toFixed(2)}`);
    if (phase === "dig") winding += s.digL ?? 0;
    if (phase === "lean") { leanDigL += Math.abs(s.digL ?? 0); leanFeet = Math.max(leanFeet, Math.abs(input.toeOutSplit ?? 0)); }
    status.add(digStatus(st.full).split(" · ")[1] ?? "");
  }
  return { s, g: st.full!.dig!, phases, winding, leanDigL, leanFeet, status };
}

test("Dig Gate is Experimental's athlete, listed as a fifth setup", () => {
  assert.ok(SETUPS.some(x => x.id === "diggate"));
  assert.deepEqual(setupParams("diggate"), setupParams("experimental"));
});

test("skating backward, LB + RB: lean eased in, the contact arrives, the feet turn, the lean eases out — and the dig winds the way the skater curves", () => {
  // MEASURED from 3-7 m/s backward, both sticks 0.3 either way: lean from
  // 0.25 s, the contact arrives and the dig begins at 1.50 s (lean early),
  // 0.5 s of dig, recovered at 3.00 s; the blades wind the body 0.64-0.76
  // N m s with the lean (-0.61 to -0.72 the other way); no falls.
  for (const v of [-3, -5, -7]) for (const lx of [0.3, -0.3]) {
    const r = dig(v, lx);
    assert.equal(r.s.fallen, false, `${v} m/s, ${lx}`);
    assert.deepEqual(r.phases.map(x => x.split("@")[0]), ["idle", "lean", "dig", "recover", "idle"], r.phases.join(" "));
    const digAt = Number(r.phases[2].split("@")[1]);
    assert.ok(Math.abs(digAt - 1.5) < 0.02, `dig at ${digAt}`);
    assert.equal(r.g.leanEarly, true);
    assert.equal(r.g.applied, true);
    assert.equal(Math.sign(r.winding), Math.sign(lx), `winds with the lean (${r.winding.toFixed(2)})`);
    assert.ok(Math.abs(r.winding) > 0.6 && Math.abs(r.winding) < 0.8, `${v} m/s, ${lx}: ${r.winding.toFixed(2)}`);
  }
});

test("the gate never turns the feet before the contact is there, and never pushes the body itself", () => {
  // While it leans, the feet stay as they were and the blades wind nothing;
  // the dig is whatever the scraping blades do once they are turned.
  const r = dig(-5, 0.3);
  assert.equal(r.leanFeet, 0, "no feet in the lean phase");
  assert.ok(r.leanDigL < 1e-6, `no winding while leaning (${r.leanDigL})`);
});

test("going forward it waits for backward travel", () => {
  // MEASURED: the same dig skated forward, 3-7 m/s, either lean, feet either
  // way round, put the skater down 10 times in 10 (lean exceeded). So from
  // 5 m/s forward the gate waits, asks nothing, and the skater glides on.
  const r = dig(5, 0.3);
  assert.deepEqual(r.phases.map(x => x.split("@")[0]), ["idle", "wait", "idle"]);
  assert.equal(r.winding, 0);
  assert.equal(r.s.fallen, false);
  assert.ok(r.status.has("skate backward"));
});

test("let go mid-lean and the gate eases back out without digging", () => {
  const r = dig(-5, 0.3, [0.25, 0.75]);
  assert.deepEqual(r.phases.map(x => x.split("@")[0]), ["idle", "lean", "recover", "idle"], r.phases.join(" "));
  assert.equal(r.g.applied, false);
  assert.equal(r.s.fallen, false);
  assert.ok(DIG_ASK === 0.4);
});
