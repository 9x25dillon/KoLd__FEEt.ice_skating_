// Diagnostic for Hand_off Open question 3: Nationals had no clean run in 45 (transfer on).
// Skates the wide grid for one event and prints, per run, where it fell and how far each jump turned.
import {skate} from './rival_baseline.mjs';
import {CAREER_EVENTS} from '../runtime/game/career.js';
const id=process.argv[2]??'nationals';
const i=CAREER_EVENTS.findIndex(e=>e.id===id);
const RADII=[8,9,10,11,12,13,14,15,16],JUMPS=[2.8,3,3.3,3.6,3.9];
const out=[];
for(const R of RADII)for(const j of JUMPS){
 const r=skate(i,R,j);out.push(r);
 console.log(JSON.stringify({R,j,complete:r.complete,total:r.total,jumps:r.jumps,falls:r.falls}));
}
const tally={};for(const r of out)for(const f of r.falls){const k=f.replace(/^[\d.]+ s /,'');tally[k]=(tally[k]??0)+1;}
console.log('FALLS BY KIND AND ELEMENT',JSON.stringify(tally,null,1));
console.log('clean',out.filter(r=>r.complete&&!r.falls.length).length,'/',out.length,'complete',out.filter(r=>r.complete).length);
