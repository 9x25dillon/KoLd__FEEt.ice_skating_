import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {SKATE_PRESETS} from '../runtime/game/skates.js';

test('the catalog carries the skates, and a frame carries the look worn',()=>{
 const engine=new IceEngine();
 assert.ok(engine.catalog().skates.presets.length>=10);
 assert.equal(engine.snapshot().skates.name,'Competition white');
 engine.setSkates('gold');
 const frame=engine.snapshot();
 assert.equal(frame.skates.name,'Gold-plated blade');
 assert.equal(frame.skates.blade.native,false);
 engine.setSkates({boot:'diamond'});
 assert.equal(engine.snapshot().skates.name,'Competition white','anything off the lists is today\'s look');
});

test('skates never change the skating: the same inputs give the same state in any pair',()=>{
 const run=choice=>{
  const engine=new IceEngine();engine.setSkates(choice);
  for(let i=0;i<360;i++)engine.tick({...emptyControls(),lean:.2*Math.sin(i*.02),knee:.4,push:i%80===0});
  return JSON.stringify(engine.state);
 };
 const bare=run(null);
 for(const preset of SKATE_PRESETS)assert.equal(run(preset.choice),bare,preset.id);
});
