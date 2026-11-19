import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IceEngine} from '../bridge/engine.mjs';
import {NEUTRAL_INPUT} from '../runtime/sim/types.js';
import {JUMP_PHASE} from '../runtime/sim/jump.js';

// Off means the engine ticks with no presentation snapshots. On exercises the real bridge hook.
function composer(clips) {
 const e=new IceEngine(); e.start({mode:'composer',sequence:['step']});
 const digest=createHash('sha256'), frames=[];
 for(let tick=0;tick<480;tick++) {
  e.tick({...NEUTRAL_INPUT,knee:.4,weight:.5,push:tick%90===0});
  if(clips) {
   const f=e.snapshot();frames.push(f.motion);
   assert.deepEqual(e.snapshot().motion,f.motion,'repeat snapshot is identical');
  }
  digest.update(JSON.stringify(e.state));
 }
 return {digest:digest.digest('hex'),frames,score:JSON.stringify(e.routine)};
}
test('composer step snapshots are deterministic and leave every sim tick and score byte-identical',()=>{
 const off=composer(false),on=composer(true),again=composer(true);
 assert.equal(on.digest,off.digest); assert.equal(on.score,off.score);
 assert.deepEqual(on,again);
 assert.ok(on.frames.some(f=>f?.layer==='arms'&&f.clip.startsWith('step.')));
});
test('bridge removes step clip when finished, airborne or fallen',()=>{
 const e=new IceEngine();e.start({mode:'composer',sequence:['step']});
 assert.match(e.snapshot().motion.clip,/^step\./);
 e.finished=true;assert.ok(!e.snapshot().motion?.clip.startsWith('step.'));e.finished=false;
 e.state.jump.phase=JUMP_PHASE.Air;assert.ok(!e.snapshot().motion?.clip.startsWith('step.'));
 e.state.jump.phase=JUMP_PHASE.None;e.state.fallen=true;
 assert.equal(e.snapshot().motion.layer,'full');
});
