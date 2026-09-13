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

test("edge changes count the skater's choices, not the strokes", () => {
  // The first version counted every EdgeChanged. A stroke rolls the pushing
  // blade onto its inside edge and back, two events, so stroking every 0.75 s
  // with no lean at all read 161/min against a first tester's 297 — and the
  // NONE -> edge at the first tick read 2/min on a straight glide. Both
  // numbers are asserted on the raw stream first, so this test fails if the
  // stimulus stops producing what it is here to filter.
  const two = { ...NEUTRAL_INPUT };
  for (const [name, at] of [
    ["glide", (): SkatingInput => two],
    ["stroke", (i: number): SkatingInput => ({ ...two, push: i % 90 === 0 })],
  ] as const) {
    const m = new SessionMeter();
    const s = createState(p, 4.0, 0);
    const ev: EdgeEvent[] = [];
    let raw = 0;
    for (let i = 0; i < 7200; i++) {
      const inp = at(i);
      ev.length = 0;
      step(s, inp, p, SIM_DT, ev);
      m.sample(s, inp, ev, SIM_DT);
      raw += ev.filter((e) => e.type === 0).length;   // EVENT.EdgeChanged
    }
    assert.equal(raw, name === "glide" ? 2 : 161, `${name}: the raw stream, measured`);
    assert.equal(m.summary().edgeChangesPerMinute, 0, `${name}: and none of it was chosen`);
  }
});

test("a blade that pushes off one edge and comes back on the other made one change", () => {
  // A push roll is skipped, not erased. Lean one way, flip the lean, and stroke
  // on the right foot while the flip is carrying the edges across: that blade
  // leaves its outside edge for the push, the flip arrives mid-push, and it
  // stays on its inside because the new lean wants it there — no roll-back
  // event ever fires. Measured: the only events in the window are the roll-in
  // (skipped) and two on the left blade, which was not pushing. The right
  // blade's net change is the third, and a meter that only filtered would
  // report two. (The flip leads the push by 0.27 s since the two-footed stance
  // stopped wobbling: the edges take that long to come across. Any flip from
  // 0.33 to 0.20 s before the push gives this same pattern.)
  const m = new SessionMeter();
  const s = createState(p, 4.0, 0);
  const ev: EdgeEvent[] = [];
  const counted = () => Math.round(m.summary().edgeChangesPerMinute * m.summary().freePlaySeconds / 60);
  let before = 0;
  for (let i = 0; i < 300; i++) {
    if (i === 240) before = counted();
    const inp = { ...NEUTRAL_INPUT, lean: i < 208 ? -0.2 : 0.2, push: i === 240 };
    ev.length = 0;
    step(s, inp, p, SIM_DT, ev);
    m.sample(s, inp, ev, SIM_DT);
  }
  assert.ok(!s.fallen && s.strokeTime <= 0, "up, and the stroke is over");
  assert.equal(counted() - before, 3);
});

/**
 * test/jump.test.ts's attempt, fed to a meter: skate, hold the knee deep for
 * the resolver's ideal 0.30 s, release. The outcomes asserted below are that
 * file's measured ones — the meter's job is to record them, not re-derive them.
 */
function jumpSession(mode: number, speed: number, weight: number, lean: number,
  toe: boolean, whip: number): { summary: ReturnType<SessionMeter["summary"]>; state: SkaterState } {
  const LOAD_AT = 180, RELEASE = LOAD_AT + 36;
  const jp = { ...p, jumpMode: mode };
  const m = new SessionMeter();
  const s = createState(jp, speed);
  const ev: EdgeEvent[] = [];
  for (let i = 0; i < 600; i++) {
    const loading = i >= LOAD_AT && i < RELEASE;
    const inp = {
      ...NEUTRAL_INPUT, lean, weight,
      knee: loading ? 0.95 : i >= RELEASE && i < RELEASE + 3 ? 0 : i >= RELEASE ? 0.8 : 0.35,
      carriage: loading || i === RELEASE ? whip : 0,
      toe: toe && i === RELEASE - 2,
    };
    ev.length = 0;
    step(s, inp, jp, SIM_DT, ev);
    m.sample(s, inp, ev, SIM_DT);
  }
  return { summary: m.summary(), state: s };
}

test("the card records jumps: a hop, a clean triple, and a fall on landing", () => {
  const hop = jumpSession(1, 5, 0.5, 0, false, 1).summary;
  assert.equal(hop.takeoffs, 1);
  assert.equal(hop.hops, 1);
  assert.equal(hop.jumps, 0);
  assert.equal(hop.landings.length, 1);
  assert.equal(hop.landings[0].kind, 255, "a hop has no element");
  assert.ok(Math.abs(hop.landings[0].height - 0.44) < 0.005);
  assert.ok(Math.abs(hop.landings[0].second - (180 + 36 + 1 + 71) / 120) < 0.02,
    `landed ${hop.landings[0].second.toFixed(3)} s in`);

  const triple = jumpSession(2, -5, 1, -0.25, true, 1).summary;
  assert.equal(triple.jumps, 1);
  assert.equal(triple.hops, 0);
  assert.deepEqual(
    [triple.landings[0].kind, triple.landings[0].revolutions, triple.landings[0].rotationCall,
      triple.landings[0].toe, triple.landings[0].fall],
    [0, 3, 0, 1, 0], "3T, clean, toe-assisted, stood up");
  assert.equal(triple.meanTakeoffQuality, triple.landings[0].takeoffQuality);
  assert.ok(Math.abs(triple.meanTakeoffQuality - 1) < 1e-9);
  assert.equal(triple.landingFalls, 0);

  const short = jumpSession(2, -5, 1, -0.25, false, 0.5).summary;
  assert.equal(short.landingFalls, 1);
  assert.equal(short.falls, 1, "a fall on landing is a fall, counted once");
  assert.equal(short.landings[0].fall, 1);
  assert.equal(short.landings[0].rotationCall, 2, "under-rotated");

  const none = jumpSession(0, 5, 0.5, 0, false, 1).summary;
  assert.equal(none.takeoffs, 0, "jumps off: a deep knee is only a deep knee");
  assert.equal(none.meanLandingQuality, -1, "no landings is unmeasured, not zero");
  assert.deepEqual(none.landings, []);
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
