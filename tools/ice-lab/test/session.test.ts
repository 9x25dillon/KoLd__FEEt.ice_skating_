// What a play session measured — the metrics the kill gate is written against.
//
// These are pre-production-plan.md §6's definitions, so the thing to protect is
// that they keep meaning what that document says. The first version of this
// module counted the seconds a fallen skater spends sliding on their side, and
// reported a mean lean depth of 80 degrees with total confidence.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState, SkatingInput } from "../sim/types.ts";
import { SessionMeter } from "../sim/session.ts";

const p = PRESETS.responsive;

function play(ticks: number, at: (i: number, s: SkaterState) => SkatingInput) {
  const m = new SessionMeter();
  const s = createState(p, 4.0, 0);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const inp = at(i, s);
    ev.length = 0;
    step(s, inp, p, SIM_DT, ev);
    m.sample(s, inp, ev, SIM_DT);
  }
  return { summary: m.summary(), state: s };
}

test("a calm session reports what it did", () => {
  const { summary, state } = play(1200, (i) => ({
    ...NEUTRAL_INPUT, weight: 1, knee: 0.45,
    lean: 0.25 * Math.sin(i * 0.01), push: i % 90 === 0,
  }));
  assert.ok(!state.fallen, "this sequence should stay up");
  assert.ok(Math.abs(summary.freePlaySeconds - 10) < 0.01, `${summary.freePlaySeconds}`);
  assert.ok(summary.strokes >= 12 && summary.strokes <= 14, `strokes ${summary.strokes}`);
  assert.ok(summary.distanceMetres > 30, `distance ${summary.distanceMetres.toFixed(1)} m`);
  assert.ok(summary.edgeChangesPerMinute > 0, "an oscillating lean changes edges");
  assert.equal(summary.downSeconds, 0, "nobody fell");
  assert.equal(summary.medianTimeToRetrySeconds, -1,
    "and an unmeasured retry is -1, not an instant one");
});

test("the metrics describe skating, not lying on the ice", () => {
  // The failure this is here for: a fallen body lies at about 89 degrees and
  // keeps sliding, so counting those ticks put mean lean depth at 80 degrees.
  // This tester lies there: a push while down would stand them up, so the
  // strokes stop at the fall to keep the body on the ice long enough to matter.
  const { summary, state } = play(2400, (i, s) => ({
    ...NEUTRAL_INPUT, weight: 1, knee: 0.45,
    lean: 0.45 * Math.sin(i * 0.006), push: !s.fallen && i % 90 === 0,
  }));
  assert.ok(state.fallen, "this one is supposed to go down");
  assert.ok(summary.downSeconds > 5, `and stay down: ${summary.downSeconds.toFixed(1)} s`);
  assert.equal(summary.medianTimeToRetrySeconds, -1, "never got up, so no retry to report");
  assert.ok(summary.meanLeanDepth < 0.5,
    `mean lean depth must exclude the fall: ${(summary.meanLeanDepth * 180 / Math.PI).toFixed(1)} deg`);
  assert.ok(summary.deepestLean <= p.fallLean + 1e-9, "and so must the deepest");
  assert.ok(summary.timeOnEdgeRatio <= 1 && summary.skidRatio <= 1, "ratios stay ratios");
});

test("standing up is the retry, ends the down time, and is not a stroke", () => {
  // The same fall, then two seconds on the ice, then a fresh push. The solver
  // stands them up on that press; the meter has to read it as one retry of
  // two seconds, two seconds down, and zero strokes — the press was consumed.
  let fellAt = -1;
  const { summary, state } = play(2400, (i, s) => {
    if (s.fallen && fellAt < 0) fellAt = i;
    const down = s.fallen;
    const getUp = down && i === fellAt + 240;
    return {
      ...NEUTRAL_INPUT, weight: 1, knee: 0.45,
      lean: down ? 0 : 0.45 * Math.sin(i * 0.006),
      push: getUp || (!down && i < fellAt && i % 90 === 0) || (!down && fellAt < 0 && i % 90 === 0),
    };
  });
  assert.ok(fellAt > 0, "this one is supposed to go down");
  assert.ok(!state.fallen, "and be back up by the end");
  assert.equal(summary.falls, 1);
  assert.ok(Math.abs(summary.medianTimeToRetrySeconds - 2) < 0.02,
    `two seconds from the fall to the press: ${summary.medianTimeToRetrySeconds.toFixed(3)} s`);
  assert.ok(Math.abs(summary.downSeconds - 2) < 0.02,
    `and two seconds on the ice: ${summary.downSeconds.toFixed(3)} s`);
  const strokesBefore = Math.floor((fellAt - 1) / 90) + 1;
  assert.equal(summary.strokes, strokesBefore, "the stand-up press is not a stroke");
  assert.ok(summary.meanLeanDepth < 0.5, "and lying there still did not count as skating");
});

test("skid ratio is zero on a held edge and rises when the edge lets go", () => {
  const held = play(600, () => ({ ...NEUTRAL_INPUT, weight: 1, knee: 0.45, lean: 0.2 }));
  assert.equal(held.summary.skidRatio, 0, "an edge that holds never skids");

  // Sharpness is what a blunt blade costs: the same edge, no bite.
  const blunt = { ...p, sharpness: 0.05 };
  const m = new SessionMeter();
  const s = createState(blunt, 7.0, 0);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < 600; i++) {
    const inp = { ...NEUTRAL_INPUT, weight: 1, knee: 0.45, lean: 0.5, push: i % 90 === 0 };
    ev.length = 0;
    step(s, inp, blunt, SIM_DT, ev);
    m.sample(s, inp, ev, SIM_DT);
  }
  assert.ok(m.summary().skidRatio > 0.2,
    `a blunt blade at speed should skid: ${m.summary().skidRatio.toFixed(2)}`);
});
