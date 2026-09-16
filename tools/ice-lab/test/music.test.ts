// The rhythm layer (sim/music.ts, musicMode 1) — design-bible.md §2.1, §2.6.
//
// Two mechanics, two grains: a crossover push lands in a beat window (full
// impulse on tempo, `musicMissedPushScale` and a MusicMiss event off it), and
// a turn's cusp or a jump's landing earns phrase-weighted credit within
// `musicAccentWindow` of an accent — this rig's downbeats, until a shipped
// track's hand-authored ones exist (see sim/music.ts's own header).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PRESETS, DEFAULT_PARAMS, SIM_DT, validate } from "../sim/params.ts";
import type { Params } from "../sim/params.ts";
import { createState, step } from "../sim/solver.ts";
import { NEUTRAL_INPUT, EVENT } from "../sim/types.ts";
import type { EdgeEvent } from "../sim/types.ts";
import { len } from "../sim/math.ts";
import { beatOffset, onBeat, accentOffset, onAccent, phraseWeight, accentCredit } from "../sim/music.ts";

const music = (extra: Partial<Params> = {}): Params =>
  ({ ...PRESETS.responsive, movesMode: 1, musicMode: 1, musicBpm: 120, musicBeatWindow: 0.05, ...extra });

test("every preset skates with the rhythm layer off, and its levers validate", () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(p.musicMode, 0, name);
  assert.deepEqual(validate(DEFAULT_PARAMS), []);
  assert.ok(validate({ ...DEFAULT_PARAMS, musicMode: 2 }).some((e) => e.includes("musicMode")));
  assert.ok(validate({ ...DEFAULT_PARAMS, musicBpm: 0 }).some((e) => e.includes("musicBpm")));
  assert.ok(validate({ ...DEFAULT_PARAMS, musicBeatWindow: 1 }).some((e) => e.includes("musicBeatWindow")));
  assert.ok(validate({ ...DEFAULT_PARAMS, musicAccentWindow: 1 }).some((e) => e.includes("musicAccentWindow")));
  assert.ok(validate({ ...DEFAULT_PARAMS, musicMissedPushScale: 1 }).some((e) => e.includes("musicMissedPushScale")));
});

// ── the beat grid, as pure math ──────────────────────────────────────────────

test("beatOffset and onBeat read tick zero as exactly on the beat, at any tempo", () => {
  const p = music();
  assert.equal(beatOffset(p, 0), 0);
  assert.ok(onBeat(p, 0));
  // 120 bpm: a beat every 0.5 s, 60 ticks. tick 60 is the next beat, tick 30 is
  // maximally off it (a quarter-beat window either side of the half-period).
  assert.equal(Math.abs(beatOffset(p, 60)), 0);
  assert.ok(onBeat(p, 60));
  assert.ok(Math.abs(beatOffset(p, 30)) >= 0.24, "tick 30 is a quarter-beat from either neighbour");
  assert.ok(!onBeat(p, 30));
});

test("accentOffset and onAccent read every downbeat as an accent, phrase-weighted", () => {
  const p = music({ musicBeatsPerBar: 4, musicBarsPerPhrase: 8, musicAccentWindow: 0.05 });
  // A bar is 4 beats at 120 bpm: 2 s, 240 ticks. tick 0 and tick 240 are downbeats.
  assert.equal(accentOffset(p, 0), 0);
  assert.ok(onAccent(p, 0));
  assert.equal(Math.abs(accentOffset(p, 240)), 0);
  assert.ok(onAccent(p, 240));
  assert.ok(!onAccent(p, 120), "half a bar from the nearest downbeat");
  assert.equal(phraseWeight(p, 0), 1, "the phrase's first bar is not its climax");
  // 8 bars to a phrase: bar 7 (0-based) is the climax, at 7 * 240 = 1680 ticks.
  assert.equal(phraseWeight(p, 1680), 3);
  assert.equal(phraseWeight(p, 8 * 240), 1, "the next phrase starts over at bar 0");
  assert.equal(accentCredit(p, 1680), 3);
  assert.equal(accentCredit(p, 120), 0, "no accent nearby, no credit");
});

// ── the crossover's beat window, in the solver ───────────────────────────────

