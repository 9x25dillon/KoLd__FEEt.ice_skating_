// Prints the built rivals' looks (game/cast.ts) as JSON for tools/render_cast.py.
//   node games/ice-run-godot/tools/cast_looks.mjs > looks.json
import {RIVALS} from '../runtime/game/rivals.js';
import {rivalLook} from '../runtime/game/cast.js';
console.log(JSON.stringify(RIVALS.map(r=>({name:r.name,...rivalLook(r.name)})).filter(l=>l.model)));
