import { strict as assert } from "node:assert";
import { test } from "node:test";
import { kissAndCry, kissAndCrySeconds, reactionTo, WAIT_SECONDS } from "../game/kisscry.ts";
import { CLIP_BY_ID } from "../game/motion/library.ts";
import { setupParams } from "../game/setups.ts";

test("the reaction is read off the result: a win or a personal best is joy, the podium relief, else disappointment", () => {
  assert.equal(reactionTo({ complete: true, place: 1, score: 20, bestBefore: null }), "joy");
  assert.equal(reactionTo({ complete: true, place: 5, score: 20, bestBefore: 18 }), "joy", "a personal best off the podium");
  assert.equal(reactionTo({ complete: true, place: 5, score: 20, bestBefore: null }), "disappointed", "a first completion is not a best");
  assert.equal(reactionTo({ complete: true, place: 3, score: 20, bestBefore: 25 }), "relief");
  assert.equal(reactionTo({ complete: true, place: 6, score: 20, bestBefore: 25 }), "disappointed");
  assert.equal(reactionTo({ complete: false, place: null, score: 0, bestBefore: 25 }), "disappointed");
});

test("the sequence: the wait, the reaction, a wave after a good mark; every clip is in the library", () => {
  const p = setupParams("simulation");
  const good = kissAndCry({ complete: true, place: 1, score: 30, bestBefore: null }, p);
  assert.deepEqual(good.sequence.map(x => x.clip), ["kc.wait", "kc.joy", "kc.wave"]);
  assert.equal(good.sequence[0].seconds, WAIT_SECONDS);
  const bad = kissAndCry({ complete: false, place: null, score: 0, bestBefore: null }, p);
  assert.deepEqual(bad.sequence.map(x => x.clip), ["kc.wait", "kc.disappointed"]);
  for (const k of [good, bad]) for (const x of k.sequence) assert.ok(CLIP_BY_ID.has(x.clip), x.clip);
  assert.ok(kissAndCrySeconds(good) > kissAndCrySeconds(bad));
  assert.ok(!good.state.fallen && good.state.vel.x === 0);
});
