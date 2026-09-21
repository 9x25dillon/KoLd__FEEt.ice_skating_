import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gameInput, GAME_PARAMS } from "../game/controls.ts";
import { FULL_SCHEME, defaultControllerProfile, parseControllerProfile, shapeStick } from "../game/full-controls.ts";
import type { Action, GameControlState } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import { createState, step } from "../sim/solver.ts";
import { SIM_DT } from "../sim/params.ts";
import { MOVE, TURN_KIND, SPIN_POSITION } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "../sim/replay.ts";
function rig(speed = 6.8) {
  const p = { ...GAME_PARAMS, musicMode: 0, iceGridMode: 0 };
  const s = createState(p, speed), st: GameControlState = newSchemeState(), profile = defaultControllerProfile();
  const h: ControllerHardware = { connected: true, axes: [-0.5, 0, 0, 0], buttons: Array(16).fill(0), keys: [] };
  h.buttons[7] = 0.38;
  const recorder = new ReplayRecorder(p, speed);
  function tick(autoPush = false) {
    const result = gameInput({ hardware: h, autoPush } as Controls, s, FULL_SCHEME, st, false, p, profile);
    const events: EdgeEvent[] = []; step(s, result.input, p, SIM_DT, events);
    recorder.capture(result.input, p, s, events, "D"); return result;
  }
  function skate(n: number) { for (let i = 0; i < n; i++) tick(); }
  function hold(a: Action, down = true) { const b = profile.bindings[a]; h.buttons[b.button] = Number(down); if (b.modified) h.buttons[profile.modifier] = Number(down); }
  skate(240); return { s, st, h, tick, skate, hold, recorder, profile };
}
test("direct turn buttons produce distinct physical turns from short taps, with D replay parity", () => {
  for (const [action, kind] of Object.entries({ three: TURN_KIND.ThreeTurn, mohawk: TURN_KIND.Mohawk, bracket: TURN_KIND.Bracket, loop: TURN_KIND.Loop, rocker: TURN_KIND.Rocker, counter: TURN_KIND.Counter })) {
    const r = rig(); assert.equal(r.s.fallen, false); const foot = r.s.supportFoot;
    r.hold(action as Action); r.tick(); assert.equal(r.s.move, MOVE.Turn, action);
    r.hold(action as Action, false); r.skate(110);
    assert.equal(r.s.moveDone.detail, kind, action);
    assert.equal(r.s.supportFoot, action === "mohawk" ? 1 - foot : foot, action);
    assert.equal(r.s.fallen, false, `${action} exit`);
    assert.equal(verifyReplay(parseReplay(r.recorder.toJson())).divergence, null, action);
  }
});
test("holding a three-turn cannot cause a loop or repeats; invalid entries are not queued", () => {
  const r = rig(); r.hold("three"); r.skate(120); assert.equal(r.s.moveDone.detail, TURN_KIND.ThreeTurn);
  const tick = r.s.moveDone.tick; r.skate(100); assert.equal(r.s.moveDone.tick, tick);
  const stopped = rig(0); stopped.hold("rocker"); stopped.skate(50); assert.equal(stopped.s.move, MOVE.None); assert.equal(stopped.s.moveDone.tick, -1);
});
test("raw buttons reach glides, twizzles, spin positions and foot change", () => {
  for (const [action, move] of [["ina", MOVE.InaBauer], ["spiral", MOVE.Spiral], ["twizzle", MOVE.Twizzle], ["spin", MOVE.Spin]] as const) {
    const r = rig(); r.hold(action); r.tick(); assert.equal(r.s.move, move, action);
  }
  const r = rig(); r.hold("spin"); r.skate(10); r.h.buttons[7] = 1; r.skate(35); assert.equal(r.s.spin.position, SPIN_POSITION.Sit);
  r.h.buttons[7] = 0; r.h.axes[3] = -1; r.skate(50); assert.equal(r.s.spin.position, SPIN_POSITION.Camel);
  r.h.axes[3] = 0; r.h.buttons[4] = 1; r.skate(20); r.hold("toe"); r.tick(); r.hold("toe", false); r.skate(60); assert.ok(r.s.spin.changeCompletedTick >= 0);
  const low = rig(); low.hold("low"); for (let i = 0; i < 60; i++) { assert.equal(low.tick().cantilever, true); assert.equal(low.s.jump.phase, JUMP_PHASE.None); }
});
test("LT only brakes; RT load and release reaches a toe-assisted jump", () => {
  const r = rig(); r.h.buttons[6] = 1; const b = r.tick(true).input; assert.equal(b.brake, true); assert.equal(b.toe, false); assert.equal(b.push, false, "Cruise cannot fight the brake");
  r.h.buttons[6] = 0; r.h.axes[0] = 0; r.h.buttons[7] = 1; r.skate(45); r.hold("toe"); r.tick(); r.hold("toe", false); r.h.buttons[7] = 0; r.tick();
  assert.equal(r.s.jump.phase, JUMP_PHASE.Air); assert.equal(r.s.jump.toeInLoad, true);
});
test("profiles reject conflicts, reserved buttons and invalid numbers; radial sticks stay bounded", () => {
  const p = defaultControllerProfile(); assert.deepEqual(parseControllerProfile(p), p);
  for (const deadzone of [NaN, Infinity, -0.1, 0.9]) assert.throws(() => parseControllerProfile({ ...p, deadzone }));
  assert.throws(() => parseControllerProfile({ ...p, bindings: { ...p.bindings, spin: p.bindings.push } }));
  assert.throws(() => parseControllerProfile({ ...p, bindings: { ...p.bindings, spin: { button: 7, modified: false } } }));
  assert.deepEqual(shapeStick(0.1, 0.1, p), { x: 0, y: 0 }); const c = shapeStick(1, 1, p); assert.ok(Math.hypot(c.x, c.y) <= 1.00000001);
});
test("releasing a modifier first keeps a held glide in its original bank", () => {
  const r = rig(); r.hold("spiral"); r.tick(); assert.equal(r.s.move,MOVE.Spiral);
  r.h.buttons[r.profile.modifier]=0; r.skate(10); assert.equal(r.s.move,MOVE.Spiral);
  assert.equal(r.st.full?.previous.has("spin"),false);
  r.h.buttons[r.profile.bindings.spiral.button]=0; r.tick(); r.hold("spin");r.tick();assert.equal(r.s.move,MOVE.Spin);
});
test("holding Push through a fall never auto-recovers; a new press does", () => {
  const r = rig(); r.hold("push");r.tick();r.s.fallen=true;r.skate(180);assert.equal(r.s.fallen,true);
  r.hold("push",false);r.tick();r.hold("push");r.tick();assert.equal(r.s.fallen,false);
});
test("keyboard fallback reaches every direct turn on either travel direction", () => {
  for(const speed of [6.8,-6.8]) for(const [key,kind] of [["b",0],["h",1],["n",2],["j",3],["k",4],["l",5]] as const){
    const r=rig(speed);r.h.connected=false;r.h.axes.fill(0);r.h.keys=['a'];r.skate(120);
    r.h.keys.push(key);r.tick();r.h.keys=['a'];r.skate(110);
    assert.equal(r.s.moveDone.detail,kind,`${key} at ${speed}`);
  }
});
