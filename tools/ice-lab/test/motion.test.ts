// game/motion: the library is complete, well-formed, physically placed, and every style's vocabulary exists.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CLIPS, CLIP_BY_ID, clipsIn, libraryIndex } from "../game/motion/library.ts";
import { FALLS, RECOVERIES, IMPACTS, chooseFall } from "../game/motion/falls.ts";
import { DANCE_STYLES, styleClipIds, styleFit, suggestStyles, choreograph } from "../game/motion/dance.ts";
import { sample, joints, lowestPoint, mirrorClip, onIce, SEGMENTS, DEFAULT_RIG } from "../game/motion/types.ts";
import type { Rig } from "../game/motion/types.ts";
import { FALL } from "../sim/types.ts";
import { STEP_TYPE as STEPS } from "../sim/stepLevel.ts";

test("the library holds what the owner asked for: 50+ falls, and plenty of expression, spin, leg and skate transitions", () => {
  assert.ok(FALLS.length >= 50, `${FALLS.length} falls`);
  assert.ok(clipsIn("expression").length >= 60, `${clipsIn("expression").length} expressions`);
  assert.ok(clipsIn("spin").length >= 50, `${clipsIn("spin").length} spin clips`);
  assert.ok(clipsIn("transition").length >= 50, `${clipsIn("transition").length} transitions`);
  assert.ok(clipsIn("leg").length >= 20, `${clipsIn("leg").length} free-leg lines`);
  assert.ok(RECOVERIES.length >= 6);
  assert.ok(DANCE_STYLES.length >= 15, `${DANCE_STYLES.length} dance styles`);
  assert.equal(new Set(CLIPS.map(c => c.id)).size, CLIPS.length, "ids are unique");
  assert.equal(libraryIndex().counts.total, CLIPS.length);
});

test("every clip is well-formed: keys in time, inside its length, every direction a real direction", () => {
  for (const c of CLIPS) {
    assert.ok(c.keys.length >= 1 && c.duration > 0, c.id);
    assert.ok(c.note.length > 15, `${c.id} says what it is`);
    for (let i = 1; i < c.keys.length; i++) assert.ok(c.keys[i].t > c.keys[i - 1].t, `${c.id} key ${i}`);
    assert.ok(c.keys[c.keys.length - 1].t <= c.duration + 1e-9, c.id);
    for (const k of c.keys) for (const [s, v] of Object.entries(k.pose.seg ?? {})) {
      assert.ok((SEGMENTS as readonly string[]).includes(s), `${c.id}: ${s}`);
      assert.ok(Math.hypot(...v) > 0.5 && v.every(Number.isFinite), `${c.id}: ${s} ${v}`);
    }
  }
});

const SMALL: Rig = { ...DEFAULT_RIG, thigh: 0.38, shin: 0.35, trunk: 0.41, upperArm: 0.27, forearm: 0.19 };
test("nothing goes through the ice: no clip, sampled through its length on two body sizes, sinks more than a few centimetres", () => {
  for (const c of CLIPS) for (const rig of [DEFAULT_RIG, SMALL]) for (let i = 0; i <= 8; i++) {
    const raw = sample(c, (c.duration * i) / 8);
    const pose = raw;
    if (pose.pelvis === undefined) continue; // a layer: the legs are whatever is skating
    // Pelvis heights are written for the default rig; a smaller body stands lower by its legs' difference.
    const scaled = { ...pose, pelvis: pose.pelvis - (DEFAULT_RIG.thigh + DEFAULT_RIG.shin - rig.thigh - rig.shin) * Math.min(1, pose.pelvis / 0.89) };
    const placed = onIce(scaled, rig);
    assert.ok(lowestPoint(placed, rig) > -0.12, `${c.id} at ${i}/8 on ${rig === SMALL ? "small" : "default"}: ${lowestPoint(placed, rig).toFixed(3)} m`);
  }
});

