// tests/venues.test.mjs — the bridge tells a client where it is skating (tools/ice-lab/game/venues.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine} from '../bridge/engine.mjs';
import {VENUES,EVENT_VENUE} from '../runtime/game/venues.js';
import {CAREER_EVENTS} from '../runtime/game/career.js';

test('the catalogue carries every venue, once, as the data module has it', () => {
 const e=new IceEngine();
 assert.deepEqual(e.catalog().venues,VENUES);
});

test('a snapshot names its venue: a new engine is free skating, outdoors', () => {
 // The constructor starts a free skate, so even the hello frame carries a venue.
 assert.equal(new IceEngine().snapshot().venue,'outdoor-night');
});

test('start() picks the venue for the run: the first career event, and other modes', () => {
 // Later events unlock in order; their mapping is tools/ice-lab/test/venues.test.ts's to prove.
 const career=new IceEngine();career.start({mode:'career',event:0});
 assert.equal(career.snapshot().venue,EVENT_VENUE[CAREER_EVENTS[0].id]);
 assert.equal(career.snapshot().venue,'dawn-practice');
 const free=new IceEngine();free.start({mode:'free'});
 assert.equal(free.snapshot().venue,'outdoor-night');
 const rookie=new IceEngine();rookie.start({mode:'rookie'});
 assert.equal(rookie.snapshot().venue,'dawn-practice');
});

test('the venue changes nothing on the ice: a career run steps the same in any venue', () => {
 const a=new IceEngine(),b=new IceEngine();
 a.start({mode:'career',event:0});b.start({mode:'career',event:0});
 b.venue='gala';
 for(let i=0;i<30;i++){a.advance(undefined,4);b.advance(undefined,4);}
 assert.deepEqual(a.state.pos,b.state.pos);
 assert.equal(b.snapshot().venue,'gala');
});
