// Per takeoff: the state the pilot jumps from, to tell fatigue from entry (Open question 3).
import {skate} from './rival_baseline.mjs';
import {CAREER_EVENTS} from '../runtime/game/career.js';
const id=process.argv[2]??'northern-cup',i=CAREER_EVENTS.findIndex(e=>e.id===id);
const runs=(process.argv[3]??'8:3,9:2.8,9:3,8:3.3,10:3.9').split(',').map(x=>x.split(':').map(Number));
for(const [R,j] of runs){
 const rows=[];
 const r=skate(i,R,j,(e,t,air,wasAir)=>{
  const s=e.state;
  if(air&&!wasAir){const v=Math.hypot(s.vel.x,s.vel.y),fwd=(s.vel.x*s.heading.x+s.vel.y*s.heading.y)/v;
   rows.push({t:+t.toFixed(2),el:e.routine.current,v:+v.toFixed(2),fwd:+fwd.toFixed(2),legs:+s.legs.toFixed(3),wind:+s.wind.toFixed(3),lean:+s.lean.toFixed(3),spin:+(s.spinRate??s.yawRate??0).toFixed(2)});}
  if(!air&&wasAir)rows.at(-1).turned=+s.landed.turned.toFixed(2);
 });
 console.log(`R ${R} entry ${j} clean ${r.complete&&!r.falls.length}`);
 for(const x of rows.slice(0,5))console.log('  ',JSON.stringify(x));
}
