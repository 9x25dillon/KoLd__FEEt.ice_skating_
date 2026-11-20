// Free-foot preparation (game/footprep.ts): presentation read from the
// support signal. Two scripts, both on the Simulation setup's params (the
// weight transfer and the moves on):
// - footwork: pose_clip.mjs --footwork's own: forward crossovers round a
//   counter-clockwise curve (lean +, centre toward perpLeft, so the right foot
//   is outside), a held left outside edge, then a three-turn;
// - strokes: pose_clip.mjs --strokes's own: straight forward stroking.
// The stills record them on the bridge's free mode with --transfer.
// Both run with crossPlaceMode 0, pinned here: the Simulation setup ships it
// on (2026-11-20), and these are the uncrossed baseline (pose lab
// crossed_frames 0). The crossPlaceMode tests below use the shipped setup.

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

/** The shipped Simulation setup: crossPlaceMode 1 since 2026-11-20. */
const P_ON: Params = setupParams("simulation");
/** The same with crossPlaceMode explicitly 0: this file's uncrossed baseline. */
const P: Params = { ...P_ON, crossPlaceMode: 0 };

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

test("crossPlaceMode: 0 in every preset; on in Simulation, Experimental and Dig Gate, off in Explorer and Repertoire", () => {
  // The owner's pick, 2026-11-20: on where the legs move the load over time
  // (weightTransferMode), off where the contacts switch without a hand-over.
  assert.equal(DEFAULT_PARAMS.crossPlaceMode, 0);
  for (const [name, preset] of Object.entries(PRESETS)) assert.equal(preset.crossPlaceMode, 0, name);
  const on = new Set(["simulation", "experimental", "diggate"]);
  for (const { id } of SETUPS) {
    assert.equal(setupParams(id).crossPlaceMode, on.has(id) ? 1 : 0, id);
    if (on.has(id)) assert.equal(setupParams(id).weightTransferMode, 1, id);
  }
});

test("crossPlaceMode 0: replay digests are byte-identical with crossPlaceMode explicitly 0", () => {
  // Explorer ships the mode off: its own params and the same with an explicit 0 replay identically.
  const explorer = setupParams("explorer");
  for (const script of [FOOTWORK, STROKES]) {
    const a = record(script, false, explorer).digests;
    const b = record(script, false, { ...explorer, crossPlaceMode: 0 }).digests;
    assert.deepEqual(a, b);
  }
});

/**
 * A crossover in the order it is skated (2026-11-20): the outside foot pushes
 * while the inside carries; then it crosses over and takes the load, and only
 * then does the inside foot push under. dir +1 counter-clockwise (lean +, the
 * right foot outside), -1 clockwise.
 */
const crossovers = (dir: 1 | -1) => (run: Run): void => {
  const inside = dir > 0 ? 0 : 1, outside = 1 - inside;
  run("curve", 90, () => ({ lean: 0.3 * dir, weight: 0.5, knee: 0.45 }));
  for (let k = 0; k < 4; k++) {
    run("outside push", 72, i => ({ lean: 0.3 * dir, weight: i < 24 ? 0.5 : inside, knee: 0.55, push: i === 0, pushFoot: outside }));
    run("under push", 72, i => ({ lean: 0.3 * dir, weight: outside, knee: 0.55, push: i === 18, pushFoot: inside }));
  }
  run("edge", 90, () => ({ lean: 0.25 * dir, weight: inside, knee: 0.5 }));
};

/**
 * Ticks whose push was live when the tick's gate ran. A recorded state is
 * after the step, whose stroke clock has already counted that tick down (to
 * about 0 on the push's last tick, where it then stays).
 */
const pushingTicks = (t: Tick[]): Tick[] =>
  t.filter((k, j) => k.s.strokeTime > 1e-9 || (j > 0 && t[j - 1].s.strokeTime > 1e-9));

