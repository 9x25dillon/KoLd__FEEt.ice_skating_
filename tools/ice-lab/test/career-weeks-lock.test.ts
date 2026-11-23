import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CareerState, Choreography, CAREER_EVENTS } from "../game/career.ts";
import type { CareerEvent } from "../game/career.ts";
import { coachAdvice } from "../game/story.ts";
import { xpToRaise } from "../sim/profile.ts";

function finish(event: CareerEvent, falls = 0) {
  const c = new Choreography(event); c.index = event.routine.length; c.falls = falls; return c;
}

/** Gold at First ice, every week then spent on jump drills: stat-locked out of Club debut (floor 50.5). */
function lockedCareer() {
  const c = new CareerState();
  c.award(finish(CAREER_EVENTS[0]));
  while (c.weeks > 0) c.drill("toe");
  return c;
}

test("a career can be stat-locked with no week in hand and no medal left to improve", () => {
  const c = lockedCareer();
  assert.equal(c.medals[0], 3, "gold: First ice cannot be improved");
  assert.equal(c.weeks, 0);
  assert.equal(c.medalCap, 1, "the medal would open Club debut");
  assert.equal(c.statCap, 0, "but the stats do not");
  assert.ok(c.profile.xp > 0, "with XP in hand that cannot be spent");
});

test("a stat-locked career with no weeks earns one back from a finished, medalled run", () => {
  const c = lockedCareer();
  c.award(finish(CAREER_EVENTS[0]));
  assert.equal(c.weeks, 1, "the way out: a week of competition practice");
  c.train("edgeControl");
  assert.equal(c.weeks, 0, "and it trains");
});

test("the week back is only for a stuck career: weeks in hand, or no stat lock, earn nothing", () => {
  const withWeeks = new CareerState();
  withWeeks.award(finish(CAREER_EVENTS[0]));
  const before = withWeeks.weeks;
  withWeeks.award(finish(CAREER_EVENTS[0]));
  assert.equal(withWeeks.weeks, before, "a repeat with weeks in hand pays nothing");
  const unlocked = new CareerState();
  unlocked.award(finish(CAREER_EVENTS[0]));
  while (unlocked.statCap < 1) unlocked.train("edgeControl");
  while (unlocked.weeks > 0) unlocked.drill("toe");
  assert.ok(unlocked.unlocked >= unlocked.medalCap, "nothing stat-locked yet");
  unlocked.award(finish(CAREER_EVENTS[0]));
  assert.equal(unlocked.weeks, 0, "a repeat that is not stuck pays nothing");
  const unfinished = lockedCareer();
  const partial = new Choreography(CAREER_EVENTS[0]);
  unfinished.award(partial);
  assert.equal(unfinished.weeks, 0, "an unfinished run pays nothing");
});

test("the lock and the coach both name the way out", () => {
  const c = lockedCareer();
  assert.ok(c.outOfWeeks);
  assert.match(c.lockReason(1), /No training weeks left: skate any event you have medalled again/);
  const view = {
    xp: c.profile.xp, weeks: c.weeks, unlocked: c.unlocked, stats: c.profile.stats,
    costs: Object.fromEntries(Object.entries(c.profile.stats).map(([k, v]) => [k, xpToRaise(v)])) as typeof c.profile.stats,
    rust: c.rust, wear: c.wear, injured: c.injured, outOfWeeks: c.outOfWeeks,
  };
  assert.ok(coachAdvice(view).some(a => /Skate any event you have medalled again/.test(a)), coachAdvice(view).join(" | "));
  assert.ok(!coachAdvice({ ...view, outOfWeeks: false }).some(a => /medalled again/.test(a)), "only when stuck");
});
