// The AI ghost (game/ghost.ts): a second skater on the same solver, playing a
// virtual pad through the same setup mapping as the player. Each trick is
// skated into from the player's stride — spawned beside them at their speed,
// its pad building the entry (strokes, a three-turn, the edge) before the
// trick — so these pin each whole routine, from a range of player speeds and
// headings.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState } from "../sim/solver.ts";
import { MOVE, codeToString } from "../sim/types.ts";
import { JUMP } from "../sim/jump.ts";
import { rotate, len, dot } from "../sim/math.ts";
import { Ghost, TRICKS, GHOST_BESIDE, GHOST_LINGER, GHOST_GLIDE, GHOST_TOP, padWords, routine } from "../game/ghost.ts";
import type { Trick } from "../game/ghost.ts";
import { setupParams } from "../game/setups.ts";

/** A player at centre ice skating at `angle`, `speed` m/s. */
function player(angle: number, speed = 3) {
  const s = createState(setupParams("experimental"), speed);
  s.pos = { x: 0, y: 18 };
  s.heading = rotate(s.heading, angle); s.vel = rotate(s.vel, angle);
  return s;
}
const trick = (id: string) => TRICKS.find(t => t.id === id)!;
/** Headings with room to the boards from centre ice (the routines run 10-35 m). */
const ANGLES = [0.8, 2.4, -2.3];

/** Run one trick from spawn to the end of its linger (or a respawn); what it did. */
function perform(id: string, angle = 0.8, speed = 3) {
  const p = player(angle, speed), g = new Ghost(p, 0, [trick(id)]);
  const beside = Math.hypot(g.s.pos.x - p.pos.x, g.s.pos.y - p.pos.y);
  const spawnV = len(g.s.vel);
  const travelDot = (g.s.vel.x * p.vel.x + g.s.vel.y * p.vel.y) / (spawnV * Math.max(len(p.vel), 1e-9));
  let wound = 0, spinTicks = 0, respawned = false, last = 0, vOver = -1;
  const pressed = new Set<string>();
  for (let k = 0; k < 40 / SIM_DT; k++) {
    g.tick(p);
    if (g.t < last) { respawned = true; break; }
    last = g.t;
    wound += g.s.digL ?? 0;
    if (g.s.move === MOVE.Spin) spinTicks++;
    for (const w of g.pressing.split(" + ")) if (w) pressed.add(w.split(" ")[0]);
    if (g.over >= 0 && vOver < 0) vOver = len(g.s.vel);
    if (g.over >= 0 && g.t >= g.over + GHOST_LINGER - 2 * SIM_DT) break;
  }
  const s = g.s;
  return { g, s, beside, spawnV, travelDot, wound, spinTicks, respawned, pressed, vOver, v: len(s.vel),
    back: dot(s.vel, s.heading) < 0, turn: `${codeToString(s.moveDone.fromCode)}>${codeToString(s.moveDone.toCode)}` };
}
const near = (x: number, y: number, tol = 0.01) => Math.abs(x - y) < tol;

test("the tricks keep their ids and order, and index-based start still works", () => {
  assert.deepEqual(TRICKS.map(t => t.id), ["strokes", "dig", "loop", "snowplow", "spin", "three"]);
  const p = player(0.8);
  for (const [i, t] of TRICKS.entries()) assert.equal(new Ghost(p, i).trick.id, t.id);
  assert.equal(new Ghost(p, TRICKS.length + 2).trick.id, TRICKS[2].id, "wraps round");
  assert.equal(new Ghost(p).trick.id, "strokes");
});

test("a stride routine spawns beside the player, travelling their way at their speed — a glide when they stand, capped", () => {
  for (const angle of ANGLES) for (const t of TRICKS) for (const [speed, want] of [[3, 3], [0, GHOST_GLIDE], [11, GHOST_TOP]] as const) {
    const p = player(angle, speed), g = new Ghost(p, 0, [t]);
    const d = Math.hypot(g.s.pos.x - p.pos.x, g.s.pos.y - p.pos.y);
    assert.ok(Math.abs(d - GHOST_BESIDE) < 1e-9, `${t.id}: ${d} m`);
    assert.ok(near(len(g.s.vel), want, 1e-9), `${t.id} from ${speed}: ${len(g.s.vel)} m/s`);
    const heading = speed > 0 ? p.vel : p.heading;
    assert.ok(dot(g.s.vel, heading) / (len(g.s.vel) * len(heading)) > 0.999, `${t.id} at ${angle}: the player's way`);
    assert.ok(dot(g.s.vel, g.s.heading) > 0, "skating forward, as the player's stride does");
  }
});

