import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  BLADES, BOOT_COLOURS, BOOT_FINISHES, DEFAULT_SKATES, HEELS, LACES, SKATE_PRESETS, SKATES_CATALOG,
  cycleSkates, describeSkates, lookOf, parseSkates, skatesAreValid,
} from "../game/skates.ts";

test("the catalogue has real variety: 25+ combinations of parts and a dozen presets", () => {
  assert.ok(BOOT_COLOURS.length * BOOT_FINISHES.length * BLADES.length * LACES.length >= 25);
  assert.ok(SKATE_PRESETS.length >= 10);
  for (const name of ["Competition white", "Midnight black", "Tan to the tights", "Gold-plated blade"])
    assert.ok(SKATE_PRESETS.some(x => x.name === name), name);
});

test("ids are unique inside each list, colours are hex and numbers are in range", () => {
  for (const list of [BOOT_COLOURS, BOOT_FINISHES, BLADES, LACES, HEELS, SKATE_PRESETS])
    assert.equal(new Set(list.map(x => x.id)).size, list.length);
  for (const x of [...BOOT_COLOURS, ...BLADES, ...LACES]) assert.match(x.hex, /^#[0-9a-f]{6}$/);
  for (const f of BOOT_FINISHES) { assert.ok(f.roughness >= 0 && f.roughness <= 1); assert.ok(f.clearcoat >= 0 && f.clearcoat <= 1); }
  for (const b of BLADES) { assert.ok(b.metallic >= 0 && b.metallic <= 1 && b.roughness >= 0 && b.roughness <= 1); }
});

test("every preset is a valid choice, and its look carries its name", () => {
  for (const preset of SKATE_PRESETS) {
    assert.ok(skatesAreValid(preset.choice), preset.id);
    assert.equal(lookOf(preset.choice).name, preset.name);
    assert.deepEqual(parseSkates(preset.id), preset.choice);
  }
});

test("anything unknown is today's look: white leather boots on a chrome blade", () => {
  for (const bad of [undefined, null, 7, "nope", {}, { ...DEFAULT_SKATES, blade: "diamond" }, { ...DEFAULT_SKATES, boot: 3 }, []])
    assert.deepEqual(parseSkates(bad), DEFAULT_SKATES);
  const look = lookOf("nope");
  assert.ok(look.boot.native && look.blade.native && look.laces.native && look.heel.native, "the default repaints nothing");
  assert.equal(look.name, "Competition white");
});

test("a part is native only when it matches the model's own", () => {
  const look = lookOf({ ...DEFAULT_SKATES, boot: "black" });
  assert.equal(look.boot.native, false); assert.equal(look.blade.native, true);
  assert.equal(lookOf({ ...DEFAULT_SKATES, finish: "patent" }).boot.native, false);
  assert.equal(lookOf({ ...DEFAULT_SKATES, laces: "red" }).laces.native, false);
  const gold = lookOf("gold");
  assert.equal(gold.blade.hex, "#d9ac3c"); assert.equal(gold.blade.metallic, 1);
});

test("the heel can match the boot", () => {
  const look = lookOf("tights");
  assert.equal(look.heel.hex, look.boot.hex);
  assert.equal(look.heel.native, false);
});

test("a custom mix is named as such and described by its parts", () => {
  const mine = { boot: "lilac", finish: "matte", blade: "bronze", laces: "lime", heel: "gold" };
  const look = lookOf(mine);
  assert.equal(look.name, "Your own skates");
  assert.equal(look.description, describeSkates(parseSkates(mine)));
  assert.match(look.description, /Lilac matte/);
});

test("lookOf is pure and serialises: a save round-trips", () => {
  const a = lookOf("midnight"), b = lookOf(JSON.parse(JSON.stringify(SKATE_PRESETS[1].choice)));
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test("cycling wraps around a list in both directions", () => {
  assert.equal(cycleSkates(DEFAULT_SKATES, "boot", -1).boot, BOOT_COLOURS.at(-1)!.id);
  assert.equal(cycleSkates({ ...DEFAULT_SKATES, boot: BOOT_COLOURS.at(-1)!.id }, "boot", 1).boot, BOOT_COLOURS[0].id);
  assert.equal(cycleSkates(DEFAULT_SKATES, "blade", 1).blade, BLADES[1].id);
});

test("skates are cosmetic: the module reaches nothing in the simulation", () => {
  const source = readFileSync(new URL("../game/skates.ts", import.meta.url), "utf8");
  assert.equal(/from\s+["'][^"']*(sim|params|physics)/.test(source), false);
  assert.equal(/import\s/.test(source), false, "no imports at all");
  assert.equal(SKATES_CATALOG.presets.length, SKATE_PRESETS.length);
});
