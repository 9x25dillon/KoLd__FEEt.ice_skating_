// game/backstories.ts: every skater's story carries their numbers, and the numbers keep the season's balance.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RIVALS } from "../game/rivals.ts";
import { STYLES } from "../game/styles.ts";
import { DANCE_STYLES } from "../game/motion/dance.ts";
import { ELEMENTS, EVENT_FLOORS } from "../game/career.ts";
import { RIVAL_BACKSTORIES, ORIGINS, ORIGIN_OVERALL, ORIGIN_STAT, overallForLevel, rivalProfile, originOverall, leanOf, massFor, BUILDS } from "../game/backstories.ts";
import { overall, validateProfile, STAT_NAMES } from "../sim/profile.ts";

const checkStory = (who: string, b: { story: string; shaped: string; origin: string; style: string | null; dance: string; signature: readonly string[]; build: string }) => {
  assert.ok(b.story.length > 120 && b.shaped.length > 20 && b.origin.length > 3, who);
  assert.ok(b.style === null || STYLES.some(s => s.id === b.style), `${who}: style ${b.style}`);
  assert.ok(DANCE_STYLES.some(d => d.id === b.dance), `${who}: dance ${b.dance}`);
  assert.ok(b.signature.length > 0 && b.signature.every(e => Object.hasOwn(ELEMENTS, e)), `${who}: signature`);
  assert.ok(BUILDS.some(x => x.id === b.build), `${who}: build`);
};

test("every rival has a backstory, and their overall tells the same story as their level", () => {
  assert.equal(Object.keys(RIVAL_BACKSTORIES).length, RIVALS.length);
  for (const r of RIVALS) {
    const b = RIVAL_BACKSTORIES[r.name];
    checkStory(r.name, b);
    const p = rivalProfile(r.name)!;
    assert.deepEqual(validateProfile(p), [], r.name);
    // Authored to 50 + 20 (level - 1), within a point and a half.
    assert.ok(Math.abs(overall(p) - overallForLevel(r.level)) <= 1.5, `${r.name}: overall ${overall(p).toFixed(2)} for level ${r.level}`);
  }
  // Stronger by level is stronger by stats.
  const byLevel = [...RIVALS].sort((a, b) => a.level - b.level).map(r => overall(rivalProfile(r.name)!));
  for (let i = 1; i < byLevel.length; i++) assert.ok(byLevel[i] > byLevel[i - 1], `rival ${i} by level`);
  assert.equal(rivalProfile("Nobody"), null);
});

test("Lio Tarrant's backstory names no pronoun while Lio's part is the owner's call", () => {
  assert.doesNotMatch(RIVAL_BACKSTORIES["Lio Tarrant"].story + RIVAL_BACKSTORIES["Lio Tarrant"].shaped, /\b(he|him|his|she|her|hers)\b/i);
});

test("an origin is a shape, not a head start: overall stays where the neutral skater's is", () => {
  assert.ok(ORIGINS.length >= 6);
  assert.equal(new Set(ORIGINS.map(o => o.id)).size, ORIGINS.length);
  for (const o of ORIGINS) {
    checkStory(o.id, o);
    assert.ok(o.coach.length > 20, o.id);
    const ov = originOverall(o);
    assert.ok(ov >= ORIGIN_OVERALL.min && ov <= ORIGIN_OVERALL.max, `${o.id}: overall ${ov.toFixed(3)}`);
    // Under the second event's floor: every origin trains before Club debut, as the neutral skater does.
    assert.ok(ov < EVENT_FLOORS[1], o.id);
    for (const n of STAT_NAMES) assert.ok(o.stats[n] >= ORIGIN_STAT.min && o.stats[n] <= ORIGIN_STAT.max, `${o.id}.${n}`);
  }
  // One origin is the neutral skater every save before 2026-11-11 skated.
  assert.ok(ORIGINS.some(o => STAT_NAMES.every(n => o.stats[n] === 50) && o.style === null));
});

test("an origin's numbers lean the way its story says", () => {
  const lean = (id: string) => leanOf(ORIGINS.find(o => o.id === id)!.stats);
  assert.equal(lean("gymnast").up[0], "spring");
  assert.equal(lean("rink-rat").up[0], "edgeControl");
  assert.equal(lean("ballet").up[0], "balance");
  assert.equal(lean("hockey").up[0], "strength");
  assert.ok(["stamina", "strength"].includes(lean("speed").up[0]));
  assert.deepEqual(lean("late-starter"), { up: [], down: [] });
});

test("mass follows height and build", () => {
  assert.equal(massFor(1.6, "athletic"), 51.2);
  assert.ok(massFor(1.6, "light") < massFor(1.6, "athletic") && massFor(1.6, "athletic") < massFor(1.6, "strong"));
  assert.ok(massFor(1.7, "athletic") > massFor(1.5, "athletic"));
});
