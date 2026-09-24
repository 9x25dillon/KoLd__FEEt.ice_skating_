// The dig under the fore-aft pendulum (2026-09-24, the operator's call: lean
// early). A scraping blade pushes where it meets the ice (test/slip.test.ts's
// dig); with the pendulum on, that is where the ankle has the contact, not
// where the input asks for it. A lean asked at the dig first runs the contact
// the other way — the ankle tips the body toward the toe by pushing on the
// heel — and the body takes longer than the dig to arrive, so the winding
// comes out reversed. Leaned early, the contact is already at the toe and the
// dig winds the body as it did. Nothing in the physics changed for this; the
// asked contact is carried as observability (SkaterState.contactAsked, digL,
// the telemetry CSV, the lab's overlay) and as a test oracle (digOracle).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import { JUMP, JUMP_PHASE } from "../sim/jump.ts";
import { setupParams, SETUPS } from "../game/setups.ts";
import { Telemetry } from "../sim/telemetry.ts";
import { DIG_BASE, arrive, wind, digJump, askedStep } from "./pitch-gain-sweep.ts";

const ORACLE = { ...DIG_BASE, digOracle: 1 };
const OFF = { ...DIG_BASE, pitchMode: 0 };

test("digOracle is 0 by default and in every setup, and validates", () => {
  assert.equal(DEFAULT_PARAMS.digOracle, 0);
  for (const { id } of SETUPS) assert.equal(setupParams(id).digOracle, 0, id);
  assert.deepEqual(validate(ORACLE), []);
  assert.ok(validate({ ...DIG_BASE, digOracle: 2 }).some(e => /digOracle/.test(e)));
  assert.equal(createState(OFF).contactAsked, undefined, "no asked contact without the pendulum");
});

test("leaned late, the dig winds the body the wrong way; leaned early, the right way", () => {
  // MEASURED (toe 0.75 — the lean a forward glide can hold short of the pick):
  // late, the contact averages 0.38 over the dig and the winding is -0.207,
  // the jump's L 0; leaned 1.5 s early, 0.85 and +1.005, a lutz with L 5.09 —
  // 85% of the same dig without the pendulum (1.075, L 5.93).
  const late = wind(DIG_BASE, 0.75), early = wind(DIG_BASE, 0.75, 1.5), off = wind(OFF, 0.75, 1.5);
  assert.ok(Math.abs(late.winding + 0.207) < 0.005 && late.contact < 0.5, `late ${late.winding.toFixed(3)} at ${late.contact.toFixed(2)}`);
  assert.ok(Math.abs(early.winding - 1.005) < 0.005 && early.contact > 0.8, `early ${early.winding.toFixed(3)} at ${early.contact.toFixed(2)}`);
  assert.ok(Math.abs(off.winding - 1.075) < 0.005, `off ${off.winding.toFixed(3)}`);
  assert.equal(digJump(DIG_BASE, 0.75)!.angMomentum, 0);
  const lutz = digJump(DIG_BASE, 0.75, 1.5, true)!;
  assert.equal(lutz.kind, JUMP.Lutz);
  assert.ok(Math.abs(lutz.angMomentum - 5.09) < 0.01, `lutz L ${lutz.angMomentum.toFixed(2)}`);
  assert.ok(Math.abs(digJump(OFF, 0.75, 1.5)!.angMomentum - 5.93) < 0.01);
});

test("the dig pushes only through the contact the ankle has: the telemetry is the physics' own number", () => {
  // The winding the blades gave the body each tick (digL) is exactly what the
  // body's carried spin gained that tick, before the carry's decay; its sign
  // is the actual contact's side, never the asked.
  const p = DIG_BASE, decay = 1 - Math.min(1, SIM_DT / p.turnCarryTime);
  for (const pitch of [0.75, -0.75]) {
    const s = arrive(p, 90, 5, pitch, 0);
    for (let i = 0; i < 36; i++) {
      const before = s.spinCarry;
      step(s, { ...NEUTRAL_INPUT, lean: 0.3, knee: 0.5, pitch }, p, SIM_DT, []);
      assert.ok(Math.abs((before + s.digL! / p.inertiaOpen) * decay - s.spinCarry) < 1e-12, `${pitch}, tick ${i}`);
    }
    const r = wind(p, pitch);
    assert.equal(Math.sign(r.winding), Math.sign(r.contact - 0.5), `${pitch}: winds by the contact at ${r.contact.toFixed(2)}`);
    assert.equal(Math.sign(r.digSum), Math.sign(r.winding));
  }
  // Off the ice there is no contact and no dig.
  const s = createState(DIG_BASE, 5);
  let air = 0;
  for (let i = 0; i < 240; i++) {
    step(s, { ...NEUTRAL_INPUT, knee: i < 40 ? 0.9 : 0.2, pitch: 0.75 }, DIG_BASE, SIM_DT, []);
    if (s.jump.phase === JUMP_PHASE.Air) { air++; assert.equal(s.digL, 0, `tick ${i} in the air`); }
  }
  assert.ok(air > 10, `was airborne (${air} ticks)`);
});

test("asked against actual: a step to the toe runs the contact to the heel first, and arrives in 1.3 s", () => {
  // MEASURED from a 5 m/s glide, asked 0 -> 0.75 (contactS 0.875): the
  // contact goes to 0.126 at once and is within 0.01 of the asked at 1.300 s.
  const r = askedStep(DIG_BASE);
  assert.ok(Math.abs(r.first - 0.126) < 0.005, `first ${r.first.toFixed(3)}`);
  assert.ok(Math.abs(r.arrived - 1.3) < 0.01, `arrived ${r.arrived.toFixed(3)} s`);
  // The lab's CSV carries both, per blade.
  const s = createState(DIG_BASE, 5), t = new Telemetry();
  for (let i = 0; i < 3; i++) { step(s, { ...NEUTRAL_INPUT, knee: 0.5, pitch: 0.75 }, DIG_BASE, SIM_DT, []); t.capture(s); }
  const [head, , , row] = t.toCsv().split("\n").map(l => l.split(","));
  const col = (name: string) => Number(row[head.indexOf(name)]);
  assert.ok(col("R_contact") < 0.5 && col("R_contact_asked") === 0.875, `${col("R_contact")} / ${col("R_contact_asked")}`);
  assert.ok(head.includes("dig_Nms"));
});

test("the oracle: pushed where the input asked, the old numbers come back — pushing where the blade is not", () => {
  // MEASURED, toe 0.8 leaned late: the oracle winds +1.278 and gives the lutz
  // L 6.71 (without the pendulum, 1.276 and 6.52) while the contact the ankle
  // actually has averages 0.37 — the heel half. That is why the old dig's
  // numbers cannot stand under the pendulum.
  const r = wind(ORACLE, 0.8);
  assert.ok(Math.abs(r.winding - 1.278) < 0.005, `oracle ${r.winding.toFixed(3)}`);
  assert.ok(r.contact < 0.4, `while the blade meets the ice at ${r.contact.toFixed(2)}`);
  assert.ok(Math.abs(digJump(ORACLE, 0.8, 0, true)!.angMomentum - 6.71) < 0.01);
  assert.ok(Math.abs(wind(OFF, 0.8).winding - 1.276) < 0.005);
});
