import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine} from '../bridge/engine.mjs';

const skate=(engine,ticks,controls={})=>{for(let i=0;i<ticks;i+=2)engine.advance({lx:0,ly:.4,push:i%180===0,...controls},2);return engine.snapshot();};

test('pairs mode adds a partner skater and never changes the lead solver',()=>{
 const engine=new IceEngine();engine.start({mode:'pairs'});
 const snap=skate(engine,600);
 assert.equal(snap.mode,'pairs');
 assert.ok(snap.pairs,'partner snapshot present');
 assert.ok(Number.isFinite(snap.pairs.state.pos.x));
 assert.ok(snap.pairs.distance>0);
 const solo=new IceEngine();solo.start({mode:'free'});skate(solo,600);
 assert.deepEqual(engine.state.pos,solo.state.pos);
});

test('non-pairs modes carry no partner',()=>{
 const engine=new IceEngine();engine.start({mode:'free'});
 assert.equal(engine.snapshot().pairs,null);
});

test('pairs challenge finishes after 90 seconds with a result',()=>{
 const engine=new IceEngine();engine.start({mode:'pairs',pairsChallenge:true});
 for(let i=0;i<50000&&!engine.finished;i++)engine.advance({ly:.3},12);
 assert.ok(engine.finished);
 assert.match(engine.snapshot().result.title,/Together on ice/);
});

test('pairs replay round-trips and verifies both partners',()=>{
 const engine=new IceEngine();engine.start({mode:'pairs'});
 skate(engine,800,{pairHold:true});
 const clip=engine.exportReplay();
 assert.equal(JSON.parse(clip).format,'edgework-pairs/1');
 const replay=new IceEngine();replay.replay(clip);
 for(let i=0;i<2000&&!replay.finished;i++)replay.advance({},12);
 assert.equal(replay.snapshot().result.title,'Replay verified');
});

test('a tampered partner digest is reported as a replay mismatch',()=>{
 const engine=new IceEngine();engine.start({mode:'pairs'});
 skate(engine,400);
 const clip=JSON.parse(engine.exportReplay());clip.partners[100].digest^=1;
 const replay=new IceEngine();replay.replay(JSON.stringify(clip));
 for(let i=0;i<2000&&!replay.finished;i++)replay.advance({},12);
 assert.equal(replay.snapshot().result.title,'Replay mismatch');
});

test('malformed pairs controls and replays are rejected',()=>{
 const engine=new IceEngine();engine.start({mode:'pairs'});
 assert.throws(()=>engine.advance({pairHold:1},2),/Invalid button/);
 assert.throws(()=>engine.start({mode:'pairs',pairsChallenge:'yes'}),/Invalid pairs challenge/);
 skate(engine,20);
 const clip=JSON.parse(engine.exportReplay());
 assert.throws(()=>new IceEngine().replay(JSON.stringify({...clip,partners:[]})),/Invalid pairs replay/);
});
