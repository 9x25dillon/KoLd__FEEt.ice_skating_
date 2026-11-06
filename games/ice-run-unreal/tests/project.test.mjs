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
  const sent = new Set([...read('Source/IceRun/IceRunGameMode.cpp').matchAll(/Bridge\.Send\(TEXT\("([a-zA-Z]+)"\)/g)].map(m => m[1]));
  sent.add('quit');
  assert.ok(sent.size >= 5, [...sent].join());
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
