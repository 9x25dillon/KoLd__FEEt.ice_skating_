// Jump combinations (sim/combo.ts): recognised from the physics, never requested.
// Every run skates the same triple toe loop as test/jump.test.ts, then either
// reloads straight off its landing edge or does something that breaks the link.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, codeToString } from "../sim/types.ts";
import type { SkatingInput, SkaterState } from "../sim/types.ts";
import { JUMP, JUMP_CODE, JUMP_PHASE } from "../sim/jump.ts";
import { ComboTracker, JUMP_LANDING, canFollow, MAX_COMBO_JUMPS } from "../sim/combo.ts";
import { Choreography } from "../game/career.ts";
import { loadTables } from "../sim/score.ts";

interface Plan {
  /** Ticks after each landing before the next load; one entry per follow-up jump. */
  waits: number[];
  /** Toe tap on each follow-up: a toe loop with it, a loop without. */
  toes: boolean[];
  /** Anything else to do between the first landing and the second load. */
  between?: (i: number, s: SkaterState) => Partial<SkatingInput>;
  /** The moves on, for a turn between the jumps. */
  moves?: boolean;
  /** Approach speed, m/s, skated backward. */
  speed?: number;
  /** A routine to feed every tick, as the game does. */
  routine?: Choreography;
}

function skate(plan: Plan): { s: SkaterState; c: ComboTracker; seen: string[]; landed: string[] } {
  const p = { ...PRESETS.responsive, jumpMode: 2, movesMode: plan.moves ? 1 : 0 };
  const s = createState(p, -(plan.speed ?? 5)), c = new ComboTracker();
  const seen: string[] = [], landed: string[] = [];
  let load = 180, n = 0, lastLand = -1, afterFirst = -1;
  for (let i = 0; i < 1800; i++) {
    const airborne = s.jump.phase === JUMP_PHASE.Air;
    const k = i - load, toe = n === 0 ? true : plan.toes[n - 1];
    const loading = load >= 0 && k >= 0 && k < 36;
    let input: SkatingInput = {
      ...NEUTRAL_INPUT, lean: -0.25, weight: 1,
      knee: loading ? 0.95 : load >= 0 && k >= 36 && k < 39 ? 0 : n === 0 && i < 180 ? 0.35 : 0.8,
      carriage: !airborne && (loading || k === 36) ? 1 : 0,
      toe: toe && load >= 0 && k === 34,
    };
    if (plan.between && afterFirst >= 0 && n === 1 && i < load) input = { ...input, ...plan.between(i - afterFirst, s) };
    step(s, input, p, SIM_DT, []);
    plan.routine?.sample(s, false, SIM_DT);
    const label = c.sample(s);
    if (label) seen.push(label);
    if (s.landed.tick !== lastLand) {
      lastLand = s.landed.tick;
      landed.push(`${s.landed.revolutions}${JUMP_CODE[s.landed.kind]}${s.landed.fall ? " fall" : ""}`);
      if (n === 0) afterFirst = i;
      load = n < plan.waits.length ? i + plan.waits[n] : -1;
      n++;
    }
  }
  c.close();
  return { s, c, seen, landed };
}

