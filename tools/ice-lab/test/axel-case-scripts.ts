// The input scripts of the forward-takeoff validation cases, derived, not hand-tuned.
//
//   node test/axel-case-scripts.ts           check every case's script is what this derives
//   node test/axel-case-scripts.ts --write   write them into data/validation/cases/
//
// One entry for every case: test/entries.test.ts's axel ("back crossovers, an
// outside mohawk onto LFO, and straight up out of it"), written before these
// cases existed, so no input was chosen for them. Only the takeoff's whip
// (carriage) differs, to turn the number of revolutions the case names: a
// waltz jump (0.5), a single axel (1.5), a double axel (2.5). Air time is fixed
// by the lift at the release (sim/jump.ts), so the whip cannot move the
// observable these cases test.
//
// That test mirrors the stick at every frame flip, as app/schemes.ts does for a
// player. A case script is fixed input, so the mirror is baked in: the entry is
// skated once, on the case's own preset and body, and its per-tick input
// run-length encoded into segments. The validator replays the segments and
// checks the result is the same run (fidelity-gate §3, determinism).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BOOT_PRESET, PRESETS, SIM_DT, SIM_HZ } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { SkatingInput } from "../sim/types.ts";
import { applyProfile, makeProfile } from "../sim/profile.ts";
import { JUMP_PHASE } from "../sim/jump.ts";

const CASES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "validation", "cases");

type Phase = { ticks: number; input: (k: number) => Partial<SkatingInput> };

// test/entries.test.ts's phases, copied unchanged.
const backXovers = (sec: number, lean = -0.3): Phase => ({ ticks: Math.round(sec * 120), input: () => ({ lean, weight: 0.5, knee: 0.9, push: true }) });
const settle = (sec: number, lean: number, weight: number): Phase => ({ ticks: Math.round(sec * 120), input: () => ({ lean, weight, knee: 0.45 }) });
const jump = (lean: number, weight: number, whip: number, opt: { turn?: boolean; mohawk?: boolean } = {}): Phase => ({
  ticks: 260,
  input: (k) => ({
    lean: k < 36 ? lean : 0,
    weight: opt.mohawk ? (k < 3 ? weight : k < 40 ? 1 - weight : 1) : k < 40 ? weight : 1,
    knee: k < 36 ? 0.95 : k < 39 ? 0 : 0.8,
    carriage: k <= 36 ? whip : 0,
    turn: (opt.turn ?? false) && k < 6,
  }),
});

/** The entry's initial state: backward, as test/entries.test.ts skates it. */
export const ENTRY_SPEED_MS = -5;

/** The cases this file writes, and the whip each turns. */
export const AXEL_CASES: Record<string, number> = {
  "air-time-waltz-jump-koga2025": 0,
  "air-time-single-axel-koga2025": 0.2,
  "air-time-double-axel-koga2025": 0.5,
};

type Segment = { seconds: number; input: Partial<SkatingInput> };

/** Skate the entry on one body, the stick mirrored at each flip; the input per tick, as applied. */
function skated(body: { massKg?: number; heightM?: number }, whip: number): SkatingInput[] {
  const p = applyProfile(PRESETS[BOOT_PRESET], makeProfile("case", body));
  p.movesMode = 1; p.jumpMode = 2;
  const s = createState(p, ENTRY_SPEED_MS, 0);
  const phases = [backXovers(3), settle(0.5, -0.3, 1), jump(-0.3, 1, whip, { mohawk: true, turn: true })];
  const applied: SkatingInput[] = [];
  let flips = 0, sign = 1;
  for (const ph of phases) for (let k = 0; k < ph.ticks; k++) {
    if (s.flips !== flips) { flips = s.flips; sign = -sign; }
    const inp = ph.input(k);
    const air = s.jump.phase === JUMP_PHASE.Air;
    const full = { ...NEUTRAL_INPUT, ...inp, lean: air ? 0 : sign * (inp.lean ?? 0) };
    applied.push(full);
    step(s, full, p, SIM_DT, []);
  }
  return applied;
}

/** Run-length encode, keeping only the fields that differ from NEUTRAL_INPUT. */
function segments(applied: SkatingInput[]): Segment[] {
  const out: Segment[] = [];
  const key = (i: SkatingInput) => JSON.stringify(i);
  let from = 0;
  for (let k = 1; k <= applied.length; k++) {
    if (k < applied.length && key(applied[k]) === key(applied[from])) continue;
    const input: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(applied[from])) {
      if ((NEUTRAL_INPUT as unknown as Record<string, unknown>)[f] !== v) input[f] = v === 0 ? 0 : v; // no -0 in JSON
    }
    const seconds = Number(((k - from) / SIM_HZ).toFixed(6));
    // The validator rounds seconds to whole ticks (validate.mjs expand): it must get these ticks back.
    if (Math.round(seconds * SIM_HZ) !== k - from) throw new Error(`a segment of ${k - from} ticks does not round-trip`);
    out.push({ seconds, input: input as Partial<SkatingInput> });
    from = k;
  }
  return out;
}

/** Each case against what this file derives; with `write`, a stale one is rewritten. */
export function checkCases(write = false): Array<{ id: string; state: "current" | "stale" | "written" }> {
  const out: Array<{ id: string; state: "current" | "stale" | "written" }> = [];
  for (const [id, whip] of Object.entries(AXEL_CASES)) {
    const file = join(CASES, `${id}.json`);
    const c = JSON.parse(readFileSync(file, "utf8"));
    const body = c.skater ? { massKg: c.skater.mass_kg, heightM: c.skater.height_m } : {};
    const script = segments(skated(body, whip));
    const same = JSON.stringify(c.inputs?.script) === JSON.stringify(script) && c.inputs?.initial?.speed_ms === ENTRY_SPEED_MS;
    if (same) { out.push({ id, state: "current" }); continue; }
    if (!write) { out.push({ id, state: "stale" }); continue; }
    c.inputs = { initial: { speed_ms: ENTRY_SPEED_MS, lean_rad: 0 }, modes: { jumpMode: 2, movesMode: 1 }, script, clip: null };
    writeFileSync(file, JSON.stringify(c, null, 2) + "\n");
    out.push({ id, state: "written" });
  }
  return out;
}

if (import.meta.main) {
  const r = checkCases(process.argv.includes("--write"));
  for (const { id, state } of r) console.log(`${id}: ${state}`);
  if (r.some((x) => x.state === "stale")) process.exit(1);
}
