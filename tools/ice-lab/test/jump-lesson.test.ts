// The double loop's lesson (game/tutorial.ts LOOP_STEP, the owner 2026-11-10:
// a jump lesson that places the skater at the entry). Played here the way a
// client plays it: step, let the tutorial watch, and when it says a placement
// is owed, swap in a fresh skater at the entry. Every number was printed
// first, then written down.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SIM_DT } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { IceGrid } from "../sim/ice.ts";
import { EVENT } from "../sim/types.ts";
import type { EdgeEvent, SkaterState } from "../sim/types.ts";
import { setupParams, setupInput } from "../game/setups.ts";
import { defaultControllerProfile } from "../game/full-controls.ts";
import { newSchemeState } from "../app/schemes.ts";
import type { Controls, ControllerHardware } from "../app/pad.ts";
import { Tutorial, LOOP_STEP, LOOP_ENTRY, LOOP_TURN, RETRY_S, ENTRY_LONGEST, entryState, entryOnBeat, insideBoards } from "../game/tutorial.ts";
import { COURSES, courseById, courseSteps } from "../game/padcourse.ts";

const B = 1, X = 2, LT = 6, RT = 7;

/** One try's hands. Times are s from the placement; the air and the landing answer what the skater does, as a player's do. */
interface Try {
  /** RT while the edge deepens, and how long before the load. */
  pre: number; loadAt: number;
  /** s of the load (RT full), and s into it B is changed for X; Infinity keeps B. */
  load: number; swing: number;
  /** RT in the air; s after the landing B and X come. */
  air: number; outB: number; outX: number;
}
/** Re-measured on current main: weight-transfer/cross-place mode shifts the beat crossover; this center keeps 20/27 neighbours landing. */
const CENTRE: Try = { pre: 0.55, loadAt: 1.3 + 3 * SIM_DT, load: 0.317 - SIM_DT, swing: 0.1, air: 0.7, outB: 0, outX: 0.15 };
const HANDS_OFF: Try = { pre: 0, loadAt: Infinity, load: 0, swing: 0, air: 0, outB: Infinity, outX: Infinity };

/** The music: the default grid, or a track's. `anywhere` is a client that places her without waiting for the beat. */
interface Music { bpm: number; offset: number; anywhere?: boolean }
const DEFAULT_MUSIC: Music = { bpm: 128, offset: 0 };

/** A client, and a pilot who flies `tries[n]` on try n (the last one again after that). */
function lesson(tries: Try[], T = 40, music: Music = DEFAULT_MUSIC, lead = 0) {
  const p = { ...setupParams("experimental"), musicBpm: music.bpm, musicOffset: music.offset }, profile = defaultControllerProfile();
  const tut = new Tutorial("experimental", 0, [LOOP_STEP]);
  let s: SkaterState = createState(p, 4.5), st = newSchemeState(), ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
  const h: ControllerHardware = { axes: [0, 0, 0, 0], buttons: Array(16).fill(0), keys: [], connected: true };
  const placedAt: number[] = [];
  let k0 = 0, took = -1, landed = -1, inside = Infinity, k = 0;
  for (; k < T / SIM_DT && !tut.done; k++) {
    h.buttons.fill(0); h.axes = [0, 0, 0, 0];
    if (placedAt.length) {
      const y = tries[Math.min(placedAt.length - 1, tries.length - 1)], t = (k - k0) * SIM_DT;
      if (landed >= 0) {
        h.buttons[RT] = 0.5;
        if (t - landed >= y.outB) h.buttons[B] = 1;
        if (t - landed >= y.outX) { h.buttons[LT] = 0.5; h.buttons[X] = 1; }
      } else if (took >= 0) h.buttons[RT] = y.air;
      else if (y !== HANDS_OFF) {
        if (k - k0 < 2) h.buttons[B] = 1;
        h.axes[0] = h.axes[2] = -Math.min(1, t / 0.5);
        if (t < y.loadAt) h.buttons[RT] = y.pre;
        else if (t < y.loadAt + y.load) { h.buttons[RT] = 1; h.buttons[t - y.loadAt < y.swing ? B : X] = 1; }
      }
      const events: EdgeEvent[] = [];
      step(s, setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input, p, SIM_DT, events, ice);
      if (took < 0 && events.some(e => e.type === EVENT.Takeoff)) took = t;
      if (took >= 0 && landed < 0 && events.some(e => e.type === EVENT.Landing)) landed = t;
      inside = Math.min(inside, insideBoards(s.pos.x, s.pos.y));
    } else step(s, setupInput({ hardware: h } as Controls, s, "experimental", st, p, profile).input, p, SIM_DT, [], ice);
    tut.sample(s, SIM_DT);
    const e = tut.entry;
    if (e && !tut.done && k >= lead && (music.anywhere || entryOnBeat(p, e, s.tick))) {
      s = entryState(p, e, s.tick); st = newSchemeState(); ice = new IceGrid(p.rinkHalfLength, p.rinkHalfWidth);
      tut.entered(s);
      placedAt.push(+((k + 1) * SIM_DT).toFixed(3)); k0 = k + 1; took = -1; landed = -1;
    }
  }
  return { passed: tut.done ? +(k * SIM_DT).toFixed(3) : -1, tut, s, placedAt, inside };
}

