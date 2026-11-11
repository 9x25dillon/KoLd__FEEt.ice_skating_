// The Season's story (game/story.ts): authored words over the career that runs.
// It changes nothing it reads; these check that every event has its chapter,
// that the words keep the bible's one rule of tone, and that the coach points
// at the right thing first.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CAREER_EVENTS } from "../game/career.ts";
import { RIVALS } from "../game/rivals.ts";
import { CHAPTERS, SEASON, SEASON_TWO, RIVAL_PARTS, outcome, finale, coachAdvice, cast, COACH, STAT_TITLES } from "../game/story.ts";
import type { CareerView } from "../game/story.ts";
import { STAT_NAMES } from "../sim/profile.ts";

test("every event has its chapter, and every chapter every ending", () => {
  assert.equal(CHAPTERS.length, CAREER_EVENTS.length);
  for (const c of CHAPTERS) for (const key of ["before", "gold", "silver", "bronze", "short"] as const) assert.ok(c[key].length > 40, key);
  for (const r of RIVALS) assert.ok(RIVAL_PARTS[r.name].length > 20, r.name);
  assert.deepEqual(cast().map(c => c.name), ["Remi Castellan", "Noor Ashdown", "Katya Vell", "Lio Tarrant", "Ansa Merrow"]);
  assert.deepEqual(cast(2).map(c => c.name), ["Teodora Wynn", "Remi Castellan", "Noor Ashdown", "Katya Vell", "Lio Tarrant", "Ansa Merrow"]);
  assert.ok(SEASON_TWO.opening.includes("Mara") && SEASON_TWO.opening.includes("Teodora Wynn"));
  for (const key of STAT_NAMES) assert.ok(STAT_TITLES[key]);
  assert.ok(SEASON.opening.includes(COACH.name));
});

test("no failure shaming: a fall is part of the story, never a judgement (design bible, anti-goals)", () => {
  const words = [SEASON.opening, ...Object.values(SEASON.finale), SEASON_TWO.opening, ...Object.values(SEASON_TWO.finale), ...CHAPTERS.flatMap(c => [c.before, c.gold, c.silver, c.bronze, c.short])].join(" ");
  for (const shame of [/\bfail(ed|ure)?\b/i, /\bbad\b/i, /terrible/i, /disappoint/i, /shame/i, /embarrass/i, /pathetic/i, /\bweak\b/i]) assert.doesNotMatch(words, shame);
});

test("the ending follows the run: the medal when finished, the short one when the music ran out", () => {
  assert.equal(outcome(0, 3, true), CHAPTERS[0].gold);
  assert.equal(outcome(1, 2, true), CHAPTERS[1].silver);
  assert.equal(outcome(2, 1, true), CHAPTERS[2].bronze);
  assert.equal(outcome(3, 0, false), CHAPTERS[3].short);
  assert.equal(outcome(99, 3, true), "");
  assert.equal(outcome(8, 3, true), CHAPTERS[8].gold, "Nationals");
  assert.equal(finale(1), SEASON.finale.champion);
  assert.equal(finale(1, 2), SEASON_TWO.finale.champion);
  assert.equal(finale(2, 2), SEASON_TWO.finale.podium);
  assert.equal(finale(6, 2), SEASON_TWO.finale.field);
  assert.equal(finale(3), SEASON.finale.podium);
  assert.equal(finale(5), SEASON.finale.field);
});

const view = (patch: Partial<CareerView> = {}): CareerView => ({
  xp: 300, weeks: 3, unlocked: 0,
  stats: { strength: 40, spring: 35, edgeControl: 40, balance: 40, stamina: 40 },
  costs: { strength: 120, spring: 110, edgeControl: 120, balance: 120, stamina: 120 },
  rust: { toe: 0, edge: 0 }, wear: { hip: 0, knee: 0, shoulder: 0 }, injured: { hip: false, knee: false, shoulder: false },
  ...patch,
});

test("the coach points at an injury first, then rust before a jump, then wear, then the weakest stat", () => {
  // Nothing wrong: train the weakest, which you can afford.
  assert.deepEqual(coachAdvice(view()), ['"Spring is your weakest, at 35. Spend a week on it: 110 XP."']);
  // An injury comes first, whatever else.
  const hurt = coachAdvice(view({ injured: { hip: false, knee: true, shoulder: false } }));
  assert.match(hurt[0], /Rest the knees/);
  assert.equal(hurt.length, 2);
  // Rust matters before a program with a jump: Jump showcase is the third event.
  assert.match(coachAdvice(view({ unlocked: 2, rust: { toe: 0.4, edge: 0.1 } }))[0], /toe jumps have gone rusty, 40%/);
  assert.doesNotMatch(coachAdvice(view({ unlocked: 1, rust: { toe: 0.4, edge: 0.1 } }))[0], /rusty/, "Club debut has no jump");
  // Worn but not injured: rest it.
  assert.match(coachAdvice(view({ wear: { hip: 0.6, knee: 0, shoulder: 0 } }))[0], /hips are carrying a lot of falls/);
  // No XP for the weakest: skate for it.
  assert.match(coachAdvice(view({ xp: 20 }))[0], /better medal pays the 110 XP/);
  assert.match(coachAdvice(view({ weeks: 0, xp: 500 }))[0], /No weeks left/);
  // A new career's stats are all 50: none is the weakest.
  const fresh = view({ xp: 0, stats: { strength: 50, spring: 50, edgeControl: 50, balance: 50, stamina: 50 } });
  assert.deepEqual(coachAdvice(fresh), ['"Your stats are level, at 50. A better medal pays the 120 XP to train one."']);
});

test("the coach reads and never writes", () => {
  const v = view({ rust: { toe: 0.5, edge: 0 }, unlocked: 2 });
  const before = JSON.stringify(v);
  coachAdvice(v);
  assert.equal(JSON.stringify(v), before);
});
