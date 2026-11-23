import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join, relative} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = join(root, '../..');
// D7: build into a staging folder; the previous good package is replaced only after the new one
// passes every check, so a failed export leaves it untouched.
const finalOut = join(root, 'exports/linux');
const out = join(root, 'exports/linux.staging');
const godot = process.env.GODOT_BIN || 'godot4';

function tryExec(cmd, args, cwd = repo) {
  try {
    return execFileSync(cmd, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return null;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(dir, base = dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...listFiles(full, base));
    else results.push(relative(base, full).replaceAll('\\', '/'));
  }
  return results.sort();
}

function runGodot(args) {
  const r = spawnSync(godot, args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Godot exited with status ${r.status}: ${args.join(' ')}`);
  if (/SCRIPT ERROR:|Parse Error:|Failed to load script/.test(r.stderr ?? '')) {
    throw new Error(`Godot reported a script error during ${args.join(' ')}; aborting export.`);
  }
}

if (existsSync(out)) rmSync(out, {recursive: true, force: true});
process.on('exit', code => {
  if (code !== 0 && existsSync(out)) rmSync(out, {recursive: true, force: true});
});
const runtimeDir = join(root, 'runtime');
if (existsSync(runtimeDir)) rmSync(runtimeDir, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
execFileSync(process.execPath, [join(root, 'tools/prepare.mjs')], {stdio: 'inherit'});
runGodot(['--headless', '--path', root, '--editor', '--import', '--quit']);
runGodot(['--headless', '--path', root, '--export-release', 'Linux', join(out, 'ice-run.x86_64')]);
// Node cannot read Godot's PCK. Ship the original simulation beside the binary.
for (const folder of ['bridge', 'runtime']) {
  cpSync(join(root, folder), join(out, folder), {
    recursive: true,
    filter: source => !source.endsWith('.import') && !source.endsWith('.translation'),
  });
}
for (const name of ['LICENSE', 'LICENSE-CODE']) cpSync(join(repo, name), join(out, name));
cpSync(join(root, 'assets/fonts/LICENSE'), join(out, 'LICENSE-font.txt'));
mkdirSync(join(out, 'docs'), {recursive: true});
cpSync(join(repo, 'docs/grand-prix-build.md'), join(out, 'docs/grand-prix-build.md'));
cpSync(join(repo, 'docs/presentation'), join(out, 'docs/presentation'), {recursive: true});
cpSync(join(repo, 'tools/ice-lab/game/audio/README.md'), join(out, 'docs/audio.md'));
if (existsSync(join(root, 'assets/source/makehuman/README.md'))) {
  cpSync(join(root, 'assets/source/makehuman/README.md'), join(out, 'docs/makehuman-cc0.md'));
}
for (const doc of ['distribution-linux.md', 'controller-acceptance-checklist.md']) {
  const src = join(repo, 'docs', doc);
  if (existsSync(src)) cpSync(src, join(out, 'docs', doc));
}
writeFileSync(join(out, 'README.txt'), `EDGEWORK / Grand Prix — Northlight Arena (Linux Package)

Run: ./ice-run.x86_64
Runtime requirements:
  - Node.js 24.19+ or 26 on PATH (or set ICE_RUN_NODE=/absolute/path/to/node)
  - Vulkan-capable GPU (Godot 4 Forward+ renderer)
  - Keep ice-run.pck, bridge/, and runtime/ in the same directory as ice-run.x86_64
  - Node.js is NOT bundled; Godot and Blender are NOT required to play
  - No network connection is required

Verify package integrity:
  sha256sum -c SHA256SUMS

Save location (Linux):
  ~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/
  (preferences.json, career-v1.json, wardrobe-v1.json, studio-v1.json, arcade-v1.json)
  Isolated smoke run: ./ice-run.x86_64 --headless -- --smoke-test

Controls:
  Xbox: A select, B back, D-pad navigate, Menu pause, View cycle camera (blocked airborne).
  Keyboard: A/D carve, Space push, Shift load/release, Esc pause, V camera, F11 fullscreen.
  Start with Blade Explorer. Select Simulation, Experimental, Dig Gate, or Full Repertoire in Settings.
  Native paddle presets, controller tuning, and landing vibration are in Settings.

Troubleshooting & rollback:
  See docs/distribution-linux.md and package-manifest.json.
  This is a playable development build; see docs/distribution-linux.md for open acceptance gates.
`);

for (const required of ['ice-run.x86_64', 'ice-run.pck', 'bridge/host.mjs', 'runtime/sim/solver.js', 'runtime/tracks.json', 'runtime/source-manifest.json']) {
  if (!existsSync(join(out, required))) {
    throw new Error(`Export incomplete: missing ${required} in ${out}`);
  }
}

const sourceManifestPath = join(out, 'runtime/source-manifest.json');
const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
const gitCommit = tryExec('git', ['rev-parse', 'HEAD']) ?? 'unknown';
const gitShort = tryExec('git', ['rev-parse', '--short', 'HEAD']) ?? 'unknown';
const gitBranch = tryExec('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown';
const gitStatus = tryExec('git', ['status', '--porcelain']);
const godotVersion = tryExec(godot, ['--version'], root) ?? 'unknown';

const packageManifest = {
  format: 'edgework-linux-package/1',
  product: 'EDGEWORK / Grand Prix',
  platform: 'linux-x86_64',
  builtAtUtc: new Date().toISOString(),
  source: {
    commit: gitCommit,
    shortCommit: gitShort,
    branch: gitBranch,
    dirty: gitStatus === null ? null : gitStatus.length > 0,
  },
  toolchain: {
    nodeBuildVersion: process.version,
    godotVersion,
  },
  runtimeRequirements: {
    node: '>=24.19.0 (tested on Node 24 and 26; not bundled)',
    renderer: 'Vulkan (Godot 4 Forward+)',
    adjacentEntries: ['ice-run.x86_64', 'ice-run.pck', 'bridge/', 'runtime/'],
  },
  simulationRuntime: {
    preparedModules: Object.keys(sourceManifest).length,
    sourceManifestSha256: sha256File(sourceManifestPath),
  },
  saveDirectory: '~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/',
  checksumFile: 'SHA256SUMS',
};
writeFileSync(join(out, 'package-manifest.json'), JSON.stringify(packageManifest, null, 2) + '\n');

const files = listFiles(out).filter(rel => rel !== 'SHA256SUMS');
const checksumLines = files.map(rel => `${sha256File(join(out, rel))}  ${rel}`);
writeFileSync(join(out, 'SHA256SUMS'), checksumLines.join('\n') + '\n');

const previous = join(root, 'exports/linux.previous');
if (existsSync(previous)) rmSync(previous, {recursive: true, force: true});
if (existsSync(finalOut)) renameSync(finalOut, previous);
renameSync(out, finalOut);
rmSync(previous, {recursive: true, force: true});

console.log(`Linux build ready: ${finalOut}/ice-run.x86_64 (${gitShort}, ${files.length} checksummed files)`);
