// Records one choreographed passage from the real engine, every tick, for
// tools/pose_lab.gd: a glide into a deep outside edge, a crossover stroke, a
// three-turn to backward, and a jump that lands.
//   node games/ice-run-godot/tools/pose_clip.mjs <out.json>
import {writeFileSync} from 'node:fs';
import {IceEngine} from '../bridge/engine.mjs';
import {createState} from '../runtime/sim/solver.js';
import {NEUTRAL_INPUT} from '../runtime/sim/types.js';
import {SKINS} from '../runtime/game/appearance.js';
const e=new IceEngine();
e.start({mode:'free'});
e.state=createState(e.params,6);
e.state.pos.y=18;
const pick=b=>({contact:b.contact,tangent:b.tangent,tilt:b.tilt,weight:b.weight,normalLoad:b.normalLoad,inContact:b.inContact,latSlipAccel:b.latSlipAccel,longSpeed:b.longSpeed,demandRatio:b.demandRatio});
const frames=[],marks=[];
const record=()=>{const s=e.state;frames.push({low:false,state:{tick:s.tick,pos:s.pos,vel:s.vel,heading:s.heading,yawRate:s.yawRate,lean:s.lean,comZ:s.comZ,knee:s.knee,intAccel:s.intAccel,balanceError:s.balanceError,latAccel:s.latAccel,armsL:s.armsL,strokeTime:s.strokeTime,strokeFoot:s.strokeFoot,twist:s.twist,freeSwing:s.freeSwing,fallen:s.fallen,move:s.move,supportMode:s.supportMode,supportFoot:s.supportFoot,jump:{phase:s.jump.phase,z:s.jump.z,vz:s.jump.vz,rotation:s.jump.rotation,inertia:s.jump.inertia},spin:{position:s.spin.position,inertia:s.spin.inertia,omega:s.spin.omega},blade:s.blade.map(pick)}});};
const run=(name,ticks,input)=>{marks.push({name,tick:frames.length});for(let i=0;i<ticks;i++){e.tick({...NEUTRAL_INPUT,...input(i)});record();}};
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
const out={skin:SKINS.find(k=>k.name==='Northlight')??SKINS[0],marks,landed:s.landed.tick!==first?{tick:s.landed.tick,...Object.fromEntries(Object.entries(s.landed).filter(([,v])=>typeof v!=='object'))}:null,fallen:frames.filter(f=>f.state.fallen).length,frames};
writeFileSync(process.argv[2],JSON.stringify(out));
console.log(JSON.stringify({ticks:frames.length,marks,fallen:out.fallen,landed:out.landed,end:{pos:s.pos,move:s.move,speed:Math.hypot(s.vel.x,s.vel.y)},leanPeak:Math.max(...frames.map(f=>Math.abs(f.state.lean))),tiltPeak:Math.max(...frames.map(f=>Math.max(Math.abs(f.state.blade[0].tilt),Math.abs(f.state.blade[1].tilt))))}));
