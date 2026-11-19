// A/B for Open question 3: the same wide grid with weightTransferMode forced 0 or 1, and staminaMode as set.
import {IceEngine} from '../bridge/engine.mjs';
import {skate} from './rival_baseline.mjs';
import {CAREER_EVENTS} from '../runtime/game/career.js';
const [id='northern-cup',wt='1',st='keep']=process.argv.slice(2);
const start=IceEngine.prototype.start;
IceEngine.prototype.start=function(o){const r=start.call(this,o);
 this.params={...this.params,weightTransferMode:+wt,...(st==='keep'?{}:{staminaMode:+st})};
 if(+wt===0){this.state.loadBias=this.state.loadRate=this.state.loadAsked=undefined;}
 else if(this.state.loadBias===undefined){this.state.loadBias=0;this.state.loadRate=0;this.state.loadAsked=0;}
 return r;};
const i=CAREER_EVENTS.findIndex(e=>e.id===id);
let clean=0,n=0;const tot=[],j2=[];
for(const R of [8,9,10,11,12,13,14,15,16])for(const j of [2.8,3,3.3,3.6,3.9]){
 let k=0;const r=skate(i,R,j,(e,t,air,wasAir)=>{if(!air&&wasAir&&++k===2)j2.push(+e.state.landed.turned.toFixed(2));});
 n++;if(r.complete&&!r.falls.length){clean++;tot.push(r.total);}
}
tot.sort((a,b)=>a-b);
console.log(`${id} weightTransfer ${wt} stamina ${st}: clean ${clean}/${n} median ${tot.length?tot[tot.length>>1].toFixed(2):'-'} jump2 turned ${j2.join(' ')}`);
