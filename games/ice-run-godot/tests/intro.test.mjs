// game/motion/intro.ts through the bridge: the moment before the music is presentation only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine} from '../bridge/engine.mjs';
import {replayDigest} from '../runtime/sim/replay.js';
import {INTRO_SECONDS,INTRO_CLIPS,introClip,ProgramIntro} from '../runtime/game/motion/intro.js';
import {CLIP_BY_ID} from '../runtime/game/motion/library.js';
import {SIM_DT} from '../runtime/sim/params.js';

const pad=(a=0)=>({hardware:{axes:[.3,0,.3,0],buttons:[a,...Array(15).fill(0)],keys:[],connected:true}});
const engine=()=>{const e=new IceEngine();e.configure({setup:'simulation',beginner:false,cruise:false});return e;};
const INTRO_TICKS=Math.round(INTRO_SECONDS/SIM_DT);

test('every intro clip is in the library, and the choice is a pure function of the seed',()=>{
 for(const id of INTRO_CLIPS)assert.ok(CLIP_BY_ID.get(id),id);
 for(let seed=-3;seed<8;seed++)assert.equal(introClip(seed),introClip(seed));
 assert.deepEqual(new Set([0,1,2,3].map(introClip)),new Set(INTRO_CLIPS));
});

test('off unless asked: a run starts exactly as before',()=>{
 const f=engine().start({mode:'career',event:0});
 assert.equal(f.intro,null);
 assert.notEqual(f.state.vel.x**2+f.state.vel.y**2,0);
});

test('the sim is held at tick 0 through the intro; afterwards the program is the one it would have been',()=>{
 const a=engine(),b=engine();
 a.start({mode:'career',event:0,intro:true});b.start({mode:'career',event:0});
 let fa;
 for(let i=0;i<INTRO_TICKS/2;i++)fa=a.advance(pad(),2);
 assert.equal(fa.intro,null,'it ends after INTRO_SECONDS');
 assert.equal(a.state.tick,0);assert.equal(a.elapsed,0);
 for(let i=0;i<300;i++){a.advance(pad(),2);b.advance(pad(),2);}
 assert.equal(a.state.tick,b.state.tick);
 assert.equal(replayDigest(a.state,[]),replayDigest(b.state,[]));
 assert.deepEqual(a.recorder.frames?.length,b.recorder.frames?.length);
});

test('while she stands, the frame shows her still in a whole-body idle clip',()=>{
 const f=engine().start({mode:'career',event:0,intro:true});
 assert.equal(f.motion.layer,'full');assert.ok(INTRO_CLIPS.includes(f.motion.clip));
 assert.deepEqual(f.state.vel,{x:0,y:0});assert.equal(f.state.yawRate,0);
 assert.equal(f.intro.left,INTRO_SECONDS);
});

test('a fresh press of A skips it; an A held from the menu does not',()=>{
 const e=engine();e.start({mode:'career',event:0,intro:true});
 let f=e.advance(pad(1),2);
 assert.notEqual(f.intro,null,'held from the menu');
 f=e.advance(pad(0),2);f=e.advance(pad(1),2);
 assert.equal(f.intro,null);assert.ok(e.state.tick>0,'the program began in the same batch');
 const p=new ProgramIntro(1);p.tick(SIM_DT,true);assert.equal(p.done,false);p.tick(SIM_DT);p.tick(SIM_DT,true);assert.equal(p.done,true);
});

test('out of a warm-up the program still opens with its intro',()=>{
 const e=engine();e.start({mode:'career',event:0,warmup:true,warmupSeconds:1,intro:true});
 let f;for(let i=0;i<70&&e.warmup;i++)f=e.advance(pad(),2);
 assert.equal(e.warmup,null);assert.notEqual(e.intro,null);assert.equal(e.state.tick,0);
});
