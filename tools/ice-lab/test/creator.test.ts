// game/creator.ts and its career: a created skater is shaped, saved and skated without breaking the season's balance.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ORIGINS, originById, ORIGIN_STYLE_MASTERY, SHAPED_OVERALL } from "../game/backstories.ts";
import { sheetFrom, tradePoint, tradeBlock, parseSheet, sheetOverall, sheetProfile, Studio, MAX_SKATERS, creatorCatalog } from "../game/creator.ts";
import { CareerState, EVENT_FLOORS } from "../game/career.ts";
import { STYLES } from "../game/styles.ts";
import { STAT_NAMES, validateProfile } from "../sim/profile.ts";

const gymnast = () => ({ ...sheetFrom(originById("gymnast")!, "Wren"), heightM: 1.55 });

test("a sheet from every origin parses, bakes and validates", () => {
  for (const o of ORIGINS) {
    const s = sheetFrom(o, "Test");
    assert.deepEqual(parseSheet(s), s, o.id);
    assert.deepEqual(validateProfile(sheetProfile(s)), [], o.id);
  }
});

test("points trade one for one, inside the stat bounds and the overall band", () => {
  let s = gymnast();
  const sum = (x: typeof s) => STAT_NAMES.reduce((a, n) => a + x.stats[n], 0);
  const before = sum(s);
  s = tradePoint(s, "stamina", "strength");
  assert.equal(s.stats.stamina, 44); assert.equal(s.stats.strength, 51); assert.equal(sum(s), before);
  // Spring is at the ceiling of 60 after two; a third is refused, and the sheet comes back unchanged.
  s = tradePoint(tradePoint(s, "strength", "spring"), "strength", "spring");
  assert.equal(s.stats.spring, 60);
  assert.match(tradeBlock(s, "strength", "spring"), /ceiling/);
  assert.equal(tradePoint(s, "strength", "spring"), s);
  // Edges carry the most weight in overall: moving many off them runs into the band's floor.
  let t = sheetFrom(originById("late-starter")!, "Level");
  let moved = 0;
  while (!tradeBlock(t, "edgeControl", "stamina")) { t = tradePoint(t, "edgeControl", "stamina"); moved++; }
  assert.ok(moved > 0 && moved < 10, `moved ${moved}`);
  assert.match(tradeBlock(t, "edgeControl", "stamina"), /under/);
  assert.ok(sheetOverall(t) >= SHAPED_OVERALL.min);
  assert.match(tradeBlock(t, "spring", "spring"), /different/);
});

test("parseSheet refuses anything off a list or a bound, and trims a name", () => {
  const s = gymnast();
  assert.equal(parseSheet({ ...s, name: "  Wren  " })!.name, "Wren");
  assert.equal(parseSheet({ ...s, name: "" }), null);
  assert.equal(parseSheet({ ...s, origin: "astronaut" }), null);
  assert.equal(parseSheet({ ...s, heightM: 2 }), null);
  assert.equal(parseSheet({ ...s, build: "huge" }), null);
  assert.equal(parseSheet({ ...s, stats: { ...s.stats, spring: 61 } }), null);
  assert.equal(parseSheet({ ...s, stats: { ...s.stats, spring: 60, edgeControl: 60, balance: 60 } }), null, "overall above the band");
  assert.equal(parseSheet({ ...s, style: 9 }), null);
  assert.equal(parseSheet({ ...s, dance: "moonwalk" }), null);
  assert.equal(parseSheet({ ...s, costume: "preset:nope" }), null);
  assert.equal(parseSheet({ ...s, costume: "design:99" }), null);
  assert.ok(parseSheet({ ...s, costume: "design:0" }));
  assert.equal(parseSheet(null), null);
});

