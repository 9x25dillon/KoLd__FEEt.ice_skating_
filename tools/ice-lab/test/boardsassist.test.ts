// The learner's boards (Params.boardsAssistMode; the owner, 2026-11-27: Beginner mode and the tutorial
// lessons). No bounce, no crash, back on the ice; slow against the boards she pushes off along her blade.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupParams } from "../game/setups.ts";
import { BEGINNER_PARAMS } from "../game/beginner.ts";
import { BOARDS_CLEARANCE, BOARDS_PUSH_OFF, RINK, resolveRinkCollision, rinkHit } from "../game/rink.ts";
import { createState, step } from "../sim/solver.ts";
import { FALL, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay } from "../sim/replay.ts";
import { IceGrid } from "../sim/ice.ts";

function placed(p: Params, speed: number, hx: number, hy: number, x: number, y: number): SkaterState {
  const s = createState(p, speed);
  s.heading = { x: hx, y: hy }; s.vel = { x: hx * speed, y: hy * speed }; s.pos = { x, y };
  for (const b of s.blade) { b.tangent = { ...s.heading }; b.contact = { x, y }; }
  return s;
}
/** Seconds within 2 mm of the right-hand boards slower than 0.1 m/s (docs/boardsgap-2026-11.md's stuck proxy). */
function stuck(p: Params, s: SkaterState, input: (k: number) => SkatingInput, seconds: number) {
  let t = 0, fell = false;
  for (let k = 0; k < seconds / SIM_DT; k++) {
    const ev: never[] = [];
    step(s, input(k), p, SIM_DT, ev);
    resolveRinkCollision(s, ev, p);
    fell ||= s.fallen;
    if (RINK.maxX - s.pos.x < 0.002 && Math.hypot(s.vel.x, s.vel.y) < 0.1) t += SIM_DT;
  }
  return { t, fell };
}
const tap = (k: number) => ({ ...NEUTRAL_INPUT, push: k % 42 === 0 });

test("off by default; 0 is the boards exactly as before, byte for byte", () => {
  assert.equal(DEFAULT_PARAMS.boardsAssistMode, 0);
  assert.deepEqual(validate({ ...DEFAULT_PARAMS, boardsAssistMode: 2 }).some(e => /boardsAssistMode/.test(e)), true);
  for (const speed of [1, 2, 5]) {
    const a = placed(DEFAULT_PARAMS, speed, 1, 0, 28.05, 18), b = placed(DEFAULT_PARAMS, speed, 1, 0, 28.05, 18);
    const ea: never[] = [], eb: never[] = [];
    resolveRinkCollision(a, ea); resolveRinkCollision(b, eb, { ...DEFAULT_PARAMS });
    assert.deepEqual([a, ea], [b, eb]);
  }
});

test("a hit at crash speed: the hard boards put her down, the learner's take the speed away", () => {
  for (const mode of [0, 1]) {
    const p = { ...setupParams("simulation"), boardsAssistMode: mode };
    const s = placed(p, 5, 1, 0, 28.02, 18), ev: { type: number }[] = [];
    resolveRinkCollision(s, ev as never[], p);
    if (mode === 0) assert.equal(s.fallReason, FALL.Collision);
    else {
      assert.equal(s.fallen, false); assert.equal(ev.length, 0);
      assert.ok(s.vel.x <= -BOARDS_PUSH_OFF + 1e-12, "pushed back off along her blade");
      assert.ok(Math.abs(RINK.maxX - s.pos.x - BOARDS_CLEARANCE) < 1e-9, "1 mm inside");
    }
  }
});

test("along the boards at speed she slides: the speed along them is kept, no push-off", () => {
  const p = { ...setupParams("simulation"), boardsAssistMode: 1 };
  const s = placed(p, 3, 0, 1, 28.01, 18);
  s.vel = { x: 0.4, y: 3 };   // drifting into the boards while gliding along them
  resolveRinkCollision(s, [], p);
  assert.deepEqual(s.vel, { x: 0, y: 3 });
  assert.equal(rinkHit(s.pos.x, s.pos.y), null);
});

