// Prepares the Unreal client: the Ice Lab runtime the bridge runs, the C++ module, and the
// content imported from the Godot game's skaters. Each step is skipped when it is up to date,
// unless asked for by name.
//
//   node games/ice-run-unreal/tools/prepare.mjs [--content] [--no-build]
//
// UE_ROOT is the installed engine (default ~/UnrealEngine/Linux_Unreal_Engine_5.8.4).
import {existsSync, statSync, readdirSync, readFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const godot = join(root, '../ice-run-godot');
const project = join(root, 'IceRun.uproject');
const engine = process.env.UE_ROOT ?? join(homedir(), 'UnrealEngine/Linux_Unreal_Engine_5.8.4');
const editorCmd = join(engine, 'Engine/Binaries/Linux/UnrealEditor-Cmd');
const build = join(engine, 'Engine/Build/BatchFiles/Linux/Build.sh');
const args = new Set(process.argv.slice(2));

function newest(dir) {
  let latest = 0;
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return latest;
}

// 1. The bridge's runtime: the same TypeScript the browser and Godot games run, prepared once;
// with FFmpeg, the music too (Ogg Vorbis, which tools/build_content.py imports).
let ffmpeg = true;
try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); } catch { ffmpeg = false; }
execFileSync(process.execPath, [join(godot, 'tools/prepare.mjs'), ...(ffmpeg ? [] : ['--engine-only'])], {stdio: 'inherit'});

// Unreal's importer reads audio-only Ogg Vorbis: the MP3s carry cover art, which an Ogg made from them
// keeps as a second stream it cannot read. So the music gets its own copies, the audio alone.
const audio = join(root, '../../tools/ice-lab/game/audio');
const tracks = JSON.parse(readFileSync(join(audio, 'tracks.json'), 'utf8'));
mkdirSync(join(root, 'Intermediate/Music'), {recursive: true});
if (ffmpeg) for (const track of tracks) {
  const source = join(audio, track.file), out = join(root, 'Intermediate/Music', `${track.id}.ogg`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(source).mtimeMs) continue;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vn', '-map', '0:a:0', '-c:a', 'libvorbis', '-q:a', '5', out]);
}

if (!existsSync(editorCmd)) {
  console.error(`No Unreal Engine at ${engine}. Set UE_ROOT to an installed 5.8 build.`);
  process.exit(1);
}

// 2. The C++ module, when its source is newer than the library.
const library = join(root, 'Binaries/Linux/libUnrealEditor-IceRun.so');
if (!args.has('--no-build') && (!existsSync(library) || newest(join(root, 'Source')) > statSync(library).mtimeMs)) {
  execFileSync(build, ['IceRunEditor', 'Linux', 'Development', `-Project=${project}`, '-WaitMutex'], {stdio: 'inherit'});
}

// 3. Content: the skaters through Interchange, and the materials, when missing or asked for.
const manifest = join(root, 'Content/Generated/music.json');
const sources = [join(root, 'tools/build_content.py'), ...['skater-athlete', 'skater-competition', 'skater-berserker', 'skater', 'spectator', 'skater-rival-ansa', 'skater-rival-katya', 'skater-rival-noor', 'skater-rival-remi', 'skater-rival-teodora', 'skater-build-light', 'skater-build-strong'].map(n => join(godot, `assets/generated/${n}.glb`))];
const stale = !existsSync(manifest) || sources.some(s => existsSync(s) && statSync(s).mtimeMs > statSync(manifest).mtimeMs);
if (args.has('--content') || stale) {
  execFileSync(editorCmd, [project, '-run=pythonscript', `-script=${join(root, 'tools/build_content.py')}`, '-unattended', '-nosplash', '-nullrhi'], {stdio: 'inherit'});
}
console.log('Unreal client prepared.');
