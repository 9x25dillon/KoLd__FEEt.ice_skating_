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
  s.jump.phase = JUMP_PHASE.None; s.move = MOVE.Spin;
  // In a spin the body plays the spin's position (2026-11-14), never the style's arms: they are physics.
  const spun = p.frame(s, 10)!;
  assert.equal(spun.layer, "body", "and in a spin");
  assert.ok(!["upperArmL", "forearmL", "upperArmR", "forearmR"].some(k => k in (spun.pose.seg ?? {})));
  s.move = MOVE.None;
  const mid = p.frame(s, 30)!;
  const cue = p.cues.filter(c => c.layer === "arms" && c.at <= 30).at(-1)!;
  assert.equal(mid.clip, cue.clip);
  assert.ok(Math.abs(mid.t - (30 - cue.at)) < 1e-9);
});

// ── Spin positions and moves in the field (2026-11-14) ──────────────────────
import { FOOT, SPIN_POSITION, SPIN_VARIATION } from "../sim/types.ts";
import { movePose, spinPoseId } from "../game/motion/player.ts";
import { CLIP_BY_ID } from "../game/motion/library.ts";
import { readFileSync } from "node:fs";

const ARMS = ["upperArmL", "forearmL", "upperArmR", "forearmR"];
const spinning = (position: number, foot: number = FOOT.Left, variation?: number) => {
  const s = createState(setupParams("simulation"), 0);
  s.move = MOVE.Spin; s.spin.position = position; s.spin.foot = foot as 0 | 1;
  if (variation !== undefined) s.spin.variation = variation;
  return s;
};

test("a spin plays the reference pose data/spin-positions.json names for its position", () => {
  const catalogue = JSON.parse(readFileSync(new URL("../../../data/spin-positions.json", import.meta.url), "utf8")).positions as { id: string; reference_pose: string }[];
  const ref = (id: string) => catalogue.find(x => x.id === id)!.reference_pose;
  assert.equal(spinPoseId(SPIN_POSITION.Upright), ref("upright_basic"));
  assert.equal(spinPoseId(SPIN_POSITION.Sit), ref("sit_basic"));
  assert.equal(spinPoseId(SPIN_POSITION.Camel), ref("camel_basic"));
  assert.equal(spinPoseId(SPIN_POSITION.Upright, SPIN_VARIATION.Attitude), ref("upright_attitude"));
  assert.equal(spinPoseId(SPIN_POSITION.Upright, SPIN_VARIATION.Split), ref("upright_i_position"));
  // The variations are upright's: a sit or a camel keeps its own.
  assert.equal(spinPoseId(SPIN_POSITION.Camel, SPIN_VARIATION.Split), ref("camel_basic"));
});

test("the body plays the spin, the arms stay the sim's, and the skating leg is her support foot", () => {
  const p = new MotionPlayer("classical", music, 120);
  const left = p.frame(spinning(SPIN_POSITION.Camel), 5)!;
  assert.equal(left.layer, "body");
  assert.equal(left.clip, "SP_Camel_Basic");
  assert.ok(ARMS.every(k => !(k in (left.pose.seg ?? {}))), "no arm in a spin's pose");
  assert.ok(left.pose.pelvis !== undefined && left.pose.seg?.thighR, "pelvis and legs are the clip's");
  const right = p.frame(spinning(SPIN_POSITION.Camel, FOOT.Right), 6)!;
  assert.equal(right.clip, "SP_Camel_Basic.cw");
  // Mirrored: the free leg is the left now, out behind as the right was.
  assert.deepEqual(right.pose.seg?.thighL?.map(v => Math.round(v * 1e6)), left.pose.seg?.thighR?.map((v, i) => Math.round((i === 0 ? -v : v) * 1e6)));
});

test("a change of position changes the pose, from the moment it changed", () => {
  const p = new MotionPlayer(null, null, 120), s = spinning(SPIN_POSITION.Upright);
  assert.equal(p.frame(s, 1)!.clip, "SP_Upright_Basic");
  s.spin.position = SPIN_POSITION.Sit;
  const sit = p.frame(s, 2)!;
  assert.equal(sit.clip, "SP_Sit_Basic");
  assert.equal(sit.t, 0);
});

test("spirals and the Ina Bauer play their clips on the sim's foot; a raise in play leaves the sim's leg", () => {
  const p = new MotionPlayer(null, null, 120), s = createState(setupParams("simulation"), 3);
  s.move = MOVE.Spiral; s.spiral.foot = FOOT.Left; s.blade[FOOT.Left].longSpeed = 3;
  assert.equal(movePose(s)!.id, "move.spiral.forward");
  s.blade[FOOT.Left].longSpeed = -3;
  assert.equal(movePose(s)!.id, "move.spiral.back");
  s.spiral.foot = FOOT.Right; s.blade[FOOT.Right].longSpeed = 3;
  assert.equal(movePose(s)!.id, "move.spiral.forward.mirror");
  assert.equal(p.frame(s, 1)!.layer, "body");
  s.spiral.peakRaise = 0.4;
  assert.equal(movePose(s), null, "Experimental's free leg is physics");
  const ina = createState(setupParams("simulation"), 3);
  ina.move = MOVE.InaBauer; ina.inaBauer.lead = FOOT.Left;
  assert.deepEqual(movePose(ina), { id: "move.ina-bauer", mirror: false });
  ina.inaBauer.lead = FOOT.Right;
  const f = new MotionPlayer(null, null, 120).frame(ina, 1)!;
  assert.equal(f.clip, "move.ina-bauer.mirror");
  // Mirrored, the left foot trails: behind her, where the right was.
  assert.ok(f.pose.seg!.thighL![2] > 0 && f.pose.seg!.thighR![2] < 0, JSON.stringify(f.pose.seg));
});

test("no move pose in the air, a fall, or a turn; a fall out of a spin still plays the fall", () => {
  const s = spinning(SPIN_POSITION.Upright);
  s.jump.phase = JUMP_PHASE.Air; assert.equal(movePose(s), null);
  s.jump.phase = JUMP_PHASE.None; s.move = MOVE.Turn; assert.equal(movePose(s), null);
  const p = new MotionPlayer(null, null, 120), t = spinning(SPIN_POSITION.Sit);
  assert.equal(p.frame(t, 1)!.layer, "body");
  t.fallen = true; t.fallReason = FALL.BalanceTimeout; t.tick = 50;
  assert.equal(p.frame(t, 1.2)!.layer, "full");
});

test("every pose a move can ask for is in the library", () => {
  for (const pos of [0, 1, 2]) for (const v of [0, 1, 2]) for (const sfx of ["", ".cw"]) assert.ok(CLIP_BY_ID.has(spinPoseId(pos, v) + sfx));
  for (const id of ["move.spiral.forward", "move.spiral.back", "move.spiral.forward.mirror", "move.spiral.back.mirror", "move.ina-bauer"]) assert.ok(CLIP_BY_ID.has(id), id);
});
