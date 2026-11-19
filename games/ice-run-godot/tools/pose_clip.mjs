// Records one choreographed passage from the real engine, every tick, for
// tools/pose_lab.gd: a glide into a deep outside edge, a crossover stroke, a
// three-turn to backward, and a jump that lands.
//   node games/ice-run-godot/tools/pose_clip.mjs <out.json>
import {writeFileSync} from 'node:fs';
import {IceEngine} from '../bridge/engine.mjs';
import {createState} from '../runtime/sim/solver.js';
import {NEUTRAL_INPUT} from '../runtime/sim/types.js';
import {supportSignal} from '../runtime/sim/support.js';
import {footPrep} from '../runtime/game/footprep.js';
// --no-prep: frames without footPrep, so pose_lab shows the free foot as it was before it (the "before" stills).
const prepArg=!process.argv.includes('--no-prep');
import {SKINS} from '../runtime/game/appearance.js';
import {lookOf} from '../runtime/game/skates.js';
import {MotionPlayer} from '../runtime/game/motion/player.js';
// --motion: each frame carries game/motion/player.ts's clip (a fall's, or --style=<id>'s arms), as the bridge sends it.
const motionArg=process.argv.includes('--motion'),styleArg=process.argv.find(a=>a.startsWith('--style='))?.slice(8)??null;
const player=motionArg?new MotionPlayer(styleArg,{bpm:120,beatsPerBar:4,offset:0},120):null;
// --skates=<preset id>: the clip carries game/skates.ts's look for pose_lab to wear. Cosmetic: the frames are the same.
const skatesArg=process.argv.find(a=>a.startsWith('--skates='))?.slice(9);
const skatesField=skatesArg?{skates:lookOf(skatesArg)}:{};
const e=new IceEngine();
e.start({mode:'free'});
// --transfer: the legs move the load between the blades over time (weightTransferMode 1).
if(process.argv.includes('--transfer'))e.params={...e.params,weightTransferMode:1};
// --cross-place: crossover places the outside blade past the skating blade's line (crossPlaceMode 1).
if(process.argv.includes('--cross-place'))e.params={...e.params,crossPlaceMode:1};
e.state=createState(e.params,6);
e.state.pos.y=18;
const pick=b=>({contact:b.contact,tangent:b.tangent,tilt:b.tilt,weight:b.weight,normalLoad:b.normalLoad,inContact:b.inContact,latSlipAccel:b.latSlipAccel,longSpeed:b.longSpeed,demandRatio:b.demandRatio});
const frames=[],marks=[];
const record=()=>{const s=e.state;const motion=player?player.frame(s,s.tick/120):null;frames.push({low:false,motion,support:supportSignal(s),...(prepArg?{footPrep:footPrep(s,supportSignal(s))}:{}),state:{tick:s.tick,pos:s.pos,vel:s.vel,heading:s.heading,yawRate:s.yawRate,lean:s.lean,comZ:s.comZ,knee:s.knee,intAccel:s.intAccel,balanceError:s.balanceError,latAccel:s.latAccel,armsL:s.armsL,strokeTime:s.strokeTime,strokeFoot:s.strokeFoot,twist:s.twist,freeSwing:s.freeSwing,fallen:s.fallen,move:s.move,supportMode:s.supportMode,supportFoot:s.supportFoot,jump:{phase:s.jump.phase,z:s.jump.z,vz:s.jump.vz,rotation:s.jump.rotation,inertia:s.jump.inertia},spin:{position:s.spin.position,inertia:s.spin.inertia,omega:s.spin.omega},blade:s.blade.map(pick)}});};
const run=(name,ticks,input)=>{marks.push({name,tick:frames.length});for(let i=0;i<ticks;i++){e.tick({...NEUTRAL_INPUT,...input(i)});record();}};
// --falls: a real fall each way and getting up, instead of the passage below.
if(process.argv.includes('--falls')){
 for(const [name,side] of [['fall left',1],['fall right',-1]]){
  {const {pos,tick}=e.state;e.state=createState(e.params,6);e.state.pos={...pos};e.state.tick=tick;}
  // The lean is pushed past the limit at a known tick; the sim calls the fall itself.
  run(name+': over',240,i=>{if(i===60)e.state.lean=side*(e.params.fallLean+.05);return {lean:i<60?side*.3:0,weight:.5,knee:.4};});
  run(name+': up',120,i=>({lean:0,weight:.5,knee:.4,push:i===0}));
 }
 const fallAt=frames.flatMap((f,i)=>f.state.fallen&&!frames[i-1]?.state.fallen?[i]:[]);
 writeFileSync(process.argv[2],JSON.stringify({skin:SKINS.find(k=>k.name==='Northlight')??SKINS[0],...skatesField,marks,landed:null,fallen:frames.filter(f=>f.state.fallen).length,fallAt,frames}));
 console.log(JSON.stringify({ticks:frames.length,fallAt,leans:fallAt.map(i=>frames[i].state.lean),marks}));
 process.exit(0);
}
// --strokes: forward stroking. Each beat pushes off one blade with both on the ice, then glides on the other alone.
if(process.argv.includes('--strokes')){
 e.state.pos.x=-26; // the passage covers about 30 m: start it near one end, clear of the boards at the other.
 run('two-foot glide',60,()=>({lean:0,weight:.5,knee:.4}));
 for(let k=0;k<6;k++){const foot=k%2,other=1-foot;run(`push off the ${foot?'right':'left'}, glide on the ${other?'right':'left'}`,72,i=>({lean:0,weight:i<24?.5:other,knee:.55,push:i===0,pushFoot:foot}));}
 run('two-foot glide',60,()=>({lean:0,weight:.5,knee:.4}));
 const s=e.state;
 writeFileSync(process.argv[2],JSON.stringify({skin:SKINS.find(k=>k.name==='Northlight')??SKINS[0],...skatesField,marks,landed:null,fallen:frames.filter(f=>f.state.fallen).length,frames}));
 console.log(JSON.stringify({ticks:frames.length,marks,fallen:frames.filter(f=>f.state.fallen).length,speed:Math.hypot(s.vel.x,s.vel.y)}));
 process.exit(0);
}
// --footwork: forward crossovers round a counter-clockwise curve, then a left forward outside three-turn,
// for the free-foot preparation stills (game/footprep.ts). Pair with --transfer, as Simulation plays it.
if(process.argv.includes('--footwork')){
 e.state.pos.x=-20;
 run('two-foot curve',90,()=>({lean:.3,weight:.5,knee:.45}));
 for(let k=0;k<4;k++){const foot=k%2?0:1,other=1-foot;run(`crossover: push off the ${foot?'right (outside)':'left (under)'}`,72,i=>({lean:.3,weight:i<24?.5:other,knee:.55,push:i===0,pushFoot:foot}));}
 run('left outside edge',90,()=>({lean:.25,weight:0,knee:.5}));
 run('three-turn',90,i=>({lean:.2,weight:0,knee:.5,turn:i<4}));
 run('back glide',60,()=>({lean:-.15,weight:0,knee:.5}));
 const s=e.state;
 writeFileSync(process.argv[2],JSON.stringify({skin:SKINS.find(k=>k.name==='Northlight')??SKINS[0],...skatesField,marks,landed:null,fallen:frames.filter(f=>f.state.fallen).length,frames}));
 console.log(JSON.stringify({ticks:frames.length,marks,fallen:frames.filter(f=>f.state.fallen).length,speed:Math.hypot(s.vel.x,s.vel.y),
  prep:Object.fromEntries(['beside','cross','under','held'].map(k=>[k,frames.filter(f=>f.footPrep?.some(p=>p.pose===k&&p.weight>.5)).length]))}));
 process.exit(0);
}
run('two-foot glide',120,()=>({lean:0,weight:.5,knee:.35}));
run('left outside edge',240,()=>({lean:.32,weight:0,knee:.6}));
run('crossover stroke',120,i=>({lean:.3,weight:0,knee:.5,push:i===0}));
run('straighten',60,()=>({lean:0,weight:0,knee:.45}));
run('three-turn',120,i=>({lean:.2,weight:0,knee:.5,turn:i<30}));
run('back glide',120,()=>({lean:-.2,weight:1,knee:.6}));
let load=0,landedAt=-1;const first=e.state.landed.tick;
run('jump',360,i=>{const air=e.state.jump.phase===2,k=i-load,loading=k>=0&&k<36;
 return {lean:-.25,weight:1,knee:loading?.95:k>=36&&k<39?0:.8,carriage:!air&&(loading||k===36)?1:0,toe:k===34};});
