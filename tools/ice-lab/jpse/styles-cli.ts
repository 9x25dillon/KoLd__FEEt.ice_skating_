// node jpse/styles-cli.ts — each career style through JPSE's first grid and a stroking run.
import { FIRST_GRID } from "./search.ts";
import { SERPENTINE_TICKS, compareStyles } from "./styles.ts";

const rows = compareStyles({ ...FIRST_GRID, repeat: 0 });
const head = ["style", "accepted", "took off", "skids", "height m", "|L|", "turned", "top m/s", "wind", "legs", "carve skid", "min R m", "carve fell", "serpentine", "spiral leg", "spiral cost", "split", "split ω", "plain ω"];
console.log(head.map((h) => h.padStart(12)).join(""));
console.log(`(serpentine: ticks stood of ${SERPENTINE_TICKS})`);
for (const r of rows) console.log([r.style, r.accepted, r.tookOff, r.skids, r.meanHeight, r.meanAbsL, r.meanTurned, r.topSpeed, r.wind, r.legs, r.carveSkidTicks, r.carveMinRadius, r.carveFell, r.serpentineTicks, r.spiralPeak, r.spiralLegs, r.splitReached, r.splitOmega, r.plainOmega]
  .map((v) => String(v).padStart(12)).join(""));
