// game/modes.ts: the arcade ladder, its board, the exhibition and who can skate them.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MODES, ARCADE_LADDER, ARCADE_LIVES, ArcadeRun, ArcadeBoard, arcadeRounds, rivalCharacter, createdCharacter, characterParams, exhibitionEvent, GALA_ROUTINE, BOARD_SIZE } from "../game/modes.ts";
import { RIVALS, rivalScore } from "../game/rivals.ts";
import { CAREER_EVENTS } from "../game/career.ts";
import { sheetFrom } from "../game/creator.ts";
import { originById } from "../game/backstories.ts";
import { DEFAULT_PARAMS, validate } from "../sim/params.ts";

test("career is the first mode, and every mode has words", () => {
  assert.equal(MODES[0].id, "career");
  assert.deepEqual(MODES.map(m => m.id), ["career", "arcade", "exhibition", "creation"]);
  for (const m of MODES) assert.ok(m.blurb.length > 30, m.id);
});

test("the ladder: real events, real rivals, the career's own measured targets", () => {
  for (const r of ARCADE_LADDER) {
    assert.ok(CAREER_EVENTS[r.event] && !CAREER_EVENTS[r.event].exhibition, `event ${r.event}`);
    assert.ok(RIVALS.some(x => x.name === r.rival), r.rival);
  }
  const rounds = arcadeRounds("career");
  assert.equal(rounds.length, ARCADE_LADDER.length);
  assert.equal(rounds[0].target, rivalScore(0, 0));
  // Each round is harder to beat than the one before.
  for (let i = 1; i < rounds.length; i++) assert.ok(rounds[i].target > rounds[i - 1].target, `round ${i}`);
  // A rival never skates against themself.
  const asNoor = arcadeRounds("rival:Noor Ashdown");
  assert.equal(asNoor.length, ARCADE_LADDER.length - 1);
  assert.ok(!asNoor.some(r => r.rival === "Noor Ashdown"));
});

test("an arcade run: a win climbs and pays, a loss or an unfinished program costs a life", () => {
  const run = new ArcadeRun("career");
  const t0 = run.current!.target;
  const win = run.record(t0 + 1, true);
  assert.ok(win.won && win.points > 0 && run.round === 1 && run.lives === ARCADE_LIVES);
  assert.equal(run.points, Math.round((t0 + 1) * 10 + 20));
  assert.ok(!run.record(run.current!.target + 5, false).won, "unfinished");
  assert.ok(!run.record(run.current!.target - 0.01, true).won, "under the target");
  assert.equal(run.lives, ARCADE_LIVES - 2);
  const last = run.record(0, true);
  assert.ok(last.over && !last.cleared && run.over);
  assert.equal(run.record(999, true).won, false, "nothing after game over");
  const clean = new ArcadeRun("career");
  while (!clean.over) clean.record(clean.current!.target + 1, true);
  assert.ok(clean.cleared && clean.lives === ARCADE_LIVES);
});

test("the board keeps the best ten, best first, and survives a save", () => {
  const board = new ArcadeBoard();
  for (let i = 1; i <= 12; i++) {
    const run = new ArcadeRun("career");
    run.record(run.current!.target + i, true);
    board.add(run, `S${i}`);
  }
  assert.equal(board.entries.length, BOARD_SIZE);
  assert.equal(board.entries[0].name, "S12");
  assert.ok(board.entries.every((e, i) => i === 0 || e.points <= board.entries[i - 1].points));
  assert.equal(board.add(new ArcadeRun("career"), "Zero"), 0, "no points, no place");
  assert.deepEqual(ArcadeBoard.restore(board.serialize()).entries, board.entries);
  assert.deepEqual(ArcadeBoard.restore("{").entries, []);
});

test("characters: a rival skates their story's stats and style; a created skater theirs; both stay valid physics", () => {
  for (const r of RIVALS) {
    const c = rivalCharacter(r.name)!;
    assert.ok(c, r.name);
    assert.deepEqual(validate(characterParams(DEFAULT_PARAMS, c)), [], r.name);
  }
  const ansa = characterParams(DEFAULT_PARAMS, rivalCharacter("Ansa Merrow")!);
  const katya = characterParams(DEFAULT_PARAMS, rivalCharacter("Katya Vell")!);
  // Ansa's backstory is spring and power; Katya's is figures.
  assert.ok(ansa.jumpImpulse / DEFAULT_PARAMS.jumpImpulse > katya.jumpImpulse / DEFAULT_PARAMS.jumpImpulse);
  assert.ok(katya.angulationLimit > ansa.angulationLimit);
  const me = createdCharacter(2, sheetFrom(originById("ballet")!, "Iris"))!;
  assert.equal(me.id, "created:2");
  assert.deepEqual(validate(characterParams(DEFAULT_PARAMS, me)), []);
  assert.equal(createdCharacter(0, { name: "" } as never), null);
  assert.equal(rivalCharacter("Nobody"), null);
});

test("an exhibition is an event nobody is placed in, with the gala's program when you bring none", () => {
  const open = exhibitionEvent(null);
  assert.ok(open.exhibition);
  assert.deepEqual(open.routine, [...GALA_ROUTINE]);
  assert.deepEqual(exhibitionEvent(["glide", "jump", "pose"]).routine, ["glide", "jump", "pose"]);
});
