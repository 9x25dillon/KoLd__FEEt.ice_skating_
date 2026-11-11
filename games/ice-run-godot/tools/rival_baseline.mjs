// Re-derives tools/ice-lab/game/rivals.ts BASELINE: what a clean, plain career program scores at
// each event when it skates its full time (the owner's rule of 2026-11-02), measured through this
// bridge (career params, Shared arms undrilled, music, rink boards, rust gate) on Simulation.
//
//   node games/ice-run-godot/tools/prepare.mjs --engine-only
//   node games/ice-run-godot/tools/rival_baseline.mjs          about 3 minutes
//   node games/ice-run-godot/tools/rival_baseline.mjs --from=5 --wide   season two, as measured 2026-11-11
//
// Each element's own pad is the 2026-11-01 baseline script's (it was never committed; recovered
// from that session), except the jump: Simulation's measured half turn, test/padcourse.test.ts
// ELEMENT_PADS.jump. What full time and turning jumps added, a pilot does between elements:
//  - a turning jump lands backward and slower, so each element first gets back to its speed,
//    steering with the lean that speed can hold (test/figurebot.ts's steering, round the rink
//    centre, through Simulation's stick mapping) and tapping A; a spin waits for 4 m/s, because it
//    hooks only above spinMinSpeed 3 and the carve into it bleeds speed;
//  - an element out of a spin, but the pose, three-turns to forward first (game/tutorial.ts: on a
//    curve, tap B); until 2026-11-11 only a jump did, and season one has no other;
//  - a fall: tap A to get up (game/padcourse.ts recoverHow), then the element again;
//  - after the last element the program runs on: the same steering, round the rink. In
//    Simulation a hands-off skater falls once the speed is gone (measured 2026-11-03).
// A scripted pad here is chaotic: a tenth of a second changes a landing. So each event is skated
// over a grid of orbit radii and jump entry speeds, and BASELINE is the median of the clean runs.
// Fresh career, in memory only: IceEngine never writes a save; bridge/host.mjs does.
import {IceEngine} from '../bridge/engine.mjs';
import {CAREER_EVENTS} from '../runtime/game/career.js';
import {SIM_DT} from '../runtime/sim/params.js';
import {JUMP_PHASE} from '../runtime/sim/jump.js';
import {FALL_NAME,MOVE} from '../runtime/sim/types.js';
import {BASELINE} from '../runtime/game/rivals.js';

