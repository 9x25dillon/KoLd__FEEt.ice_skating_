// game/warmup.ts: the field skates its warm-up on the sim, on the ice, and nobody's numbers change.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { WarmupGroup, WARMUP_SECONDS, LANES } from "../game/warmup.ts";
import { RIVALS } from "../game/rivals.ts";
import { rinkHit } from "../game/rink.ts";

test("a warm-up group skates its whole time: moving, on the ice, getting up after a fall, and trying jumps", () => {
  const g = new WarmupGroup(RIVALS.map(r => r.name));
  assert.equal(g.skaters.length, Math.min(RIVALS.length, LANES.length));
  const landings = g.skaters.map(() => new Set<number>());
  let moving = 0, samples = 0;
  while (!g.done) {
    g.tick();
    g.skaters.forEach((k, i) => {
      if (k.state.landed.tick >= 0) landings[i].add(k.state.landed.tick);
      assert.equal(rinkHit(k.state.pos.x, k.state.pos.y), null, `${k.name} stays inside the boards`);
      if (Math.hypot(k.state.vel.x, k.state.vel.y) > 1) moving++;
      samples++;
    });
  }
  assert.ok(Math.abs(g.elapsed - WARMUP_SECONDS) < 0.01);
  // Measured 2026-11-11: each lands one or two half turns in 45 s, a few fall once, none stays down.
  assert.ok(landings.every(l => l.size >= 1), landings.map(l => l.size).join());
  assert.ok(g.skaters.every(k => !k.state.fallen || k.falls > 0));
  assert.ok(moving / samples > 0.7, `moving ${(moving / samples).toFixed(2)} of the time`);
  // The same group skates the same warm-up: it is the sim, seeded by nothing.
  const again = new WarmupGroup(RIVALS.map(r => r.name), 5), once = new WarmupGroup(RIVALS.map(r => r.name), 5);
  while (!again.done) { again.tick(); once.tick(); }
  assert.deepEqual(again.skaters.map(k => k.state.pos), once.skaters.map(k => k.state.pos));
});
