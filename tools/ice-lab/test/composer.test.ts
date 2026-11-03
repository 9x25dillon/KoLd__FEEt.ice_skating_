import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { CAREER_EVENTS, CareerState, Choreography, PLAN_EXTRA } from "../game/career.ts";
import {
  CUE_EARLY_BARS, CUE_LATE_BARS, MIN_GAP_BARS, addCue, barCount, barSeconds, barStart, checkTimeline, cueResult,
  cueTimes, nudge, parseTimeline, removeCue, requiredCues, retime, spreadTimeline, timelineOrder,
} from "../game/composer.ts";
import type { BeatGrid, Timeline } from "../game/composer.ts";
import { createState } from "../sim/solver.ts";
import { GAME_PARAMS } from "../game/controls.ts";

const tracks: BeatGrid[] = JSON.parse(readFileSync(new URL("../game/audio/tracks.json", import.meta.url), "utf8"));
const first = CAREER_EVENTS[0], finale = CAREER_EVENTS[4];

test("bars come from tracks.json's own grid, the one sim/music.ts reads", () => {
  const g = tracks[0];
  assert.equal(barSeconds(g), 60 / g.bpm * g.beatsPerBar);
  assert.equal(barStart(g, 0), g.offset);
  assert.equal(barCount(g, first.seconds), Math.floor((first.seconds - g.offset) / barSeconds(g)));
  assert.ok(barStart(g, barCount(g, first.seconds)) <= first.seconds, "the last bar still starts inside the event");
});

test("every event's own program spreads cleanly over every track", () => {
  for (const event of CAREER_EVENTS) for (let i = 0; i < tracks.length; i++) {
    const t = spreadTimeline(event, tracks[i], i, event.routine)!;
    assert.ok(t, `${event.id} on track ${i}`);
    const check = checkTimeline(event, tracks[i], t);
    assert.deepEqual(check.problems, [], `${event.id} on track ${i}`);
    assert.deepEqual(timelineOrder(t), [...event.routine]);
    assert.equal(t.cues.at(-1)!.bar, barCount(tracks[i], event.seconds) - 2, "the last cue leaves a bar after it");
  }
});

test("a timeline that leaves out, crowds, overfills or leaves the music is refused, in words", () => {
  const g = tracks[0], t = spreadTimeline(first, g, 0, first.routine)!;
  const missing = { ...t, cues: t.cues.slice(1) };
  assert.match(checkTimeline(first, g, missing).problems.join(), /asks for Opening glide/);
  const crowded = { ...t, cues: [t.cues[0], { ...t.cues[1], bar: t.cues[0].bar + MIN_GAP_BARS - 1 }, t.cues[2]] };
  assert.match(checkTimeline(first, g, crowded).problems.join(), /1 bar apart/);
  const off = { ...t, cues: [...t.cues.slice(0, 2), { ...t.cues[2], bar: barCount(g, first.seconds) }] };
  assert.match(checkTimeline(first, g, off).problems.join(), /off the music/);
  const extra = Array.from({ length: PLAN_EXTRA + 1 }, (_, i) => ({ id: "spiral" as const, bar: 1 + 2 * (i + 1) }));
  const over: Timeline = { track: 0, cues: [{ id: "glide", bar: 0 }, ...extra, { id: "edge", bar: 9 }, { id: "pose", bar: 12 }] };
  assert.match(checkTimeline(first, g, over).problems.join(), /At most 2 elements of your own/);
  assert.equal(checkTimeline(first, g, { track: 0, cues: [] }).ok, false);
});

test("jumps in the second half and cues on a phrase are noted, not refused", () => {
  const g = tracks[2], bars = barCount(g, finale.seconds);
  const t = spreadTimeline(finale, g, 2, finale.routine)!;
  const check = checkTimeline(finale, g, t);
  assert.ok(check.ok);
  assert.ok(check.notes.some(n => /second half/.test(n)), "the finale's second jump is late in the program");
  assert.ok(bars > g.barsPerPhrase);
});

test("nudging moves one cue and refuses to leave the music; crowding is the check's to report", () => {
  const g = tracks[0], t = spreadTimeline(first, g, 0, first.routine)!;
  assert.equal(nudge(first, g, t, 0, -1), null);
  const later = nudge(first, g, t, 0, 1)!;
  assert.equal(later.cues[0].bar, t.cues[0].bar + 1);
  const onto = nudge(first, g, t, 1, t.cues[2].bar - t.cues[1].bar)!;
  assert.equal(checkTimeline(first, g, onto).ok, false);
  assert.equal(nudge(first, g, t, 2, 1)!.cues[2].bar, barCount(g, first.seconds) - 1);
  assert.equal(nudge(first, g, t, 2, 2), null);
});