/** Every live under-push tick is crossed, and every two-foot one is clear and balanced over its contacts. */
function assertCrossed(ticks: Tick[], dir: 1 | -1): void {
  const inside = dir > 0 ? 0 : 1, outside = 1 - inside;
  const pushing = new Set(pushingTicks(ticks));
  const live = ticks.filter(k => k.mark === "under push" && pushing.has(k));
  assert.ok(live.length > 100, `live under-push ticks ${live.length}`);
  assert.ok(live.every(k => k.s.crossed === true), "every live under-push tick crossed");
  const twoFoot = live.filter(k => k.s.supportMode === 2);
  assert.ok(twoFoot.length > 50, `expected >50 crossed two-foot ticks, got ${twoFoot.length}`);
  for (const k of twoFoot) {
    // The inside blade is past the outside blade's line, toward the outside,
    // and behind it: 2 * CROSS_HALF_WIDTH across, 2 * CROSS_HALF_ALONG fore-aft.
    const d = sub(k.s.blade[inside].contact, k.s.blade[outside].contact);
    const lat = dot(d, perpLeft(k.s.heading)) * dir, along = dot(d, k.s.heading);
    assert.ok(lat < -(2 * CROSS_HALF_WIDTH - 1e-6), `lat ${lat.toFixed(4)}`);
    assert.ok(along < -(2 * CROSS_HALF_ALONG - 1e-6), `along ${along.toFixed(4)}`);
    assert.ok(len(d) >= Math.hypot(2 * CROSS_HALF_WIDTH, 2 * CROSS_HALF_ALONG) - 1e-6);
    // The support signal's centre of pressure is the share-weighted contacts.
    const w0 = k.g.share[0], w1 = k.g.share[1];
    assert.ok(Math.abs(k.g.cop.x - (k.s.blade[0].contact.x * w0 + k.s.blade[1].contact.x * w1)) < 1e-9);
    assert.ok(Math.abs(k.g.cop.y - (k.s.blade[0].contact.y * w0 + k.s.blade[1].contact.y * w1)) < 1e-9);
  }
  // Off the moment the push ends, and never outside an under-push.
  const stray = ticks.filter(k => k.s.crossed && (!pushing.has(k) || k.mark !== "under push"));
  assert.deepEqual(stray.map(k => `${k.s.tick} ${k.mark} ${k.s.strokeTime.toFixed(4)}`), []);
  assert.ok(ticks.every(k => !k.s.fallen));
}

test("crossPlaceMode 1: a crossover's under-push crosses the blades with clearance, COP follows, and footPrep follows it", () => {
  const ticks = record(crossovers(1), true, P_ON).ticks;
  assertCrossed(ticks, 1);
  // footPrep carries the outside foot across while it is free after its push.
  const crossing = ticks.filter(k => k.mark === "outside push" && k.g.role[1] === "free");
  assert.ok(crossing.length > 10);
  for (const k of crossing) {
    assert.equal(k.prep[1].pose, "cross");
    assert.ok(fromCarrier(k, 1).out < -0.05, `expected crossed prep out < -0.05, got ${fromCarrier(k, 1).out.toFixed(3)}`);
  }
});

test("crossPlaceMode 1: clockwise crossovers mirror counter-clockwise", () => {
  const ccw = record(crossovers(1), false, P_ON), cw = record(crossovers(-1), true, P_ON).ticks;
  assertCrossed(cw, -1);
  const crossedAt = (t: Tick[]) => t.map((k, i) => k.s.crossed ? i : -1).filter(i => i >= 0);
  assert.deepEqual(crossedAt(cw), crossedAt(record(crossovers(1), true, P_ON).ticks));
  assert.equal(ccw.digests.length, cw.length);
});

test("crossPlaceMode 1: pushes out of order never cross — the load not on the outside foot, or moving onto the pushing foot", () => {
  // The old footwork script pushes under while the inside foot still carries
  // (3% outside share at the push): crossed only once the outside foot has
  // most of the load and the skater asks for it there.
  const fw = record(FOOTWORK, true, P_ON).ticks, fwPushing = new Set(pushingTicks(fw));
  for (const k of fw.filter(k => k.s.crossed)) {
    const outside = k.s.crossSide > 0 ? 1 : 0;
    assert.ok(fwPushing.has(k) && k.s.blade[outside].weight > 0.5, `tick ${k.s.tick}`);
    assert.ok((outside === 1 ? k.s.loadAsked! : -k.s.loadAsked!) > 0, `tick ${k.s.tick}: load asked toward the inside`);
  }
  // An inside push whose load moves onto the pushing foot is a step, not an
  // under-push: the outside foot carrying at the push, the load asked inside.
  const step = record(run => {
    run("curve", 90, () => ({ lean: 0.3, weight: 1, knee: 0.45 }));
    run("step", 72, i => ({ lean: 0.3, weight: 0, knee: 0.55, push: i === 0, pushFoot: 0 }));
  }, true, P_ON).ticks;
  assert.ok(pushingTicks(step).some(k => k.s.crossover && k.s.strokeFoot === 0), "the push is a crossover push");
  assert.ok(step.every(k => k.s.crossed === false));
  // Straight strokes never lean into a crossover, and move nothing physical.
  const on = record(STROKES, true, P_ON).ticks, off = record(STROKES, true, P).ticks;
  assert.ok(on.every(k => k.s.crossed === false));
  on.forEach((k, i) => assert.deepEqual(
    [k.s.pos, k.s.vel, k.s.lean, k.s.blade.map(b => [b.contact, b.weight])],
    [off[i].s.pos, off[i].s.vel, off[i].s.lean, off[i].s.blade.map(b => [b.contact, b.weight])]));
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