test("the lesson is a course of its own, for Experimental, and the Tutorial's steps are as they were", () => {
  const course = courseById("doubleloop")!;
  assert.deepEqual(course.setups, ["experimental"]);
  assert.deepEqual(courseSteps(course, "experimental").map(x => x.id), ["doubleloop"]);
  assert.equal(COURSES[COURSES.length - 1].id, "doubleloop", "after the controls courses: a client's first course for a setup is still its controls");
  // Nothing was measured on another setup, so no other setup is asked for it.
  const sim = new Tutorial("simulation", 0, [LOOP_STEP]);
  assert.equal(sim.done, true); assert.deepEqual(sim.skipped, ["doubleloop"]); assert.equal(sim.entry, null);
  assert.match(LOOP_STEP.how({ setup: "experimental", push: "A", three: "B", modifier: "L3", feet: "dpad" }), /both sticks all the way left.*RT just past halfway.*B, change B for X/);
});

test("a placement is owed as the step begins, and the client's fresh skater is at the entry, backward", () => {
  const tut = new Tutorial("experimental", 0, [LOOP_STEP]);
  assert.deepEqual(tut.entry, LOOP_ENTRY);
  const s = entryState(setupParams("experimental"), LOOP_ENTRY);
  assert.deepEqual([s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.heading.x, s.tick], [10, 38, -6.6, 0, 1, 0]);
  tut.entered(s);
  assert.equal(tut.entry, null, "placed: nothing more is owed until the try is over");
});

test("the measured script lands the double on the first try, standing, and stays on the ice", () => {
  const r = lesson([CENTRE]);
  assert.equal(r.tut.falls, 0);
  // At the default 128 bpm a try may start every 0.469 s: the first moment is tick 56.
  assert.deepEqual(r.placedAt, [0.467], "placed once, on the music");
  // MEASURED on current main: the landing turns 2.030 revolutions, then the 2 s glide.
  assert.ok(Math.abs(r.s.landed.turned - 2.030) < 0.002, `${r.s.landed.turned}`);
  assert.ok(r.s.landed.turned >= LOOP_TURN);
  assert.ok(Math.abs(r.passed - 4.692) < 0.02, `passed at ${r.passed}`);
  assert.equal(r.tut.message, LOOP_STEP.trust);
  // The whole try, from the entry to the pass, with room to the boards.
  assert.ok(r.inside >= 4, `${r.inside.toFixed(2)} m inside the boards at the nearest`);
});

test("a fall: no getting up, and the next try starts from the entry a moment later, on the music", () => {
  // A load held 0.4 s: the edge has tipped her in before the release. Nothing is pressed after the fall.
  const r = lesson([{ ...CENTRE, load: 0.4 }, CENTRE]);
  assert.equal(r.tut.falls, 1);
  assert.equal(r.placedAt.length, 2);
  // MEASURED: down 1.66 s into the try; SETTLE_S to see it; then under a beat's wait.
  const gap = r.placedAt[1] - r.placedAt[0];
  assert.ok(gap >= 4.2 && gap < 4.3, `${gap.toFixed(3)} s between the placements`);
  assert.ok(r.passed > 0, "and the second try passes");
  assert.match(new Tutorial("experimental", 0, [LOOP_STEP]).status, /0\.0 \/ 2 s/);
});

