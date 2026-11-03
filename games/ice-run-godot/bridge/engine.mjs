import {createState,step} from '../runtime/sim/solver.js';
import {IceGrid} from '../runtime/sim/ice.js';
import {SIM_DT,PRESETS} from '../runtime/sim/params.js';
import {MOVE,TURN_KIND,NEUTRAL_INPUT,codeToString} from '../runtime/sim/types.js';
import {JUMP_PHASE,JUMP_CODE} from '../runtime/sim/jump.js';
import {ReplayRecorder,ReplayPlayer,parseReplay,replayDigest,MAX_REPLAY_BYTES} from '../runtime/sim/replay.js';
import {SessionMeter} from '../runtime/sim/session.js';
import {applyProfile,SAMPLE_PROFILES,xpToRaise,overall,STAT_NAMES} from '../runtime/sim/profile.js';
import {loadTables,scoreJump} from '../runtime/sim/score.js';
import {loadSpinFeatureThresholds,SpinLevelTracker,scoreSpinLevel} from '../runtime/sim/spinLevel.js';
import {loadStepFeatureThresholds} from '../runtime/sim/stepLevel.js';
import {loadSegmentRules} from '../runtime/sim/pcs.js';
import {newSchemeState} from '../runtime/app/schemes.js';
import {SETUPS,isSetup,setupParams,setupInput} from '../runtime/game/setups.js';
import {gameInput,GAME_PARAMS} from '../runtime/game/controls.js';
import {defaultControllerProfile,parseControllerProfile,validHardware,ACTIONS,BUTTON_NAMES,TUNING,bindingLabel} from '../runtime/game/full-controls.js';
import {BeginnerCoach,BEGINNER_PARAMS} from '../runtime/game/beginner.js';
import {CareerState,Choreography,CAREER_EVENTS,ELEMENTS,MEDALS,EVENT_FLOORS,LESSON_XP,PLAN_EXTRA} from '../runtime/game/career.js';
import {Tutorial,STEPS as TRUST_STEPS} from '../runtime/game/tutorial.js';
import {RustGate,JUMP_FAMILIES} from '../runtime/game/training.js';
import {BODY_REGIONS,FallWatch,wearNote} from '../runtime/game/wear.js';
import {standings,seasonTable,RIVALS} from '../runtime/game/rivals.js';
import {COURSES,courseById,courseSteps,howContext,elementHow,recoverHow} from '../runtime/game/padcourse.js';
import {ARM_FOCUS,ArmDrill,armParams,armExpression} from '../runtime/game/armfocus.js';
import {Practice,LESSONS} from '../runtime/game/practice.js';
import {IceRun,LIGHTS} from '../runtime/game/run.js';
import {RookieCourse,ROOKIE_GATES} from '../runtime/game/rookie.js';
import {SKINS} from '../runtime/game/appearance.js';
import {Wardrobe,PARTS,FABRICS,CRYSTALS,MAX_DESIGNS,NAME_LIMIT,designFromPreset,designSkin,parseDesign} from '../runtime/game/atelier.js';
import {checkTimeline,cueTimes,spreadTimeline,retime,nudge,addCue,removeCue,requiredCues,sortedCues,barCount,barSeconds,barStart,parseTimeline,MIN_GAP_BARS,CUE_EARLY_BARS,CUE_LATE_BARS} from '../runtime/game/composer.js';
import {ComboTracker} from '../runtime/sim/combo.js';
import {Playground,SNOWFLAKES,TARGETS} from '../runtime/game/playground.js';
import {resolveRinkCollision,RINK} from '../runtime/game/rink.js';
import {PairsSession,PAIRS_PHRASES} from '../runtime/game/pairs.js';
import {readFileSync} from 'node:fs';

