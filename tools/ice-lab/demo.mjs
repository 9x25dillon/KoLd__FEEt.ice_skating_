// tools/ice-lab/demo.mjs — scripted runs to watch, as replay clips.
//
//   node tools/ice-lab/demo.mjs              writes build/demos/<name>.json and <name>.txt
//   node tools/ice-lab/demo.mjs --out <dir>
//
// Each demo is a script of held inputs, the same format a validation case uses
// (data/validation/README.md). It is run through the solver, recorded as an
// edgework-replay clip, verified by replaying it, and written out with a text
// timeline of every input change. Open a clip in the lab with import replay and
// the input overlay shows the buttons and sticks tick by tick; the .txt is the
// same run on paper.
//
// The jump demos are one attempt four ways — manual, wound up, wound the wrong
// way, and wound up on assisted with no whip at all — so the difference the
// wind-up makes is the only difference on screen.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRESETS, SIM_DT, SIM_HZ } from "./sim/params.ts";
import { createState, step } from "./sim/solver.ts";
import { NEUTRAL_INPUT } from "./sim/types.ts";
import { JUMP_CODE, JUMP_NONE, ROTATION_MARK } from "./sim/jump.ts";
import { ReplayRecorder, parseReplay, verifyReplay } from "./sim/replay.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const T = (ticks) => ticks / SIM_HZ;

/**
 * The toe loop jump.test.ts measures: 1.5 s backward on a right back outside
 * edge, 0.30 s of deep knee with the arms out, the pick two ticks before the
 * release, the release, then knee 0.8 to land. `wind` inserts the flick 30
 * ticks before the release, held for 6; `whip` is how far the arms go out.
 */
function toeLoop({ whip, wind = 0 }) {
  const edge = { lean: -0.25, weight: 1 };
  const load = { ...edge, knee: 0.95, carriage: whip };
  const segs = [{ seconds: T(180), input: edge, note: "back outside edge, right foot" }];
  if (wind === 0) {
    segs.push({ seconds: T(34), input: load, note: "load: knee deep, arms out" });
  } else {
    segs.push({ seconds: T(6), input: load, note: "load: knee deep, arms out" });
    segs.push({ seconds: T(6), input: { ...load, windup: wind }, note: wind > 0 ? "WIND-UP: flick right, against the rotation" : "flick LEFT, with the rotation: takes the commitment back" });
    segs.push({ seconds: T(22), input: load, note: "load continues" });
  }
  segs.push({ seconds: T(1), input: { ...load, toe: true }, note: "toe pick" });
  segs.push({ seconds: T(1), input: load, note: "" });
  segs.push({ seconds: T(1), input: { ...edge, knee: 0, carriage: whip }, note: "RELEASE: the takeoff" });
  segs.push({ seconds: T(2), input: { ...edge, knee: 0 }, note: "arms in" });
  segs.push({ seconds: T(381), input: { ...edge, knee: 0.8 }, note: "knee ready to absorb the landing" });
  return segs;
}

const DEMOS = [
  {
    name: "carve-figure", preset: "responsive", speed: 5, modes: { jumpMode: 0, movesMode: 0 },
    about: "A right forward outside circle, then a change of edge onto the left forward outside.",
    script: [
      { seconds: 6, input: { lean: 0.3, weight: 1 }, note: "lean right, right foot: RFO circle" },
      { seconds: 6, input: { lean: -0.3, weight: 0 }, note: "lean left, left foot: LFO circle" },
    ],
  },
  {
    name: "toe-loop-manual", preset: "responsive", speed: -5, modes: { jumpMode: 2, movesMode: 0 },
    about: "The measured toe loop with a full whip and a full tuck, no wind-up: the arms are all yours.",
    script: toeLoop({ whip: 1 }),
  },
  {
    name: "toe-loop-wound", preset: "responsive", speed: -5, modes: { jumpMode: 2, movesMode: 0 },
    about: "The same toe loop with the wind-up flick: the assist checks it out on its revolution.",
    script: toeLoop({ whip: 1, wind: 1 }),
  },
  {
    name: "toe-loop-wrong-way", preset: "responsive", speed: -5, modes: { jumpMode: 2, movesMode: 0 },
    about: "The flick thrown with the rotation instead of against it: nothing arms, the manual jump.",
    script: toeLoop({ whip: 1, wind: -1 }),
  },
  {
    name: "double-flick-only-assisted", preset: "assisted", speed: -5, modes: { jumpMode: 2, movesMode: 0 },
    about: "Assisted, arms never thrown out at all — only the wind-up flick. The flick is the whip.",
    script: toeLoop({ whip: 0, wind: 1 }),
  },
];

function describe(input) {
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (NEUTRAL_INPUT[k] === v) continue;
    parts.push(typeof v === "boolean" ? k : `${k} ${v}`);
  }
  return parts.join(", ") || "neutral";
}

function run(demo) {
  const p = { ...PRESETS[demo.preset], ...demo.modes };
  const rec = new ReplayRecorder(p, demo.speed, 0);
  const s = createState(p, demo.speed, 0);
  const events = [];
  const lines = [`${demo.name} — ${demo.about}`, `preset ${demo.preset}, start ${demo.speed} m/s (negative is backward), 120 Hz`, ""];
  let tick = 0;
  for (const seg of demo.script) {
    const n = Math.round(seg.seconds * SIM_HZ);
    const input = { ...NEUTRAL_INPUT, ...seg.input };
    lines.push(`tick ${String(tick).padStart(4)}–${String(tick + n - 1).padStart(4)}  ${(tick * SIM_DT).toFixed(3)} s  ${describe(seg.input).padEnd(44)}  ${seg.note ?? ""}`);
    for (let i = 0; i < n; i++, tick++) {
      events.length = 0;
      step(s, input, p, SIM_DT, events);
      rec.capture(input, p, s, events, "A");
    }
  }
  const clip = rec.toJson();
  const check = verifyReplay(parseReplay(clip));
  if (check.divergence) throw new Error(`${demo.name}: replay diverged at tick ${check.divergence.tick}`);
  const L = s.landed;
  const result = L.tick < 0 ? "no jump"
    : `${L.kind === JUMP_NONE ? "hop" : `${L.revolutions}${JUMP_CODE[L.kind]}${ROTATION_MARK[L.rotationCall]}`}`
      + `  ${L.turned.toFixed(3)} rev  landing quality ${L.landingQuality.toFixed(2)}`
      + `${L.fall ? "  FALL" : ""}${L.armed ? "  wound" : ""}`;
  lines.push("", `result: ${result}`, `clip: ${check.ticks} ticks, verified`);
  return { clip, text: lines.join("\n") + "\n", result };
}

function main(argv) {
  const at = argv.indexOf("--out");
  const out = at >= 0 && argv[at + 1] ? resolve(argv[at + 1]) : join(HERE, "build", "demos");
  mkdirSync(out, { recursive: true });
  for (const demo of DEMOS) {
    const { clip, text, result } = run(demo);
    writeFileSync(join(out, `${demo.name}.json`), clip);
    writeFileSync(join(out, `${demo.name}.txt`), text);
    process.stdout.write(`${demo.name.padEnd(28)} ${result}\n`);
  }
  process.stdout.write(`\nwritten to ${out} — open a .json in the lab with import replay\n`);
}

main(process.argv.slice(2));
