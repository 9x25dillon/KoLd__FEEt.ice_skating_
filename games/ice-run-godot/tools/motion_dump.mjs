// Samples every clip in tools/ice-lab/game/motion at a telling moment, as JSON for tools/render_motion.py:
// a fall at its impact, a moving clip at 60% through, a hold as it is. Poses settled onIce.
//   node games/ice-run-godot/tools/motion_dump.mjs [category] > poses.json
import {CLIPS} from '../../../tools/ice-lab/game/motion/library.ts';
import {sample} from '../../../tools/ice-lab/game/motion/types.ts';
const only=process.argv[2];
const at=c=>c.category==='fall'?c.keys[Math.min(2,c.keys.length-1)].t:c.keys.length===1?0:c.duration*0.6;
console.log(JSON.stringify(CLIPS.filter(c=>!only||c.category===only).map(c=>({id:c.id,name:c.name,category:c.category,pose:sample(c,at(c))}))));
