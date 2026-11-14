import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CareerState, CAREER_EVENTS, SEASONS } from "../game/career.ts";
import { DANCE_STYLES } from "../game/motion/dance.ts";

const [first, second] = DANCE_STYLES.map(s => s.id);

test("a new career dresses every event in the Settings style", () => {
  const c = new CareerState();
  assert.equal(c.dances.length, CAREER_EVENTS.length);
  assert.ok(c.dances.every(d => d === null));
});

test("each event keeps its own dance style, and gives it back for the Settings one", () => {
  const c = new CareerState();
  assert.equal(c.setDance(0, first), true);
  assert.equal(c.setDance(2, second), true);
  assert.deepEqual([c.dances[0], c.dances[1], c.dances[2]], [first, null, second]);
  assert.equal(c.setDance(0, null), true);
  assert.equal(c.dances[0], null);
});

test("an unknown style or event is refused and changes nothing", () => {
  const c = new CareerState();
  assert.equal(c.setDance(0, "moonwalk"), false);
  assert.equal(c.setDance(-1, first), false);
  assert.equal(c.setDance(CAREER_EVENTS.length, first), false);
  assert.ok(c.dances.every(d => d === null));
});

test("dances survive a save and restore", () => {
  const c = new CareerState();
  c.setDance(1, second);
  const back = CareerState.restore(c.serialize());
  assert.deepEqual(back.dances, c.dances);
});

test("a save from before per-event dances restores whole, with none chosen", () => {
  const c = new CareerState();
  c.medals[0] = 2;
  const old = JSON.parse(c.serialize());
  delete old.dances;
  const back = CareerState.restore(JSON.stringify(old));
  assert.equal(back.medals[0], 2);
  assert.ok(back.dances.every(d => d === null));
});

test("a season-one save gains season two's events, undressed", () => {
  const c = new CareerState();
  const one = SEASONS[0].last + 1;
  const old = JSON.parse(c.serialize());
  for (const k of ["medals", "plans", "timelines", "best"]) old[k] = old[k].slice(0, one);
  old.dances = Array(one).fill(null);
  old.dances[0] = first;
  const back = CareerState.restore(JSON.stringify(old));
  assert.equal(back.dances.length, CAREER_EVENTS.length);
  assert.equal(back.dances[0], first);
  assert.ok(back.dances.slice(one).every(d => d === null));
});

test("an unknown style in a save falls back to Settings for that event only", () => {
  const c = new CareerState();
  c.setDance(0, first);
  c.setDance(1, second);
  const old = JSON.parse(c.serialize());
  old.dances[1] = "moonwalk";
  const back = CareerState.restore(JSON.stringify(old));
  assert.deepEqual([back.dances[0], back.dances[1]], [first, null]);
});
