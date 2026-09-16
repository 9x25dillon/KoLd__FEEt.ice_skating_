import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {createState,step} from '../runtime/sim/solver.js';
import {NEUTRAL_INPUT} from '../runtime/sim/types.js';
import {verifyReplay,parseReplay} from '../runtime/sim/replay.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('Godot host executes the exact Ice Lab solver across 240 input ticks',()=>{
 const engine=new IceEngine(),s=createState(engine.params,4.5);
 for(let i=0;i<240;i++){
  const input={...NEUTRAL_INPUT,lean:.18*Math.sin(i*.013),knee:.45,weight:.5,push:i%90===0,carriage:.6};
  step(s,input,engine.params,1/120,[]);engine.tick(input);
  assert.deepEqual(engine.state,s,`solver state at tick ${i+1}`);
 }
 assert.equal(verifyReplay(parseReplay(engine.exportReplay())).divergence,null);
});

test('bridge runs full physical choreography and persists earned progression',()=>{
 const e=new IceEngine();e.start({mode:'career',event:0});
 for(let i=0;i<9000&&!e.finished;i++){
  const c=emptyControls();c.kx=e.routine.index===1?-1:0;
  e.advance(c,1,e.routine.index===2);
 }
 assert.equal(e.routine.index,3);assert.equal(e.result.complete,true);assert.equal(e.career.medals[0],3);
 const restored=new IceEngine(e.career.serialize());assert.equal(restored.career.unlocked,1);
 restored.train('balance');assert.equal(restored.career.profile.stats.balance,51);
 assert.throws(()=>restored.start({mode:'career',event:3}),/previous/);
});

test('authored programs validate and preserve order without granting career XP',()=>{
 const e=new IceEngine();assert.throws(()=>e.start({mode:'composer',sequence:['teleport']}));
 e.start({mode:'composer',sequence:['glide']});
 for(let i=0;i<200&&!e.finished;i++)e.advance({},2);
 assert.equal(e.finished,true);assert.equal(e.career.profile.xp,0);
 e.start({mode:'free'});assert.equal(e.finished,false);assert.equal(e.state.tick,0);
});

test('replay playback does not grant progression or mutate the live recorder',()=>{
 const e=new IceEngine();for(let i=0;i<50;i++)e.advance({},2);
 const replay=e.exportReplay();const save=e.career.serialize();e.replay(replay);
 while(!e.finished)e.advance({},2);
 assert.equal(e.result.title,'Replay verified');assert.equal(e.career.serialize(),save);assert.equal(e.recorder.ticks,0);
});

test('protocol input validation rejects corrupt timing and controls',()=>{
 const e=new IceEngine();
 for(const ticks of [0,13,NaN,1.5])assert.throws(()=>e.advance({},ticks));
 assert.throws(()=>e.advance({kx:NaN}));assert.throws(()=>e.advance({push:'yes'}));assert.equal(e.state.tick,0);
});

test('every prepared module is sourced from the entire current Ice Lab tree',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../runtime/source-manifest.json',import.meta.url),'utf8'));
 assert.ok(Object.keys(manifest).length>=44);
 for(const [path,hash] of Object.entries(manifest)){
  const source=readFileSync(new URL('../../../tools/ice-lab/'+path,import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),hash,path);
 }
});
