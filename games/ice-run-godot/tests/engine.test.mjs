import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {createState,step} from '../runtime/sim/solver.js';
import {IceGrid} from '../runtime/sim/ice.js';
import {NEUTRAL_INPUT,MOVE,TURN_KIND} from '../runtime/sim/types.js';
import {verifyReplay,parseReplay} from '../runtime/sim/replay.js';
import {JUMP_PHASE} from '../runtime/sim/jump.js';
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

test("a turn's own kind reaches snapshot().move — the bridge used to say the bare 'Turn' for all six",()=>{
 // Fourteenth session (this file's own note in engine.mjs): the bridge never
 // broke Turn down the way game/main.ts's free-skate HUD already did. Direct
 // state, not a real entry: isolates the label mapping from turn-entry
 // physics tools/ice-lab/test/turn.test.ts already covers on its own.
 const e=new IceEngine();
 e.state.move=MOVE.Turn;
 e.state.turn.kind=TURN_KIND.ThreeTurn;e.state.turn.against=false;
 assert.equal(e.snapshot().move,'Three-turn');
 e.state.turn.kind=TURN_KIND.Mohawk;
 assert.equal(e.snapshot().move,'Mohawk');
 e.state.turn.kind=TURN_KIND.Bracket;e.state.turn.against=true;
 assert.equal(e.snapshot().move,'Bracket');
 e.state.turn.kind=TURN_KIND.Loop;e.state.turn.against=false;
 assert.equal(e.snapshot().move,'Loop');
 e.state.turn.kind=TURN_KIND.Rocker;
 assert.equal(e.snapshot().move,'Rocker');
 e.state.turn.kind=TURN_KIND.Counter;e.state.turn.against=true;
 assert.equal(e.snapshot().move,'Counter');
});

test('a jump taken straight off the last landing edge reaches snapshot().combo, then decays',()=>{
 // tools/ice-lab/test/combo.test.ts's recipe, at the toe loop's 6.8 m/s, through engine.tick().
 const e=new IceEngine();
 e.state=createState(e.params,-6.8);
 let load=180,n=0,last=-1;const seen=new Set();
 for(let i=0;i<900;i++){
  const air=e.state.jump.phase===JUMP_PHASE.Air,k=i-load,loading=load>=0&&k>=0&&k<36;
  e.tick({...NEUTRAL_INPUT,lean:-.25,weight:1,knee:loading?.95:load>=0&&k>=36&&k<39?0:n===0&&i<180?.35:.8,
   carriage:!air&&(loading||k===36)?1:0,toe:load>=0&&k===34});
  if(e.snapshot().combo)seen.add(e.snapshot().combo);
  if(e.state.landed.tick!==last){last=e.state.landed.tick;load=n<1?i+90:-1;n++;}
 }
 assert.deepEqual([...seen],['4T+3T<'],'the game params rise higher than the lab preset: a quad, then an under-rotated triple');
 assert.equal(e.snapshot().combo,'','the flash must decay rather than stick forever');
});

test('a foot change mid-spin reaches snapshot().footChange as a brief flash, then decays',()=>{
 // tools/ice-lab/test/spin.test.ts's own recipe for change_foot_by_jump,
 // driven through engine.tick() the same way the spinLevel test above does.
 const e=new IceEngine();
 let sawFlash=false;
 for(let i=0;i<240+900;i++){
  const t=i-240;
  const input={...NEUTRAL_INPUT,weight:0,lean:t<0?.3:0,knee:.7,toe:t===50,spin:t>=0&&t<900};
  e.tick(input);
  if(e.snapshot().footChange)sawFlash=true;
 }
 assert.ok(e.state.spin.changeCompletedTick>0,'the change must actually have completed');
 assert.ok(sawFlash,'footChange must flash true on the tick(s) right after it completes');
 for(let i=0;i<200;i++)e.tick({...NEUTRAL_INPUT,weight:0,lean:0,knee:.7});
 assert.equal(e.snapshot().footChange,false,'the flash must decay rather than stick forever');
});

test('bridge runs full physical choreography and persists earned progression',()=>{
 const e=new IceEngine();e.start({mode:'career',event:0});
 for(let i=0;i<9000&&!e.finished;i++){
  const c=emptyControls();c.kx=e.routine.index===1?-1:0;
  e.advance(c,1,e.routine.index===2);
 }
 assert.equal(e.routine.index,3);assert.equal(e.result.complete,true);assert.equal(e.career.medals[0],3);
 // sim/pcs.ts's own score, never reached the bridge snapshot before this.
 assert.ok(e.snapshot().routine.pcsScore.total>0,'a finished career routine must carry a real PCS score');
 assert.match(e.result.detail,/PCS \d+\.\d\d/,"the finished routine's own result text must carry it too");
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
 // Costumes are the browser's own SKINS data, not a Godot copy: scripts/skater.gd recolours from these.
 assert.deepEqual(hello.skins.map(k=>k.id),['violet','aurora','solstice']);
 for(const k of hello.skins)for(const f of ['bodice','skirt','sleeve','trim','hair','skin','tights'])assert.match(k[f],/^#[0-9a-f]{6}$/,`${k.id}.${f}`);
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

test('Full repertoire uses shared raw mapping in Godot, including batched taps and D replay', async()=>{
 const {gameInput}=await import('../runtime/game/controls.js');
 const {newSchemeState}=await import('../runtime/app/schemes.js');
 const e=new IceEngine();e.configure({scheme:3,beginner:false,cruise:false});e.start({mode:'free'});
 const s=createState(e.params,4.5),st=newSchemeState(),ice=new IceGrid(e.params.rinkHalfLength,e.params.rinkHalfWidth);
 const hardware={connected:true,axes:[-.5,0,0,0],buttons:Array(16).fill(0),keys:[]};hardware.buttons[7]=.38;
 for(let batch=0;batch<180;batch++){
  hardware.buttons[15]=batch===120?1:0;
  for(let i=0;i<2;i++){
   const {input}=gameInput({...emptyControls(),hardware},s,3,st,false,e.params,e.controllerProfile);
   step(s,input,e.params,1/120,[],ice);
  }
  e.advance({hardware},2);
  assert.deepEqual(e.state,s,`raw mapping parity, batch ${batch}`);
 }
 assert.equal(e.state.moveDone.detail,TURN_KIND.Rocker);
 const clip=parseReplay(e.exportReplay());assert.ok(clip.frames.every(f=>f.scheme==='D'));
 assert.equal(verifyReplay(clip).divergence,null);
});
test('controller profiles validate before replacing settings and raw payloads are bounded',()=>{
 const e=new IceEngine(),p=structuredClone(e.controllerProfile);
 p.leanGain=.4;[p.bindings.rocker,p.bindings.loop]=[p.bindings.loop,p.bindings.rocker];
 e.configure({scheme:3,controllerProfile:p});
 assert.equal(e.controllerProfile.leanGain,.4);
 assert.equal(e.snapshot().controllerBindings.find(b=>b.name==='Rocker turn').binding,'D-pad ↑');
 assert.throws(()=>e.configure({controllerProfile:{...p,deadzone:1}}));assert.deepEqual(e.controllerProfile,p);
 assert.throws(()=>e.advance({hardware:{axes:[NaN,0,0,0],buttons:[],keys:[],connected:true}},2));
 assert.throws(()=>e.advance({hardware:{axes:[0,0,0,0],buttons:[],keys:Array(65).fill('x'),connected:true}},2));
 assert.throws(()=>e.advance({},2));
});
