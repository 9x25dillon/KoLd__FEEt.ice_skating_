// Where a career stalls: each event skated by tools/rival_baseline.mjs's scripted pilot (Simulation,
// fresh skater) over its grid of orbit radii and jump entries, reporting the medal each run earns
// (game/career.ts: complete + falls), the element a failed run was stuck on, falls by element,
// and the seconds each element took. The pilot is a competent, patient player, not a human: read the
// shares as an upper bound on what a first-time player gets, and the blockers as where they stall.
//
//   node games/ice-run-godot/tools/prepare.mjs --engine-only
//   nice node games/ice-run-godot/tools/career_difficulty.mjs [--from=0] [--to=4] [--wide] [--json=out.json]
import {writeFileSync} from 'node:fs';
import {skate} from './rival_baseline.mjs';
import {CAREER_EVENTS} from '../runtime/game/career.js';

const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.split('=')[1]??d;
const WIDE=process.argv.includes('--wide');
const RADII=WIDE?[8,9,10,11,12,13,14,15,16]:[9,10,11,12,13,14,15],JUMP_ENTRIES=WIDE?[2.8,3,3.3,3.6,3.9]:[3,3.3,3.6];
const from=Number(arg('from',0)),to=Number(arg('to',CAREER_EVENTS.length-1)),jsonOut=arg('json',null);
const MEDAL=['none','bronze','silver','gold'];
const medalOf=r=>!r.complete?0:r.falls.length===0?3:r.falls.length<=2?2:1;

const report=[];
for(let i=from;i<=to;i++){
 const ev=CAREER_EVENTS[i],runs=[];
 for(const R of RADII)for(const j of ev.routine.includes('jump')?JUMP_ENTRIES:[3]){
  const spent={},state={cur:undefined,since:0};let stuck;
  const r=skate(i,R,j,(e,t)=>{
   const cur=e.routine.current;
   if(cur!==state.cur){if(state.cur!==undefined)spent[`${state.idx}:${state.cur}`]=+(t-state.since).toFixed(1);state.cur=cur;state.idx=e.routine.index;state.since=t;}
   stuck=cur===undefined?undefined:`${e.routine.index}:${cur}`;
  });
  runs.push({R,jumpEntry:j,medal:medalOf(r),complete:r.complete,falls:r.falls,stuck:r.complete?null:stuck,spent,total:r.total});
 }
 const count=m=>runs.filter(r=>r.medal===m).length;
 const stuckOn={};for(const r of runs)if(r.stuck)stuckOn[r.stuck]=(stuckOn[r.stuck]??0)+1;
 const fallsOn={};for(const r of runs)for(const f of r.falls){const k=f.match(/\(([^)]*)\)$/)?.[1]??'?';fallsOn[k]=(fallsOn[k]??0)+1;}
 const meanSpent={};for(const r of runs)for(const [k,v] of Object.entries(r.spent))(meanSpent[k]??=[]).push(v);
 for(const k in meanSpent)meanSpent[k]=+(meanSpent[k].reduce((a,b)=>a+b,0)/meanSpent[k].length).toFixed(1);
 const row={i,id:ev.id,seconds:ev.seconds,routine:ev.routine,runs:runs.length,gold:count(3),silver:count(2),bronze:count(1),none:count(0),stuckOn,fallsOn,meanSpent,detail:runs};
 report.push(row);
 console.log(`${String(i).padStart(2)} ${ev.id.padEnd(14)} ${ev.seconds}s  runs ${runs.length}  gold ${row.gold}  silver ${row.silver}  bronze ${row.bronze}  none ${row.none}`);
 if(Object.keys(stuckOn).length)console.log(`     unfinished, stuck on: ${JSON.stringify(stuckOn)}`);
 if(Object.keys(fallsOn).length)console.log(`     falls during: ${JSON.stringify(fallsOn)}`);
 console.log(`     mean seconds per element: ${JSON.stringify(meanSpent)}`);
}
if(jsonOut)writeFileSync(jsonOut,JSON.stringify({measured:new Date().toISOString(),wide:WIDE,report},null,1));