test("a landing that does not count puts her back after a moment; so does a try that never jumps", () => {
  // B held through a long load, no swing: a hop of a tenth of a turn, standing. Not a double.
  const hop = lesson([{ ...CENTRE, loadAt: 1, load: 0.3, swing: Infinity }, HANDS_OFF], 12);
  assert.equal(hop.tut.falls, 0);
  assert.ok(hop.placedAt.length >= 2, "placed again");
  const gap = hop.placedAt[1] - hop.placedAt[0];
  assert.ok(gap > 2 + RETRY_S && gap < 2 + RETRY_S + 1.5, `back at the entry ${gap.toFixed(2)} s into the try`);
  // Hands off: she glides on, and is put back when the try has run its length.
  const idle = lesson([HANDS_OFF], 2 * ENTRY_LONGEST + 2);
  assert.equal(idle.passed, -1);
  assert.equal(idle.placedAt.length, 3);
  // The try's longest, then the wait for the music: under one beat (0.469 s).
  const wait = idle.placedAt[1] - idle.placedAt[0] - ENTRY_LONGEST;
  assert.ok(wait >= 0 && wait < 0.47, `${idle.placedAt}`);
});

test("the beat is in the entry: started on the music it lands on every track, started anywhere it mostly does not", () => {
  // MEASURED 2026-11-10. Backward on the deep edge Experimental crosses over by itself on each beat; the
  // script wants that crossover on tick 113 of the try, 0.36 s before the load. game/audio/tracks.json's
  // five tracks, the default grid, and two more tempos; `lead` moves where in the music the lesson begins.
  const TRACKS: Music[] = [{ bpm: 54.3, offset: 2.84 }, { bpm: 60.8, offset: 2.98 }, { bpm: 67.1, offset: 3.1 }, { bpm: 65.8, offset: 2.9 }, { bpm: 68.1, offset: 3.06 }];
  for (const music of [...TRACKS, DEFAULT_MUSIC, { bpm: 100, offset: 0 }, { bpm: 160, offset: 0 }]) for (const lead of [0, 137, 911]) {
    const r = lesson([CENTRE], 7 + lead * SIM_DT, music, lead);
    assert.ok(r.passed > 0 && r.tut.falls === 0, `${music.bpm} bpm from tick ${lead}: fell ${r.tut.falls}`);
    assert.ok(r.s.landed.turned >= 2.019 && r.s.landed.turned <= 2.031, `${music.bpm} bpm: turned ${r.s.landed.turned}`);
    assert.ok(r.placedAt[0] - lead * SIM_DT <= 60 / music.bpm + 0.02, "the wait for the music is under a beat");
  }
  // A client that places her at once, whatever the music is doing: the same hands, on the first try.
  const anywhere = (music: Music) => [0, 137, 500, 911, 1500, 2222, 3001, 4444, 6000, 9999]
    .filter(lead => { const r = lesson([CENTRE], 5 + lead * SIM_DT, { ...music, anywhere: true }, lead); return r.passed > 0 && r.tut.falls === 0; }).length;
  assert.equal(anywhere(TRACKS[0]), 3, "the first track, 54.3 bpm: 3 of 10 on current main");
  assert.equal(anywhere({ bpm: 100, offset: 0 }), 3, "100 bpm: 3 of 10 on current main");
  assert.equal(anywhere(DEFAULT_MUSIC), 3, "128 bpm: 3 of 10 on current main");
});

test("how forgiving it is: a tick or two off on each timing, 20 of 27 still land", () => {
  // MEASURED 2026-11-10, from the lesson's own place (21 from the sheet's origin: the ice grid differs).
  // The load is the knife's edge: a tick short or long and some of these fall.
  let landed = 0;
  for (const a of [-2, 0, 2]) for (const l of [-1, 0, 1]) for (const w of [-1, 0, 1]) {
    const r = lesson([{ ...CENTRE, loadAt: CENTRE.loadAt + a * SIM_DT, load: CENTRE.load + l * SIM_DT, swing: CENTRE.swing + w * SIM_DT }], 5);
    if (r.passed > 0 && r.tut.falls === 0) landed++;
  }
  assert.equal(landed, 20);
});
