// game/motion/track.ts and the podium's clips (2026-11-14).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bakeTrack, trackPose, TRACK_FPS } from "../game/motion/track.ts";
import { CLIP_BY_ID } from "../game/motion/library.ts";
import { sample } from "../game/motion/types.ts";
import { podium, PODIUM_CLIPS } from "../game/podium.ts";
import { setupParams } from "../game/setups.ts";

test("a looping clip bakes one cycle; a one-shot clip bakes through its last key", () => {
  const wave = CLIP_BY_ID.get("podium.wave")!, medal = CLIP_BY_ID.get("podium.medal")!;
  const w = bakeTrack(wave), m = bakeTrack(medal);
  assert.equal(w.poses.length, Math.round(wave.duration * TRACK_FPS));
  assert.equal(m.poses.length, Math.round(medal.duration * TRACK_FPS) + 1);
  assert.deepEqual(w.poses[7], sample(wave, 7 / TRACK_FPS), "each frame is the clip's own sample");
  assert.deepEqual(m.poses.at(-1), sample(medal, medal.duration));
});

test("a track loops or holds its last frame", () => {
  const w = bakeTrack(CLIP_BY_ID.get("podium.wave")!), m = bakeTrack(CLIP_BY_ID.get("podium.medal")!);
  assert.deepEqual(trackPose(w, w.duration + 0.1), trackPose(w, 0.1));
  assert.deepEqual(trackPose(m, 99), m.poses.at(-1));
  assert.deepEqual(trackPose(m, -1), m.poses[0]);
});

test("every podium place plays a standing clip from the library", () => {
  for (const id of PODIUM_CLIPS) {
    const c = CLIP_BY_ID.get(id);
    assert.ok(c, id);
    assert.ok(sample(c!, 0).pelvis! > 0.85, `${id} stands`);
  }
  const rows = [1, 2, 3, 4].map(place => ({ place, name: `S${place}`, you: place === 3, score: 10 - place }));
  const p = podium(rows as never, setupParams("simulation"));
  assert.deepEqual(p.map(x => x.clip), [...PODIUM_CLIPS]);
});
