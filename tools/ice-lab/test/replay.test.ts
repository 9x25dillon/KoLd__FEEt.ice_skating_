import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { ReplayRecorder, ReplayPlayer, parseReplay, verifyReplay, replayDigest,
  MAX_REPLAY_TICKS } from "../sim/replay.ts";
import { IceGrid } from "../sim/ice.ts";

function record(ticks = 1200): { json: string; state: SkaterState } {
  const p = { ...PRESETS.responsive }, state = createState(p, 4);
  const recorder = new ReplayRecorder(p, 4), events: EdgeEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const input = { ...NEUTRAL_INPUT, lean: 0.3 * Math.sin(i * 0.017),
      knee: 0.45 + 0.25 * Math.sin(i * 0.004), weight: 0.5 + 0.45 * Math.sin(i * 0.011),
      pitch: 0.4 * Math.sin(i * 0.009), push: i % 90 === 0 };
    if (i === 400) p.sharpness = 0.9;
    events.length = 0;
    step(state, input, p, SIM_DT, events);
    recorder.capture(input, p, state, events, i < 400 ? "A" : i < 800 ? "B" : "C");
  }
  return { json: recorder.toJson(), state };
}

test("a JSON round trip replays a live ten-second run including tuning and scheme changes", () => {
  const { json, state } = record();
  assert.equal(state.fallen, false, "exercise skating rather than a fallen body");
  const clip = parseReplay(json), player = new ReplayPlayer(clip);
  assert.equal(clip.frames.filter((frame) => frame.params).length, 1);
  assert.equal(clip.frames[400].params?.sharpness, 0.9);
  while (!player.done) player.advance();
  assert.equal(player.divergence, null);
  assert.deepEqual(player.state, state);
  assert.equal(player.scheme, "C");
  assert.deepEqual(verifyReplay(clip), { ticks: 1200, divergence: null });
  player.advance();
  assert.deepEqual(player.state, state, "completion must not add ticks");
});

test("the first changed input is located at its causal tick", () => {
  const clip = parseReplay(record(600).json);
  // A second push during an active stroke is intentionally ignored. Braking
  // changes this tick's velocity and therefore has an immediate consequence.
  clip.frames[300].input.brake = true;
  const result = verifyReplay(clip);
  assert.equal(result.divergence?.tick, 301);
  assert.equal(result.ticks, 301, "stop on the first difference");
});

test("backward motion, split blades, and a latched fall survive replay", () => {
  for (const speed of [-4, 4]) {
    const p = { ...PRESETS.responsive }, state = createState(p, speed);
    const r = new ReplayRecorder(p, speed), events: EdgeEvent[] = [];
    let falls = 0;
    for (let i = 0; i < 600; i++) {
      const input = { ...NEUTRAL_INPUT, lean: 1, leanSplit: 0.25, brake: i > 500 };
      events.length = 0; step(state, input, p, SIM_DT, events);
      falls += events.filter(e => e.type === 6).length;
      r.capture(input, p, state, events, "C");
    }
    assert.equal(state.fallen, true);
    assert.equal(falls, 1, "exercise the fall event and its latch");
    const player = new ReplayPlayer(parseReplay(r.toJson()));
    while (!player.done) player.advance();
    assert.equal(player.divergence, null);
    assert.deepEqual(player.state, state);
  }
});

test("a corrupted digest cannot silently pass", () => {
  const clip = parseReplay(record(10).json);
  clip.frames[4].digest = (clip.frames[4].digest ^ 1) >>> 0;
  assert.equal(verifyReplay(clip).divergence?.tick, 5);
});

test("both historical /8 branch fixtures are rejected rather than silently relabelled", () => {
  const game = JSON.parse(record(2).json);
  game.solver = "ice-lab-f64/8";
  const fidelity = structuredClone(game);
  for (const f of game.frames) delete f.input.windup;
  for (const f of fidelity.frames) delete f.input.bracket;
  for (const clip of [game, fidelity]) assert.throws(() => parseReplay(JSON.stringify(clip)), /solver/);
});

test("the merged replay contract carries music, bracket, wind-up and rink relief together", () => {
  const p = {...PRESETS.assisted, movesMode: 1, jumpMode: 2, musicMode: 1, rinkRelief: 0.01};
  const s = createState(p, 5), r = new ReplayRecorder(p, 5);
  for (let i = 0; i < 600; i++) {
    const input = {...NEUTRAL_INPUT, lean: 0.2, weight: 1, push: i % 90 === 0,
      bracket: i === 180, windup: i >= 300 && i < 315 ? 1 : 0,
      knee: i >= 300 && i < 336 ? 0.9 : 0.35};
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events); r.capture(input, p, s, events);
  }
  const player = new ReplayPlayer(parseReplay(r.toJson()));
  while (!player.done) player.advance();
  assert.equal(player.divergence, null);
  assert.deepEqual(player.state, s);
});

test("iceGridMode's own sheet replays deterministically, from nothing but the recorded inputs", () => {
  // ReplayPlayer owns no serialized grid: it is fully determined by the same
  // inputs everything else is, so a fresh IceGrid, replayed the same way,
  // must reproduce a live run's friction exactly — not just its inputs.
  const p = { ...PRESETS.responsive, iceGridMode: 1, iceDamagePerPass: 0.05 };
  const grid = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const s = createState(p, 5), r = new ReplayRecorder(p, 5);
  for (let i = 0; i < 600; i++) {
    const input = { ...NEUTRAL_INPUT, lean: 0.3 * Math.sin(i * 0.02), weight: 0.5, push: i % 90 === 0 };
    const events: EdgeEvent[] = [];
    step(s, input, p, SIM_DT, events, grid);
    r.capture(input, p, s, events);
  }
  const player = new ReplayPlayer(parseReplay(r.toJson()));
  while (!player.done) player.advance();
  assert.equal(player.divergence, null);
  assert.deepEqual(player.state, s);
  assert.notDeepEqual(s, createState(p, 5), "exercise a run the grid actually changed, not a no-op");
});

