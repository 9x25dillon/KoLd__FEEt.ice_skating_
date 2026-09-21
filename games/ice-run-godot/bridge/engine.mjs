import {createState,step} from '../runtime/sim/solver.js';
import {IceGrid} from '../runtime/sim/ice.js';
import {SIM_DT,PRESETS} from '../runtime/sim/params.js';
import {MOVE,TURN_KIND,NEUTRAL_INPUT,codeToString} from '../runtime/sim/types.js';
import {JUMP_PHASE,JUMP_CODE} from '../runtime/sim/jump.js';
import {ReplayRecorder,ReplayPlayer,parseReplay} from '../runtime/sim/replay.js';
import {SessionMeter} from '../runtime/sim/session.js';
import {applyProfile,SAMPLE_PROFILES,xpToRaise} from '../runtime/sim/profile.js';
import {loadTables,scoreJump} from '../runtime/sim/score.js';
import {loadSpinFeatureThresholds,SpinLevelTracker,scoreSpinLevel} from '../runtime/sim/spinLevel.js';
import {loadStepFeatureThresholds} from '../runtime/sim/stepLevel.js';
import {loadSegmentRules} from '../runtime/sim/pcs.js';
import {newSchemeState} from '../runtime/app/schemes.js';
import {gameInput,GAME_PARAMS} from '../runtime/game/controls.js';
import {defaultControllerProfile,parseControllerProfile,validHardware,ACTIONS,BUTTON_NAMES,TUNING,bindingLabel} from '../runtime/game/full-controls.js';
import {BeginnerCoach,BEGINNER_PARAMS} from '../runtime/game/beginner.js';
import {CareerState,Choreography,CAREER_EVENTS,ELEMENTS,MEDALS} from '../runtime/game/career.js';
import {Practice,LESSONS} from '../runtime/game/practice.js';
import {IceRun,LIGHTS} from '../runtime/game/run.js';
import {RookieCourse,ROOKIE_GATES} from '../runtime/game/rookie.js';
import {Playground,SNOWFLAKES,TARGETS} from '../runtime/game/playground.js';
import {resolveRinkCollision,RINK} from '../runtime/game/rink.js';
import {readFileSync} from 'node:fs';