test("the landing edge is data/jump-definitions.csv's, and only the toe loop and loop can follow it", () => {
  const csv = readFileSync(new URL("../../../data/jump-definitions.csv", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(","));
  const col = csv[0].indexOf("landing_edge");
  csv.slice(1).forEach((r, k) => assert.equal(codeToString(JUMP_LANDING[k]), r[col], JUMP_CODE[k]));
  const followers = Object.values(JUMP).filter((j) => canFollow(JUMP.Toeloop, j)).map((j) => JUMP_CODE[j]);
  assert.deepEqual(followers, ["T", "Lo"], "the bible's own reason every combination ends +T or +Lo");
  assert.equal(MAX_COMBO_JUMPS, 3);
});

test("reloading straight off a clean landing is a combination: 3T+2T with a toe tap, 3T+2Lo without", () => {
  const t = skate({ waits: [40], toes: [true] });
  assert.deepEqual(t.landed, ["3T", "2T"]);
  assert.deepEqual(t.seen, ["3T+2T"]);
  assert.deepEqual(t.c.combos, [["3T", "2T"]]);
  const lo = skate({ waits: [40], toes: [false] });
  assert.deepEqual(lo.landed, ["3T", "2Lo"]);
  assert.deepEqual(lo.c.combos, [["3T", "2Lo"]]);
});

test("no time limit: an edge held long enough to reload is still the landing edge", () => {
  assert.deepEqual(skate({ waits: [90], toes: [true] }).c.combos, [["3T", "2T"]]);
});

test("a fall on the second jump still makes the combination; the fall is the jump's own deduction", () => {
  const r = skate({ waits: [20], toes: [true] });
  assert.deepEqual(r.landed, ["3T", "3T fall"]);
  assert.deepEqual(r.c.combos, [["3T", "3T<<"]], "downgraded, and on the sheet as such");
});

test("a stroke onto the other foot between the jumps breaks the link: two solo jumps", () => {
  // Step onto the left foot and back before the reload — a change of foot, so
  // the second jump is not taken off the first one's landing edge.
  const r = skate({ waits: [90], toes: [true], between: (j) => (j >= 10 && j < 40 ? { weight: 0 } : {}) });
  assert.equal(r.landed.length, 2, r.landed.join(","));
  assert.deepEqual(r.c.combos, [], `landed ${r.landed.join(",")}`);
});

test("a turn between the jumps breaks the link", () => {
  // With the moves on, a jump rises with its own entry speed: 6.8 m/s, the
  // toe loop's in data/entry-templates.json, lands both clean.
  const moves = { waits: [90], toes: [true], moves: true, speed: 6.8 };
  assert.deepEqual(skate(moves).c.combos, [["3T", "2T"]], "with the moves on and no turn, still a combination");
  const r = skate({ ...moves, between: (j) => (j >= 10 && j < 14 ? { turn: true } : {}) });
  assert.equal(r.landed.length, 2, r.landed.join(","));
  assert.deepEqual(r.c.combos, [], `landed ${r.landed.join(",")}`);
});

test("a step-out on the first landing breaks the link, however clean the second jump", () => {
  // With the moves on, the 5 m/s approach is too slow for a clean triple: it steps out.
  const r = skate({ waits: [90], toes: [true], moves: true });
  assert.deepEqual(r.landed, ["3T", "2T fall"]);
  assert.deepEqual(r.c.combos, []);
});

test("a three-jump combination is recognised, and a fourth linked jump starts afresh", () => {
  const three = skate({ waits: [40, 40], toes: [true, false] });
  assert.equal(three.landed.length, 3, three.landed.join(","));
  assert.equal(three.c.combos.length, 1);
  assert.equal(three.c.combos[0].length, 3, three.c.combos[0].join("+"));
  assert.deepEqual(three.seen.map((l) => l.split("+").length), [2, 3]);
});

test("a routine's combination element completes on the landing that links, and not on a solo jump", () => {
  const program = () => new Choreography({ id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["combo"] });
  const linked = program();
  skate({ waits: [40], toes: [true], routine: linked });
  assert.equal(linked.index, 1);
  const solo = program();
  skate({ waits: [], toes: [], routine: solo });
  assert.equal(solo.index, 0, "one clean triple is not a combination");
});

test("a routine's protocol sheet lists a combination as one element, and solo jumps as their own", () => {
  const read = (f: string) => readFileSync(new URL(`../../../data/${f}`, import.meta.url), "utf8");
  const tables = loadTables(read("scale-of-values.csv"), read("calls-and-deductions.csv"));
  const program = () => new Choreography({ id: "test", title: "Test", venue: "Test", seconds: 30, routine: ["glide"] }, tables);
  const linked = program();
  skate({ waits: [40], toes: [true], routine: linked });
  assert.deepEqual(linked.sheet!.lines, ["3T+2T"]);
  assert.equal(linked.technicalScore, linked.sheet!.tes);
  assert.ok(linked.technicalScore > 0);
  const split = program();
  const r = skate({ waits: [90], toes: [true], between: (j) => (j >= 10 && j < 40 ? { weight: 0 } : {}), routine: split });
  assert.equal(split.sheet!.lines.length, r.landed.length, split.sheet!.lines.join(", "));
});
