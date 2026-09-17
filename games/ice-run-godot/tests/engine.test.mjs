import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {createState,step} from '../runtime/sim/solver.js';
import {IceGrid} from '../runtime/sim/ice.js';
import {NEUTRAL_INPUT,MOVE} from '../runtime/sim/types.js';
import {verifyReplay,parseReplay} from '../runtime/sim/replay.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('Godot host executes the exact Ice Lab solver across 240 input ticks',()=>{
 // A reference sheet of its own, the same shape engine.mjs gives its live
 // one: iceGridMode is on in GAME_PARAMS, so without this the reference path
 // and the engine's own tick() would silently disagree on friction.
 const engine=new IceEngine(),s=createState(engine.params,4.5),ice=new IceGrid(engine.params.rinkHalfLength,engine.params.rinkHalfWidth);
 for(let i=0;i<240;i++){
  const input={...NEUTRAL_INPUT,lean:.18*Math.sin(i*.013),knee:.45,weight:.5,push:i%90===0,carriage:.6};
  step(s,input,engine.params,1/120,[],ice);engine.tick(input);
  assert.deepEqual(engine.state,s,`solver state at tick ${i+1}`);
 }
 assert.equal(verifyReplay(parseReplay(engine.exportReplay())).divergence,null);
});

test('a completed spin reaches snapshot().spinLevel, the free-skate readout game/main.ts already has',()=>{
 // The exact carve-then-hold-then-release recipe tools/ice-lab/test/spin.test.ts
 // itself drives a spin with, fed through engine.tick() the same way the first
 // test in this file drives the solver directly (GAME_PARAMS already carries
 // movesMode 1, so a fresh 'free' engine can spin with no extra setup).
 const e=new IceEngine();
 assert.equal(e.snapshot().spinLevel,-1,'nothing scored yet');
 for(let i=0;i<240+400+120;i++){
  const t=i-240;
  const input={...NEUTRAL_INPUT,weight:0,lean:t<0?.3:0,knee:.45,spin:t>=0&&t<400};
  e.tick(input);
 }
 assert.notEqual(e.state.move,MOVE.Spin,'the spin has been released and exited');
 const level=e.snapshot().spinLevel;
 assert.ok(level>=0&&level<=4,`spinLevel should be a real, scored level, got ${level}`);
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

test('a step sequence is a real, composer-authorable element (sim/stepLevel.ts)',()=>{
 const e=new IceEngine();
 const hello=e.catalog();
 assert.ok(Object.hasOwn(hello.elements,'step'),'ELEMENTS.step must reach the catalog the Composer picker reads');
 const snap=e.start({mode:'composer',sequence:['step']});
 assert.equal(snap.routine.sequence[0],'step');
 for(let i=0;i<50&&!e.finished;i++)e.advance({},2);
 assert.equal(e.routine.bestStepLevel,0,'no footwork driven: the honest zero, not an error');
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
