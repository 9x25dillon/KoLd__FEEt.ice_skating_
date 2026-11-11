// game/motion/player.ts: a fall plays the fall the sim had; a style's arms play only while the arms are free.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MotionPlayer } from "../game/motion/player.ts";
import { createState } from "../sim/solver.ts";
import { setupParams } from "../game/setups.ts";
import { FALL, MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

const music = { bpm: 120, beatsPerBar: 4, offset: 0.5 };
test("no style and no fall: nothing to draw but the sim", () => {
  const p = new MotionPlayer(null, music, 120), s = createState(setupParams("simulation"), 4);
  assert.equal(p.frame(s, 3), null);
  assert.equal(p.cues.length, 0);
});

test("a fall plays a fall chosen from the sim's own: its side, and from the moment it happened", () => {
  const p = new MotionPlayer("classical", music, 120), s = createState(setupParams("simulation"), 4);
  p.frame(s, 1);
  // Positive lean is her left (game/wear.ts fallSide): she goes down on her left hip.
  s.fallen = true; s.fallReason = FALL.LeanExceeded; s.lean = 0.9; s.tick = 240;
  const first = p.frame(s, 2)!;
  assert.equal(first.layer, "full");
  assert.match(first.clip, /^fall\./);
  assert.ok(first.clip.endsWith(".left") || !/\.(left|right)$/.test(first.clip), first.clip);
  assert.equal(first.t, 0);
  const later = p.frame(s, 2.5)!;
  assert.equal(later.clip, first.clip, "the same fall, playing on");
  assert.ok(Math.abs(later.t - 0.5) < 1e-9);
  s.fallen = false;
  assert.notEqual(p.frame(s, 4)?.layer, "full", "up again: the sim's pose");
});

test("a fall out of a spin plays a spin-out or a turn collapse", () => {
  const p = new MotionPlayer(null, null, 120), s = createState(setupParams("simulation"), 2);
  s.move = MOVE.Spin; p.frame(s, 1);
  s.move = MOVE.None; s.fallen = true; s.fallReason = FALL.BalanceTimeout; s.tick = 99;
  assert.match(p.frame(s, 1.2)!.clip, /^fall\.(spin-out|turn-collapse|hip-slide)\./);
});

test("a style's arms play on the program's clock, only arms and head, never in the air or a spin", () => {
  const p = new MotionPlayer("flamenco", music, 120), s = createState(setupParams("simulation"), 4);
  assert.ok(p.cues.length > 10);
  const f = p.frame(s, 0.6)!;
  assert.equal(f.layer, "arms");
  assert.equal(f.clip, p.cues[0].clip, "the opening first");
  assert.deepEqual(Object.keys(f.pose.seg!).sort().filter(k => !["upperArmL", "forearmL", "upperArmR", "forearmR", "head"].includes(k)), []);
  assert.equal(f.pose.pelvis, undefined, "the legs are the sim's");
  s.jump.phase = JUMP_PHASE.Air; assert.equal(p.frame(s, 10), null, "in the air the arms are physics");
  s.jump.phase = JUMP_PHASE.None; s.move = MOVE.Spin; assert.equal(p.frame(s, 10), null, "and in a spin");
  s.move = MOVE.None;
  const mid = p.frame(s, 30)!;
  const cue = p.cues.filter(c => c.layer === "arms" && c.at <= 30).at(-1)!;
  assert.equal(mid.clip, cue.clip);
  assert.ok(Math.abs(mid.t - (30 - cue.at)) < 1e-9);
});