/** Carve for `pushAt` ticks, then a single-tick crossover push. musicMode governs its beat window. */
function crossoverPush(p: Params, pushAt: number): { speedGain: number; scale: number; events: EdgeEvent[] } {
  const s = createState(p, 5);
  const events: EdgeEvent[] = [];
  let speedAtPush = 0, scale = 1;
  for (let i = 0; i < pushAt + 60; i++) {
    if (i === pushAt) speedAtPush = len(s.vel);
    const ev: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: 0.35, knee: 0.9, weight: 0.5, push: i === pushAt }, p, SIM_DT, ev);
    if (i === pushAt) scale = s.strokeMusicScale;
    events.push(...ev);
  }
  return { speedGain: len(s.vel) - speedAtPush, scale, events };
}

test("a crossover push on the beat gets full impulse and a MusicHit event", () => {
  const p = music();
  const hit = crossoverPush(p, 240); // 240 ticks at 120 bpm: exactly on a beat
  assert.equal(hit.scale, 1);
  assert.ok(hit.events.some((e) => e.type === EVENT.MusicHit));
  assert.ok(!hit.events.some((e) => e.type === EVENT.MusicMiss));
});

test("a crossover push off the beat is scaled down and gets a MusicMiss event, audibly", () => {
  const p = music();
  const hit = crossoverPush(p, 240);
  const miss = crossoverPush(p, 270); // a quarter-beat later: off tempo
  assert.equal(miss.scale, p.musicMissedPushScale);
  assert.ok(miss.events.some((e) => e.type === EVENT.MusicMiss));
  assert.ok(!miss.events.some((e) => e.type === EVENT.MusicHit));
  assert.ok(miss.speedGain < hit.speedGain, "a missed beat window pushes weaker, not just differently");
  assert.ok(miss.speedGain > 0, "still a push, just a scaled one — never a gate (bible §2.6)");
});

test("with musicMode off, a crossover push's scale is always 1, on or off the beat", () => {
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const offBeat = crossoverPush(p, 270);
  const onBeatOff = crossoverPush(p, 240);
  assert.equal(offBeat.scale, 1);
  assert.equal(onBeatOff.scale, 1);
  assert.ok(offBeat.events.every((e) => e.type !== EVENT.MusicHit && e.type !== EVENT.MusicMiss));
});

// ── accent credit, from a real turn ──────────────────────────────────────────

/** A known-working RFO three-turn (test/turns.test.ts's recipe), music-instrumented. */
function threeTurn(p: Params): { musicCredit: number; turnTick: number } {
  const s = createState(p, 6.8);
  let flips = 0, sign = 1, turnTick = -1;
  for (let i = 0; i < 480; i++) {
    if (s.flips !== flips) { flips = s.flips; sign = -sign; }
    const ev: EdgeEvent[] = [];
    step(s, { ...NEUTRAL_INPUT, lean: sign * -0.3, weight: 1, knee: 0.45, turn: i >= 240 && i < 250 }, p, SIM_DT, ev);
    for (const e of ev) if (e.type === EVENT.Turn) turnTick = e.tick;
    if (s.fallen) break;
  }
  return { musicCredit: s.musicCredit, turnTick };
}

test("a turn's cusp earns exactly the credit sim/music.ts predicts for the tick it lands on", () => {
  const p = { ...PRESETS.responsive, movesMode: 1, musicMode: 1, musicBpm: 120, musicAccentWindow: 0.05 };
  const r = threeTurn(p);
  assert.ok(r.turnTick >= 0, "the turn actually happened");
  assert.equal(r.musicCredit, accentCredit(p, r.turnTick));
});

test("with musicMode off, a turn earns no credit at all", () => {
  const p = { ...PRESETS.responsive, movesMode: 1 };
  const r = threeTurn(p);
  assert.equal(r.musicCredit, 0);
});

test("musical credit survives a fall and a fresh press, like the last landing does", () => {
  const p = { ...PRESETS.responsive, musicMode: 1, musicBpm: 120, musicAccentWindow: 0.4 };
  const s = createState(p, 5);
  s.musicCredit = 7;
  s.fallen = true; s.pushHeld = false;
  step(s, { ...NEUTRAL_INPUT, push: true }, p, SIM_DT, []);
  assert.equal(s.fallen, false, "the fresh press stood the skater up");
  assert.equal(s.musicCredit, 7);
});
