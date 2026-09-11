// Racing a ghost — app/race.ts.
//
// The ghost is a replay re-simulated, so the race has to agree with the run
// that made it to the tick: same finish, same score, and against itself a gap
// of exactly nothing.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ghostRun, timeGap, tuningDiffers, raceLines } from "../app/race.ts";
import type { GhostRun } from "../app/race.ts";
import type { FigureResult } from "../app/figure8.ts";
import { START_SPEED } from "../app/figure8.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { ReplayRecorder, parseReplay } from "../sim/replay.ts";
import { figureBot } from "./figurebot.ts";

function botClip(): { clip: ReturnType<typeof parseReplay>; ticks: number; score: number } {
  const p = { ...PRESETS.responsive };
  const rec = new ReplayRecorder(p, START_SPEED);
  const { run } = figureBot(p, (input, s, ev) => rec.capture(input, p, s, ev, "A"));
  return { clip: parseReplay(rec.toJson()), ticks: run.ticks, score: run.result().score };
}

test("the ghost is the run: same finish tick, same score, still verifying", () => {
  const { clip, ticks, score } = botClip();
  const g = ghostRun(clip);
  assert.equal(g.diverged, false);
  assert.equal(g.finishTick, ticks, "the ghost finishes on the tick the bot did");
  assert.equal(g.result.score, score);
  assert.ok(g.splitTick > 0 && g.splitTick < g.finishTick, `split ${g.splitTick}, finish ${g.finishTick}`);
  assert.equal(g.reach[g.reach.length - 1], 2);
  for (let i = 1; i < g.reach.length; i++) assert.ok(g.reach[i] >= g.reach[i - 1], "reach never falls back");
});

test("racing your own run, you are level with it every tick you are moving on", () => {
  const g = ghostRun(botClip().clip);
  let checked = 0;
  for (let t = 2; t <= g.finishTick; t++) {
    if (g.reach[t - 1] <= g.reach[t - 2]) continue;   // a plateau is where "level" is ambiguous
    assert.equal(timeGap(g, g.reach[t - 1], t), 0, `tick ${t}`);
    checked++;
  }
  assert.ok(checked > g.finishTick * 0.9, `checked ${checked} of ${g.finishTick} ticks`);
});

test("the gap is the ghost's tick for where you are, subtracted from yours", () => {
  // A synthetic ghost going round at an even pace: 0 to 2 over 1200 ticks.
  const reach = new Float64Array(1200).map((_, i) => (2 * (i + 1)) / 1200);
  const g = { reach, finishTick: 1200, splitTick: 600, diverged: false } as unknown as GhostRun;
  assert.ok(Math.abs(timeGap(g, 1, 720)! - 1) < 1e-12, "half way at tick 720, the ghost was there at 600: a second behind");
  assert.ok(Math.abs(timeGap(g, 1, 480)! + 1) < 1e-12, "at 480: a second ahead");
  const fell = { ...g, reach: reach.map((r) => Math.min(r, 1.3)) } as GhostRun;
  assert.equal(timeGap(fell, 1.5, 900), null, "past where a ghost that fell ever got");
});

test("a ghost on other tuning says which", () => {
  const live = { ...PRESETS.responsive };
  assert.deepEqual(tuningDiffers({ ...live }, live), []);
  assert.deepEqual(tuningDiffers({ ...live, sharpness: 0.7 }, live), ["sharpness"]);
  const g = { ...ghostRun(botClip().clip) };
  g.params = { ...live, sharpness: 0.7, rocker: 2.4, biteC1: 3 };
  const lines = raceLines(g, "your best", null, 0, live, null).map(([t]) => t);
  assert.ok(lines.some((t) => t.startsWith("tuned differently: ") && t.endsWith("+1")), lines.join(" | "));
});

test("the verdict: beat it, lose to it, or it never finished", () => {
  const g = ghostRun(botClip().clip);
  const live = PRESETS.responsive;
  const done = (seconds: number): FigureResult => ({
    state: "done", seconds, rms: 0.5, edgeShare: 0.9, progress: 2, accuracy: 60, edge: 90, pace: 80, score: 70,
  });
  const ghostSeconds = g.finishTick * SIM_DT;
  const text = (r: FigureResult, gg: GhostRun = g): string => raceLines(gg, "best", r, 0, live, null).map(([t]) => t).join(" | ");
  assert.match(text(done(ghostSeconds - 1.5)), /beat the ghost by 1\.50 s · 70 v /);
  assert.match(text(done(ghostSeconds + 0.25)), /ghost won by 0\.25 s/);
  assert.match(text(done(20), { ...g, finishTick: -1 }), /never finished: you win/);
  const running: FigureResult = { ...done(0), state: "running", progress: 1, seconds: 0 };
  const behind = raceLines(g, "best", running, g.splitTick + 60, live, null).map(([t]) => t).join(" | ");
  assert.match(behind, /\+0\.50 s behind the ghost/);
});
