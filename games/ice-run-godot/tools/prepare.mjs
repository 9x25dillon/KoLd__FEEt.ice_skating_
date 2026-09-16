import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const lab=join(root,'../../tools/ice-lab');
const manifest={};
mkdirSync(join(root,'runtime'),{recursive:true});
// These files belong to Node, not Godot's resource/translation importer.
writeFileSync(join(root,'runtime/.gdignore'),'');
for(const folder of ['sim','app','game']) {
 const out=join(root,'runtime',folder); mkdirSync(out,{recursive:true});
 for(const name of readdirSync(join(lab,folder)).filter(n=>n.endsWith('.ts'))) {
  const source=readFileSync(join(lab,folder,name),'utf8');
  manifest[`${folder}/${name}`]=createHash('sha256').update(source).digest('hex');
  const js=stripTypeScriptTypes(source,{mode:'strip'}).replace(/(from\s*["'])(\.[^"']*?)\.ts(["'])/g,'$1$2.js$3');
  writeFileSync(join(out,name.replace(/\.ts$/,'.js')),js);
 }
}
writeFileSync(join(root,'runtime/package.json'),'{"type":"module"}\n');
mkdirSync(join(root,'runtime/data'),{recursive:true});
for(const f of readdirSync(join(lab,'../../data')).filter(n=>/\.(json|csv)$/.test(n))) copyFileSync(join(lab,'../../data',f),join(root,'runtime/data',f));
mkdirSync(join(root,'assets/generated/audio'),{recursive:true});
const tracks=JSON.parse(readFileSync(join(lab,'game/audio/tracks.json'),'utf8'));
for(const track of tracks) {
 const target=`${track.id}.ogg`;
 if(!process.argv.includes('--engine-only')) execFileSync('ffmpeg',['-v','error','-y','-i',join(lab,'game/audio',track.file),'-c:a','libvorbis','-q:a','5',join(root,'assets/generated/audio',target)]);
 track.file=target;
}
writeFileSync(join(root,'runtime/tracks.json'),JSON.stringify(tracks,null,2));
writeFileSync(join(root,'runtime/source-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Prepared ${Object.keys(manifest).length} Ice Lab modules${process.argv.includes('--engine-only')?' (audio conversion skipped)':` and ${tracks.length} music tracks`}.`);
