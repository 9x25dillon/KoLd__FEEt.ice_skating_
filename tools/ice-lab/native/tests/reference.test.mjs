// Apache-2.0. Integrity checks independent of the generator's Git subprocesses.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical, PIN } from '../export-reference.mjs';
import { crc32 } from '../../sim/math.ts';
import { checkFlags } from '../check-fp-flags.mjs';

const read = name => readFileSync(new URL('../reference/' + name, import.meta.url));
const json = name => JSON.parse(read(name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('every committed reference artifact matches its SHA-256 manifest', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.sourceCommit, PIN);
  assert.equal(manifest.sourceSolver, 'ice-lab-f64/5');
  assert.equal(manifest.nativeSolverVerified, false);
  assert.equal(Object.keys(manifest.files).length, 8);
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(sha(read(name)), hash, name);
});

test('oracle is bound to the /5 replay and covers every numeric bit including tick zero', () => {
  const [header, ...rows] = read('oracle.jsonl').toString().trimEnd().split('\n').map(JSON.parse);
  const clip = json('replay-v1.json');
  assert.equal(clip.solver, 'ice-lab-f64/5');
  assert.equal(header.replaySha256, sha(read('replay-v1.json')));
  assert.equal(header.sourceCommit, PIN);
  assert.equal(rows.length, clip.frames.length + 1);
  for (const [tick, row] of rows.entries()) {
    assert.equal(row.tick, tick);
    const pair = JSON.parse(row.canonical);
    assert.equal(pair[0].tick, tick);
    assert.equal(canonical(pair), row.canonical);
    assert.equal(crc32(new TextEncoder().encode(row.canonical)), row.crc);
    if (tick) assert.equal(row.crc, clip.frames[tick - 1].digest);
    else assert.deepEqual(pair[1], []);
    const visited = [];
    function walk(v, path, key) {
      if (typeof v === 'number' || v === '+Infinity') {
        const token = row.bits[path]; assert.match(token, /^[0-9a-f]{16}$/);
        const value = Buffer.from(token, 'hex').readDoubleBE();
        if (v === '+Infinity') { assert.equal(key, 'turnRadius'); assert.equal(value, Infinity); }
        else { assert(Number.isFinite(value)); assert.equal(JSON.stringify(value), JSON.stringify(v)); }
        visited.push(path);
      } else if (v && typeof v === 'object') {
        for (const key of Object.keys(v)) walk(v[key], path + '/' + key, key);
      }
    }
    walk(pair, '', ''); assert.deepEqual(visited.sort(), Object.keys(row.bits).sort());
  }
});

test('wire manifest includes all inactive fields, signed sentinels, and parser bounds', () => {
  const m = json('wire-manifest.json');
  assert.equal(m.sourceCommit, PIN);
  assert.equal(m.types.find(t => t.name === 'Params').fields.length, 93);
  assert.equal(m.types.find(t => t.name === 'SkatingInput').fields.length, 13);
  assert.deepEqual(m.initialSpeed, [-100, 100]);
  assert.deepEqual(m.inputBounds.carriage, [0, 1]);
  const initial = JSON.parse(JSON.parse(read('oracle.jsonl').toString().split('\n')[1]).canonical)[0];
  assert.equal(initial.jump.inertia, json('replay-v1.json').initial.params.inertiaOpen);
  assert.equal(initial.landed.tick, -1);
  assert.equal(initial.moveDone.tick, -1);
  assert.equal(m.types.find(t => t.name === 'EdgeEvent').fields.length, 7);
});

test('measured mutations pin future native stop-at-first-divergence checks', () => {
  const { mutations } = json('measured-mutations.json');
  assert.equal(mutations[0].tick, 5);
  assert.equal(mutations[0].ticksAttempted, 5);
  assert.equal(mutations[0].firstNumericDifference, null);
  const brake = mutations[1];
  assert.equal(brake.tick, 101);
  assert.equal(brake.ticksAttempted, 101);
  assert.equal(brake.expected, 1528175992);
  assert.equal(brake.actual, 2962664100);
  assert.deepEqual(brake.firstNumericDifference, {
    path: '/0/blade/0/contact/x', expectedBits: '400ae0032097d7a9', actualBits: '400adf91d5812909',
  });
});

test('canonical reference helper rejects illegal non-finite values', () => {
  assert.equal(canonical([{ turnRadius: Infinity, x: -0 }, []]), '[{"turnRadius":"+Infinity","x":0},[]]');
  assert.throws(() => canonical([{ x: Infinity }, []]), /Non-finite/);
  assert.throws(() => canonical([{ turnRadius: -Infinity }, []]), /Non-finite/);
  assert.throws(() => canonical([{ x: NaN }, []]), /Non-finite/);
});

test('strict FP evidence fails closed on absent, partial or conflicting commands', () => {
  const rows = ['KoLdMath.cpp', 'KoLdProtocol.cpp', 'native_check.cpp'].map(file => ({
    file, arguments: ['c++', '-fno-fast-math', '-ffp-contract=off', '-c', file],
  }));
  checkFlags(rows);
  assert.throws(() => checkFlags([]), /empty/);
  assert.throws(() => checkFlags(rows.slice(1)), /missing compile commands/);
  for (const flag of ['-ffast-math', '-Ofast', '-ffp-contract=fast']) {
    const bad = structuredClone(rows); bad[0].arguments.push(flag);
    assert.throws(() => checkFlags(bad), /conflicting/);
  }
  const bad = structuredClone(rows); bad[0].arguments.splice(2, 1);
  assert.throws(() => checkFlags(bad), /missing -ffp-contract=off/);
});