test("a trick without a stride entry still spawns at its entry state, pad released after its duration", () => {
  const legacy: Trick = { id: "legacy", name: "Back glide", how: "", setup: "experimental", speed: -5, duration: 1,
    pad: h => { h.buttons[1] = 1; } };
  const p = player(0.8), g = new Ghost(p, 0, [legacy]);
  assert.ok(near(len(g.s.vel), 5, 1e-9) && dot(g.s.vel, g.s.heading) < 0, "backward at 5 m/s");
  assert.ok(dot(g.s.vel, p.vel) > 0, "travelling the player's way");
  g.tick(p);
  assert.equal(g.pressing, "B");
  while (g.t < 1) g.tick(p);
  g.tick(p);
  assert.equal(g.pressing, "", "released after its duration");
});

test("strokes: from the player's speed, LT, RT… for 3 s, standing — every heading", () => {
  // MEASURED at 0.8, 2.4 and -2.3 rad alike: 1 (a glide from a standstill)
  // -> 2.475 m/s after 3 s of strokes; 3 -> 4.280; 5 -> 5.984; 7 -> 7.582.
  for (const angle of ANGLES) for (const [v0, v3] of [[0, 2.475], [3, 4.280], [5, 5.984], [7, 7.582]]) {
    const r = perform("strokes", angle, v0);
    assert.equal(r.s.fallen, false);
    assert.equal(r.respawned, false);
    assert.ok(near(r.vOver, v3), `strokes from ${v0}: ${r.vOver.toFixed(3)}`);
  }
});

test("dig: strokes, a three-turn to skate backward, then the gate's dig winds the body the way it curves", () => {
  // MEASURED: RFI three-turn onto RBO; both sticks 0.3 left, LB + RB 2.25 s:
  // the gate leans, digs, recovers; the blades wind the body -0.42 (from a
  // standstill), -0.41 (3 m/s), -0.55 (5), -0.12 (7: the curve is shallow
  // that fast); backward and standing after, 3.1-5.3 m/s.
  for (const angle of ANGLES) for (const [v0, w] of [[0, -0.419], [3, -0.405], [5, -0.552], [7, -0.124]]) {
    const r = perform("dig", angle, v0);
    assert.equal(r.s.fallen, false);
    assert.equal(r.g.failed, 0);
    assert.equal(r.turn, "RFI>RBO", "the three-turn that took it backward");
    assert.equal(r.back, true);
    assert.ok(near(r.wound, w), `dig from ${v0}: wound ${r.wound.toFixed(3)}`);
    assert.ok(r.pressed.has("LB") && r.pressed.has("RB") && r.pressed.has("A"));
  }
});

test("loop: skated into from the player's stride, the double loop lands clean — from standstill to 7 m/s, every heading", () => {
  // MEASURED: strokes on a left curve to 5.5 m/s, RFI three-turn onto RBO,
  // both sticks deepen the edge (lean -0.18 at takeoff, against -0.10 to
  // -0.15 off the right stick alone), held 1 s, then RT + B + heel 0.35 s:
  // takeoff L 37.9-38.2 at 4.4-6.6 m/s; B in the air once the landing will
  // have turned 1.95. A clean double loop, standing through the run-out:
  // 1.893 revolutions from a standstill, 1.970 from 3 m/s, 1.993 from 5, 1.990 from 7.
  for (const angle of ANGLES) for (const [v0, turned] of [[0, 1.893], [3, 1.970], [5, 1.993], [7, 1.990]]) {
    const r = perform("loop", angle, v0);
    assert.equal(r.respawned, false);
    assert.equal(r.s.fallen, false, `loop from ${v0} at ${angle}`);
    assert.equal(r.turn, "RFI>RBO");
    assert.equal(r.s.landed.kind, JUMP.Loop);
    assert.equal(r.s.landed.revolutions, 2);
    assert.equal(r.s.landed.rotationCall, 0);
    assert.equal(r.s.landed.fall, false);
    assert.ok(near(r.s.landed.turned, turned), `loop from ${v0}: ${r.s.landed.turned.toFixed(3)}`);
  }
});

test("loop: every player speed, 0-8 m/s by 0.5, lands a clean double", () => {
  // MEASURED (heading 0.8): 1.88-1.99 revolutions, all clean, all standing.
  // On a 0.05 m/s grid: 161 of 161 land standing, 152 clean, 7 a quarter
  // short, 2 hit the boards from centre ice.
  for (let v0 = 0; v0 <= 8; v0 += 0.5) {
    const r = perform("loop", 0.8, v0);
    assert.ok(!r.s.fallen && !r.respawned && r.s.landed.revolutions === 2 && r.s.landed.rotationCall === 0,
      `from ${v0}: ${r.s.landed.turned.toFixed(2)} turned, call ${r.s.landed.rotationCall}`);
  }
});

test("snowplow: pushed up to speed if slow, then toes in and inside edges — it stops, standing", () => {
  // MEASURED: from a standstill and 3 m/s the Simulation pushes reach 3.8 /
  // 3.5 m/s and the snowplow brings the skater to rest; from 5 m/s 2.438
  // after 3.5 s of plow (the source test: 5 -> 2.79 in 3 s), from 7 4.013.
  for (const angle of ANGLES) for (const [v0, vOver] of [[0, 1.217], [3, 0.991], [5, 2.438], [7, 4.013]]) {
    const r = perform("snowplow", angle, v0);
    assert.equal(r.s.fallen, false);
    assert.ok(near(r.vOver, vOver), `snowplow from ${v0}: ${r.vOver.toFixed(3)}`);
    assert.ok(r.v < r.vOver, "still slowing through the linger");
  }
  assert.ok(perform("snowplow", 0.8, 3).v < 0.05, "from 3 m/s: at rest");
});