test("falls end on the ice and getting up ends standing", () => {
  for (const f of FALLS) {
    const end = sample(f, f.duration);
    if (f.tags.includes("touchdown") || f.tags.includes("knees") || f.tags.includes("knee")) assert.ok(end.pelvis! < 0.65, f.id);
    else assert.ok(end.pelvis! <= 0.2, `${f.id} ends down: ${end.pelvis}`);
    assert.ok(sample(f, 0).pelvis! > 0.8, `${f.id} starts on the blades`);
  }
  for (const r of RECOVERIES) assert.ok(sample(r, r.duration).pelvis! > 0.8, `${r.id} ends up`);
  // Each impact on both sides, with three arm reactions.
  assert.equal(FALLS.length, IMPACTS.length * 3 * 2);
});

test("a fall the sim reports gets a fitting clip, on its side, and the same fall always the same", () => {
  const side = chooseFall({ reason: FALL.LeanExceeded, side: -1, speed: 4, seed: 120 });
  assert.match(side.fall.id, /^fall\.(hip-slide\.[a-z]+\.left|edge-washout\.[a-z]+)$/, "her left side, or a straight wash-out");
  assert.equal(chooseFall({ reason: FALL.LeanExceeded, side: -1, speed: 4, seed: 120 }).fall.id, side.fall.id);
  assert.match(chooseFall({ reason: FALL.LeanExceeded, side: 1, speed: 4, seed: 120 }).fall.id, /\.(right|mirror)$/, "her right side, or a straight fall's twin");
  assert.match(chooseFall({ reason: FALL.Collision, side: 0, speed: 7, seed: 3 }).fall.id, /^fall\.boards\./);
  assert.match(chooseFall({ reason: FALL.Landing, side: 1, speed: 4, jump: true, seed: 9 }).fall.id, /^fall\.(landing-under|hip-slide)\./);
  assert.match(chooseFall({ reason: FALL.ToePickTrip, side: 0, speed: 7, seed: 5 }).fall.id, /^fall\.(belly-slide|toe-pitch)\./);
  assert.match(chooseFall({ reason: FALL.Landing, side: 1, speed: 2, spin: true, seed: 5 }).fall.id, /^fall\.(spin-out|turn-collapse)\./);
  // Different falls of the same kind vary.
  const seen = new Set(Array.from({ length: 40 }, (_, s) => chooseFall({ reason: FALL.LeanExceeded, side: 1, speed: 4, seed: s }).fall.id));
  assert.ok(seen.size >= 3, [...seen].join());
  for (const reason of Object.values(FALL)) for (const sd of [-1, 0, 1]) assert.ok(chooseFall({ reason, side: sd, speed: 5, seed: 1 }).recover);
});

test("the spin catalogue's reference poses all exist, and every spin has its clockwise twin", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/spin-positions.json", import.meta.url), "utf8"));
  for (const p of data.positions) {
    assert.ok(CLIP_BY_ID.get(p.reference_pose), `${p.id}: ${p.reference_pose}`);
    assert.ok(CLIP_BY_ID.get(`${p.reference_pose}.cw`), `${p.reference_pose}.cw`);
  }
  // A clockwise twin is the mirror: the free leg on the other side.
  const ccw = sample(CLIP_BY_ID.get("SP_Camel_Basic")!, 0), cw = sample(CLIP_BY_ID.get("SP_Camel_Basic.cw")!, 0);
  assert.deepEqual(cw.seg!.thighL, [-ccw.seg!.thighR![0], ccw.seg!.thighR![1], ccw.seg!.thighR![2]]);
});

test("a camel is level, a sit is low, an upright is tall: the shapes are what their names say", () => {
  const j = (id: string) => joints(sample(CLIP_BY_ID.get(id)!, 0));
  assert.ok(Math.abs(j("SP_Camel_Basic").chest[1] - j("SP_Camel_Basic").pelvis[1]) < 0.12, "camel trunk level");
  assert.ok(j("SP_Sit_Basic").pelvis[1] < 0.5, "sit low");
  assert.ok(j("SP_Upright_Basic").crown[1] > 1.4, "upright tall");
  assert.ok(j("SP_Upright_IPosition").toeR[1] > j("SP_Upright_IPosition").crown[1] - 0.2, "the I position's free blade by the head");
  assert.ok(j("move.spiral.forward").ankleR[1] > j("move.spiral.forward").hipR[1], "the spiral's free foot above the hip");
});

