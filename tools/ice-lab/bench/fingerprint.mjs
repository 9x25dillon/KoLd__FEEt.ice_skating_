// tools/ice-lab/bench/fingerprint.mjs — a determinism fingerprint anyone can re-run.
//
//   node tools/ice-lab/bench/fingerprint.mjs                 the .ts solver the tests run
//   node tools/ice-lab/bench/fingerprint.mjs --runtime       the generated JS the bridge ships
//   node --jitless tools/ice-lab/bench/fingerprint.mjs --runtime   the same, interpreter only
//
// 3600 ticks of the gate's preset under a fixed, varying input. Each tick's
// state checksum (sim/solver.ts `checksum`: positions to 0.1 mm, angles to
// 1e-5 rad, blade codes, tick) is folded into one FNV-1a word. Two runs that
// print the same word skated the same 3600 ticks; a different word means a
// different tick somewhere, and replay/verify.ts finds which.
//
// `--runtime` needs `node games/ice-run-godot/tools/prepare.mjs --engine-only`
// first. `--jitless` works only with `--runtime`: Node strips types with
// WebAssembly, which `--jitless` turns off, so the .ts path cannot load there.
//
// The input comes from an integer generator, not from Math.sin, so the script
// asks nothing of the engine's own transcendentals. It measures; it pins nothing.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const runtime = process.argv.includes("--runtime");
const simDir = runtime
  ? join(HERE, "..", "..", "..", "games", "ice-run-godot", "runtime", "sim")
  : join(HERE, "..", "sim");
const ext = runtime ? "js" : "ts";
const load = (name) => import(pathToFileURL(join(simDir, `${name}.${ext}`)).href);

const { PRESETS, BOOT_PRESET, SIM_DT } = await load("params");
const { createState, step, checksum } = await load("solver");
const { NEUTRAL_INPUT } = await load("types");

const TICKS = 3600;
const p = PRESETS[BOOT_PRESET];
const s = createState(p, 4, 0);
const events = [];

let seed = 0x1234567;
const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);

let input = { ...NEUTRAL_INPUT, weight: 1 };
let hash = 0x811c9dc5;
for (let i = 0; i < TICKS; i++) {
  if (i % 30 === 0) {
    const r = next();
    input = {
      ...NEUTRAL_INPUT,
      lean: ((r % 201) - 100) / 250,            // −0.4 … 0.4 of the lean range
      knee: ((r >>> 8) % 101) / 200,            // 0 … 0.5
      weight: 0.5 + ((r >>> 16) % 51) / 100,    // 0.5 … 1
      push: (r >>> 24) % 5 === 0,
    };
  }
  events.length = 0;
  step(s, input, p, SIM_DT, events);
  const c = checksum(s) >>> 0;
  for (let b = 0; b < 4; b++) hash = Math.imul(hash ^ ((c >>> (8 * b)) & 0xff), 0x01000193) >>> 0;
}

const out = {
  fingerprint: "0x" + hash.toString(16).padStart(8, "0"),
  source: runtime ? "games/ice-run-godot/runtime/sim/*.js" : "tools/ice-lab/sim/*.ts",
  preset: BOOT_PRESET, ticks: TICKS,
  pos: [s.pos.x, s.pos.y], fallen: s.fallen,
  node: process.version, jitless: process.execArgv.includes("--jitless"),
};
process.stdout.write(JSON.stringify(out) + "\n");