test("spin (new): strokes, onto the left forward outside edge, Y held 3 s — a spin, checked out backward", () => {
  // MEASURED: LFO into the spin, 3 s on the button (360 ticks spinning):
  // 8.61 revolutions from a standstill, 9.34 from 3 m/s, 10.42 from 5, 13.77
  // from 7 (a faster entry, more angular momentum); out backward on RBO at
  // 2.0 m/s, standing.
  for (const angle of ANGLES) for (const [v0, rev] of [[0, 8.61], [3, 9.34], [5, 10.42], [7, 13.77]]) {
    const r = perform("spin", angle, v0);
    assert.equal(r.s.fallen, false);
    assert.equal(r.spinTicks, 360);
    assert.equal(r.turn, "LFO>RBO");
    assert.ok(near(r.s.moveDone.revolutions, rev), `spin from ${v0}: ${r.s.moveDone.revolutions.toFixed(2)}`);
    assert.equal(r.back, true);
    assert.ok(r.pressed.has("Y"));
  }
});

test("three-turn (new): strokes, the left forward outside edge, A — LFO onto LBI, skating on backward", () => {
  // MEASURED: 3.5-5.9 m/s after the turn, backward, standing 1.5 s on.
  for (const angle of ANGLES) for (const v0 of [0, 3, 5, 7]) {
    const r = perform("three", angle, v0);
    assert.equal(r.s.fallen, false);
    assert.equal(r.turn, "LFO>LBI");
    assert.equal(r.s.moveDone.revolutions, 0.5);
    assert.equal(r.back, true);
  }
});

test("the HUD can say what the ghost is pressing", () => {
  const dig = perform("dig"), loop = perform("loop");
  assert.ok(dig.pressed.has("LB") && dig.pressed.has("RB"));
  assert.ok(loop.pressed.has("RT") && loop.pressed.has("B") && loop.pressed.has("A") && loop.pressed.has("LT"));
  const h = { axes: [0, 0, 0.5, 0.8], buttons: Array(16).fill(0), keys: [], connected: true };
  h.buttons[4] = h.buttons[5] = 1; h.buttons[7] = 0.7;
  assert.equal(padWords(h), "LB + RB + RT 70% + R-stick back-right");
});

test("a routine that waits past a step's limit gives up: the pad lets go and the ghost fades", () => {
  const stuck: Trick = { id: "stuck", name: "Stuck", how: "", setup: "experimental", speed: 0, duration: 30, entry: "stride",
    pad: routine([{ name: "wait", pad: h => { h.buttons[2] = 1; }, until: () => false, max: 0.5 }, { name: "never", pad: () => {} }]) };
  const p = player(0.8), g = new Ghost(p, 0, [stuck]);
  while (g.over < 0) g.tick(p);
  assert.ok(near(g.over, 0.5, 2 * SIM_DT), `gave up at ${g.over}`);
  assert.equal(g.failed, 1);
  g.tick(p);
  assert.equal(g.pressing, "");
});

test("after a trick it lingers, fades, and the next spawns beside the player again", () => {
  const p = player(0.8), g = new Ghost(p, 0);
  const first = g.trick.id;
  let faded = false, ticks = 0, over = -1;
  while (g.trick.id === first && ticks < 5000) {
    g.tick(p); ticks++;
    if (g.over >= 0) over = g.over;
    if (g.alpha < 0.05 && g.trick.id === first) faded = true;
  }
  assert.ok(faded, "faded out");
  assert.ok(Math.abs(ticks * SIM_DT - (over + GHOST_LINGER)) < 2 * SIM_DT, `next after ${(ticks * SIM_DT).toFixed(3)} s (over at ${over.toFixed(3)})`);
  assert.equal(g.trick.id, TRICKS[1].id, "the next trick");
  // One tick of its new trick has run: within that tick's travel of the spawn point.
  const d = Math.hypot(g.s.pos.x - p.pos.x, g.s.pos.y - p.pos.y);
  assert.ok(Math.abs(d - GHOST_BESIDE) < len(g.s.vel) * SIM_DT + 1e-6, `beside the player again (${d.toFixed(3)} m)`);
});

test("a routine list of its own: the ghost cycles through only those", () => {
  const p = player(0.8), g = new Ghost(p, 1, [trick("spin"), trick("three")]);
  assert.equal(g.trick.id, "three");
  assert.deepEqual(g.routine.map(t => t.id), ["spin", "three"]);
  let ticks = 0;
  while (g.trick.id === "three" && ticks < 5000) { g.tick(p); ticks++; }
  assert.equal(g.trick.id, "spin", "wraps to the list's first");
});