test("a career from a sheet: its stats and body, its origin's style a week drilled, and the same first gates", () => {
  const s = gymnast();
  const c = CareerState.fromSheet(s);
  assert.deepEqual(c.profile.stats, s.stats);
  assert.equal(c.profile.heightM, 1.55);
  assert.equal(c.profile.name, "Wren");
  const power = STYLES.findIndex(x => x.id === "power");
  assert.equal(c.style, power);
  assert.equal(c.customNudge, power);
  assert.equal(c.styleMastery[power], ORIGIN_STYLE_MASTERY);
  // Club debut asks every new skater for training, created or not.
  assert.ok(c.statCap < 1 && new CareerState().statCap < 1, `floor ${EVENT_FLOORS[1]}`);
  // The late starter takes up no style.
  assert.equal(CareerState.fromSheet(sheetFrom(originById("late-starter")!, "L")).style, -1);
});

test("a created career survives a save, and a stat under 50 is only allowed with a sheet", () => {
  const c = CareerState.fromSheet(gymnast());
  c.profile = { ...c.profile, xp: 120 };
  const back = CareerState.restore(c.serialize());
  assert.deepEqual(back.skater, c.skater);
  assert.deepEqual(back.profile.stats, c.profile.stats);
  assert.equal(back.profile.heightM, 1.55);
  assert.equal(back.profile.xp, 120);
  assert.equal(back.style, c.style);
  // Without its sheet the same stats are a tampered save: a fresh career, as before.
  const bare = JSON.parse(c.serialize()); bare.skater = null;
  assert.equal(CareerState.restore(JSON.stringify(bare)).profile.stats.edgeControl, 50);
  // A broken sheet is a broken save.
  const broken = JSON.parse(c.serialize()); broken.skater.origin = "x";
  assert.equal(CareerState.restore(JSON.stringify(broken)).skater, null);
  // A save from before created skaters has none and keeps its career.
  const old = JSON.parse(new CareerState().serialize()); delete old.skater; old.xp = 77;
  const kept = CareerState.restore(JSON.stringify(old));
  assert.equal(kept.skater, null); assert.equal(kept.profile.xp, 77); assert.equal(kept.profile.name, "Career skater");
});

test("the studio keeps skaters, programs and dances, and drops only what is broken", () => {
  const st = new Studio(3);
  assert.ok(st.setSkater(0, gymnast()));
  assert.ok(!st.setSkater(MAX_SKATERS, gymnast()));
  assert.ok(st.setProgram(1, { name: "Signature", elements: ["glide", "jump", "spin", "pose"] }));
  assert.ok(!st.setProgram(2, { name: "Bad", elements: ["glide", "teleport"] }));
  assert.ok(st.setDance(0, { name: "Tango night", style: "tango", track: 2, seed: 7 }));
  assert.ok(!st.setDance(1, { name: "Off the end", style: "tango", track: 3, seed: 7 }));
  const saved = JSON.parse(st.serialize());
  saved.programs[3] = { name: "Corrupt", elements: [] };
  const back = Studio.restore(JSON.stringify(saved), 3);
  assert.deepEqual(back.skaters[0], st.skaters[0]);
  assert.deepEqual(back.programs[1], st.programs[1]);
  assert.equal(back.programs[3], null);
  assert.deepEqual(back.dances[0], st.dances[0]);
  assert.ok(back.clear("programs", 1)); assert.equal(back.programs[1], null);
  assert.deepEqual(Studio.restore("not json").skaters, Array(MAX_SKATERS).fill(null));
  assert.equal(creatorCatalog().origins.length, ORIGINS.length);
});

// ── A build's body (2026-11-14) ────────────────────────────────────────────────
import { buildModel } from "../game/creator.ts";
import { BUILDS as BUILD_LIST } from "../game/backstories.ts";
import { existsSync } from "node:fs";

test("every build names a body that is built, or the athlete", () => {
  assert.equal(buildModel("athletic"), null, "Athletic is the athlete herself");
  for (const b of BUILD_LIST) {
    const m = buildModel(b.id);
    if (m) assert.ok(existsSync(new URL(`../../../games/ice-run-godot/assets/generated/${m}.glb`, import.meta.url)), `${b.id}: ${m}.glb`);
  }
  assert.notEqual(buildModel("light"), buildModel("strong"));
});
