// Checks that need no Unreal install: the project file, the bridge ops the client sends, and that
// the C++ port of the skater and the sim-space mapping still agree with the Godot scripts they
// follow. With an installed engine and a built module (UE_ROOT), it also runs the live smoke test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const godot = join(root, '../ice-run-godot');
const read = path => readFileSync(join(root, path), 'utf8');

test('the project names its module and the plugins it builds on', () => {
  const project = JSON.parse(read('IceRun.uproject'));
  assert.equal(project.Modules[0].Name, 'IceRun');
  const plugins = project.Plugins.map(p => p.Name);
  for (const name of ['ProceduralMeshComponent', 'PythonScriptPlugin']) assert.ok(plugins.includes(name), name);
});

test('every op the client sends is one the bridge answers', () => {
  const host = readFileSync(join(godot, 'bridge/host.mjs'), 'utf8');
  const answered = new Set([...host.matchAll(/case '([a-zA-Z]+)'/g)].map(m => m[1]));
  // The session's own sends, and the menus' (SendOp).
  const source = ['Source/IceRun/IceRunGameMode.cpp', 'Source/IceRun/IceRunMenus.cpp'].map(read).join('\n');
  const sent = new Set([...source.matchAll(/(?:Bridge\.Send|SendOp)\(TEXT\("([a-zA-Z]+)"\)/g)].map(m => m[1]));
  sent.add('quit');
  for (const op of ['start', 'frame', 'configure', 'plan', 'timeline', 'train', 'drill', 'rest', 'armFocus', 'dress', 'design']) assert.ok(sent.has(op), `the client never sends '${op}'`);
  for (const op of sent) assert.ok(answered.has(op), `host.mjs has no '${op}'`);
});

test('sim space puts the sheet centre where the Godot game does', () => {
  const gd = readFileSync(join(godot, 'scripts/sim_space.gd'), 'utf8');
  const centre = Number(gd.match(/RINK_CENTRE_Y := ([\d.]+)/)[1]);
  const cpp = read('Source/IceRun/IceSimSpace.h');
  assert.equal(Number(cpp.match(/RinkCentreY = ([\d.]+)/)[1]), centre);
});

test("the C++ skater keeps skater.gd's constants", () => {
  const gd = readFileSync(join(godot, 'scripts/skater.gd'), 'utf8');
  const cpp = read('Source/IceRun/IceSkater.cpp');
  const pascal = name => name.toLowerCase().replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
  let compared = 0;
  for (const [, name, value] of gd.matchAll(/^const ([A-Z_]+) := ([\d.]+)\s*(?:#.*)?$/gm)) {
    const port = cpp.match(new RegExp(`constexpr double ${pascal(name)} = ([\\d.]+);`));
    if (!port) continue;
    assert.equal(Number(port[1]), Number(value), name);
    compared++;
  }
  assert.ok(compared >= 25, `only ${compared} constants compared`);
});

const engine = process.env.UE_ROOT ?? join(homedir(), 'UnrealEngine/Linux_Unreal_Engine_5.8.4');
const editorCmd = join(engine, 'Engine/Binaries/Linux/UnrealEditor-Cmd');
const built = existsSync(join(root, 'Binaries/Linux/libUnrealEditor-IceRun.so')) && existsSync(join(godot, 'runtime/sim/solver.js'));

test('the live engine skates the first career routine in Unreal', {skip: !existsSync(editorCmd) || !built ? 'needs UE_ROOT, a built module and the prepared runtime' : false, timeout: 600_000}, () => {
  const out = execFileSync(editorCmd, [join(root, 'IceRun.uproject'), '-game', '-nullrhi', '-unattended', '-nosplash', '-nosound', '-IceSmoke', '-UseFixedTimeStep', '-FPS=60', '-stdout'], {encoding: 'utf8', maxBuffer: 256 << 20});
  assert.match(out, /UNREAL_SMOKE_PASS/);
});

test('the menus walk a career round through the live engine: plan, music, skate, result and story, train, dress, compose', {skip: !existsSync(editorCmd) || !built ? 'needs UE_ROOT, a built module and the prepared runtime' : false, timeout: 600_000}, () => {
  const out = execFileSync(editorCmd, [join(root, 'IceRun.uproject'), '-game', '-nullrhi', '-unattended', '-nosplash', '-nosound', '-IceMenuTest', '-UseFixedTimeStep', '-FPS=60', '-stdout', '-FullStdOutLogOutput'], {encoding: 'utf8', maxBuffer: 256 << 20});
  assert.match(out, /UNREAL_MENUS_PASS/);
});

test('the landing the client senses carries every field it reads', async () => {
  // SenseLanding (the thud, the crowd's swell, the rumble, CLEAN LANDING) reads the snapshot's state.landed.
  const {IceEngine} = await import('../../ice-run-godot/bridge/engine.mjs');
  const e = new IceEngine();
  e.start({mode: 'free'});
  const landed = e.snapshot().state.landed;
  const cpp = read('Source/IceRun/IceRunGameMode.cpp');
  const body = cpp.slice(cpp.indexOf('void AIceRunGameMode::SenseLanding'));
  const fields = [...body.slice(0, body.indexOf('\n}\n')).matchAll(/\(\*Landed\)->TryGet\w+Field\(TEXT\("(\w+)"\)/g)].map(m => m[1]);
  assert.deepEqual(fields.sort(), ['fall', 'stepOut', 'tick', 'turned']);
  for (const field of fields) assert.ok(Object.hasOwn(landed, field), `state.landed has no '${field}'`);
});

test('the story and the coach reach the bridge catalog and snapshot the menus read', async () => {
  const {IceEngine} = await import('../../ice-run-godot/bridge/engine.mjs');
  const e = new IceEngine();
  const story = e.catalog().story;
  assert.equal(story.chapters.length, e.catalog().events.length);
  for (const key of ['season', 'coach', 'cast', 'statTitles']) assert.ok(story[key], key);
  assert.ok(Array.isArray(e.snapshot().career.advice));
});