test("capture owns inputs and tuning snapshots even when the caller mutates them", () => {
  const p = { ...PRESETS.responsive }, state = createState(p, 4), input = { ...NEUTRAL_INPUT };
  const r = new ReplayRecorder(p, 4), events: EdgeEvent[] = [];
  p.sharpness = 0.7;
  step(state, input, p, SIM_DT, events);
  r.capture(input, p, state, events);
  p.sharpness = 0.2; input.push = true;
  const clip = parseReplay(r.toJson());
  assert.equal(clip.initial.params.sharpness, PRESETS.responsive.sharpness);
  assert.equal(clip.frames[0].params?.sharpness, 0.7);
  assert.equal(clip.frames[0].input.push, false);
  assert.equal(verifyReplay(clip).divergence, null);
});

test("the digest covers hidden integration state, the fall latch, blade dwell, and events", () => {
  const base = createState(PRESETS.responsive, 4), digest = replayDigest(base, []);
  for (const key of ["intHeld", "legRate", "knee", "strokeTime", "balanceErrorTime"] as const) {
    const copy = structuredClone(base); copy[key] += 0.01;
    assert.notEqual(replayDigest(copy, []), digest, key);
  }
  const fallen = structuredClone(base); fallen.fallen = true;
  assert.notEqual(replayDigest(fallen, []), digest);
  const dwell = structuredClone(base); dwell.blade[0].dwell += SIM_DT;
  assert.notEqual(replayDigest(dwell, []), digest);
  assert.notEqual(replayDigest(base, [{ tick: 1, type: 0, foot: 0,
    prevCode: 255, newCode: 2, prevDwell: 0, value: 0 }]), digest);
  base.lean = NaN;
  assert.throws(() => replayDigest(base, []), /non-finite/);
});

test("full clips stay bounded, and resetting a skater requires a fresh recorder", () => {
  const p = PRESETS.responsive, state = createState(p, 0), r = new ReplayRecorder(p, 0);
  const events: EdgeEvent[] = [];
  step(state, NEUTRAL_INPUT, p, SIM_DT, events);
  r.capture(NEUTRAL_INPUT, p, state, events);
  assert.throws(() => r.capture(NEUTRAL_INPUT, p, state, events), /Reset/);
  // Fill the real recorder: the cap must govern storage, not just an export.
  for (let i = 1; i < MAX_REPLAY_TICKS + 2; i++) {
    events.length = 0; step(state, NEUTRAL_INPUT, p, SIM_DT, events);
    r.capture(NEUTRAL_INPUT, p, state, events);
  }
  assert.equal(r.full, true);
  assert.equal(r.ticks, MAX_REPLAY_TICKS);
  const reset = new ReplayRecorder(p, 7);
  const fresh = createState(p, 7);
  events.length = 0; step(fresh, NEUTRAL_INPUT, p, SIM_DT, events);
  reset.capture(NEUTRAL_INPUT, p, fresh, events);
  assert.equal(verifyReplay(parseReplay(reset.toJson())).divergence, null);
});

test("malformed files fail before a player runs", () => {
  const valid = record(2).json;
  const broken: Array<(x: any) => void> = [
    x => { x.schema = "future"; }, x => { x.solver = "future"; },
    x => { x.hz = 60; }, x => { x.frames = []; },
    x => { x.frames = Array(MAX_REPLAY_TICKS + 1).fill(x.frames[0]); },
    x => { delete x.initial.params.mass; }, x => { x.initial.params.gravity = 0; },
    x => { x.initial.params.mass = "55"; }, x => { x.initial.params.mass = null; },
    x => { x.initial.params.maxLean = 10; }, x => { x.initial.speed = null; },
    x => { x.frames[0].input.lean = 2; }, x => { delete x.frames[0].input.leanSplit; },
    x => { x.frames[0].input.brake = 1; }, x => { x.frames[0].scheme = "E"; },
    x => { x.frames[0].digest = -1; }, x => { x.frames[0].digest = 0.5; },
    x => { x.frames[0].params = {}; }, x => { x.script = "anything"; },
  ];
  for (const mutate of broken) {
    const value = JSON.parse(valid); mutate(value);
    assert.throws(() => parseReplay(JSON.stringify(value)));
  }
  assert.throws(() => parseReplay("{"));
  assert.throws(() => parseReplay("null"));
});

test("the committed v1 fixture detects changes across builds", () => {
  const clip = parseReplay(readFileSync(new URL("fixtures/replay-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(verifyReplay(clip), { ticks: 240, divergence: null });
});

test("the CLI distinguishes verified, diverged, and invalid clips", () => {
  const dir = mkdtempSync(join(tmpdir(), "ice-replay-"));
  try {
    const file = join(dir, "clip.json");
    const cli = new URL("../replay/verify.ts", import.meta.url).pathname;
    const invoke = () => spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
    writeFileSync(file, record(8).json);
    const ok = invoke();
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout), { verified: true, ticks: 8 });
    const clip = parseReplay(readFileSync(file, "utf8"));
    clip.frames[3].digest = (clip.frames[3].digest ^ 1) >>> 0;
    writeFileSync(file, JSON.stringify(clip));
    const drift = invoke();
    assert.equal(drift.status, 1);
    assert.equal(JSON.parse(drift.stderr).divergence.tick, 4);
    writeFileSync(file, "{}");
    assert.equal(invoke().status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
