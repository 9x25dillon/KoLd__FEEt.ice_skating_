// Free-foot preparation (game/footprep.ts): presentation read from the
// support signal. Two scripts, both on the Simulation setup's params (the
// weight transfer and the moves on):
// - footwork: pose_clip.mjs --footwork's own: forward crossovers round a
//   counter-clockwise curve (lean +, centre toward perpLeft, so the right foot
//   is outside), a held left outside edge, then a three-turn;
// - strokes: pose_clip.mjs --strokes's own: straight forward stroking.
// The stills record them on the bridge's free mode with --transfer.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { setupParams } from "../game/setups.ts";
import { createState, step } from "../sim/solver.ts";
import { MOVE, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { dot, perpLeft, sub } from "../sim/math.ts";
import { replayDigest } from "../sim/replay.ts";
import { supportSignal } from "../sim/support.ts";
import type { SupportSignal } from "../sim/support.ts";
import { footPrep, HOLD_IN_TIME } from "../game/footprep.ts";
import type { FootPrep } from "../game/footprep.ts";

interface Tick { mark: string; s: SkaterState; g: SupportSignal; prep: [FootPrep, FootPrep] }
type Run = (mark: string, n: number, input: (i: number) => Partial<SkatingInput>) => void;

const P: Params = setupParams("simulation");

function record(script: (run: Run) => void, withPrep = true): { ticks: Tick[]; digests: number[] } {
  const s = createState(P, 6, 0), ticks: Tick[] = [], digests: number[] = [];
  script((mark, n, input) => {
    for (let i = 0; i < n; i++) {
      step(s, { ...NEUTRAL_INPUT, ...input(i) }, P, SIM_DT, []);
      if (withPrep) {
        const g = supportSignal(s);
        ticks.push({ mark, s: structuredClone(s), g, prep: footPrep(s, g) });
      }
      digests.push(replayDigest(s, []));
    }
  });
  return { ticks, digests };
}

const FOOTWORK = (run: Run): void => {
  run("curve", 90, () => ({ lean: 0.3, weight: 0.5, knee: 0.45 }));
  for (let k = 0; k < 4; k++) {
    const foot = k % 2 ? 0 : 1, other = 1 - foot;
    run(foot ? "outside push" : "under push", 72, i => ({ lean: 0.3, weight: i < 24 ? 0.5 : other, knee: 0.55, push: i === 0, pushFoot: foot }));
  }
  run("edge", 90, () => ({ lean: 0.25, weight: 0, knee: 0.5 }));
  run("three-turn", 90, i => ({ lean: 0.2, weight: 0, knee: 0.5, turn: i < 4 }));
  run("back glide", 60, () => ({ lean: -0.15, weight: 0, knee: 0.5 }));
};

const STROKES = (run: Run): void => {
  run("two-foot glide", 60, () => ({ lean: 0, weight: 0.5, knee: 0.4 }));
  for (let k = 0; k < 6; k++) {
    const foot = k % 2, other = 1 - foot;
    run(`push ${foot}`, 72, i => ({ lean: 0, weight: i < 24 ? 0.5 : other, knee: 0.55, push: i === 0, pushFoot: foot }));
  }
};

const footwork = record(FOOTWORK).ticks, strokes = record(STROKES).ticks;
/** m: where a prepared foot is from the skating blade: `out` toward the free foot's own side, `ahead` along the facing. */
const fromCarrier = (k: Tick, free: 0 | 1): { out: number; ahead: number } => {
  const c = sub(k.s.blade[1 - free].contact, k.s.pos), d = sub(k.prep[free].at, c);
  return { out: dot(d, perpLeft(k.s.heading)) * (free === 0 ? 1 : -1), ahead: dot(d, k.s.heading) };
};

test("presentation only: computing the preparation changes no digest, tick for tick", () => {
  for (const script of [FOOTWORK, STROKES]) {
    const a = record(script, true).digests, b = record(script, false).digests;
    assert.equal(a.length, b.length);
    assert.deepEqual(a, b);
  }
});

test("deterministic: the same run gives the same preparation", () => {
  assert.deepEqual(record(FOOTWORK).ticks.map(k => k.prep), footwork.map(k => k.prep));
});

test("weights stay in 0..1, a carrying or sharing foot is never prepared, and 'none' carries no weight", () => {
  for (const k of [...footwork, ...strokes]) for (const i of [0, 1] as const) {
    const p = k.prep[i];
    assert.ok(p.weight >= 0 && p.weight <= 1);
    if (p.pose === "none") assert.equal(p.weight, 0);
    if (k.g.role[i] === "carrying" || k.g.role[i] === "sharing") assert.equal(p.pose, "none", `tick ${k.s.tick} ${k.g.role[i]}`);
  }
});

test("no preparation goes past the skating foot's line: the sim's contacts never cross (pose lab: crossed_frames 0)", () => {
  for (const k of [...footwork, ...strokes]) for (const i of [0, 1] as const) {
    if (k.prep[i].pose === "none") continue;
    const at = fromCarrier(k, i);
    assert.ok(at.out >= 0.01, `tick ${k.s.tick} ${k.prep[i].pose} out ${at.out.toFixed(3)}`);
  }
});

test("crossover: the outside foot that pushed is carried forward in front of the skating foot", () => {
  const crossing = footwork.filter(k => k.mark === "outside push" && k.g.role[1] === "free");
  assert.ok(crossing.length > 10);
  for (const k of crossing) {
    assert.equal(k.prep[1].pose, "cross");
    assert.ok(k.prep[1].weight > 0.99);
    const at = fromCarrier(k, 1);
    assert.ok(at.ahead > 0.1 && at.out < 0.05, `out ${at.out.toFixed(3)} ahead ${at.ahead.toFixed(3)}`);
  }
  // Placed while the inside foot pushes under: the crossing gives way as the share comes on.
  const placing = footwork.filter(k => k.mark === "under push" && k.g.role[1] === "taking");
  assert.ok(placing.length > 10 && placing.every(k => k.prep[1].pose === "cross"));
  assert.ok(placing.every(k => Math.abs(k.prep[1].weight - (1 - k.g.share[1])) < 1e-9));
});

test("crossover: the inside foot that pushed under is carried behind the skating foot, and placed from there", () => {
  const under = footwork.filter(k => k.mark === "under push" && k.g.role[0] === "free");
  assert.ok(under.length > 10);
  for (const k of under) {
    assert.equal(k.prep[0].pose, "under");
    assert.ok(fromCarrier(k, 0).ahead < -0.15);
  }
  const placing = footwork.filter(k => k.mark === "outside push" && k.g.role[0] === "taking" && k.s.tick > 162);
  assert.ok(placing.length > 10 && placing.every(k => k.prep[0].pose === "under"));
  assert.ok(placing.every(k => Math.abs(k.prep[0].weight - (1 - k.g.share[0])) < 1e-9));
});

test("a held edge after the crossovers: the foot that didn't push carries nothing", () => {
  const held = footwork.filter(k => k.mark === "edge" && k.g.phase === "one");
  assert.ok(held.length > 30 && held.every(k => k.s.crossover));
  assert.ok(held.every(k => k.prep[1].pose === "none"));
});

test("straight strokes: the pushing foot recovers in beside the skating heel as its push ends, and is placed from there", () => {
  // Fades in over the push's last RECOVER_TIME, set while still giving and planted.
  const recovered = strokes.filter(k => k.mark.startsWith("push") && k.g.role[k.s.strokeFoot] === "free");
  assert.ok(recovered.length > 30);
  for (const k of recovered) {
    const p = k.prep[k.s.strokeFoot];
    assert.equal(p.pose, "beside");
    assert.ok(p.weight > 0.99);
    const at = fromCarrier(k, k.s.strokeFoot);
    assert.ok(at.out < 0.15 && at.ahead < 0 && at.ahead > -0.2, `out ${at.out.toFixed(3)} ahead ${at.ahead.toFixed(3)}`);
  }
  const placing = strokes.filter(k => k.s.strokeTime > 0 && k.g.role[1 - k.s.strokeFoot] === "taking");
  assert.ok(placing.length > 30);
  assert.ok(placing.every(k => { const p = k.prep[1 - k.s.strokeFoot]; return p.pose === "beside" && Math.abs(p.weight - (1 - k.g.share[1 - k.s.strokeFoot])) < 1e-9; }));
});

test("three-turn: the free foot comes in and is held by the skating ankle through the pivot, and lets go after", () => {
  const turning = footwork.filter(k => k.s.move === MOVE.Turn);
  assert.ok(turning.length > 20);
  assert.ok(turning.every(k => k.prep[1].pose === "held" && k.prep[0].pose === "none"));
  // It comes in over HOLD_IN_TIME, rising throughout.
  assert.ok(turning.slice(1).every((k, i) => k.prep[1].weight >= turning[i].prep[1].weight));
  assert.ok(turning.filter(k => k.s.turn.t >= HOLD_IN_TIME).every(k => k.prep[1].weight > 0.99));
  for (const k of turning) {
    const at = fromCarrier(k, 1);
    assert.ok(at.out < 0.1 && Math.abs(at.ahead) < 0.12 && k.prep[1].lift > 0.1, `out ${at.out.toFixed(3)} ahead ${at.ahead.toFixed(3)}`);
  }
  assert.ok(footwork.filter(k => k.mark === "back glide").every(k => k.prep[1].pose === "none"));
});

test("in the air and down, nothing is prepared", () => {
  const s = createState(P, 6, 0);
  s.fallen = true;
  assert.deepEqual(footPrep(s, supportSignal(s)).map(p => p.pose), ["none", "none"]);
});
