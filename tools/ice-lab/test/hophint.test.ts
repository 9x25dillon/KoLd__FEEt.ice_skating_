// The HUD's hop hints (app/hophint.ts): why a takeoff was a hop, in words.
//
// Each case is a landing record as sim/jump.ts would leave it, with the
// takeoff's reading beside it. The wording is pinned whole where a player
// will read it, because a hint that says the wrong foot is worse than none.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DIR, EDGE, EDGE_CODE_NONE, FOOT, makeCode } from "../sim/types.ts";
import type { JumpResult } from "../sim/types.ts";
import { JUMP, JUMP_MODE, JUMP_NONE, noResult } from "../sim/jump.ts";
import { hopHint, hopReason, kneeHint } from "../app/hophint.ts";

const hop = (over: Partial<JumpResult> = {}): JumpResult => ({ ...noResult(), tick: 100, turned: 0.2, landingQuality: 0.6, ...over });
const off = (foot: number, dir: number, side: number) => ({ kind: JUMP_NONE, code: makeCode(foot as 0, dir as 0, side as 0) });
const FULL = JUMP_MODE.Full;

test("forward on the right foot: nothing leaves there, so the hint names the way out", () => {
  const want = "forward on the right foot: no jump leaves here — skate backward (a three-turn) "
    + "or take off from the left outside edge for an axel";
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Forward, EDGE.Outside), FULL), want);
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Forward, EDGE.Inside), FULL), want, "either edge");
});

test("forward on the left inside edge: the axel is the outside edge", () => {
  assert.equal(hopReason(hop(), off(FOOT.Left, DIR.Forward, EDGE.Inside), FULL),
    "forward on the left inside edge: no jump leaves here — the left foot jumps forward from its outside edge (axel)");
});

test("backward on the right inside edge: the right foot's jumps are on its outside edge", () => {
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Backward, EDGE.Inside), FULL),
    "backward on the right inside edge: no jump leaves here — the right foot jumps backward from its outside edge (toe loop, loop)");
});

test("the pick: the Lutz needs it, the axel must not have it", () => {
  assert.equal(hopReason(hop({ toe: false }), off(FOOT.Left, DIR.Backward, EDGE.Outside), FULL),
    "backward on the left outside edge without the pick: that is the Lutz's edge — tap the pick in the knee bend");
  assert.equal(hopReason(hop({ toe: true }), off(FOOT.Left, DIR.Forward, EDGE.Outside), FULL),
    "forward on the left outside edge with the pick: no jump leaves here — leave the pick out for the axel");
});

test("on a jump's edge at the release, but the knee bend read the other one", () => {
  // identify() reads the edge held through the load, not the one at the
  // release: a blade that rolled onto the loop's edge at the last instant
  // took off from the inside edge as far as the call is concerned.
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Backward, EDGE.Outside), FULL),
    "backward on the right outside edge at the release, but the knee bend read the other edge — "
    + "hold the outside edge through the whole bend for the loop");
});

test("a named takeoff that did not turn enough: the arms", () => {
  assert.equal(hopReason(hop({ turned: 0.3 }), { kind: JUMP.Loop, code: makeCode(FOOT.Right, DIR.Backward, EDGE.Outside) }, FULL),
    "a loop takeoff, but 0.30 rev is too little to count — arms out through the release, then pull them in: the arms are most of the turn");
  assert.match(hopReason(hop({ turned: 0.7 }), { kind: JUMP.Axel, code: makeCode(FOOT.Left, DIR.Forward, EDGE.Outside) }, FULL),
    /^an axel takeoff, but 0\.70 rev is too little past the axel's half/);
});

test("no edge, no travel, the flat, and hop mode each say so", () => {
  assert.match(hopReason(hop(), { kind: JUMP_NONE, code: EDGE_CODE_NONE }, FULL), /no edge under you/);
  assert.match(hopReason(hop(), off(FOOT.Left, DIR.Stationary, EDGE.Outside), FULL), /no travel at the release/);
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Backward, EDGE.Flat), FULL),
    "backward on the right flat: no jump leaves a flat — lean onto an edge through the knee bend");
  assert.equal(hopReason(hop(), off(FOOT.Right, DIR.Backward, EDGE.Outside), JUMP_MODE.Hop),
    "hop: jumps are on hop only — J / D-pad ↑ for full jumps");
});

test("the knee: RT let go before touchdown gets a line, RT held does not", () => {
  assert.equal(kneeHint(hop(), 0.7), "", "0.15 is a knee held, not let go");
  assert.equal(kneeHint(hop(), 0.5), "knee 0.50 at touchdown cost 0.25 of landing quality — keep RT (Shift) pulled as you land");
  assert.equal(kneeHint(hop({ fall: true, landingQuality: 0.05 }), 0),
    "knee 0.00 at touchdown cost 0.50 of landing quality, and that was the fall — keep RT (Shift) pulled as you land");
  assert.doesNotMatch(kneeHint(hop({ fall: true, landingQuality: 0, shortBy: 0.8 }), 0), /that was the fall/,
    "a jump 0.8 rev short falls whatever the knee did");
});

test("hopHint: nothing before a landing, nothing for a clean jump, both lines when both apply", () => {
  const code = makeCode(FOOT.Right, DIR.Backward, EDGE.Outside);
  assert.deepEqual(hopHint(noResult(), { kind: JUMP_NONE, code }, FULL, 0), []);
  assert.deepEqual(hopHint(hop({ kind: JUMP.Loop, revolutions: 1, turned: 1 }), { kind: JUMP.Loop, code }, FULL, 0.9), []);
  const both = hopHint(hop({ turned: 0.3 }), { kind: JUMP.Loop, code }, FULL, 0.1);
  assert.equal(both.length, 2);
  assert.match(both[0], /^a loop takeoff/);
  assert.match(both[1], /^knee 0\.10/);
  assert.match(hopHint(hop({ kind: JUMP.Loop, revolutions: 1, turned: 1 }), { kind: JUMP.Loop, code }, FULL, 0)[0], /^knee 0\.00/,
    "a named jump gets the knee line alone");
});
