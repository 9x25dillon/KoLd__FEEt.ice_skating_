// The Figure Eight — app/figure8.ts.
//
// A game layer has two duties before it has any fun: measure what the plan
// says it measures (§6: RMS distance of the tracing from the reference curve,
// metres), and leave the state it reads exactly as it found it.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  FigureEight, CENTRES, RADIUS, deviation, loadBest, saveBest, BEST_KEY,
} from "../app/figure8.ts";
import { figureBot } from "./figurebot.ts";
import { PRESETS, SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import { makeCode, FOOT, DIR, EDGE } from "../sim/types.ts";
import type { SkaterState, Foot } from "../sim/types.ts";

const RFO = makeCode(FOOT.Right, DIR.Forward, EDGE.Outside);
const LFO = makeCode(FOOT.Left, DIR.Forward, EDGE.Outside);
const RFI = makeCode(FOOT.Right, DIR.Forward, EDGE.Inside);

/** Put a synthetic skater at a point with a support blade on an edge. */
function place(s: SkaterState, x: number, y: number, foot: Foot, code: number): void {
  s.pos = { x, y };
  s.supportFoot = foot;
  const b = s.blade[foot];
  b.inContact = true;
  b.contact = { x, y };
  b.code = code;
}

/**
 * Trace the eight: lobe one clockwise round the right circle from the
 * crossing, lobe two anticlockwise round the left. `off` pushes the tracing
 * outward by that many metres; `codes` picks the edge on each lobe.
 */
function skate(run: FigureEight, s: SkaterState, opts: { off?: number; codes?: [number, number];
  reverse?: boolean; n?: number } = {}): void {
  const n = opts.n ?? 1200, off = opts.off ?? 0, codes = opts.codes ?? [RFO, LFO];
  for (let k = 0; k < 2; k++) {
    const c = CENTRES[k], a0 = k === 0 ? Math.PI / 2 : -Math.PI / 2;
    const dir = (k === 0 ? -1 : 1) * (opts.reverse ? -1 : 1);
    for (let i = 1; i <= n + 2; i++) {
      const a = a0 + dir * (2 * Math.PI * i) / n;
      place(s, c.x + (RADIUS + off) * Math.cos(a), c.y + (RADIUS + off) * Math.sin(a),
        (k === 0 ? FOOT.Right : FOOT.Left) as Foot, codes[k]);
      run.sample(s, SIM_DT);
      if (run.state !== "running" || run.lobe !== k) break;
    }
  }
}

const fresh = (): { s: SkaterState; run: FigureEight } => {
  const s = createState(PRESETS.responsive, 5);
  return { s, run: new FigureEight(s) };
};

test("the crossing is on both circles, and the skater starts there", () => {
  assert.equal(deviation(0, 0), 0);
  assert.deepEqual(createState(PRESETS.responsive, 5).pos, { x: 0, y: 0 });
  assert.ok(Math.abs(deviation(0, -2 * RADIUS)) < 1e-12, "the far side of the right circle is on the line");
});

test("a perfect outside eight: done, on the line, on the edge", () => {
  const { s, run } = fresh();
  skate(run, s);
  const r = run.result();
  assert.equal(r.state, "done");
  assert.ok(r.rms < 1e-9, `rms ${r.rms}`);
  assert.equal(r.edgeShare, 1);
  assert.equal(Math.round(r.accuracy), 100);
  assert.ok(Math.abs(r.seconds - 20) < 0.05, `two lobes at 1200 ticks each: ${r.seconds}`);
  // Par is 4 m/s round the 75 m figure, 18.8 s, so a 20 s run is 94% pace.
  assert.ok(Math.abs(r.pace - 100 * (4 * Math.PI * RADIUS / 4) / r.seconds) < 1e-9);
  assert.equal(r.score, Math.round(45 + 40 + 0.15 * r.pace));
});

test("the figure-eight deviation is §6's: RMS metres from the reference curve", () => {
  const { s, run } = fresh();
  skate(run, s, { off: 0.5 });
  const r = run.result();
  assert.equal(r.state, "done");
  // Half a metre wide of its own circle everywhere, but the distance is to the
  // FIGURE: near the crossing the other circle is closer than that. Measured
  // 0.483 m. A tracing is scored against the whole reference curve, as §6 says,
  // not against the lobe the tracker happens to be on.
  assert.ok(r.rms > 0.47 && r.rms < 0.5, `a tracing half a metre wide of the line: ${r.rms}`);
  assert.ok(Math.abs(r.accuracy - 100 * (1 - r.rms / 1.5)) < 1e-9);
});

test("you cannot fake it: the wrong edge scores no edge, the wrong way round never finishes", () => {
  const inside = fresh();
  skate(inside.run, inside.s, { codes: [RFI, LFO] });
  const r = inside.run.result();
  assert.equal(r.state, "done");
  assert.ok(Math.abs(r.edgeShare - 0.5) < 0.01, `half the figure on the wrong edge: ${r.edgeShare}`);

  const back = fresh();
  skate(back.run, back.s, { reverse: true });
  assert.equal(back.run.state, "running", "anticlockwise round the right circle unwinds the lobe");
  assert.equal(back.run.lobe, 0);
  assert.equal(back.run.result().score, 0);
});

test("a fall ends the run, and scores nothing", () => {
  const { s, run } = fresh();
  place(s, 0, 0, FOOT.Right as Foot, RFO);
  run.sample(s, SIM_DT);
  s.fallen = true;
  run.sample(s, SIM_DT);
  assert.equal(run.state, "fell");
  assert.equal(run.result().score, 0);
  const t = run.ticks;
  run.sample(s, SIM_DT);
  assert.equal(run.ticks, t, "and the clock stops");
});

test("the game layer reads the state and never writes it", () => {
  const { s, run } = fresh();
  place(s, 1, -0.1, FOOT.Right as Foot, RFO);
  const before = structuredClone(s);
  for (let i = 0; i < 50; i++) run.sample(s, SIM_DT);
  run.result();
  assert.deepEqual(s, before);
});

test("the best run survives a reload, and junk in storage is no best at all", () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => { box.set(k, v); } };
  assert.equal(loadBest(store), null);
  const best = { score: 81, seconds: 17.5, rms: 0.31, edgeShare: 0.9, clip: "{}" };
  saveBest(store, best);
  assert.deepEqual(loadBest(store), best);
  box.set(BEST_KEY, "{not json");
  assert.equal(loadBest(store), null);
  box.set(BEST_KEY, JSON.stringify({ score: "81" }));
  assert.equal(loadBest(store), null);
  assert.equal(loadBest(undefined), null, "no storage: a private window, or the test stub");
});

test("the solver as tuned can finish the course: a steering bot skates it", () => {
  // How RADIUS and START_SPEED were chosen, 2026-09-11, with test/figurebot.ts:
  // at 5 m it fell on the second lobe from 4 and 5 m/s; at 6 m from 5 m/s it
  // finished. Without the push at the crossing nothing finished — 75 m is too
  // far to glide (hand-off §5 item 5). If a tuning change fails this, the
  // course's radius and start speed are the levers, not this test.
  const { run } = figureBot();
  const r = run.result();
  assert.equal(r.state, "done", `the bot ${r.state} at ${r.progress.toFixed(2)} lobes`);
  assert.ok(r.score > 0 && r.edgeShare > 0.5, `score ${r.score}, edge ${r.edgeShare.toFixed(2)}, rms ${r.rms.toFixed(2)}`);
});