run('recover',120,()=>({lean:0,weight:.5,knee:.4}));
// A fresh entry for the spin, where the skater already is: it needs speed and an edge.
{const {pos,tick}=e.state;e.state=createState(e.params,6);e.state.pos={...pos};e.state.tick=tick;}
// --clockwise spins the other way, off the same foot, so both arms get to lead. --two-feet comes out of it on both.
const lean=process.argv.includes('--clockwise')?-.3:.3;
const exitWeight=process.argv.includes('--two-feet')?.5:0;
run('spin entry',240,()=>({weight:0,lean,knee:.45}));
run('spin, arms out',90,()=>({weight:0,lean:0,knee:.45,spin:true,carriage:1}));
run('spin, arms in',330,()=>({weight:0,lean:0,knee:.45,spin:true,carriage:0}));
run('spin exit',240,()=>({weight:exitWeight,lean:0,knee:.45}));
const s=e.state;
// The costume new sessions wear, so the lab shows what the game shows.
const out={skin:SKINS.find(k=>k.name==='Northlight')??SKINS[0],...skatesField,marks,landed:s.landed.tick!==first?{tick:s.landed.tick,...Object.fromEntries(Object.entries(s.landed).filter(([,v])=>typeof v!=='object'))}:null,fallen:frames.filter(f=>f.state.fallen).length,frames};
writeFileSync(process.argv[2],JSON.stringify(out));
console.log(JSON.stringify({ticks:frames.length,marks,fallen:out.fallen,landed:out.landed,end:{pos:s.pos,move:s.move,speed:Math.hypot(s.vel.x,s.vel.y)},leanPeak:Math.max(...frames.map(f=>Math.abs(f.state.lean))),tiltPeak:Math.max(...frames.map(f=>Math.max(Math.abs(f.state.blade[0].tilt),Math.abs(f.state.blade[1].tilt))))}));
