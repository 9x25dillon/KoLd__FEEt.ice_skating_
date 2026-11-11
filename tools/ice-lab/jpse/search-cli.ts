// node jpse/search-cli.ts [--grid first|power] [--style <id> [--mastery 0..1]] [--mirror] [--windows] [--out search.json]
//
// JPSE-007's measured grids. With --style the skater is that career style at
// that mastery (default 1, fully drilled; 0 is the day it is chosen). With
// --windows, instead of the grid's check axis every (speed, load) cell is
// scanned check tick by check tick: how wide the landing window really is.
import { writeFileSync } from "node:fs";
import { SIM_DT } from "../sim/params.ts";
import { STYLES, styleParams } from "../game/styles.ts";
import { BASELINE_KNOBS, baselineParams } from "./baseline.ts";
import { FIRST_GRID, POWER_GRID, checkWindows, revolutionsOf, runSearch } from "./search.ts";
import type { SearchSpec } from "./search.ts";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const mirror = process.argv.includes("--mirror");
const gridName = arg("--grid") ?? "first";
const grids: Record<string, SearchSpec> = { first: FIRST_GRID, power: POWER_GRID };
const grid = grids[gridName];
if (!grid) { console.error(`--grid: one of ${Object.keys(grids).join(", ")}`); process.exit(2); }
const styleId = arg("--style");
const styleIndex = styleId ? STYLES.findIndex((s) => s.id === styleId) : -1;
if (styleId && styleIndex < 0) { console.error(`--style: one of ${STYLES.map((s) => s.id).join(", ")}`); process.exit(2); }
const mastery = Number(arg("--mastery") ?? 1);
const params = styleParams(baselineParams(), styleIndex, mastery);
const who = styleId ? `${styleId} at mastery ${mastery}` : "the neutral skater";
const transform = { mirror, reverse: false };

if (process.argv.includes("--windows")) {
  const speeds = grid.axes.speed ?? [BASELINE_KNOBS.speed], loads = grid.axes.load ?? [BASELINE_KNOBS.load];
  const ms = (ticks: number): string => (ticks * SIM_DT * 1000).toFixed(0);
  console.log(`JPSE check windows — Lo${mirror ? " mirrored (clockwise)" : ""}, ${who}, ${gridName} grid's speeds and loads, full stick`);
  console.log("each cell: every check tick from 0.2 s to the landing, skated in full. A window is consecutive ticks that land.");
  let evaluated = 0;
  const t0 = performance.now();
  for (const speed of speeds) for (const load of loads) {
    const scan = checkWindows({ ...BASELINE_KNOBS, speed, load }, params, transform);
    evaluated += scan.evaluated;
    const head = `speed ${String(-speed).padEnd(5)} load ${String(load).padEnd(5)}`;
    if (!scan.airTicks) { console.log(`${head} never leaves the ice`); continue; }
    const wins = scan.windows.map((w) => `${w.revolutions}Lo ticks ${w.from}-${w.to}${w.open ? " (to the landing: no check needed)" : ""}, ${w.to - w.from + 1} wide (${ms(w.to - w.from + 1)} ms), best landing ${w.bestLanding.toFixed(2)} at ${w.bestAt}`);
    console.log(`${head} air ${scan.airTicks} ticks, unchecked ${scan.uncheckedTurned.toFixed(2)} rev ${scan.uncheckedAccepted ? "lands" : "does not land"}`);
    for (const w of wins) console.log(`    ${w}`);
    if (!wins.length) console.log("    no check lands it");
  }
  console.log(`${evaluated} candidates, ${((performance.now() - t0) / 1000).toFixed(1)} s on this machine`);
} else {
  const t0 = performance.now();
  const r = runSearch(mirror ? { ...grid, transform } : grid, params);
  const ms = performance.now() - t0;
  console.log(`JPSE search — ${r.jump}${mirror ? " mirrored (clockwise)" : ""}, ${who}, ${gridName} grid, ${r.evaluated} candidates (+${r.repeatability.checked} repeats), ${r.ticksTotal} solver ticks`);
  console.log(`cost: ${(ms / (r.evaluated + r.repeatability.checked)).toFixed(1)} ms per candidate on this machine (${(ms / 1000).toFixed(1)} s total)`);
  console.log(`repeatability: ${r.repeatability.identical}/${r.repeatability.checked} identical digests`);
  console.log("first failed gate:");
  for (const [k, n] of Object.entries(r.distribution)) console.log(`  ${k.padEnd(28)} ${n}`);
  const show = (i: number) => { const p = r.points[i]; const k = p.knobs;
    return `#${i} speed ${k.speed} load ${k.load} check ${k.checkAt} depth ${k.depth}: ${revolutionsOf(p.turned)}${p.simCalls} ${p.turned.toFixed(3)} rev, takeoff q ${p.takeoffQuality.toFixed(3)}, landing q ${p.landingQuality.toFixed(3)}`; };
  console.log(`accepted (${r.accepted.length}):`); for (const i of r.accepted) console.log("  " + show(i));
  console.log(`pareto front: ${r.pareto.map((i) => "#" + i).join(" ") || "none"}`);
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
}
