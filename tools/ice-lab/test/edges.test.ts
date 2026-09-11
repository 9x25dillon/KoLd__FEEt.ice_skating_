// The edge course — app/edges.ts.
//
// What it teaches is the edge names, so the first thing to hold is that the
// names are RIGHT: every gate's edge must turn the way the weave turns there,
// by the solver's own classifier, or the course teaches the wrong thing while
// looking self-consistent (hand-off finding 1 is exactly that failure).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { EdgeCourse, GATES, GATE_WIDTH, EDGE_SEQUENCE, START_SPEED, guideY, edgeLines } from "../app/edges.ts";
import { ghostRun } from "../app/race.ts";
import { ReplayRecorder, parseReplay } from "../sim/replay.ts";
import { edgeBot } from "./figurebot.ts";
import { edgeWords } from "../app/course.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import { classifyCode } from "../sim/classify.ts";
import { makeCode, codeToString, FOOT, DIR, EDGE, EDGE_CODE_NONE } from "../sim/types.ts";
import type { SkaterState, Foot } from "../sim/types.ts";

const p = PRESETS.responsive;

/** "LFI" -> the code the solver would give it. */
function code(name: string): number {
  const foot = (name[0] === "R" ? FOOT.Right : FOOT.Left) as Foot;
  return makeCode(foot, DIR.Forward, name[2] === "O" ? EDGE.Outside : EDGE.Inside);
}

function place(s: SkaterState, x: number, y: number, name: string): void {
  const foot = (name[0] === "R" ? FOOT.Right : FOOT.Left) as Foot;
  s.pos = { x, y };
  s.supportFoot = foot;
  const b = s.blade[foot];
  b.inContact = true;
  b.contact = { x, y };
  b.code = code(name);
}

/** Skate the weave at 5 m/s, on whatever edge `edgeAt` says for the gate ahead. */
function skate(course: EdgeCourse, s: SkaterState, edgeAt: (gate: number) => string,
  yAt: (x: number, gate: number) => number = (x) => guideY(x)): void {
  const dx = 5 * SIM_DT;
  for (let x = dx; course.state === "running" && x < GATES[GATES.length - 1].x + 5; x += dx) {
    const g = Math.min(course.next, GATES.length - 1);
    place(s, x, yAt(x, g), edgeAt(g));
    course.sample(s, SIM_DT);
  }
}

test("every gate's edge turns the way the weave turns there, by the solver's own classifier", () => {
  for (const g of GATES) {
    // Rightward curvature at the +y apexes, leftward at the -y ones: lean that way.
    const turnRight = g.y > 0;
    const tilt = turnRight ? -0.3 : 0.3;           // + leans toward perpLeft: left
    const foot = (g.edge[0] === "R" ? FOOT.Right : FOOT.Left) as Foot;
    const got = codeToString(classifyCode(foot, tilt, 5, EDGE_CODE_NONE, p));
    assert.equal(got, g.edge, `a ${turnRight ? "right" : "left"} turn on the ${foot === FOOT.Right ? "right" : "left"} foot is ${got}`);
  }
  const taught = [...EDGE_SEQUENCE].sort().join(" ");
  assert.equal(taught, "LFI LFI LFO LFO RFI RFI RFO RFO", "every forward edge, twice");
});

test("a clean run: every gate clean, done, and scored", () => {
  const s = createState(p, 5), course = new EdgeCourse(s);
  skate(course, s, (g) => GATES[g].edge);
  const r = course.result();
  assert.equal(r.state, "done");
  assert.equal(r.clean, GATES.length);
  assert.equal(r.progress, GATES.length);
  // The last gate at 5 m/s, against a 4.5 m/s par: full pace.
  assert.equal(r.pace, 100);
  assert.equal(r.score, 100);
});

test("the wrong edge is named, and a gate you go round is missed", () => {
  const s = createState(p, 5), course = new EdgeCourse(s);
  skate(course, s, (g) => (g === 2 ? "RFO" : GATES[g].edge),
    (x, g) => (g === 5 ? GATES[5].y + Math.sign(GATES[5].y) * GATE_WIDTH : guideY(x)));
  const r = course.result();
  assert.equal(r.state, "done");
  assert.deepEqual(r.gates[2], { gate: 2, code: "RFO", outcome: "wrong" }, "gate 3 wanted LFI");
  assert.equal(r.gates[5].outcome, "missed");
  assert.equal(r.clean, GATES.length - 2);
  assert.ok(r.score < 100 - 2 * 10 + 1, `two gates lost cost two gates' worth: ${r.score}`);
});

test("a fall ends the run and scores nothing; the course never writes the state", () => {
  const s = createState(p, 5), course = new EdgeCourse(s);
  place(s, 1, 0.2, "RFO");
  const before = structuredClone(s);
  course.sample(s, SIM_DT);
  course.result();
  assert.deepEqual(s, before, "read-only");
  s.fallen = true;
  course.sample(s, SIM_DT);
  assert.equal(course.state, "fell");
  assert.equal(course.result().score, 0);
});

test("the panel teaches the names: the gate ahead in words, and the edge you are on", () => {
  const s = createState(p, 5), course = new EdgeCourse(s);
  place(s, 1, 0.2, "RFI");
  course.sample(s, SIM_DT);
  const text = edgeLines(course, s, null, false).map(([t]) => t).join(" | ");
  assert.match(text, /gate 1 of 8: RFO · right forward outside/);
  assert.match(text, /you are on RFI · right forward inside/);
  assert.equal(edgeWords("LFI"), "left forward inside");
  assert.equal(edgeWords("RF-"), "right forward flat");
  assert.equal(edgeWords("---"), "off the ice");
});

test("the solver as tuned can finish the course: a steering bot skates it", () => {
  // How GATE_SPACING was chosen, 2026-09-11, with this bot: at 12 m it finished
  // with 6 of 8 clean, at 14 m with 7, and at 16 m it fell before the last gate.
  // If a tuning change fails this, the spacing is the lever, not this test.
  const r = edgeBot().run.result();
  assert.equal(r.state, "done", `the bot ${r.state} after ${r.gates.length} gates`);
  assert.ok(r.clean >= 6, `${r.clean} clean: ${r.gates.map((g) => g.code).join(" ")}`);
  assert.ok(r.score > 0);
});

test("a ghost race runs on the edge course: the ghost finishes on the tick the run did", () => {
  const bp = { ...p };
  const rec = new ReplayRecorder(bp, START_SPEED);
  const { run } = edgeBot(bp, (input, s, ev) => rec.capture(input, bp, s, ev, "A"));
  const g = ghostRun(parseReplay(rec.toJson()), (s) => new EdgeCourse(s));
  assert.equal(g.diverged, false);
  assert.equal(g.finishTick, run.ticks);
  assert.equal(g.result.score, run.result().score);
  assert.ok(g.splitTick > 0 && g.splitTick < g.finishTick, "halfway is the fourth gate");
});
