import {cpSync, mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'exports/linux');
const godot = process.env.GODOT_BIN || 'godot4';
mkdirSync(out, {recursive: true});
execFileSync(process.execPath, [join(root, 'tools/prepare.mjs')], {stdio: 'inherit'});
execFileSync(godot, ['--headless', '--path', root, '--editor', '--import', '--quit'], {stdio: 'inherit'});
execFileSync(godot, ['--headless', '--path', root, '--export-release', 'Linux', join(out, 'ice-run.x86_64')], {stdio: 'inherit'});
// Node cannot read Godot's PCK. Ship the original simulation beside the binary.
for (const folder of ['bridge', 'runtime']) {
  cpSync(join(root, folder), join(out, folder), {
    recursive: true,
    filter: source => !source.endsWith('.import') && !source.endsWith('.translation'),
  });
}
writeFileSync(join(out, 'README.txt'), `EDGEWORK / Ice Run — Linux development build

Run ./ice-run.x86_64. Requires Node.js 24 or newer on PATH.
Set ICE_RUN_NODE to an absolute Node executable path if needed.
Keep ice-run.pck, bridge/ and runtime/ alongside the executable.
The Node runtime is not bundled. No network connection is needed to play.

Career, authored programs and settings save in Godot's user data directory.
This is a playable prototype, with procedural animation and a single rink.
`);
console.log(`Linux build ready: ${out}/ice-run.x86_64`);