test("every dance style's vocabulary exists in the library, and its steps are steps the sim knows", () => {
  for (const s of DANCE_STYLES) {
    for (const id of styleClipIds(s)) assert.ok(CLIP_BY_ID.has(id), `${s.id}: ${id}`);
    for (const st of s.steps) assert.ok(st in STEPS, `${s.id}: step ${st}`);
    assert.ok(s.steps.length >= 2 && s.phrases.length >= 1 && s.freeLeg.length >= 2 && s.moves.length >= 2, s.id);
    assert.ok(s.tempo.min < s.tempo.max);
  }
});

test("music suggests its styles: a slow three-four to the classical and the waltz, a quick four-four to jazz and swing", () => {
  const slowWaltz = suggestStyles(84, 3).slice(0, 4).map(x => x.style.id);
  assert.ok(slowWaltz.includes("classical") || slowWaltz.includes("romantic"), slowWaltz.join());
  const viennese = suggestStyles(174, 3)[0].style.id;
  assert.equal(viennese, "waltz");
  const quick = suggestStyles(160, 4).slice(0, 4).map(x => x.style.id);
  assert.ok(quick.includes("jazz") || quick.includes("swing") || quick.includes("broadway"), quick.join());
  const tango = DANCE_STYLES.find(s => s.id === "tango")!;
  assert.ok(styleFit(tango, 64, 4) > styleFit(tango, 174, 3));
});

test("choreograph lays a style over the bars: opening first, ending last, on the music, the same every time", () => {
  for (const s of DANCE_STYLES) {
    const music = { bpm: (s.tempo.min + s.tempo.max) / 2, beatsPerBar: s.meter, offset: 0.4, bars: 40 };
    const cues = choreograph(s, music, 7);
    assert.deepEqual(choreograph(s, music, 7), cues, "deterministic");
    assert.equal(cues[0].clip, s.opening);
    assert.equal(cues.filter(c => c.layer === "arms").at(-1)!.clip, s.ending);
    const bar = (60 / music.bpm) * music.beatsPerBar;
    for (const c of cues) {
      assert.ok(CLIP_BY_ID.has(c.clip), `${s.id}: ${c.clip}`);
      assert.ok(Math.abs(c.at - (0.4 + c.bar * bar + c.beat * 60 / music.bpm)) < 1e-9, "on its bar and beat");
      assert.ok(c.bar >= 0 && c.bar < music.bars);
    }
    for (let i = 1; i < cues.length; i++) assert.ok(cues[i].at >= cues[i - 1].at);
    assert.ok(cues.some(c => c.layer === "leg") && cues.filter(c => c.layer === "arms").length >= 10, s.id);
  }
  assert.notDeepEqual(choreograph(DANCE_STYLES[0], { bpm: 90, beatsPerBar: 3, bars: 40 }, 1), choreograph(DANCE_STYLES[0], { bpm: 90, beatsPerBar: 3, bars: 40 }, 2), "seeds vary");
});

test("mirroring twice gives the clip back", () => {
  for (const c of CLIPS.slice(0, 60)) {
    const back = mirrorClip(mirrorClip(c, "a", "a"), c.id, c.name);
    assert.deepEqual(back.keys.map(k => k.pose), c.keys.map(k => k.pose), c.id);
  }
});

test("a straight fall's other-shoulder twin is a different fall, not the same one mirrored onto itself", () => {
  for (const f of FALLS.filter(c => c.id.endsWith(".mirror"))) {
    const base = CLIP_BY_ID.get(f.id.replace(/\.mirror$/, ""))!;
    const a = joints(sample(base, base.duration)), b = joints(sample(f, f.duration));
    const apart = Math.max(...(Object.keys(a) as (keyof typeof a)[]).map(k => Math.hypot(a[k][0] - b[k][0], a[k][2] - b[k][2])));
    assert.ok(apart > 0.1, `${f.id}: ${apart.toFixed(3)} m apart at most`);
  }
});