test("an added cue is the skater's own and can come out again; the event's cannot", () => {
  const g = tracks[1], base = spreadTimeline(first, g, 1, first.routine)!;
  // Pull the program in to make room at the end.
  const t: Timeline = { track: 1, cues: base.cues.map((c, i) => ({ ...c, bar: i * MIN_GAP_BARS })) };
  const added = addCue(first, g, t, "spiral")!;
  assert.ok(checkTimeline(first, g, added).ok);
  assert.deepEqual(requiredCues(first, added), [true, true, true, false]);
  assert.deepEqual(removeCue(first, added, 3)!.cues, t.cues);
  assert.equal(removeCue(first, added, 0), null);
  assert.equal(addCue(first, g, base, "spiral"), null, "no bar left after a spread program");
});

test("other music keeps each cue's moment to within half a bar", () => {
  const t = spreadTimeline(finale, tracks[0], 0, finale.routine)!;
  const moved = retime(finale, tracks[0], tracks[2], t, 2);
  assert.equal(moved.track, 2);
  for (let i = 0; i < t.cues.length; i++)
    assert.ok(Math.abs(barStart(tracks[2], moved.cues[i].bar) - barStart(tracks[0], t.cues[i].bar)) <= barSeconds(tracks[2]) / 2 + 1e-9);
});

test("an element reads early, on or late against its cue's bars", () => {
  const g = tracks[0], [cue] = cueTimes(g, { track: 0, cues: [{ id: "edge", bar: 4 }] });
  assert.equal(cue.at, barStart(g, 4));
  assert.equal(cueResult(cue, barStart(g, 4 - CUE_EARLY_BARS) - .01), "early");
  assert.equal(cueResult(cue, cue.at), "on");
  assert.equal(cueResult(cue, barStart(g, 4 + CUE_LATE_BARS)), "on");
  assert.equal(cueResult(cue, barStart(g, 4 + CUE_LATE_BARS) + .01), "late");
});

test("a program on its music runs to the end of its time and records each cue, without touching the medal", () => {
  const g = tracks[0], t = spreadTimeline(first, g, 0, first.routine)!;
  const c = new Choreography(first);
  assert.ok(c.setCues(cueTimes(g, t)));
  const s = createState(GAME_PARAMS, 4.5);
  c.sample(s, false, 3);               // glide, at 3 s: before bar 1's early window? bar 0 starts at the offset
  s.lean = .2; c.sample(s, false, 2);  // edge
  c.sample(s, true, 2);                // pose
  assert.ok(c.complete);
  assert.equal(c.done, false, "the music is still playing");
  assert.deepEqual(c.cueResults.map(r => r !== null), [true, true, true]);
  assert.equal(c.cueResults[2], "early", "the pose came long before its bar");
  s.lean = 0; c.sample(s, false, first.seconds);
  assert.ok(c.done);
  assert.equal(c.medal, 3, "timing is shown, not scored");
  const plain = new Choreography(first);
  plain.sample(s, false, 3); s.lean = .2; plain.sample(s, false, 2); plain.sample(s, true, 2);
  assert.ok(plain.done, "without music the program ends with its last element, as before");
});

test("cues that do not match the routine are refused", () => {
  const g = tracks[0], t = spreadTimeline(first, g, 0, ["edge", "glide", "pose"])!;
  assert.equal(new Choreography(first).setCues(cueTimes(g, t)), false);
});

test("the career keeps a timeline, uses its order as the plan, and drops it when the plan is edited without it", () => {
  const g = tracks[3], c = new CareerState();
  const t = spreadTimeline(first, g, 3, ["edge", "glide", "pose"])!;
  assert.ok(c.setTimeline(0, t, g));
  assert.deepEqual(c.plans[0], ["edge", "glide", "pose"]);
  const back = CareerState.restore(c.serialize());
  assert.deepEqual(back.timelines[0], t);
  assert.equal(c.setTimeline(0, { ...t, cues: t.cues.slice(1) }, g), false);
  assert.ok(c.setPlan(0, ["glide", "edge", "pose"]));
  assert.equal(c.timelines[0], null);
  // A save whose timeline no longer matches its plan keeps the plan and loses the timeline.
  const saved = JSON.parse(back.serialize());
  saved.plans[0] = ["glide", "edge", "pose"];
  assert.equal(CareerState.restore(JSON.stringify(saved)).timelines[0], null);
  assert.equal(parseTimeline({ track: 0, cues: [{ id: "nope", bar: 0 }] }), null);
});
