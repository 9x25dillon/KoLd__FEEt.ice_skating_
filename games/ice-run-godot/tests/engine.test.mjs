import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {setupParams} from '../runtime/game/setups.js';
import {CareerState} from '../runtime/game/career.js';
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

test('a physical combination reaches the HUD, then the finished Composer protocol without career rewards',()=>{
 // tools/ice-lab/test/combo.test.ts's recipe, at the toe loop's 6.8 m/s, through engine.tick().
 const e=new IceEngine();
 e.start({mode:'composer',sequence:['step']});
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
 // End the rehearsal at the next sample, after the real physical landings.
 e.routine.elapsed=e.routine.event.seconds-1/120;
 e.tick({...NEUTRAL_INPUT});
 const protocol=e.snapshot().result.protocol;
 assert.equal(e.result.complete,false);
 assert.deepEqual(protocol.lines,['4T+3T<'],'one combination stays one element, with its under-rotation call intact');
 assert.ok(protocol.tes>0);
 assert.equal(protocol.tes,e.routine.sheet.tes);
 assert.equal(protocol.deductions,e.routine.deductions);
 assert.ok(Math.abs(protocol.tes+protocol.pcs-protocol.deductions-protocol.total)<.011);
 assert.equal(e.result.xp,0);
 assert.equal(e.career.profile.xp,0);
 e.start({mode:'free'});
 assert.equal(e.snapshot().result,null,'a fresh skate must not retain the previous sheet');
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
 // A career program runs its full 75 s since 2026-11-02: 9,000 ticks, with room to spare.
 for(let i=0;i<9600&&!e.finished;i++){
  const c=emptyControls();c.kx=e.routine.index===1?-1:0;
  e.advance(c,1,e.routine.index===2);
 }
 assert.equal(e.routine.index,3);assert.equal(e.result.complete,true);assert.equal(e.career.medals[0],3);
 // sim/pcs.ts's own score, never reached the bridge snapshot before this.
 assert.ok(e.snapshot().routine.pcsScore.total>0,'a finished career routine must carry a real PCS score');
 const protocol=e.snapshot().result.protocol;
 assert.deepEqual(protocol.lines,[],'the opening routine has no jumps; presentation must handle an empty sheet');
 assert.equal(protocol.tes,0);
 assert.equal(protocol.pcs,e.routine.pcsScore.total);
 assert.equal(protocol.deductions,0);
 assert.equal(protocol.total,protocol.pcs);
 // Re-spaced floors (2026-11-02): a gold alone no longer opens Club debut; training does.
 const restored=new IceEngine(e.career.serialize());assert.equal(restored.career.unlocked,0);
 restored.train('balance');assert.equal(restored.career.profile.stats.balance,51);
 restored.train('edgeControl');restored.train('edgeControl');assert.equal(restored.career.unlocked,1);
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
 assert.deepEqual(hello.skins.map(k=>k.id),['violet','aurora','solstice','northlight']);
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

for(const setup of ['simulation','explorer','experimental','repertoire']) test(`${setup} raw controls match browser mapping in batched Godot ticks`,async()=>{
 const {setupInput}=await import('../runtime/game/setups.js');
 const {newSchemeState}=await import('../runtime/app/schemes.js');
 const e=new IceEngine();e.configure({setup,assistance:.75,beginner:false,cruise:false});e.start({mode:'free'});
 const s=createState(e.params,4.5),st=newSchemeState(),ice=new IceGrid(e.params.rinkHalfLength,e.params.rinkHalfWidth);
 const hardware={connected:true,axes:[-.35,0,setup==='simulation'?-.35:0,0],buttons:Array(16).fill(0),keys:[]};hardware.buttons[7]=.38;
 for(let batch=0;batch<120;batch++){
  hardware.buttons[0]=batch===20?1:0;
  hardware.buttons[10]=batch>=50&&batch<60?1:0;
  hardware.axes[2]=batch>=50&&batch<60?.5:setup==='simulation'?-.35:0;
  for(let i=0;i<2;i++){
   const {input}=setupInput({...emptyControls(),hardware},s,setup,st,e.params,e.controllerProfile,.75);
   step(s,input,e.params,1/120,[],ice);
  }
  e.advance({hardware},2);assert.deepEqual(e.state,s,`${setup}, batch ${batch}`);
 }
 assert.equal(e.snapshot().setup,setup);
 assert.equal(verifyReplay(parseReplay(e.exportReplay())).divergence,null);
});

test('simulation rejects extra gameplay assistance and setup validation is nonmutating',()=>{
 const e=new IceEngine();
 e.configure({setup:'simulation',beginner:true,cruise:true});e.start();
 assert.equal(e.beginner,false);assert.equal(e.cruise,false);assert.equal(e.params.jumpAssist,0);assert.equal(e.params.hypeMode,0);
 assert.throws(()=>e.configure({setup:'explorer',assistance:NaN}));assert.equal(e.setup,'simulation');
 assert.throws(()=>e.configure({setup:'unknown'}));assert.equal(e.setup,'simulation');
});

test('experimental keeps trigger-driven strokes when a saved preference requests Cruise',()=>{
 const e=new IceEngine();
 e.configure({setup:'experimental',beginner:true,cruise:true});e.start();
 assert.equal(e.beginner,false);assert.equal(e.cruise,false);
 assert.equal(e.snapshot().setup,'experimental');
});

test('arm focus: career trades balance for line, drills shrink it, every other mode has both',()=>{
 const e=new IceEngine(),base=e.start({mode:'free'});
 const full=e.params.internalMax;
 assert.equal(base.armStyle,1,'free skate carries the line');
 e.setArmFocus(0);e.start({mode:'career',event:0});
 assert.equal(e.params.internalMax,full,'Function is the full authority free skate has');
 assert.equal(e.routine.armExpression,0);assert.equal(e.snapshot().armStyle,0);
 e.setArmFocus(2);e.start({mode:'career',event:0});
 const raw=e.params.internalMax;
 assert.ok(raw<full,'Expression gives up authority');assert.equal(e.routine.armExpression,.5);
 e.career.recordDrill(2,100);e.start({mode:'career',event:0});
 assert.ok(e.params.internalMax>raw&&e.params.internalMax<full,'mastery narrows the trade, never removes it');
 assert.equal(e.routine.armExpression,1);
 e.start({mode:'free'});assert.equal(e.params.internalMax,full,'the choice never reaches free skate');
 const saved=CareerState.restore(e.career.serialize());
 assert.equal(saved.armFocus,2);assert.deepEqual(saved.armBest,[0,0,100]);
 assert.equal(saved.recordDrill(2,60),0,'only an improved drill counts');
 const old=JSON.parse(e.career.serialize());delete old.armFocus;delete old.armBest;
 assert.equal(CareerState.restore(JSON.stringify(old)).armFocus,1,'a save from before the drills still loads');
});

test('an arm drill scores the called line, finishes, and replays with its own params',()=>{
 const e=new IceEngine();e.setArmFocus(2);e.start({mode:'armdrill'});
 let i=0;
 while(!e.finished&&i<46*120){const d=e.drill;e.tick({...NEUTRAL_INPUT,lean:.2,weight:.5,knee:.4,push:i%90===0,carriage:d.done?0:d.wanted});i++;}
 assert.ok(e.finished,'the drill ends by itself');
 assert.ok(e.drill.score>=80,`following every call should score high: ${e.drill.score}`);
 assert.equal(e.career.armBest[2],e.drill.score);
 assert.equal(verifyReplay(parseReplay(e.exportReplay())).divergence,null);
 const f=new IceEngine();f.setArmFocus(2);f.start({mode:'armdrill'});
 for(let j=0;j<46*120&&!f.finished;j++)f.tick({...NEUTRAL_INPUT,lean:.2,weight:.5,knee:.4,push:j%90===0,carriage:f.drill.done?0:1-f.drill.wanted});
 assert.ok(f.drill.score<=20,`doing the opposite should score low: ${f.drill.score}`);
});

test('a lesson runs on its own setup, pays each step once, and a skip pays nothing',()=>{
 const e=new IceEngine();
 assert.throws(()=>e.start({mode:'lesson',course:'nope'}),/Unknown lesson/);
 e.configure({setup:'explorer'});
 assert.throws(()=>e.start({mode:'lesson',course:'experimental'}),/needs its own setup/);
 assert.equal(e.start({mode:'lesson',course:'explorer'}).tutorial.title,'Lean into a curve');
 const hardware={axes:[.5,0,0,0],buttons:Array(16).fill(0),keys:[],connected:true};
 for(let i=0;i<60;i++)e.advance({hardware},12);
 const f=e.snapshot();
 assert.equal(f.tutorial.index,1,'holding the stick passed the edge');
 assert.deepEqual(f.career.lessons,['edge']);
 assert.equal(f.career.xp,25);
 const total=f.tutorial.total;
 for(let i=1;i<total;i++)e.skipStep();
 assert.equal(e.finished,true);
 assert.match(e.result.detail,/skipped/);
 assert.equal(e.result.xp,25,'skips paid nothing');
 assert.equal(e.career.profile.xp,25);
 e.start({mode:'lesson',course:'explorer'});
 for(let i=0;i<60;i++)e.advance({hardware},12);
 assert.equal(e.career.profile.xp,25,'a second pass pays nothing');
});

test('the trust-the-ice lesson runs on every setup, and no lesson leaves a career mode behind it',()=>{
 const e=new IceEngine();
 for(const setup of ['simulation','explorer','experimental','diggate','repertoire']){
  e.configure({setup});
  const f=e.start({mode:'lesson',course:'trust'});
  assert.equal(f.tutorial.title,'Stand tall, let it carry you',setup);
  assert.ok(f.tutorial.how.length>20);
  assert.equal(e.params.internalMax,setupParams(setup).internalMax,'no arm trade-off in a lesson');
 }
 assert.throws(()=>new IceEngine().skipStep(),/No lesson/);
});

test('career prompts follow the setup, and every stat can be trained',()=>{
 const e=new IceEngine();e.configure({setup:'experimental'});
 const f=e.start({mode:'career',event:0});
 assert.match(f.routine.how,/Snap LT and RT/);
 assert.match(f.recover,/Snap a trigger/);
 e.configure({setup:'explorer'});
 assert.match(e.start({mode:'career',event:0}).routine.how,/A \/ Cross/);
 assert.deepEqual(e.snapshot().career.floors,[0,50.5,51.35,51.9,52.5]);
 assert.equal(e.snapshot().career.locks[0],'');
 e.career.profile={...e.career.profile,xp:1000};
 e.train('stamina');assert.equal(e.career.profile.stats.stamina,51);
 assert.throws(()=>e.train('luck'),/Unknown/);
});

test('a routine that ran out says which element stopped it',()=>{
 const e=new IceEngine();e.configure({setup:'experimental'});e.start({mode:'career',event:0});
 e.routine.elapsed=e.routine.event.seconds-.001;
 const hardware={axes:[0,0,0,0],buttons:Array(16).fill(0),keys:[],connected:true};
 e.advance({hardware},2);
 assert.equal(e.result.complete,false);
 assert.equal(e.result.stopped.element,'Opening glide');
 assert.match(e.result.stopped.how,/Snap LT and RT/);
});

test('a career run skates your plan, carries your rust, and shows the field only when finished',()=>{
 const e=new IceEngine();
 assert.throws(()=>e.setPlan(0,['glide']),/leaves out/);
 e.setPlan(0,['edge','glide','pose']);
 const f=e.start({mode:'career',event:0});
 assert.deepEqual(f.routine.sequence,['edge','glide','pose']);
 assert.deepEqual(f.career.plans[0],['edge','glide','pose']);
 assert.equal(f.career.field[0].length,5,'five rivals until you skate');
 e.career.rust={toe:0,edge:1};e.start({mode:'career',event:0});
 assert.equal(e.rusty.rust.edge,1);
 e.start({mode:'free'});assert.equal(e.rusty,null,'no rust outside a career');
 const w=e.career.weeks;e.drillFamily('edge');assert.equal(e.career.weeks,w-1);assert.equal(e.career.rust.edge,.75);
 assert.throws(()=>e.drillFamily('hop'),/Unknown/);
});

test('a worn career run replays exactly: wear reaches the clip as ordinary params',()=>{
 const e=new IceEngine();e.setup='simulation';e.career.wear={hip:.5,knee:.5,shoulder:.5};
 e.start({mode:'career',event:0});
 for(let i=0;i<120;i++)e.tick({...NEUTRAL_INPUT,lean:.2,knee:.4,weight:.5});
 assert.equal(verifyReplay(parseReplay(e.exportReplay())).divergence,null);
});

test('career wear: a fall costs the body as it happens, lowers the next run, and can be rested',()=>{
 const e=new IceEngine();e.setup='simulation';
 e.career.wear={hip:.5,knee:0,shoulder:0};
 e.start({mode:'free'});const free=e.params.balanceKd;
 e.start({mode:'career',event:0});
 assert.notEqual(e.params.balanceKd,free,'a worn hip lowers what career skates with');
 const stats=e.career.profile.stats.balance;
 const before=e.career.wear.hip;
 e.state.lean=e.params.fallLean+.05;
 e.tick({...NEUTRAL_INPUT});
 assert.ok(e.career.wear.hip>before,`wear ${e.career.wear.hip}`);
 assert.equal(e.career.profile.stats.balance,stats,'trained stats untouched');
 const after=e.career.wear.hip;e.tick({...NEUTRAL_INPUT});
 assert.equal(e.career.wear.hip,after,'one fall, once');
 const weeks=e.career.weeks;e.rest('hip');
 assert.equal(e.career.weeks,weeks-1);assert.ok(e.career.wear.hip<after);
 assert.throws(()=>e.rest('elbow'));
 assert.ok(e.catalog().bodyRegions.length===3);
 const snap=e.snapshot();assert.deepEqual(snap.career.wear,e.career.wear);
 e.start({mode:'free'});const w=e.career.wear.hip;e.state.lean=e.params.fallLean+.05;e.tick({...NEUTRAL_INPUT});
 assert.equal(e.career.wear.hip,w,'other modes cost the body nothing');
});
