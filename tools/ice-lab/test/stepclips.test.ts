import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepClipFrame, StepArmBlend } from '../game/motion/stepclips.ts';
import { performancePose } from '../game/appearance.ts';
import { createState } from '../sim/solver.ts';
import { setupParams } from '../game/setups.ts';
import { FOOT, MOVE } from '../sim/types.ts';
import { JUMP_PHASE } from '../sim/jump.ts';

const p = setupParams('simulation');
test('step clips use the stroke foot and sim clock, independent of render frequency', () => {
  const s = createState(p, 4);
  const before = JSON.stringify(s);
  assert.equal(stepClipFrame(s, 'step')?.clip, 'step.swing-roll');
  assert.equal(JSON.stringify(s), before);
  s.strokeFoot = FOOT.Right; s.tick = 120;
  const frame = stepClipFrame(s, 'step')!;
  assert.equal(frame.clip, 'step.swing-roll.mirror');
  assert.equal(frame.layer, 'arms');
  assert.deepEqual(Object.keys(frame.pose), ['seg']);
  assert.deepEqual(Object.keys(frame.pose.seg!).sort(), ['forearmL','forearmR','upperArmL','upperArmR']);
  for (let tick = 0; tick < 120; tick++) stepClipFrame({ ...s, tick }, 'step');
  assert.deepEqual(stepClipFrame(s, 'step'), frame);
});

test('step clips release on element end, fall, air, load, spin and formal moves', () => {
  const s = createState(p, 4);
  for (const element of [undefined, null, 'glide', 'spin']) assert.equal(stepClipFrame(s, element), null);
  s.fallen = true; assert.equal(stepClipFrame(s, 'step'), null); s.fallen = false;
  for (const phase of [JUMP_PHASE.Load, JUMP_PHASE.Air]) {
    s.jump.phase = phase; assert.equal(stepClipFrame(s, 'step'), null);
  }
  s.jump.phase = JUMP_PHASE.None;
  for (const move of [MOVE.Spin, MOVE.Spiral, MOVE.InaBauer]) {
    s.move = move; assert.equal(stepClipFrame(s, 'step'), null);
  }
});

test('browser blend only moves render elbows and hands and eases completely out', () => {
  const s = createState(p, 4), blend = new StepArmBlend();
  blend.apply(performancePose(s,p),s,stepClipFrame(s,'step'));
  s.tick = 30;
  const before = JSON.stringify(s), render = performancePose(s,p), original = structuredClone(render);
  blend.apply(render,s,stepClipFrame(s,'step'));
  assert.notDeepEqual(render.body.hands, original.body.hands);
  assert.notDeepEqual(render.elbows, original.elbows);
  const { hands: _hands, ...body } = render.body;
  const { hands: _originalHands, ...originalBody } = original.body;
  assert.deepEqual(body,originalBody);
  assert.equal(JSON.stringify(s),before);
  s.tick = 60;
  const stopped = performancePose(s,p), expected = structuredClone(stopped);
  blend.apply(stopped,s,null); assert.deepEqual(stopped,expected);
});
