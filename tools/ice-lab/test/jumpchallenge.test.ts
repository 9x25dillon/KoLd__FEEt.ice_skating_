// The jump challenge — app/jumps.ts.
//
// It has no scoring of its own to test: that is sim/score.ts, from data/. What
// it must hold is that it hands the scorer the landing the resolver made, files
// the result under the jump it actually was, and takes a fall as the data says.
// The attempts are test/jump.test.ts's own, whose outcomes are measured there.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { JumpAttempt, startSpeed, recipe, takeoffCode, jumpLines } from "../app/jumps.ts";
import { ghostRun } from "../app/race.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState, SkatingInput } from "../sim/types.ts";
import { JUMP, JUMP_CODE } from "../sim/jump.ts";
import { loadTables, scoreJump, fallDeduction, round2 } from "../sim/score.ts";
import type { ScoreTables } from "../sim/score.ts";
import { ReplayRecorder, parseReplay } from "../sim/replay.ts";

const repo = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repo), "utf8");
const tables = loadTables(read("data/scale-of-values.csv"), read("data/calls-and-deductions.csv"));
const p = { ...PRESETS.responsive, jumpMode: 2 };

const LOAD_AT = 180, RELEASE = LOAD_AT + 36;

/** jump.test.ts's approach: skate, hold the knee deep 0.30 s, release, whip, land. */
function attempt(target: number, a: { weight: number; lean: number; toe?: boolean; whip?: number; absorb?: number },
  t: ScoreTables | null = tables,
  each?: (input: SkatingInput, s: SkaterState, ev: EdgeEvent[]) => void): { s: SkaterState; run: JumpAttempt } {
  const s = createState(p, startSpeed(target));
  const run = new JumpAttempt(s, target, t);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < 600 && run.state === "running"; i++) {
    const loading = i >= LOAD_AT && i < RELEASE;
    const input = {
      ...NEUTRAL_INPUT, lean: a.lean, weight: a.weight,
      knee: loading ? 0.95 : i >= RELEASE && i < RELEASE + 3 ? 0 : i >= RELEASE ? (a.absorb ?? 0.8) : 0.35,
      carriage: i <= RELEASE ? (loading || i === RELEASE ? a.whip ?? 0 : 0) : 0,
      toe: (a.toe ?? false) && i === RELEASE - 2,
    };
    ev.length = 0;
    step(s, input, p, SIM_DT, ev);
    run.sample(s, SIM_DT);
    each?.(input, s, ev);
  }
  return { s, run };
}

const TOE_LOOP = { weight: 1, lean: -0.25, toe: true, whip: 1 };

test("the takeoffs and starts are the data file's", () => {
  assert.equal(takeoffCode(JUMP.Lutz), "LBO");
  assert.equal(takeoffCode(JUMP.Axel), "LFO");
  assert.equal(recipe(JUMP.Lutz), "left backward outside, toe pick (F)");
  assert.equal(recipe(JUMP.Salchow), "left backward inside");
  assert.equal(startSpeed(JUMP.Axel), 5, "the one forward takeoff");
  for (const k of [JUMP.Toeloop, JUMP.Salchow, JUMP.Loop, JUMP.Flip, JUMP.Lutz]) assert.equal(startSpeed(k), -5, JUMP_CODE[k]);
});

test("a clean triple toe loop scores exactly what the scorer says", () => {
  const { run } = attempt(JUMP.Toeloop, TOE_LOOP);
  const r = run.result();
  assert.equal(r.state, "done");
  assert.equal(r.landed!.kind, JUMP.Toeloop);
  assert.equal(r.landed!.revolutions, 3);
  assert.ok(r.hit);
  assert.equal(r.deduction, 0);
  assert.deepEqual(r.scored, scoreJump(tables, r.landed!), "the landing the resolver made, handed over whole");
  assert.equal(r.points, r.scored!.score);
  assert.equal(r.score, r.points);
  assert.ok(r.points > 0 && r.scored!.label.startsWith("3T"), `${r.scored!.label} ${r.points}`);
});

test("the wrong jump is named, and scored as what it was", () => {
  const { s, run } = attempt(JUMP.Lutz, TOE_LOOP);
  const r = run.result();
  assert.equal(r.landed!.kind, JUMP.Toeloop);
  assert.equal(r.hit, false);
  assert.ok(r.points > 0, "a toe loop is still worth a toe loop");
  const text = jumpLines(run, s, JUMP.Lutz, () => null, false, true, true).map(([t]) => t).join(" | ");
  assert.match(text, /that was a toe loop, not a Lutz/);
});

test("a fall on landing is still a jump: the fall's GOE, and the data's deduction", () => {
  const { run } = attempt(JUMP.Loop, { weight: 1, lean: -0.25, whip: 0.5 });
  const r = run.result();
  assert.equal(r.state, "done", "landed, then down");
  assert.ok(r.landed!.fall);
  assert.equal(r.deduction, Math.abs(fallDeduction(tables, 1)));
  assert.ok(r.deduction > 0);
  assert.equal(r.points, round2(r.scored!.score - r.deduction));
});

test("without tables nothing scores, and a fall before the takeoff ends the attempt", () => {
  const none = attempt(JUMP.Toeloop, TOE_LOOP, null).run.result();
  assert.equal(none.state, "done");
  assert.equal(none.scored, null);
  assert.equal(none.points, 0);

  const s = createState(p, -5);
  const run = new JumpAttempt(s, JUMP.Toeloop, tables);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < 600 && run.state === "running"; i++) {
    ev.length = 0;
    step(s, { ...NEUTRAL_INPUT, lean: 1 }, p, SIM_DT, ev);
    run.sample(s, SIM_DT);
  }
  assert.equal(run.state, "fell");
  assert.equal(run.result().tookOff, false);
  assert.equal(run.result().score, 0);
});

test("the attempt reads the state and never writes it", () => {
  const s = createState(p, -5);
  const run = new JumpAttempt(s, JUMP.Toeloop, tables);
  const before = structuredClone(s);
  for (let i = 0; i < 20; i++) run.sample(s, SIM_DT);
  run.result();
  assert.deepEqual(s, before);
});

test("a ghost of an attempt lands on the tick the attempt did, with its score", () => {
  const rec = new ReplayRecorder(p, startSpeed(JUMP.Toeloop));
  const { run } = attempt(JUMP.Toeloop, TOE_LOOP, tables, (input, s, ev) => rec.capture(input, p, s, ev, "A"));
  const g = ghostRun(parseReplay(rec.toJson()), (s) => new JumpAttempt(s, JUMP.Toeloop, tables));
  assert.equal(g.diverged, false);
  assert.equal(g.finishTick, run.ticks);
  assert.equal(g.result.score, run.result().score);
});
