import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {IceEngine, tracks} from '../bridge/engine.mjs';

test('the timeline editor drafts, checks and saves a career program on its music', () => {
 const engine = new IceEngine();
 let frame = engine.timeline({event: 0, action: 'open'});
 assert.equal(frame.draft.event, 0);
 assert.equal(frame.draft.check.ok, true);
 assert.equal(frame.draft.saved, false);
 assert.deepEqual(frame.draft.cues.map(c => c.id), ['glide', 'edge', 'pose']);
 // Crowd the second cue onto the first: refused at save, in words.
 const gap = frame.draft.cues[1].bar - frame.draft.cues[0].bar;
 frame = engine.timeline({action: 'nudge', event: 0, index: 1, by: -gap});
 assert.equal(frame.draft.check.ok, false);
 assert.throws(() => engine.timeline({event: 0, action: 'save'}), /same bar/);
 frame = engine.timeline({event: 0, action: 'spread'});
 assert.equal(frame.draft.check.ok, true);
 frame = engine.timeline({event: 0, action: 'track', track: 2});
 assert.equal(frame.draft.track, 2);
 frame = engine.timeline({event: 0, action: 'save'});
 assert.equal(frame.draft.saved, true);
 assert.equal(frame.career.timelines[0].track, 2);
 assert.deepEqual(frame.career.plans[0], ['glide', 'edge', 'pose']);
 assert.throws(() => engine.timeline({event: 1, action: 'nudge', index: 0, by: 1}), /Open the program/);
 assert.throws(() => engine.timeline({event: 0, action: 'remove', index: 0}), /asks for/);
});

test('a career program on its music plays that music and runs for the event, cueing each element', () => {
 const engine = new IceEngine();
 engine.configure({track: 0});
 engine.timeline({event: 0, action: 'open'});
 engine.timeline({event: 0, action: 'track', track: 3});
 engine.timeline({event: 0, action: 'save'});
 let frame = engine.start({mode: 'career', event: 0});
 assert.equal(frame.track, 3, 'the program brings its own music');
 assert.equal(engine.params.musicBpm, tracks[3].bpm);
 assert.equal(frame.routine.cues.length, 3);
 assert.ok(frame.routine.cues.every(c => c.result === null && c.at > 0));
 assert.equal(frame.draft, null, 'skating closes the editor');
 // A free skate still uses the soundtrack setting.
 assert.equal(engine.start({mode: 'free'}).track, 0);
});

test('a dressed design previews without being kept; a kept one joins the wardrobe', () => {
 const engine = new IceEngine();
 const start = engine.catalog().atelier.starts[0];
 const skin = engine.dress({...start, crystals: 'full', fabric: 'velvet'});
 assert.equal(skin.fabric, 'velvet');
 assert.ok(skin.crystals > 0);
 assert.deepEqual(engine.snapshot().wardrobe.designs, [null, null, null]);
 assert.throws(() => engine.dress({...start, bodice: '#ff00ff'}), /off the lists/);
 engine.saveDesign(1, start);
 assert.equal(engine.snapshot().wardrobe.skins[1].id, 'design-1');
 assert.throws(() => engine.saveDesign(5, start), /could not be kept/);
});

test('the real host keeps the wardrobe in its own file, apart from the career', {timeout: 15000}, async t => {
 const dir = mkdtempSync(join(tmpdir(), 'ice-run-wardrobe-'));
 t.after(() => rmSync(dir, {recursive: true, force: true}));
 const open = () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bridge/host.mjs', import.meta.url)), dir], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  let serial = 0;
  t.after(() => child.kill());
  return async (op, options = {}) => {
   child.stdin.write(JSON.stringify({id: ++serial, op, ...options}) + '\n');
   return JSON.parse((await lines.next()).value);
  };
 };
 let send = open();
 const hello = await send('hello');
 const design = {...hello.data.catalog.atelier.starts[2], name: 'Garnet night'};
 let reply = await send('design', {slot: 0, design});
 assert.equal(reply.ok, true);
 reply = await send('dress', {design: {...design, crystals: 'bodice'}});
 assert.equal(reply.data.skin.name, 'Garnet night');
 reply = await send('timeline', {options: {event: 0, action: 'open'}});
 reply = await send('timeline', {options: {event: 0, action: 'save'}});
 assert.equal(reply.ok, true);
 await send('quit').catch(() => {});
 assert.equal(JSON.parse(readFileSync(join(dir, 'wardrobe-v1.json'), 'utf8')).designs[0].name, 'Garnet night');
 assert.equal(JSON.parse(readFileSync(join(dir, 'career-v1.json'), 'utf8')).timelines[0].track, 0);
 send = open();
 reply = await send('hello');
 assert.equal(reply.data.frame.wardrobe.skins[0].name, 'Garnet night');
 assert.equal(reply.data.frame.career.timelines[0].cues.length, 3);
});

test('a rusty career jump says its higher bar, and the routine carries the rust', () => {
 const engine = new IceEngine();
 engine.career.rust = {toe: 1, edge: 0.25};
 engine.career.medals = [3, 3, 0, 0, 0];
 engine.career.profile = {...engine.career.profile, stats: {...engine.career.profile.stats, edgeControl: 70}};
 const frame = engine.start({mode: 'career', event: 2});
 assert.deepEqual(engine.routine.rust, {toe: 1, edge: 0.25});
 engine.routine.index = 2;
 assert.match(engine.snapshot().routine.how, /a toe jump needs 0\.75 of a turn here, an edge jump 0\.56/);
 assert.ok(frame.routine);
});
