import { test } from "node:test";
import { strict as assert } from "node:assert";
import { RIVALS, BASELINE, FORM_SWING, rivalScore, standings, seasonTable, YOU } from "../game/rivals.ts";
import { CAREER_EVENTS } from "../game/career.ts";
import { canonicalPaddles } from "../app/pad.ts";

test("a rival's score is fixed for that event, grows through the season, and stays within their day", () => {
  assert.equal(BASELINE.length, CAREER_EVENTS.length);
  RIVALS.forEach((r, i) => {
    BASELINE.forEach((base, e) => {
      assert.equal(rivalScore(i, e), rivalScore(i, e), "a retry faces the same score");
      const center = base * r.level * (1 + r.growth * e);
      assert.ok(Math.abs(rivalScore(i, e) - center) <= center * FORM_SWING + 0.01, `${r.name} at ${e}`);
    });
  });
  assert.ok(new Set(BASELINE.map((_, e) => rivalScore(0, e))).size > 1);
});

test("the table sorts by score and marks you; a baseline run lands inside the field, not on top", () => {
  const table = standings(0, BASELINE[0]);
  const seasonOne = RIVALS.filter(r => r.season === 1).length;
  assert.equal(table.length, seasonOne + 1);
  assert.deepEqual(table.map(r => r.place), [1, 2, 3, 4, 5, 6]);
  for (let i = 1; i < table.length; i++) assert.ok(table[i - 1].score >= table[i].score);
  const you = table.find(r => r.you)!;
  assert.equal(you.name, YOU);
  assert.ok(you.place > 1 && you.place < 6, `a plain clean run places ${you.place}`);
  assert.equal(standings(0, null).length, seasonOne, "no row until you have skated");
  // Season two's field: the five grown, and the national champion.
  assert.equal(standings(5, null).length, RIVALS.length);
  assert.ok(standings(8, null).some(r => r.name === "Teodora Wynn"));
  assert.ok(!standings(4, null).some(r => r.name === "Teodora Wynn"), "she skates from season two");
});

test("season points count only events you have skated; winning them all tops the table", () => {
  const none = seasonTable(CAREER_EVENTS.map(() => null));
  assert.ok(none.every(r => r.points === 0));
  assert.equal(none[0].name, YOU, "level on points, you are listed first");
  const top = seasonTable(CAREER_EVENTS.map(() => 1000));
  assert.equal(top[0].name, YOU);
  assert.equal(top[0].points, 12 * 5, "season one: its five events only");
  const one = seasonTable([1000, ...CAREER_EVENTS.slice(1).map(() => null)]);
  assert.equal(one.find(r => r.you)!.points, 12);
  // Season two counts its own events, and the gala (an exhibition) places nobody.
  const two = seasonTable(CAREER_EVENTS.map(() => 1000), 2);
  assert.equal(two.length, RIVALS.length + 1);
  assert.equal(two[0].points, 12 * 4, "four competitions; the gala adds nothing");
  assert.equal(seasonTable(CAREER_EVENTS.map((_, i) => i === 9 ? 1000 : null), 2).find(r => r.you)!.points, 0);
});


test("a wired Elite 2 in Firefox: paddles reach the game's slots by position, anything else passes through", () => {
  const raw = Array(21).fill(0);
  const press = (i: number) => { const b = [...raw]; b[i] = 1; return canonicalPaddles(b); };
  assert.equal(press(17)[20], 1, "top-left");
  assert.equal(press(18)[18], 1, "top-right");
  assert.equal(press(19)[21], 1, "bottom-left");
  assert.equal(press(20)[19], 1, "bottom-right");
  assert.equal(press(0)[0], 1, "the standard buttons do not move");
  assert.equal(canonicalPaddles(Array(21).fill(0)).length, 22);
  const other = [0, 0, 1];
  assert.equal(canonicalPaddles(other), other);
  assert.equal(canonicalPaddles(Array(17).fill(0)).length, 17);
});
