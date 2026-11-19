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

import { DEFAULT_PARAMS, PRESETS, SIM_DT } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { SETUPS, setupParams } from "../game/setups.ts";
import { CROSS_HALF_ALONG, CROSS_HALF_WIDTH, createState, step } from "../sim/solver.ts";
import { MOVE, NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { dot, len, perpLeft, sub } from "../sim/math.ts";
import { replayDigest } from "../sim/replay.ts";
import { supportSignal } from "../sim/support.ts";
import type { SupportSignal } from "../sim/support.ts";
import { footPrep, HOLD_IN_TIME, EXTEND_SPEED, EXTEND_FLAT_DWELL, EXTEND_EDGE_DWELL } from "../game/footprep.ts";
import type { FootPrep } from "../game/footprep.ts";

interface Tick { mark: string; s: SkaterState; g: SupportSignal; prep: [FootPrep, FootPrep] }
type Run = (mark: string, n: number, input: (i: number) => Partial<SkatingInput>) => void;

const P: Params = setupParams("simulation");

function record(script: (run: Run) => void, withPrep = true, params: Params = P): { ticks: Tick[]; digests: number[] } {
  const s = createState(params, 6, 0), ticks: Tick[] = [], digests: number[] = [];
  script((mark, n, input) => {
    for (let i = 0; i < n; i++) {
      step(s, { ...NEUTRAL_INPUT, ...input(i) }, params, SIM_DT, []);
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

test("crossPlaceMode is 0 in every preset and setup", () => {
  assert.equal(DEFAULT_PARAMS.crossPlaceMode, 0);
  for (const [name, preset] of Object.entries(PRESETS)) assert.equal(preset.crossPlaceMode, 0, name);
  for (const { id } of SETUPS) assert.equal(setupParams(id).crossPlaceMode, 0, id);
});

test("crossPlaceMode 0: replay digests are byte-identical with crossPlaceMode explicitly 0", () => {
  const explicitOff: Params = { ...P, crossPlaceMode: 0 };
  for (const script of [FOOTWORK, STROKES]) {
    const a = record(script, false, P).digests;
    const b = record(script, false, explicitOff).digests;
    assert.deepEqual(a, b);
  }
});

test("crossPlaceMode 1: outside blade crosses past skating blade with clearance, COP follows, and footPrep follows it", () => {
  const pCross: Params = { ...P, crossPlaceMode: 1 };
  const ticks = record(FOOTWORK, true, pCross).ticks;
  const underTwoFoot = ticks.filter(k => k.mark === "under push" && k.s.supportMode === 2);
  assert.ok(underTwoFoot.length > 50, `expected >50 crossed two-foot ticks, got ${underTwoFoot.length}`);
  for (const k of underTwoFoot) {
    assert.equal(k.s.crossed, true);
    const d = sub(k.s.blade[0].contact, k.s.blade[1].contact);
    const lat = dot(d, perpLeft(k.s.heading));
    const along = dot(d, k.s.heading);
    // Left (inside) is to the right of Right (outside), separated by 2 * CROSS_HALF_WIDTH laterally
    // and 2 * CROSS_HALF_ALONG fore-aft: no interpenetration.
    assert.ok(lat < -(2 * CROSS_HALF_WIDTH - 1e-6), `lat ${lat.toFixed(4)}`);
    assert.ok(along < -(2 * CROSS_HALF_ALONG - 1e-6), `along ${along.toFixed(4)}`);
    assert.ok(len(d) >= Math.hypot(2 * CROSS_HALF_WIDTH, 2 * CROSS_HALF_ALONG) - 1e-6);
    // Support signal COP matches share-weighted contacts.
    const w0 = k.g.share[0], w1 = k.g.share[1];
    assert.ok(Math.abs(k.g.cop.x - (k.s.blade[0].contact.x * w0 + k.s.blade[1].contact.x * w1)) < 1e-9);
    assert.ok(Math.abs(k.g.cop.y - (k.s.blade[0].contact.y * w0 + k.s.blade[1].contact.y * w1)) < 1e-9);
  }
  // footPrep follows the crossing when crossPlaceMode is on.
  const crossing = ticks.filter(k => k.mark === "outside push" && k.g.role[1] === "free");
  assert.ok(crossing.length > 10);
  for (const k of crossing) {
    assert.equal(k.prep[1].pose, "cross");
    assert.ok(fromCarrier(k, 1).out < -0.05, `expected crossed prep out < -0.05, got ${fromCarrier(k, 1).out.toFixed(3)}`);
  }
  // Uncrossed again on the left outside edge after the crossovers.
  const edgeTwoFoot = ticks.filter(k => k.mark === "edge" && k.s.supportMode === 2);
  assert.ok(edgeTwoFoot.length > 0 && edgeTwoFoot.every(k => k.s.crossed === false));
});

test("crossPlaceMode 1: clockwise crossovers mirror counter-clockwise exactly", () => {
  const pCross: Params = { ...P, crossPlaceMode: 1 };
  const CW_FOOTWORK = (run: Run): void => {
    run("curve", 90, () => ({ lean: -0.3, weight: 0.5, knee: 0.45 }));
    for (let k = 0; k < 4; k++) {
      const foot = k % 2 ? 1 : 0, other = 1 - foot;
      run(foot === 0 ? "outside push" : "under push", 72, i => ({ lean: -0.3, weight: i < 24 ? 0.5 : other, knee: 0.55, push: i === 0, pushFoot: foot }));
    }
  };
  const cw = record(CW_FOOTWORK, true, pCross).ticks;
  const underTwoFoot = cw.filter(k => k.mark === "under push" && k.s.supportMode === 2);
  assert.ok(underTwoFoot.length > 50);
  for (const k of underTwoFoot) {
    assert.equal(k.s.crossed, true);
    const d = sub(k.s.blade[0].contact, k.s.blade[1].contact);
    // Still Left to the right of Right (lat < 0), and now Left (outside) is ahead of Right (inside) (along > 0).
    assert.ok(dot(d, perpLeft(k.s.heading)) < -(2 * CROSS_HALF_WIDTH - 1e-6));
    assert.ok(dot(d, k.s.heading) > 2 * CROSS_HALF_ALONG - 1e-6);
  }
});

test("glide recovery: long flat glide blends beside -> extended without pops, no sim change", () => {
  const LONG_GLIDE = (run: Run): void => {
    run("push 0", 72, i => ({ lean: 0, weight: i < 24 ? 0.5 : 1, knee: 0.55, push: i === 0, pushFoot: 0 }));
    run("long glide", 240, () => ({ lean: 0, weight: 1, knee: 0.45 }));
  };
  const withP = record(LONG_GLIDE, true);
  const withoutP = record(LONG_GLIDE, false);
  assert.deepEqual(withP.digests, withoutP.digests);
  const glide = withP.ticks.filter(k => k.mark === "long glide" && k.g.phase === "one");
  assert.ok(glide.length > 200);
  // Early in the glide (short dwell): still beside.
  const early = glide.filter(k => k.s.blade[1].dwell < EXTEND_FLAT_DWELL[0]);
  assert.ok(early.length > 10 && early.every(k => k.prep[0].pose === "beside"));
  // Late in the glide (past EXTEND_FLAT_DWELL[1]): extended behind, off the ice.
  const late = glide.filter(k => k.s.blade[1].dwell >= EXTEND_FLAT_DWELL[1]);
  assert.ok(late.length > 30 && late.every(k => k.prep[0].pose === "extended" && k.prep[0].lift > 0.14));
  for (const k of late) {
    const at = fromCarrier(k, 0);
    assert.ok(at.ahead < -0.35 && at.out >= 0.01, `out ${at.out.toFixed(3)} ahead ${at.ahead.toFixed(3)}`);
  }
  // Smooth blend across beside -> extended while on the same edge: no single-tick jump.
  let maxStep = 0, blendedTicks = 0;
  for (let i = 1; i < glide.length; i++) {
    if (glide[i].s.blade[1].code !== glide[i - 1].s.blade[1].code) continue;
    blendedTicks++;
    const a = fromCarrier(glide[i - 1], 0), b = fromCarrier(glide[i], 0);
    maxStep = Math.max(maxStep, Math.hypot(b.out - a.out, b.ahead - a.ahead, glide[i].prep[0].lift - glide[i - 1].prep[0].lift));
  }
  assert.ok(blendedTicks > 150 && maxStep < 0.02, `beside <-> extended step ${maxStep.toFixed(4)} m`);
});

test("glide recovery: carved edge glide extends sooner than flat, stays off skating line, and slow glide stays beside", () => {
  const EDGE_GLIDE = (run: Run): void => {
    run("push 0", 48, i => ({ lean: 0, weight: i < 24 ? 0.5 : 1, knee: 0.55, push: i === 0, pushFoot: 0 }));
    run("edge glide", 180, () => ({ lean: -0.25, weight: 1, knee: 0.5 }));
  };
  const edge = record(EDGE_GLIDE, true).ticks.filter(k => k.mark === "edge glide" && k.g.phase === "one");
  const extended = edge.filter(k => k.prep[0].pose === "extended");
  assert.ok(extended.length > 30, `expected extended ticks on carved edge, got ${extended.length}`);
  // Extends before EXTEND_FLAT_DWELL[0] because edge depth brings in EXTEND_EDGE_DWELL.
  assert.ok(extended[0].s.blade[1].dwell < EXTEND_FLAT_DWELL[0] && extended[0].s.blade[1].dwell >= EXTEND_EDGE_DWELL[0]);
  for (const k of extended) {
    assert.ok(fromCarrier(k, 0).out >= 0.01, `never crosses skating line: out ${fromCarrier(k, 0).out.toFixed(3)}`);
  }
  // Slow glide (< EXTEND_SPEED[0]): stays beside even at high dwell.
  const s = createState(P, EXTEND_SPEED[0] * 0.5, 0);
  s.strokeFoot = 0;
  s.strokeTime = 0;
  s.blade[0].inContact = false; s.blade[0].weight = 0;
  s.blade[1].inContact = true; s.blade[1].weight = 1; s.blade[1].dwell = 3.0;
  s.supportMode = 1; s.supportFoot = 1;
  const pSlow = footPrep(s, supportSignal(s));
  assert.equal(pSlow[0].pose, "beside");
});