const tables=loadTables(readFileSync(new URL('../runtime/data/scale-of-values.csv',import.meta.url),'utf8'),readFileSync(new URL('../runtime/data/calls-and-deductions.csv',import.meta.url),'utf8'));
const spinThresholds=loadSpinFeatureThresholds(readFileSync(new URL('../runtime/data/spin-features.json',import.meta.url),'utf8'));
const stepThresholds=loadStepFeatureThresholds(readFileSync(new URL('../runtime/data/step-features.json',import.meta.url),'utf8'));
const segmentRules=loadSegmentRules(readFileSync(new URL('../runtime/data/segment-rules.csv',import.meta.url),'utf8'));
export const tracks=JSON.parse(readFileSync(new URL('../runtime/tracks.json',import.meta.url),'utf8'));
export const emptyControls=()=>({lx:0,ly:0,rx:0,ry:0,lean:0,pitch:0,kx:0,ky:0,kPrimaryX:0,kAltX:0,knee:.35,weight:.5,carriage:0,windup:0,push:false,brake:false,toe:false,turn:false,bracket:false,twizzle:false,spin:false,inaBauer:false,reset:false,pause:false,cyclePreset:false,cycleScheme:false,cycleJump:false,cycleView:false,zoom:0,dpadStep:0,tilt:0,toggleGame:false,cycleGhost:false,pickJump:-1,cycleProfile:false,cycleMoves:false,cycleRink:false});
export class IceEngine {
 constructor(save=null) {
  this.controllerProfile=defaultControllerProfile();
  this.career=CareerState.restore(save); this.track=0; this.scheme=1; this.beginner=true;
  this.profile=0; this.cruise=true; this.sequence=['glide','edge','jump','spin','pose'];
  this.start({mode:'free'});
 }
 catalog() {return {controller:{profile:defaultControllerProfile(),actions:ACTIONS,buttons:BUTTON_NAMES,tuning:TUNING},events:CAREER_EVENTS,elements:ELEMENTS,tracks,medals:MEDALS,profiles:SAMPLE_PROFILES.map(p=>p.name),presets:Object.keys(PRESETS),rink:RINK,lights:LIGHTS,gates:ROOKIE_GATES,flakes:SNOWFLAKES,targets:TARGETS};}
 start(options={}) {
  const mode=options.mode??this.mode??'free';
  if(!['free','career','rookie','timed','composer'].includes(mode)) throw Error('Unknown skating mode');
  const index=options.event??this.event??0;
  if(mode==='career'&&(!Number.isInteger(index)||index<0||index>this.career.unlocked)) throw Error('Complete the previous career event first');
  if(options.sequence) {
   if(!Array.isArray(options.sequence)||options.sequence.length<1||options.sequence.length>16||options.sequence.some(id=>!Object.hasOwn(ELEMENTS,id))) throw Error('A program needs 1–16 valid elements');
   this.sequence=[...options.sequence];
  }
  this.mode=mode;this.event=index;
  this.state=createState(this.params=applyProfile(this.beginner?BEGINNER_PARAMS:GAME_PARAMS,mode==='career'?this.career.profile:SAMPLE_PROFILES[this.profile]),4.5);
  const t=tracks[this.track]; Object.assign(this.params,{musicBpm:t.bpm,musicOffset:t.offset,musicBeatsPerBar:t.beatsPerBar,musicBarsPerPhrase:t.barsPerPhrase});
  this.state=createState(this.params,4.5);
  this.ice=new IceGrid(this.params.rinkHalfLength,this.params.rinkHalfWidth);
  this.steering=newSchemeState();this.coach=new BeginnerCoach();this.practice=new Practice();this.run=new IceRun();this.rookie=new RookieCourse();this.playground=new Playground();
  this.routine=mode==='career'?new Choreography(CAREER_EVENTS[index],tables,spinThresholds,stepThresholds,segmentRules,this.ice):mode==='composer'?new Choreography({id:'authored',title:'Your signature program',venue:'Composer rehearsal',seconds:180,routine:this.sequence,discipline:'women',segment:'free'},tables,spinThresholds,stepThresholds,segmentRules,this.ice):null;
  this.recorder=new ReplayRecorder(this.params,4.5);this.player=null;this.meter=new SessionMeter();this.elapsed=0;this.low=false;this.technical=0;this.scoredTick=-1;this.finished=false;this.result=null;this.events=[];this.trace=[];
  // The live free-skate readout game/main.ts already has (frame.technical above is its jump half) —
  // sample every tick a spin is live, score the moment it ends. -1 means no spin has finished yet;
  // scoreSpinLevel's own 0 is a real result, "level B", so it cannot double as that sentinel.
  this.spinTracker=new SpinLevelTracker();this.wasSpinning=false;this.spinLevel=-1;
  // sim/moves.ts spinTick's foot change: never surfaced here before, the
  // same decaying-flash idiom game/main.ts's own `flash` uses.
  this.lastChangeCompletedTick=-1;this.footChangeFlash=0;
  return this.snapshot();
 }
 configure(o) {
  if(o.controllerProfile!==undefined) {this.controllerProfile=parseControllerProfile(o.controllerProfile);this.steering=newSchemeState();}
  if(o.scheme!==undefined) {if(![0,1,2,3].includes(o.scheme))throw Error('Unknown control scheme');this.scheme=o.scheme;this.steering=newSchemeState();}
  if(o.beginner!==undefined)this.beginner=Boolean(o.beginner);
  if(o.cruise!==undefined)this.cruise=Boolean(o.cruise);
  if(o.track!==undefined){if(!Number.isInteger(o.track)||!tracks[o.track])throw Error('Unknown track');this.track=o.track;}
  if(o.profile!==undefined){if(!Number.isInteger(o.profile)||!SAMPLE_PROFILES[o.profile])throw Error('Unknown profile');this.profile=o.profile;}
 }
 advance(controls={},ticks=2,low=false) {
  if(!Number.isInteger(ticks)||ticks<1||ticks>12)throw Error('Tick batches must contain 1–12 ticks');
  const c={...emptyControls(),...controls};
  if(!this.player&&this.scheme===3&&!validHardware(c.hardware))throw Error("Invalid raw controller input");
  for(const [key,value] of Object.entries(emptyControls())) {
   if(typeof value==='number'&&(!Number.isFinite(c[key])||Math.abs(c[key])>10))throw Error('Invalid control '+key);
   if(typeof value==='boolean'&&typeof c[key]!=='boolean')throw Error('Invalid button '+key);
  }
  this.trace=[];this.events=[];
  for(let i=0;i<ticks&&!this.finished;i++) {
   if(this.player) {
    this.player.advance();this.state=this.player.state;this.params=this.player.params;this.events=this.player.events;
    resolveRinkCollision(this.state,this.events);
    if(this.player.done){this.finished=true;this.result={title:this.player.divergence?'Replay mismatch':'Replay verified',detail:`${this.player.index} ticks`,replay:true};}
   } else {
    const s=this.state;
    const canPush=!s.fallen&&s.move===MOVE.None&&s.jump.phase===JUMP_PHASE.None&&!c.brake&&!c.spin&&!c.turn&&!c.twizzle&&!c.inaBauer&&!low;
    const repeat=canPush&&s.tick%90===0&&(controls.pushHeld||(this.cruise&&Math.hypot(s.vel.x,s.vel.y)<5.5));
    const mapped=gameInput({...c,push:(i===0&&c.push)||repeat,autoPush:repeat,toe:i===0&&c.toe},s,this.scheme,this.steering,low,this.params,this.controllerProfile);
    const input=this.beginner?this.coach.apply(mapped.input,s,this.params,this.scheme!==3&&i===0&&c.cycleJump,SIM_DT):mapped.input;
    this.low=mapped.cantilever;
    this.tick(input);
   }
   this.elapsed+=SIM_DT;
   if(this.state.tick%4===0)this.trace.push(this.state.blade.map(b=>({x:b.contact.x,y:b.contact.y,contact:b.inContact&&this.state.jump.phase!==JUMP_PHASE.Air&&!this.state.fallen})));
  }
  return this.snapshot();
 }
 /** Same solver and recording order as Ice Run; renderer never writes physics. */
 tick(input) {
  const events=[];
  step(this.state,input,this.params,SIM_DT,events,this.ice);
  this.recorder.capture(input,this.params,this.state,events,['A','B','C','D'][this.scheme]);
  this.meter.sample(this.state,input,events,SIM_DT);
  resolveRinkCollision(this.state,events);this.events.push(...events);
  this.practice.sample(this.state,this.low,SIM_DT);
  if(this.mode==='rookie')this.rookie.sample(this.state,SIM_DT);
  if(this.mode==='timed')this.run.sample(this.state,SIM_DT);
  // Free Skate stays quiet per the bible. The original playground remains available in runtime.
  if(this.state.landed.tick>=0&&this.scoredTick!==this.state.landed.tick){this.scoredTick=this.state.landed.tick;this.technical+=scoreJump(tables,this.state.landed)?.score??0;}
  if(this.state.spin.changeCompletedTick>=0&&this.state.spin.changeCompletedTick!==this.lastChangeCompletedTick){
   this.lastChangeCompletedTick=this.state.spin.changeCompletedTick;this.footChangeFlash=1.2;
  }
  this.footChangeFlash=Math.max(0,this.footChangeFlash-SIM_DT);
  const spinning=this.state.move===MOVE.Spin;
  if(spinning)this.spinTracker.sample(this.state.spin);
  else if(this.wasSpinning){this.spinLevel=scoreSpinLevel(this.spinTracker.finish(),spinThresholds,this.spinTracker.footChanges).level;this.spinTracker.reset();}
  this.wasSpinning=spinning;
  if(this.routine)this.routine.sample(this.state,this.low,SIM_DT,events);
  if(this.routine?.done) {
   const r=this.routine,xp=this.mode==='career'?this.career.award(r):0;
   // sim/pcs.ts's own score, never shown here before — silently absent (not a misleading "0.00")
   // whenever finalizePcs left it null, the same as game/main.ts's own equivalent line.
   const pcs=r.pcsScore?` · PCS ${r.pcsScore.total.toFixed(2)}`:'';
   this.finished=true;this.result={title:r.complete?`${MEDALS[r.medal]} on ice`:'One more rehearsal',detail:`${r.index}/${r.event.routine.length} elements · ${r.falls} falls · ${this.technical.toFixed(2)} jump TES${pcs}`,xp,complete:r.complete};
  } else if(this.mode==='timed'&&this.run.done){this.finished=true;this.result={title:'Your lines, recorded',detail:`${this.run.score} points · ${this.run.collected} lights · ${this.run.falls} falls`,complete:true};}
 }
 replay(json){const clip=parseReplay(json);this.start({mode:'free'});this.player=new ReplayPlayer(clip);this.state=this.player.state;this.params=this.player.params;return this.snapshot();}
 exportReplay(){return this.recorder.toJson();}
 train(stat){if(!['strength','spring','edgeControl','balance'].includes(stat))throw Error('Unknown training skill');this.career.train(stat);}
 snapshot() {
  const s=this.state,r=this.routine;
  // Turn's own kind, broken down the same way game/main.ts's free-skate HUD
  // already does — this bridge used to say the bare 'Turn' for all six.
  const turnLabel=s.turn.against?(s.turn.kind===TURN_KIND.Counter?'Counter':'Bracket')
   :s.turn.kind===TURN_KIND.Mohawk?'Mohawk':s.turn.kind===TURN_KIND.Choctaw?'Choctaw'
   :s.turn.kind===TURN_KIND.Loop?'Loop':s.turn.kind===TURN_KIND.Rocker?'Rocker'
   :'Three-turn';
  const move=s.fallen?'Recover · press Space / A':s.jump.phase===JUMP_PHASE.Air?'Jump · in flight':s.jump.phase===JUMP_PHASE.Load?'Gather · release to take off':s.move===MOVE.Spin?'Spin':s.move===MOVE.Twizzle?'Twizzle':s.move===MOVE.InaBauer?'Ina Bauer':s.move===MOVE.Spiral?'Spiral':s.move===MOVE.Turn?turnLabel:this.low?'Cantilever':s.crossover&&s.strokeTime>0?'Crossover':'Glide';
  return {controllerRequest:this.steering.full?.request??null,controllerProfile:this.controllerProfile,controllerBindings:ACTIONS.map(a=>({name:a.name,key:a.key,binding:bindingLabel(this.controllerProfile,a.id)})),state:s,events:this.events,trace:this.trace,mode:this.mode,move,low:this.low,elapsed:this.elapsed,finished:this.finished,result:this.result,technical:this.technical,spinLevel:this.spinLevel,footChange:this.footChangeFlash>0,track:this.track,scheme:this.scheme,beginner:this.beginner,cruise:this.cruise,
   edge:s.blade.map(b=>codeToString(b.code)),jump:s.landed.tick<0?null:{tick:s.landed.tick,kind:JUMP_CODE[s.landed.kind]??'Hop',rotations:s.landed.turned,clean:!s.landed.fall&&!s.landed.stepOut},
   routine:r?{title:r.event.title,sequence:r.event.routine,index:r.index,seconds:r.seconds,held:r.held,falls:r.falls,medal:r.medal,pcsScore:r.pcsScore}:null,
   lesson:{index:this.practice.next,title:LESSONS[this.practice.next]?.[0]??'Make it your own',hint:LESSONS[this.practice.next]?.[1]??'Link the moves into your own program.',done:this.practice.done},
   rookie:{index:this.rookie.index,cleared:this.rookie.cleared,title:this.rookie.title,hint:this.rookie.hint,target:this.rookie.target},
   run:{seconds:this.run.seconds,score:this.run.score,collected:this.run.collected,target:this.run.target},
   career:{medals:this.career.medals,unlocked:this.career.unlocked,xp:this.career.profile.xp,stats:this.career.profile.stats,costs:Object.fromEntries(Object.entries(this.career.profile.stats).map(([k,v])=>[k,xpToRaise(v)]))}};
 }
}
