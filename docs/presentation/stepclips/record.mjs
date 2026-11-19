// Run after prepare.mjs --engine-only. Only compact state/pose frames, no baked tracks.
import {writeFileSync} from 'node:fs';
import {IceEngine} from '../../../games/ice-run-godot/bridge/engine.mjs';
import {NEUTRAL_INPUT} from '../../../games/ice-run-godot/runtime/sim/types.js';
import {SKINS} from '../../../games/ice-run-godot/runtime/game/appearance.js';
const e=new IceEngine();e.start({mode:'composer',sequence:['step']});
const frames=[];
for(let i=0;i<240;i++) {
 e.tick({...NEUTRAL_INPUT,knee:.4,weight:.5,push:i%90===0});
 const f=e.snapshot();
 frames.push(structuredClone({state:f.state,support:f.support,motion:f.motion,low:f.low}));
}
const out=process.argv[2]??'/tmp/codex-stepclips-pose.json';
writeFileSync(out,JSON.stringify({skin:SKINS[0],frames,marks:[],fallen:frames.filter(f=>f.state.fallen).length}));
console.log(JSON.stringify({out,frames:frames.length,stepFrames:frames.filter(f=>f.motion?.clip.startsWith('step.')).length}));
