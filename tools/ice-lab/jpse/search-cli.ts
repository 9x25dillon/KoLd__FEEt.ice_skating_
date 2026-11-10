// node jpse/search-cli.ts [--out search.json] — JPSE-007's first measured grid.
import { writeFileSync } from "node:fs";
import { FIRST_GRID, runSearch } from "./search.ts";

const t0 = performance.now();
const r = runSearch(FIRST_GRID);
const ms = performance.now() - t0;
console.log(`JPSE search — ${r.jump}, ${r.evaluated} candidates (+${r.repeatability.checked} repeats), ${r.ticksTotal} solver ticks`);
console.log(`cost: ${(ms / (r.evaluated + r.repeatability.checked)).toFixed(1)} ms per candidate on this machine (${(ms / 1000).toFixed(1)} s total)`);
console.log(`repeatability: ${r.repeatability.identical}/${r.repeatability.checked} identical digests`);
console.log("first failed gate:");
for (const [k, n] of Object.entries(r.distribution)) console.log(`  ${k.padEnd(28)} ${n}`);
const show = (i: number) => { const p = r.points[i]; const k = p.knobs;
  return `#${i} speed ${k.speed} load ${k.load} check ${k.checkAt} depth ${k.depth}: ${p.simCalls} ${p.turned.toFixed(3)} rev, takeoff q ${p.takeoffQuality.toFixed(3)}, landing q ${p.landingQuality.toFixed(3)}`; };
console.log(`accepted (${r.accepted.length}):`); for (const i of r.accepted) console.log("  " + show(i));
console.log(`pareto front: ${r.pareto.map((i) => "#" + i).join(" ") || "none"}`);
const i = process.argv.indexOf("--out");
if (i >= 0) writeFileSync(process.argv[i + 1], JSON.stringify(r, null, 1) + "\n");
