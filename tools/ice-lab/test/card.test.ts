// The session card as the collector stores it — app/card.ts.
//
// The collector's promise is that nothing reaches disk it did not put there.
// These hold that promise for the /2 format: the new fields survive, anything
// else does not, an unknown format is refused rather than misread, and the
// biggest honest card still fits under the body cap.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { clean, MAX_BODY, MAX_CARD_LANDINGS } from "../app/card.ts";
import { MAX_LANDINGS } from "../sim/session.ts";

const landing = (i: number): Record<string, number> => ({
  second: 12.345678901234567 + i, kind: 3, revolutions: 2, shortBy: 0.123456789012345,
  rotationCall: 1, edgeCall: 2, toe: 1, takeoffQuality: 0.987654321098765,
  landingQuality: 0.456789012345678, height: 0.438765432109876, airTime: 0.598765432109876,
  twoFoot: 0, stepOut: 1, fall: 0,
});

const card = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: "edgework-session/2", scheme: "A", preset: "responsive",
  params: { jumpMode: 2 },
  clip: { ticks: 4742, digest: 0xed9276e2 },
  metrics: {
    freePlaySeconds: 39.5, edgeChangesPerMinute: 41.25, falls: 1, ticks: 4742,
    takeoffs: 1, jumps: 0, hops: 1, landingFalls: 1,
    meanTakeoffQuality: 0.98, meanLandingQuality: 0.38,
    landings: [landing(0)],
  },
  ...extra,
});

const at = new Date("2026-09-11T00:00:00Z");

test("a /2 card keeps its jumps, its landings and the clip it belongs with", () => {
  const c = clean(card(), at)!;
  assert.equal(c.schema, "edgework-session/2");
  assert.deepEqual(c.clip, { ticks: 4742, digest: 0xed9276e2 });
  assert.equal(c.metrics.hops, 1);
  assert.equal(c.metrics.meanLandingQuality, 0.38);
  const l = (c.metrics.landings as Array<Record<string, number>>)[0];
  assert.deepEqual(Object.keys(l), Object.keys(landing(0)), "every landing field, in order");
  assert.equal(l.shortBy, 0.1235, "rounded like every other number");
  assert.equal(c.at, "2026-09-11T00:00:00.000Z");
});

test("no schema is /1, as the collector always assumed; an unknown one is refused", () => {
  const { schema: _, ...old } = card();
  assert.equal(clean(old, at)?.schema, "edgework-session/1");
  assert.equal(clean(card({ schema: "edgework-session/1" }), at)?.schema, "edgework-session/1");
  assert.equal(clean(card({ schema: "edgework-session/9" }), at), null,
    "a card read under the wrong definitions is worse than no card");
  assert.equal(clean(card({ schema: 2 }), at), null);
});

test("nothing survives that the card did not define", () => {
  const c = clean(card({
    name: "a nephew", email: "x@y", note: "<script>hi</script> fine",
    metrics: {
      ticks: 10, falls: "3", extra: 1,
      landings: [{ ...landing(0), who: 1, kind: "3T" }, "junk", null, [1, 2]],
    },
    clip: { ticks: 10, digest: -1 },
  }), at)!;
  assert.ok(!("name" in c) && !("email" in c));
  assert.equal(c.note, "scripthiscript fine", "a safe alphabet, not markup");
  assert.ok(!("falls" in c.metrics), "a string is not a number");
  assert.ok(!("extra" in c.metrics));
  const ls = c.metrics.landings as Array<Record<string, number>>;
  assert.equal(ls.length, 1, "non-objects dropped");
  assert.ok(!("who" in ls[0]) && !("kind" in ls[0]));
  assert.ok(!("clip" in c), "a digest that is not an unsigned 32-bit integer names nothing");
  assert.equal(clean(card({ clip: { ticks: 0.5, digest: 1 } }), at)?.clip, undefined);
});

test("the biggest honest card fits under the collector's body cap", () => {
  assert.equal(MAX_CARD_LANDINGS, MAX_LANDINGS, "the meter and the collector agree on the cap");
  const many = Array.from({ length: MAX_CARD_LANDINGS + 50 }, (_, i) => landing(i));
  const big = card({ metrics: { ...(card().metrics as object), landings: many } });
  const c = clean(big, at)!;
  assert.equal((c.metrics.landings as unknown[]).length, MAX_CARD_LANDINGS);
  // What the rig actually sends: the card pretty-printed, as the lab builds it,
  // at the meter's own cap.
  const sent = JSON.stringify({ ...big, metrics: { ...(big.metrics as object),
    landings: many.slice(0, MAX_LANDINGS) } }, null, 2);
  assert.ok(sent.length < MAX_BODY, `${sent.length} bytes against ${MAX_BODY}`);
});
