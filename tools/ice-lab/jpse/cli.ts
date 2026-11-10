// node jpse/cli.ts [--out report.json] [--replays dir] [--frames dir]
//
// Runs issue #74's first JPSE slice (the measured double loop, four entrance
// candidates) and prints what Ice Lab did with each. --out writes the full
// deterministic report; --replays writes each candidate's edgework-replay/1
// clip, which `node replay/verify.ts` and the browser player both accept;
// --frames writes each candidate's MotionFrame stream (JPSE-009) as JSON lines.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASELINE, baselineParams, loopBaselineProgram } from "./baseline.ts";
import { CANDIDATES } from "./transform.ts";
import { runSlice } from "./engine.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const { report, runs } = runSlice(loopBaselineProgram(), baselineParams(), BASELINE.jump, BASELINE.runOut,
  { setup: BASELINE.setup, baselineSource: BASELINE.source }, CANDIDATES);

const f = (x: number | undefined, d = 2): string => (x === undefined ? "-" : x.toFixed(d));
console.log(`JPSE slice — ${report.jump}, ${report.setup}, baseline: ${report.baselineSource}\n`);
for (const c of report.candidates) {
  const t = c.takeoff, l = c.landing;
  console.log(`${c.id.padEnd(15)} needs ${c.required.takeoff} ${c.required.rotation}  ` +
    `off ${t?.code ?? "---"} (solver: ${t?.simCalls ?? "-"}) ${f(t?.speed)} m/s alpha ${f(t?.alpha)}  ` +
    `L ${f(t?.angMomentum, 1)}  turned ${f(l?.turned)} ${l?.simCalls ?? "-"} ${l ? (l.fall ? "fell" : `stood ${l.stoodTicks}t`) : ""}`);
  console.log(`${"".padEnd(15)} ${c.rejected ? "REJECTED " + c.reasons.join("; ") : "ACCEPTED"}`);
}
const inv = report.invariants;
const mc = (name: string, m: typeof inv.mirror) => console.log(`${name.padEnd(34)} ${m.pass ? "exact" : `parts at tick ${m.divergesAtTick} (${m.cause})`} over ${m.ticks} ticks, max ${m.maxPositionError.toExponential(1)} m`);
console.log("\nmirror on the ice, before the load:");
mc("  canonical/mirror, as played", inv.mirror);
mc("  reverse/mirror+reverse, as played", inv.reverseMirror);
mc("  canonical/mirror, sheet+wobble off", inv.mirrorControlled);
mc("  reverse pair, sheet+wobble off", inv.reverseMirrorControlled);
console.log(`reverse turns the curve the other way round: ${inv.reverseCurvatureSense.flipped} ` +
  `(${f(inv.reverseCurvatureSense.canonical, 4)} vs ${f(inv.reverseCurvatureSense.reverse, 4)} 1/m)`);
console.log(`accepted: ${report.accepted.join(", ") || "none"}`);

const out = opt("--out");
if (out) writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
const dir = opt("--replays");
if (dir) {
  mkdirSync(dir, { recursive: true });
  for (const r of runs) writeFileSync(join(dir, `jpse-${r.id.replace("+", "-")}.replay.json`), r.replayJson);
}
const framesDir = opt("--frames");
if (framesDir) {
  mkdirSync(framesDir, { recursive: true });
  for (const r of runs) writeFileSync(join(framesDir, `jpse-${r.id.replace("+", "-")}.frames.jsonl`), r.frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
}