const tables=loadTables(readFileSync(new URL('../runtime/data/scale-of-values.csv',import.meta.url),'utf8'),readFileSync(new URL('../runtime/data/calls-and-deductions.csv',import.meta.url),'utf8'));
const spinThresholds=loadSpinFeatureThresholds(readFileSync(new URL('../runtime/data/spin-features.json',import.meta.url),'utf8'));
const stepThresholds=loadStepFeatureThresholds(readFileSync(new URL('../runtime/data/step-features.json',import.meta.url),'utf8'));
const segmentRules=loadSegmentRules(readFileSync(new URL('../runtime/data/segment-rules.csv',import.meta.url),'utf8'));
export const tracks=JSON.parse(readFileSync(new URL('../runtime/tracks.json',import.meta.url),'utf8'));
/** Measured 2026-11-01: Simulation's words land from 3 to 5.5 m/s and Experimental's near 4.5, but Blade Explorer's best clean landing in 4,320 takeoffs was 0.03 rev. */
const UNPROVEN_AIR='This one may not land on this setup yet: no scripted takeoff has. Pause and skip it if it will not come.';
export const emptyControls=()=>({lx:0,ly:0,rx:0,ry:0,lean:0,pitch:0,kx:0,ky:0,kPrimaryX:0,kAltX:0,knee:.35,weight:.5,carriage:0,windup:0,push:false,brake:false,toe:false,turn:false,bracket:false,twizzle:false,spin:false,inaBauer:false,reset:false,pause:false,cyclePreset:false,cycleScheme:false,cycleJump:false,cycleView:false,zoom:0,dpadStep:0,tilt:0,toggleGame:false,cycleGhost:false,pickJump:-1,cycleProfile:false,cycleMoves:false,cycleRink:false});
export class IceEngine {
 constructor(save=null,wardrobe=null) {
  this.wardrobe=Wardrobe.restore(wardrobe);this.draft=null;
  this.controllerProfile=defaultControllerProfile();this.setup=null;this.assistance=.75;
  this.career=CareerState.restore(save); this.track=0; this.scheme=1; this.beginner=true;
  this.profile=0; this.cruise=true; this.sequence=['glide','edge','jump','spin','pose'];
  this.start({mode:'free'});
 }
 catalog() {return {bodyRegions:BODY_REGIONS,families:JUMP_FAMILIES,planExtra:PLAN_EXTRA,rivals:RIVALS.map(r=>r.name),courses:COURSES.map(c=>({id:c.id,title:c.title,blurb:c.blurb,setups:c.setups})),trustSteps:TRUST_STEPS.length,lessonXp:LESSON_XP,armFocus:ARM_FOCUS,setups:SETUPS,controller:{profile:defaultControllerProfile(),actions:ACTIONS,buttons:BUTTON_NAMES,tuning:TUNING},events:CAREER_EVENTS,elements:ELEMENTS,tracks,medals:MEDALS,profiles:SAMPLE_PROFILES.map(p=>p.name),presets:Object.keys(PRESETS),rink:RINK,lights:LIGHTS,gates:ROOKIE_GATES,skins:SKINS,atelier:{parts:PARTS,fabrics:FABRICS,crystals:CRYSTALS,maxDesigns:MAX_DESIGNS,nameLimit:NAME_LIMIT,starts:SKINS.map(s=>designFromPreset(s))},composer:{minGap:MIN_GAP_BARS,early:CUE_EARLY_BARS,late:CUE_LATE_BARS},flakes:SNOWFLAKES,targets:TARGETS};}
 start(options={}) {
  const mode=options.mode??this.mode??'free';
  if(!['free','career','rookie','timed','composer','pairs','armdrill','lesson'].includes(mode)) throw Error('Unknown skating mode');
  if(options.pairsChallenge!==undefined&&typeof options.pairsChallenge!=='boolean')throw Error('Invalid pairs challenge');
  const index=options.event??this.event??0;
  if(mode==='career'&&(!Number.isInteger(index)||index<0||index>this.career.unlocked)) throw Error('Complete the previous career event first');
  if(options.sequence) {
   if(!Array.isArray(options.sequence)||options.sequence.length<1||options.sequence.length>16||options.sequence.some(id=>!Object.hasOwn(ELEMENTS,id))) throw Error('A program needs 1–16 valid elements');
   this.sequence=[...options.sequence];
  }
  // A lesson: 'trust' is game/tutorial.ts's course, on any setup; the rest belong to their setups.
  const course=mode==='lesson'?(options.course??this.course??'trust'):null;
  if(mode==='lesson'&&course!=='trust'){
   const known=courseById(course);
   if(!known)throw Error('Unknown lesson');
   if(!known.setups.includes(this.setup))throw Error(`${known.title} needs its own setup`);
  }
  this.course=course;
  this.mode=mode;this.event=index;
  this.state=createState(this.params=applyProfile(this.setup?setupParams(this.setup,this.assistance):this.beginner?BEGINNER_PARAMS:GAME_PARAMS,mode==='career'?this.career.bodyProfile:SAMPLE_PROFILES[this.profile]),4.5);
  // Only career trades balance for line; every other mode has both at once.
  const armed=mode==='career'||mode==='armdrill',focus=this.career.armFocus;
  this.fallWatch=armed?new FallWatch():null;this.newInjuries=[];this.wearStart={...this.career.wear};
  if(armed)this.params=armParams(this.params,focus,this.career.armBest[focus]);
  this.drill=mode==='armdrill'?new ArmDrill(focus):null;this.armStyle=armed?ARM_FOCUS[focus].style:1;
  // A career program laid on its music skates to that music, whatever the soundtrack setting.
  const laid=mode==='career'?this.career.timelines[index]:null,timeline=laid&&tracks[laid.track]?laid:null;
  this.runTrack=timeline?timeline.track:this.track;this.draft=null;
  const t=tracks[this.runTrack]; Object.assign(this.params,{musicBpm:t.bpm,musicOffset:t.offset,musicBeatsPerBar:t.beatsPerBar,musicBarsPerPhrase:t.barsPerPhrase});
  this.state=createState(this.params,4.5);
  this.pairs=mode==='pairs'?new PairsSession(this.state,this.params,options.pairsChallenge??false):null;
  this.pairFrames=[];this.pairPlayback=null;this.pairMismatch=false;this.partnerTrace=[];
  this.ice=new IceGrid(this.params.rinkHalfLength,this.params.rinkHalfWidth);
  this.steering=newSchemeState();this.coach=new BeginnerCoach();this.practice=new Practice();this.run=new IceRun();this.rookie=new RookieCourse();this.playground=new Playground();
  this.rusty=mode==='career'?new RustGate(this.career.rust):null;
  this.routine=mode==='career'?new Choreography(this.career.planned(index),tables,spinThresholds,stepThresholds,segmentRules,this.ice):mode==='composer'?new Choreography({id:'authored',title:'Your signature program',venue:'Composer rehearsal',seconds:180,routine:this.sequence,discipline:'women',segment:'free'},tables,spinThresholds,stepThresholds,segmentRules,this.ice):null;
  if(mode==='career'){this.routine.fullTime=true;this.routine.rust={...this.career.rust};}
  if(mode==='career')this.routine.armExpression=armExpression(focus,this.career.armBest[focus]);
  if(timeline&&!this.routine.setCues(cueTimes(tracks[timeline.track],timeline)))throw Error('This program no longer matches its music');
  this.lesson=mode==='lesson'?(course==='trust'?new Tutorial(this.setup):new Tutorial(this.setup,0,courseSteps(courseById(course),this.setup))):null;this.lessonXp=0;
  this.recorder=new ReplayRecorder(this.params,4.5);this.player=null;this.meter=new SessionMeter();this.elapsed=0;this.low=false;this.technical=0;this.scoredTick=-1;this.finished=false;this.result=null;this.events=[];this.trace=[];
  // The live free-skate readout game/main.ts already has (frame.technical above is its jump half) —
  // sample every tick a spin is live, score the moment it ends. -1 means no spin has finished yet;
  // scoreSpinLevel's own 0 is a real result, "level B", so it cannot double as that sentinel.
  this.spinTracker=new SpinLevelTracker();this.wasSpinning=false;this.spinLevel=-1;
  // sim/moves.ts spinTick's foot change: never surfaced here before, the
  // same decaying-flash idiom game/main.ts's own `flash` uses.
  this.lastChangeCompletedTick=-1;this.footChangeFlash=0;this.combo=new ComboTracker();this.comboFlash=0;this.comboLabel='';
  return this.snapshot();
 }
 configure(o) {
  if(o.setup!==undefined&&o.setup!==null&&!isSetup(o.setup))throw Error('Unknown skating setup');
  if(o.assistance!==undefined&&(!Number.isFinite(o.assistance)||o.assistance<.5||o.assistance>1))throw Error('Assistance must be 0.5–1');
  if(o.setup!==undefined){this.setup=o.setup;this.steering=newSchemeState();}
  if(o.assistance!==undefined)this.assistance=o.assistance;
  if(o.controllerProfile!==undefined) {this.controllerProfile=parseControllerProfile(o.controllerProfile);this.steering=newSchemeState();}
  if(o.scheme!==undefined) {if(![0,1,2,3].includes(o.scheme))throw Error('Unknown control scheme');this.scheme=o.scheme;this.steering=newSchemeState();}
  if(o.beginner!==undefined)this.beginner=Boolean(o.beginner);
  if(o.cruise!==undefined)this.cruise=Boolean(o.cruise);
  if(o.track!==undefined){if(!Number.isInteger(o.track)||!tracks[o.track])throw Error('Unknown track');this.track=o.track;}
  if(o.profile!==undefined){if(!Number.isInteger(o.profile)||!SAMPLE_PROFILES[o.profile])throw Error('Unknown profile');this.profile=o.profile;}
  if(this.setup){this.scheme=3;if(this.setup!=='repertoire')this.beginner=false;if(this.setup==='simulation'||this.setup==='experimental')this.cruise=false;}
 }
 advance(controls={},ticks=2,low=false) {
  if(!Number.isInteger(ticks)||ticks<1||ticks>12)throw Error('Tick batches must contain 1–12 ticks');
  const c={...emptyControls(),...controls};
  for(const key of ['pairHold','pairLift'])if(c[key]!==undefined&&typeof c[key]!=='boolean')throw Error('Invalid button '+key);
  if(!this.player&&this.scheme===3&&!validHardware(c.hardware))throw Error("Invalid raw controller input");
  for(const [key,value] of Object.entries(emptyControls())) {
   if(typeof value==='number'&&(!Number.isFinite(c[key])||Math.abs(c[key])>10))throw Error('Invalid control '+key);
   if(typeof value==='boolean'&&typeof c[key]!=='boolean')throw Error('Invalid button '+key);
  }
  this.trace=[];this.events=[];this.partnerTrace=[];
  for(let i=0;i<ticks&&!this.finished;i++) {
   if(this.player) {
    this.player.advance();this.state=this.player.state;this.params=this.player.params;this.events=this.player.events;
    resolveRinkCollision(this.state,this.events);
    if(this.pairs&&this.player.input){
     const recorded=this.pairPlayback[this.player.index-1];
     this.pairs.tick(this.state,this.player.input,recorded.actions);
     if(replayDigest(this.pairs.partner,this.pairs.events)!==recorded.digest)this.pairMismatch=true;
    }
    if(this.player.done||this.pairMismatch){this.finished=true;this.result={title:this.player.divergence||this.pairMismatch?'Replay mismatch':'Replay verified',detail:`${this.player.index} ticks${this.pairs?' · both partners':''}`,replay:true};}
   } else {
    const s=this.state;
    const canPush=!s.fallen&&s.move===MOVE.None&&s.jump.phase===JUMP_PHASE.None&&!c.brake&&!c.spin&&!c.turn&&!c.twizzle&&!c.inaBauer&&!low;
    // No cruise in a lesson: a step asks for the player's own pushes and glides.
    const repeat=canPush&&s.tick%90===0&&(controls.pushHeld||(this.cruise&&this.mode!=='lesson'&&Math.hypot(s.vel.x,s.vel.y)<5.5));
    const live={...c,push:(i===0&&c.push)||repeat,autoPush:repeat,toe:i===0&&c.toe};
    const mapped=this.setup?setupInput(live,s,this.setup,this.steering,this.params,this.controllerProfile,this.assistance)
      :gameInput(live,s,this.scheme,this.steering,low,this.params,this.controllerProfile);
    const input=this.beginner?this.coach.apply(mapped.input,s,this.params,this.scheme!==3&&i===0&&c.cycleJump,SIM_DT):mapped.input;
    this.low=mapped.cantilever;
    this.tick(this.rusty?this.rusty.apply(input,s):input,(c.pairHold?1:0)|(c.pairLift?2:0));
   }
   this.elapsed+=SIM_DT;
   if(this.state.tick%4===0)this.trace.push(this.state.blade.map(b=>({x:b.contact.x,y:b.contact.y,contact:b.inContact&&this.state.jump.phase!==JUMP_PHASE.Air&&!this.state.fallen})));
   if(this.pairs&&this.state.tick%4===0)this.partnerTrace.push(this.pairs.partner.blade.map(b=>({x:b.contact.x,y:b.contact.y,contact:b.inContact&&this.pairs.partner.jump.phase!==JUMP_PHASE.Air&&!this.pairs.partner.fallen&&this.pairs.liftPhase==='none'})));
  }
  return this.snapshot();
 }
 /** Same solver and recording order as Ice Run; renderer never writes physics. */
 tick(input,pairActions=0) {
  const events=[];
  step(this.state,input,this.params,SIM_DT,events,this.ice);
  this.recorder.capture(input,this.params,this.state,events,['A','B','C','D'][this.scheme]);
  this.meter.sample(this.state,input,events,SIM_DT);
  resolveRinkCollision(this.state,events);this.events.push(...events);
  // Taken as it happens, so walking out of a program does not undo a fall.
  const hit=this.fallWatch?.sample(this.state);
  if(hit){const hurt=this.career.takeFall(hit);if(hurt)this.newInjuries.push(BODY_REGIONS.find(r=>r.id===hurt).injury);}
  if(this.pairs){
   this.pairs.tick(this.state,input,pairActions);
   if(this.pairFrames.length<this.recorder.ticks)this.pairFrames.push({actions:pairActions,digest:replayDigest(this.pairs.partner,this.pairs.events)});
   if(this.pairs.done){this.finished=true;this.result=this.pairs.result();}
  }
  this.practice.sample(this.state,this.low,SIM_DT);
  if(this.mode==='rookie')this.rookie.sample(this.state,SIM_DT);
  if(this.drill&&!this.drill.done)this.drill.sample(this.state,input,SIM_DT);
  if(this.lesson&&!this.lesson.done){
   const at=this.lesson.step;this.lesson.sample(this.state,SIM_DT);
   if(this.lesson.step!==at)this.lessonXp+=this.career.recordLesson(at.id);
   if(this.lesson.done)this.finishLesson();
  }
  if(this.mode==='timed')this.run.sample(this.state,SIM_DT);
  // Free Skate stays quiet per the bible. The original playground remains available in runtime.
  if(this.state.landed.tick>=0&&this.scoredTick!==this.state.landed.tick){this.scoredTick=this.state.landed.tick;this.technical+=scoreJump(tables,this.state.landed)?.score??0;}
  if(this.state.spin.changeCompletedTick>=0&&this.state.spin.changeCompletedTick!==this.lastChangeCompletedTick){
   this.lastChangeCompletedTick=this.state.spin.changeCompletedTick;this.footChangeFlash=1.2;
  }
  this.footChangeFlash=Math.max(0,this.footChangeFlash-SIM_DT);
  const linked=this.combo.sample(this.state);if(linked){this.comboLabel=linked;this.comboFlash=1.8;}
  this.comboFlash=Math.max(0,this.comboFlash-SIM_DT);
  const spinning=this.state.move===MOVE.Spin;
  if(spinning)this.spinTracker.sample(this.state.spin);
  else if(this.wasSpinning){this.spinLevel=scoreSpinLevel(this.spinTracker.finish(),spinThresholds,this.spinTracker.footChanges).level;this.spinTracker.reset();}
  this.wasSpinning=spinning;
  if(this.routine)this.routine.sample(this.state,this.low,SIM_DT,events);
  if(this.routine?.done) {
   const r=this.routine,xp=this.mode==='career'?this.career.award(r):0;
   // Forward the existing sheet and totals; Godot formats them without parsing
   // prose or recalculating scores. Null PCS remains distinguishable from zero.
   const protocol=r.sheet?{lines:r.sheet.lines,tes:r.technicalScore,pcs:r.pcsScore?.total??null,deductions:r.deductions,total:r.segmentScore}:null;
   const stopped=r.complete?null:{element:ELEMENTS[r.current].title,how:elementHow(r.current,howContext(this.setup,this.controllerProfile))};
   this.finished=true;this.result={title:r.complete?`${MEDALS[r.medal]} on ice`:'One more rehearsal',detail:`${r.index}/${r.event.routine.length} elements · ${r.falls} falls${r.cues?` · ${r.cueResults.filter(x=>x==='on').length}/${r.cues.length} on the music`:''}`,protocol,xp,complete:r.complete,stopped,body:this.bodyNote(),standings:this.mode==='career'&&r.complete?standings(this.event,r.segmentScore):null};
  } else if(this.drill?.done&&!this.finished){const gained=this.career.recordDrill(this.drill.focus,this.drill.score);this.finished=true;this.result={title:`${ARM_FOCUS[this.drill.focus].title} drill: ${this.drill.score} / 100`,body:this.bodyNote(),detail:gained>0?`A new best, up ${gained}. Your arms give up less for ${ARM_FOCUS[this.drill.focus].title} now.`:`Your best stays ${this.career.armBest[this.drill.focus]}.`,complete:true};
  } else if(this.mode==='timed'&&this.run.done){this.finished=true;this.result={title:'Your lines, recorded',detail:`${this.run.score} points · ${this.run.collected} lights · ${this.run.falls} falls`,complete:true};}
 }
 finishLesson(){
  const l=this.lesson,title=this.course==='trust'?'You trust the ice.':'Your hands know the way.';
  const skipped=l.skipped.map(id=>l.steps.find(x=>x.id===id)?.title).filter(Boolean);
  this.finished=true;
  this.result={title,detail:`${l.steps.length-skipped.length}/${l.steps.length} steps${l.falls?` · ${l.falls} fall${l.falls>1?'s':''} you got up from`:' · without a fall'}${skipped.length?` · skipped: ${skipped.join(', ')}`:''}`,xp:this.lessonXp,lesson:true,complete:true};
 }
 /** The player moves past a step. It pays nothing. */
 skipStep(){if(!this.lesson||this.finished)throw Error('No lesson is running');this.lesson.skip();if(this.lesson.done)this.finishLesson();return this.snapshot();}
 replay(json){
  if(typeof json!=='string'||json.length>MAX_REPLAY_BYTES)throw Error('Replay is too large');
  const root=JSON.parse(json),paired=root?.format==='edgework-pairs/1';
  const clip=parseReplay(paired?JSON.stringify(root.solo):json);
  if(paired&&(!Array.isArray(root.partners)||root.partners.length!==clip.frames.length||typeof root.challenge!=='boolean'
   ||root.partners.some(f=>!f||!Number.isInteger(f.actions)||f.actions<0||f.actions>3||!Number.isInteger(f.digest)||f.digest<0||f.digest>0xffffffff)))throw Error('Invalid pairs replay');
  this.start({mode:'free'});this.player=new ReplayPlayer(clip);this.lesson=null;this.state=this.player.state;this.params=this.player.params;
  if(paired){this.mode='pairs';this.pairs=new PairsSession(this.state,this.params,root.challenge);this.pairPlayback=root.partners;}
  return this.snapshot();
 }
 exportReplay(){return this.pairs?JSON.stringify({format:'edgework-pairs/1',challenge:this.pairs.challenge,solo:JSON.parse(this.recorder.toJson()),partners:this.pairFrames}):this.recorder.toJson();}
 setArmFocus(focus){if(![0,1,2].includes(focus))throw Error('Unknown arm focus');this.career.armFocus=focus;}
 /** A new injury this run, in words; empty when there is none. */
 bodyNote(){
  const armed=this.mode==='career'||this.mode==='armdrill',worn=armed?wearNote(this.wearStart,this.career.wear):'';
  return [this.newInjuries.length?`${this.newInjuries.join(' and ')}: too many falls. It will cost you until you rest it.`:'',worn].filter(Boolean).join(' ');
 }
 rest(region){if(!BODY_REGIONS.some(r=>r.id===region))throw Error('Unknown body region');this.career.rest(region);}
 drillFamily(family){if(!JUMP_FAMILIES.some(f=>f.id===family))throw Error('Unknown jump family');this.career.drill(family);}
 setPlan(event,plan){if(!this.career.setPlan(event,plan))throw Error('That program leaves out what this event asks for');}
 /**
  * The Composer's editor: a draft timeline for one career event, checked on
  * every edit by game/composer.ts and saved only when asked. Returns the snapshot.
  */
 timeline(o={}){
  const i=o.event??this.draft?.event;
  if(!Number.isInteger(i)||!CAREER_EVENTS[i])throw Error('Unknown career event');
  const event=CAREER_EVENTS[i],grid=n=>{if(!tracks[n])throw Error('Unknown track');return tracks[n];};
  switch(o.action){
   case 'open':{const saved=this.career.timelines[i];
    this.draft={event:i,timeline:saved??spreadTimeline(event,grid(this.track),this.track,this.career.planned(i).routine)??spreadTimeline(event,grid(this.track),this.track,event.routine)};break;}
   case 'track':{const d=this.needDraft(i);d.timeline=retime(event,grid(d.timeline.track),grid(o.track),d.timeline,o.track);break;}
   case 'nudge':{const d=this.needDraft(i),next=nudge(event,grid(d.timeline.track),d.timeline,o.index,o.by);if(next)d.timeline=next;break;}
   case 'add':{const d=this.needDraft(i);if(!Object.hasOwn(ELEMENTS,o.id))throw Error('Unknown element');const next=addCue(event,grid(d.timeline.track),d.timeline,o.id);if(!next)throw Error('No room: move the last element earlier, or take one of yours out');d.timeline=next;break;}
   case 'remove':{const d=this.needDraft(i),next=removeCue(event,d.timeline,o.index);if(!next)throw Error('The event asks for that one');d.timeline=next;break;}
   case 'spread':{const d=this.needDraft(i),next=spreadTimeline(event,grid(d.timeline.track),d.timeline.track,sortedCues(d.timeline).map(c=>c.id));if(next)d.timeline=next;break;}
   case 'save':{const d=this.needDraft(i);const check=checkTimeline(event,grid(d.timeline.track),d.timeline);if(!check.ok||!this.career.setTimeline(i,d.timeline,grid(d.timeline.track)))throw Error(check.problems[0]??'That program cannot be saved');break;}
   case 'clear':this.career.clearTimeline(i);this.draft=null;break;
   case 'close':this.draft=null;break;
   default:throw Error('Unknown timeline action');
  }
  return this.snapshot();
 }
 /** A rusty family's higher bar, in words, while the current element is a jump. */
 rustNote(r){
  if(r.current!=='jump'||!r.rust||!(r.rust.toe>0||r.rust.edge>0))return '';
  const bar=f=>r.jumpBar(f==='toe'?0:1).toFixed(2);
  return ` Rust: a toe jump needs ${bar('toe')} of a turn here, an edge jump ${bar('edge')}.`;
 }
 needDraft(i){if(!this.draft||this.draft.event!==i)throw Error('Open the program on its music first');return this.draft;}
 draftView(){
  const d=this.draft;if(!d)return null;
  const event=CAREER_EVENTS[d.event],g=tracks[d.timeline.track],need=requiredCues(event,d.timeline);
  return {event:d.event,track:d.timeline.track,bars:barCount(g,event.seconds),barSeconds:barSeconds(g),offset:g.offset,barsPerPhrase:g.barsPerPhrase,seconds:event.seconds,
   saved:JSON.stringify(this.career.timelines[d.event])===JSON.stringify(d.timeline),
   cues:sortedCues(d.timeline).map((c,k)=>({id:c.id,title:ELEMENTS[c.id].title,bar:c.bar,at:barStart(g,c.bar),required:need[k]})),
   check:checkTimeline(event,g,d.timeline)};
 }
 /** The atelier: a design dressed for a preview, never saved. */
 dress(design){const d=parseDesign(design);if(!d)throw Error('That design uses something off the lists');return designSkin(d,-1);}
 saveDesign(slot,design){if(!this.wardrobe.set(slot,design))throw Error('That design could not be kept');}
 train(stat){if(!STAT_NAMES.includes(stat))throw Error('Unknown training skill');this.career.train(stat);}
 snapshot() {
  const s=this.state,r=this.routine,l=this.lesson,words=howContext(this.setup,this.controllerProfile);
  // Turn's own kind, broken down the same way game/main.ts's free-skate HUD
  // already does — this bridge used to say the bare 'Turn' for all six.
  const turnLabel=s.turn.against?(s.turn.kind===TURN_KIND.Counter?'Counter':'Bracket')
   :s.turn.kind===TURN_KIND.Mohawk?'Mohawk':s.turn.kind===TURN_KIND.Choctaw?'Choctaw'
   :s.turn.kind===TURN_KIND.Loop?'Loop':s.turn.kind===TURN_KIND.Rocker?'Rocker'
   :'Three-turn';
  const move=s.fallen?`Recover · ${recoverHow(words)}`:s.jump.phase===JUMP_PHASE.Air?'Jump · in flight':s.jump.phase===JUMP_PHASE.Load?'Gather · release to take off':s.move===MOVE.Spin?'Spin':s.move===MOVE.Twizzle?'Twizzle':s.move===MOVE.InaBauer?'Ina Bauer':s.move===MOVE.Spiral?'Spiral':s.move===MOVE.Turn?turnLabel:this.low?'Cantilever':s.crossover&&s.strokeTime>0?'Crossover':'Glide';
  return {pairs:this.pairs?{...this.pairs.snapshot(),trace:this.partnerTrace}:null,setup:this.setup,assistance:this.assistance,controllerRequest:this.steering.full?.request??null,controllerProfile:this.controllerProfile,controllerBindings:ACTIONS.map(a=>({name:a.name,key:a.key,binding:bindingLabel(this.controllerProfile,a.id)})),state:s,events:this.events,trace:this.trace,mode:this.mode,move,low:this.low,elapsed:this.elapsed,finished:this.finished,result:this.result,technical:this.technical,spinLevel:this.spinLevel,footChange:this.footChangeFlash>0,combo:this.comboFlash>0?this.comboLabel:'',track:this.runTrack??this.track,scheme:this.scheme,beginner:this.beginner,cruise:this.cruise,
   edge:s.blade.map(b=>codeToString(b.code)),jump:s.landed.tick<0?null:{tick:s.landed.tick,kind:JUMP_CODE[s.landed.kind]??'Hop',rotations:s.landed.turned,clean:!s.landed.fall&&!s.landed.stepOut},
   recover:recoverHow(words),
   tutorial:l?{unproven:l.step?.id==='spin'&&this.setup==='explorer'?UNPROVEN_AIR:'',course:this.course,index:l.index,total:l.steps.length,title:l.step?.title??'',prose:l.step?.prose??'',how:l.step?l.step.how(words):'',keys:l.step?.keys?.(words)??'',hold:l.step?.hold??0,progress:l.progress,fraction:l.fraction,status:l.status,message:l.toast>0?l.message:'',falls:l.falls}:null,
   routine:r?{how:r.current?elementHow(r.current,words)+this.rustNote(r):'',title:r.event.title,sequence:r.event.routine,index:r.index,seconds:r.seconds,held:r.held,falls:r.falls,medal:r.medal,pcsScore:r.pcsScore,elapsed:r.elapsed,cues:r.cues?r.cues.map((c,k)=>({id:c.id,bar:c.bar,at:c.at,early:c.early,late:c.late,result:r.cueResults[k]})):null}:null,
   draft:this.draftView(),wardrobe:{designs:this.wardrobe.designs,skins:this.wardrobe.skins()},
   lesson:{index:this.practice.next,title:LESSONS[this.practice.next]?.[0]??'Make it your own',hint:LESSONS[this.practice.next]?.[1]??'Link the moves into your own program.',done:this.practice.done},
   armStyle:this.armStyle,drill:this.drill?{title:this.drill.title,hint:this.drill.hint,seconds:this.drill.seconds,score:this.drill.score,focus:this.drill.focus}:null,
   rookie:{index:this.rookie.index,cleared:this.rookie.cleared,title:this.rookie.title,hint:this.rookie.hint,target:this.rookie.target},
   run:{seconds:this.run.seconds,score:this.run.score,collected:this.run.collected,target:this.run.target},
   career:{wear:this.career.wear,injured:this.career.injured,weeks:this.career.weeks,rust:this.career.rust,plans:this.career.plans,timelines:this.career.timelines,best:this.career.best,field:CAREER_EVENTS.map((_,i)=>standings(i,this.career.best[i])),season:seasonTable(this.career.best),overall:overall(this.career.profile),floors:EVENT_FLOORS,locks:CAREER_EVENTS.map((_,i)=>this.career.lockReason(i)),lessons:this.career.lessons,armFocus:this.career.armFocus,armBest:this.career.armBest,medals:this.career.medals,unlocked:this.career.unlocked,xp:this.career.profile.xp,stats:this.career.profile.stats,costs:Object.fromEntries(Object.entries(this.career.profile.stats).map(([k,v])=>[k,xpToRaise(v)]))}};
 }
}