const A=0,B=1,Y=3,LT=6,RT=7,L3=10;
// --wide: season two's grid (2026-11-11), radii 8..16 and five jump entries; its two-jump programs are clean too rarely on the narrow one.
const WIDE=process.argv.includes('--wide');
const RADII=WIDE?[8,9,10,11,12,13,14,15,16]:[9,10,11,12,13,14,15],JUMP_ENTRIES=WIDE?[2.8,3,3.3,3.6,3.9]:[3,3.3,3.6],SPIN_ENTRY=4;
const tap=(t,every)=>Math.floor(t*60)%Math.round(every*60)<3;
// Simulation's lean: both sticks, shaped by the default profile (deadzone .22, curve 1.35, gain .7), times maxLean.
const G=9.81,CX=0,CY=18,MAX_LEAN=1.13,GAIN=.7,DZ=.22,CURVE=1.35;
function stickFor(lean){
 const shaped=Math.min(1,Math.abs(lean)/MAX_LEAN/GAIN);
 return shaped<=0?0:Math.sign(lean)*(DZ+(1-DZ)*Math.pow(shaped,1/CURVE));
}
const backwardOf=s=>s.vel.x*s.heading.x+s.vel.y*s.heading.y<0;
/** Round the rink centre on a circle of radius R, leaning what the speed holds; tap A below `push` m/s. */
function orbit(h,s,t,mem,R,push){
 const dx=s.pos.x-CX,dy=s.pos.y-CY,dist=Math.hypot(dx,dy)||1e-6;
 const v=Math.hypot(s.vel.x,s.vel.y)||1e-6,vx=s.vel.x/v,vy=s.vel.y/v;
 if(mem.dir===undefined)mem.dir=Math.sign(dx*vy-dy*vx)||1;
 const dir=mem.dir,tx=(dir<0?dy:-dy)/dist,ty=(dir<0?-dx:dx)/dist;
 const out=Math.atan2(vx*dx/dist+vy*dy/dist,vx*tx+vy*ty);
 const most=Math.atan(v*v/(G*Math.max(R*.55,1)));
 const phi=Math.max(0,Math.min(most,Math.atan(v*v/(G*R))+.04*(dist-R)+.4*out));
 h.axes[0]=h.axes[2]=stickFor(dir*(backwardOf(s)?-1:1)*phi);
 if(v<push&&tap(t,push>3?.6:1.2))h.buttons[A]=1;
}
function pad(h,s,cur,t,mem,R,entry){
 const v=Math.hypot(s.vel.x,s.vel.y);
 if(s.fallen){mem.readyAt=undefined;mem.dir=undefined;if(tap(t,.5))h.buttons[A]=1;return;}
 if(cur===undefined){if(!mem.free){mem.free=true;mem.dir=undefined;}orbit(h,s,t,mem,R,3);return;}
 if(mem.cur!==cur){mem.prev=mem.cur;mem.cur=cur;mem.readyAt=undefined;mem.dir=undefined;}
 if(mem.readyAt===undefined){
  // Out of a spin she turns forward first, for any element but the pose (2026-11-11: season two
  // skates crossovers after spins). Season one's only such elements were a jump and the pose.
  const forward=cur!=='pose'&&mem.prev==='spin';
  // A crossover out of a spin gets back to an edge's speed first: the spin has bled it away.
  const need=cur==='crossover'&&mem.prev==='spin'?entry.edge:entry[cur];
  if(v<need||(forward&&backwardOf(s))){
   orbit(h,s,t,mem,R,need+.3);
   if(forward&&backwardOf(s)&&v>=2&&tap(t,1)){h.buttons[A]=0;h.buttons[B]=1;}
   return;
  }
  mem.readyAt=t;
 }
 const lt=t-mem.readyAt;
 if(cur==='glide'){if(v<3.3&&tap(t,4))h.buttons[A]=1;}
 if(cur==='edge')h.axes[0]=h.axes[2]=.5;
 if(cur==='crossover'){h.axes[0]=h.axes[2]=.6;if(tap(t,1.5))h.buttons[A]=1;}
 if(cur==='jump'){
  const u=lt%4;
  if(u<1.3)h.axes[0]=h.axes[2]=.5;
  if(u>=1&&u<1.3){h.buttons[L3]=1;h.buttons[LT]=h.buttons[RT]=1;}
  else if(u>=1.4)h.buttons[LT]=h.buttons[RT]=.5;
  if(v<3.5&&u>3)h.buttons[A]=1;
 }
 // A spin starts on a fresh press of Y (sim/moves.ts spinStart): press again until it starts, then hold it.
 if(cur==='spin'){h.axes[0]=h.axes[2]=.5;if(lt>1&&(s.move===MOVE.Spin||lt%1<.5))h.buttons[Y]=1;}
 if(cur==='pose'){if(v<2.5){if(tap(t,1))h.buttons[A]=1;}else{h.buttons[A]=1;h.buttons[L3]=1;}}
}
export function skate(i,R=12,jumpEntry=3){
 const entry={glide:0,crossover:0,edge:3,pose:3,jump:jumpEntry,spin:SPIN_ENTRY};
 const e=new IceEngine();
 e.configure({setup:'simulation',beginner:false,cruise:false});
 // Every event with a fresh skater: the floors would otherwise ask for trained stats, which change the physics.
 Object.defineProperty(e.career,'unlocked',{get:()=>CAREER_EVENTS.length-1});
 e.start({mode:'career',event:i});
 const r=e.routine,mem={},falls=[],jumps=[];
 let wasFallen=false,wasAir=false;
 for(let k=0;!e.finished&&k<(CAREER_EVENTS[i].seconds+20)/SIM_DT;k++){
  const t=k*SIM_DT,h={axes:[0,0,0,0],buttons:Array(16).fill(0),keys:[],connected:true};
  pad(h,e.state,r.current,t,mem,R,entry);
  e.advance({hardware:h},1,false);
  const air=e.state.jump.phase===JUMP_PHASE.Air;
  if(wasAir&&!air)jumps.push(+e.state.landed.turned.toFixed(2));
  wasAir=air;
  if(e.state.fallen&&!wasFallen)falls.push(`${t.toFixed(1)} s ${FALL_NAME[e.state.fallReason]} (${r.current??'after the last element'})`);
  wasFallen=e.state.fallen;
 }
 const p=e.result.protocol;
 return {id:CAREER_EVENTS[i].id,R,jumpEntry,complete:r.complete,falls,jumps,tes:p.tes,pcs:p.pcs,deductions:p.deductions,total:p.total};
}
const median=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};

if(import.meta.url===`file://${process.argv[1]}`){
 const derived=[];
 const from=Number(process.argv.find(a=>a.startsWith('--from='))?.slice(7)??0);
 for(const [i,ev] of CAREER_EVENTS.entries()){
  if(i<from)continue;
  const runs=[];
  for(const R of RADII)for(const j of ev.routine.includes('jump')?JUMP_ENTRIES:[3])runs.push(skate(i,R,j));
  const clean=runs.filter(x=>x.complete&&x.falls.length===0).map(x=>x.total);
  const value=clean.length?Math.round(median(clean)*10)/10:null;
  derived.push(value);
  console.log(`${ev.id.padEnd(14)} ${ev.seconds} s  clean ${clean.length}/${runs.length}  median ${value?.toFixed(1)??'-'}  range ${clean.length?`${Math.min(...clean).toFixed(2)}..${Math.max(...clean).toFixed(2)}`:'-'}  TES ${Math.max(0,...runs.map(x=>x.tes)).toFixed(2)} at most  (BASELINE now ${BASELINE[i]})`);
 }
 console.log(`BASELINE = [${derived.map(x=>x===null?'null':x.toFixed(1)).join(', ')}]`);
}
