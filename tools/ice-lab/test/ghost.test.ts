// The AI ghost (game/ghost.ts): a second skater on the same solver, playing a
// virtual pad through the same setup mapping as the player. Its tricks are
// the suite's own pad scripts, so these pin that each still does what its
// source test says — from any heading the player happens to be skating.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import { rotate, len } from "../sim/math.ts";
import { Ghost, TRICKS, GHOST_BESIDE, GHOST_LINGER, padWords } from "../game/ghost.ts";
import { setupParams } from "../game/setups.ts";

/** A player at centre ice skating at `angle`, 3 m/s. */
function player(angle: number) {
  const s = createState(setupParams("experimental"), 3);
  s.pos = { x: 0, y: 18 };
  s.heading = rotate(s.heading, angle); s.vel = rotate(s.vel, angle);
  return s;
}

/** Run one trick through its duration; what it did. */
function perform(id: string, angle = 0) {
  const p = player(angle), g = new Ghost(p, TRICKS.findIndex(t => t.id === id));
  const beside = Math.hypot(g.s.pos.x - p.pos.x, g.s.pos.y - p.pos.y);
  const travelDot = (g.s.vel.x * p.vel.x + g.s.vel.y * p.vel.y) / (len(g.s.vel) * len(p.vel));
  let took = false, wound = 0;
  const pressed = new Set<string>();
  for (let i = 0; i < Math.round(g.trick.duration / SIM_DT); i++) {
    g.tick(p);
    if (g.s.jump.phase === 2) took = true;
    wound += g.s.digL ?? 0;
    for (const w of g.pressing.split(" + ")) if (w) pressed.add(w.split(" ")[0]);
  }
  return { g, beside, travelDot, took, wound, pressed, v: len(g.s.vel) };
}

test("the ghost spawns beside the player, travelling their way, at its trick's entry speed", () => {
  for (const angle of [0, 1.2, -2.5]) for (const t of TRICKS) {
    const r = perform(t.id, angle);
    assert.ok(Math.abs(r.beside - GHOST_BESIDE) < 1e-9, `${t.id}: ${r.beside} m`);
    assert.ok(r.travelDot > 0.999, `${t.id} at ${angle}: travelling the player's way (${r.travelDot})`);
  }
});

test("each trick does what its source test says — from any heading", () => {
  // MEASURED (no ice grid under the ghost): strokes 3 -> 4.28 m/s; the dig
  // winds the body the way it curves; the backward double loop lands clean,
  // 2.01 revolutions; the snowplow 5 -> 2.30 m/s in 3.5 s, standing.
  for (const angle of [0, 1.2, -2.5]) {
    const strokes = perform("strokes", angle), dig = perform("dig", angle), loop = perform("loop", angle), plow = perform("snowplow", angle);
    for (const r of [strokes, dig, loop, plow]) assert.equal(r.g.s.fallen, false, `${r.g.trick.id} at ${angle}`);
    assert.ok(Math.abs(strokes.v - 4.281) < 0.01, `strokes ${strokes.v.toFixed(3)}`);
    assert.ok(dig.wound > 0.5, `dig wound ${dig.wound.toFixed(2)}`);
    assert.equal(loop.took, true);
    assert.equal(loop.g.s.landed.revolutions, 2);
    assert.ok(Math.abs(loop.g.s.landed.turned - 2.01) < 0.01 && loop.g.s.landed.rotationCall === 0, `loop ${loop.g.s.landed.turned.toFixed(2)}`);
    assert.ok(Math.abs(plow.v - 2.30) < 0.02, `snowplow ${plow.v.toFixed(2)}`);
  }
});

test("the HUD can say what the ghost is pressing", () => {
  assert.ok(perform("dig").pressed.has("LB") && perform("dig").pressed.has("RB"));
  assert.ok(perform("loop").pressed.has("RT") && perform("loop").pressed.has("B"));
  const h = { axes: [0, 0, 0.5, 0.8], buttons: Array(16).fill(0), keys: [], connected: true };
  h.buttons[4] = h.buttons[5] = 1; h.buttons[7] = 0.7;
  assert.equal(padWords(h), "LB + RB + RT 70% + R-stick back-right");
});

test("after a trick it lingers, fades, and the next spawns beside the player again", () => {
  const p = player(0), g = new Ghost(p, 0);
  const first = g.trick.id;
  let faded = false;
  let ticks = 0;
  while (g.trick.id === first && ticks < 2000) {
    g.tick(p); ticks++;
    if (g.alpha < 0.05 && g.trick.id === first) faded = true;
  }
  assert.ok(faded, "faded out");
  assert.ok(Math.abs(ticks * SIM_DT - (TRICKS[0].duration + GHOST_LINGER)) < 2 * SIM_DT, `next after ${(ticks * SIM_DT).toFixed(3)} s`);
  assert.notEqual(g.trick.id, first, "the next trick");
  // One tick of its new trick has run: within that tick's travel of the spawn point.
  const d = Math.hypot(g.s.pos.x - p.pos.x, g.s.pos.y - p.pos.y);
  assert.ok(Math.abs(d - GHOST_BESIDE) < len(g.s.vel) * SIM_DT + 1e-6, `beside the player again (${d.toFixed(3)} m)`);
});