for (const [label, base] of [["Beginner", BEGINNER_PARAMS], ["Explorer", setupParams("explorer")], ["Simulation", setupParams("simulation")]] as const) {
  test(`${label}: standing against the boards pushing into them, she gets away (hard boards: stuck)`, () => {
    const hard = stuck({ ...base, boardsAssistMode: 0, boardsUnstickMode: 0 }, placed(base, 0, 1, 0, 27.999, 18), tap, 10);
    const soft = stuck({ ...base, boardsAssistMode: 1 }, placed(base, 0, 1, 0, 27.999, 18), tap, 10);
    assert.ok(hard.t >= 4.5, `hard boards stuck ${hard.t.toFixed(1)} s (the problem this solves)`);
    assert.ok(soft.t < 0.5 && !soft.fell, `assisted stuck ${soft.t.toFixed(1)} s, fell ${soft.fell}`);
  });
}

test("every mode, boardsUnstickMode: never stuck at the boards, but the hard boards still bounce and crash", () => {
  for (const setup of ["simulation", "explorer", "experimental", "repertoire", "diggate"] as const) {
    const p = setupParams(setup);
    assert.deepEqual([p.boardsUnstickMode, p.boardsAssistMode], [1, 0], `${setup}: on, and not the learner's boards`);
    const r = stuck(p, placed(p, 0, 1, 0, 27.999, 18), tap, 10);
    assert.ok(r.t < 0.5 && !r.fell, `${setup}: stuck ${r.t.toFixed(1)} s`);
    const crash = placed(p, 5, 1, 0, 28.02, 18);
    resolveRinkCollision(crash, [], p);
    assert.equal(crash.fallReason, FALL.Collision, `${setup}: a 5 m/s hit is still a crash`);
  }
});

test("an assisted run records and plays back the same: the mode rides in the clip's Params", () => {
  // Recorded as game/main.ts and the bridge do: step, capture, then the boards; played back the
  // same way, the boards answered from the clip's own Params.
  const p = { ...setupParams("explorer"), boardsAssistMode: 1 }, rec = new ReplayRecorder(p, 0);
  const s = createState(p, 0), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const at = Math.atan2(s.heading.y, s.heading.x);
  let touched = 0;
  for (let k = 0; k < 4800; k++) {
    const input = tap(k), ev: never[] = [];
    step(s, input, p, SIM_DT, ev, ice); rec.capture(input, p, s, ev);
    if (rinkHit(s.pos.x, s.pos.y)) touched++;
    resolveRinkCollision(s, ev, p);
  }
  assert.ok(touched > 0, `the run reaches the boards (heading ${at.toFixed(2)} rad)`);
  const clip = parseReplay(rec.toJson());
  assert.equal(clip.initial.params.boardsAssistMode, 1);
  const player = new ReplayPlayer(clip);
  while (!player.done) { player.advance(); resolveRinkCollision(player.state, player.events, player.params); }
  assert.equal(player.divergence, null);
  assert.deepEqual(player.state.pos, s.pos);
});

test("a clip recorded before boardsAssistMode still loads, as 0", () => {
  const p = setupParams("simulation"), rec = new ReplayRecorder(p, 2);
  const s = createState(p, 2), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  for (let k = 0; k < 30; k++) { const ev: never[] = []; step(s, NEUTRAL_INPUT, p, SIM_DT, ev, ice); rec.capture(NEUTRAL_INPUT, p, s, ev); }
  const old = JSON.parse(rec.toJson());
  delete old.initial.params.boardsAssistMode;
  const clip = parseReplay(JSON.stringify(old));
  assert.equal(clip.initial.params.boardsAssistMode, 0);
  const player = new ReplayPlayer(clip);
  while (!player.done) player.advance();
  assert.equal(player.divergence, null);
});
