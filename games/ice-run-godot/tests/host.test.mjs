import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

function host(t, dir) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bridge/host.mjs', import.meta.url)), dir], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  let serial = 0;
  t.after(() => child.kill());
  return async (op, options = {}) => {
    child.stdin.write(JSON.stringify({id: ++serial, op, ...options}) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false, 'host must respond');
    const reply = JSON.parse(line.value);
    assert.equal(reply.id, serial);
    return reply;
  };
}

test('real host saves a career, reloads training and replays without awarding XP', {timeout: 15000}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ice-run-host-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const send = host(t, dir);
  const hello = await send('hello');
  assert.equal(hello.ok, true);
  assert.equal(hello.data.frame.career.xp, 0);
  let reply = await send('start', {options: {mode: 'career', event: 0}});
  for (let i = 0; i < 750 && !reply.data.finished; i++) {
    const index = reply.data.routine.index;
    reply = await send('frame', {ticks: 12, controls: {kx: index === 1 ? -1 : 0}, low: index === 2});
    assert.equal(reply.ok, true);
    assert.equal(reply.saveError, null);
  }
  assert.equal(reply.data.result.complete, true);
  assert.equal(reply.data.career.medals[0], 3);
  await send('train', {stat: 'balance'});
  const saved = readFileSync(join(dir, 'career-v1.json'), 'utf8');
  const restored = await host(t, dir)('hello');
  assert.equal(restored.data.frame.career.stats.balance, 51);
  assert.equal(restored.data.frame.career.unlocked, 1);
  const exported = await send('export');
  assert.equal(exported.data.path, join(dir, 'ice-run-replay.json'));
  reply = await send('replay');
  for (let i = 0; i < 750 && !reply.data.finished; i++) reply = await send('frame', {ticks: 12});
  assert.equal(reply.data.result.title, 'Replay verified');
  assert.equal(readFileSync(join(dir, 'career-v1.json'), 'utf8'), saved);
});

test('a rejected host command leaves the live skating process usable', {timeout: 5000}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ice-run-host-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const send = host(t, dir);
  assert.equal((await send('replay')).ok, false);
  assert.equal((await send('start', {options: {mode: 'career', event: 4}})).ok, false);
  const next = await send('frame', {ticks: 2});
  assert.equal(next.ok, true);
  assert.equal(next.data.state.tick, 2);
  assert.equal(next.data.career.xp, 0);
});
