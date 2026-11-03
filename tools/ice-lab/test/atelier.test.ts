import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CLOTH, CRYSTALS, FABRICS, MAX_DESIGNS, NAME_LIMIT, PARTS, Wardrobe, cyclePart, darker, describeDesign,
  designFromPreset, designSkin, lighter, parseDesign,
} from "../game/atelier.ts";
import { SKINS } from "../game/appearance.ts";

const base = designFromPreset(SKINS[3]);

test("a preset starts a design on the nearest swatches, in satin with no crystals", () => {
  assert.equal(base.name, "My Northlight");
  assert.equal(base.bodice, "midnight", "Northlight's bodice is a swatch exactly");
  assert.equal(base.fabric, "satin");
  assert.equal(base.crystals, "none");
  assert.equal(base.bun, SKINS[3].bun);
  for (const preset of SKINS) assert.ok(parseDesign(designFromPreset(preset)), preset.id);
});

test("a dressed design has every field a preset has, so any renderer can wear it", () => {
  const skin = designSkin(base, 1);
  for (const key of Object.keys(SKINS[0])) assert.ok(key in skin, key);
  assert.equal(skin.id, "design-1");
  assert.equal(skin.bodice, "#17364f");
  assert.equal(skin.highlight, lighter("#17364f"));
  assert.equal(skin.skirtShade, darker(skin.skirt));
  assert.equal(skin.crystals, 0);
  assert.equal(skin.custom, true);
  for (const key of ["bodice", "highlight", "trim", "sleeve", "sleeveShade", "skirt", "skirtShade", "tights", "tightsShade", "hair", "skin"] as const)
    assert.match(skin[key], /^#[0-9a-f]{6}$/, key);
});

test("only listed swatches, fabrics and crystals are accepted; names are trimmed and capped", () => {
  assert.equal(parseDesign({ ...base, bodice: "#ff00ff" }), null, "no free colour");
  assert.equal(parseDesign({ ...base, fabric: "leather" }), null);
  assert.equal(parseDesign({ ...base, crystals: "lots" }), null);
  assert.equal(parseDesign({ ...base, name: "   " }), null);
  assert.equal(parseDesign({ ...base, bun: "yes" }), null);
  assert.equal(parseDesign({ ...base, name: "x".repeat(40) })!.name.length, NAME_LIMIT);
  assert.equal(parseDesign(null), null);
});

test("cycling a part walks its own list and wraps both ways", () => {
  const next = cyclePart(base, "bodice", 1);
  assert.equal(next.bodice, CLOTH[1].id);
  assert.equal(cyclePart(base, "bodice", -1).bodice, CLOTH.at(-1)!.id);
  assert.equal(base.bodice, "midnight", "the original is untouched");
  for (const part of PARTS) {
    let d = base;
    for (let i = 0; i < part.swatches.length; i++) d = cyclePart(d, part.id, 1);
    assert.equal(d[part.id], base[part.id], part.id);
  }
});

test("the description names cloth, skirt, hair and crystals", () => {
  assert.equal(describeDesign(base), "Midnight satin · midnight skirt · bun");
  const sparkly = { ...base, fabric: "velvet" as const, crystals: "full" as const, bun: false };
  assert.equal(describeDesign(sparkly), "Midnight velvet · midnight skirt · ponytail · full crystals");
  assert.equal(designSkin(sparkly, 0).crystals, CRYSTALS.at(-1)!.density);
  assert.equal(FABRICS[0].id, "satin", "satin first: what every preset already wears");
});

test("the wardrobe keeps three designs and survives a broken save", () => {
  const w = new Wardrobe();
  assert.ok(w.set(0, base));
  assert.equal(w.set(MAX_DESIGNS, base), false);
  assert.equal(w.set(1, { ...base, hair: "green" }), false);
  const back = Wardrobe.restore(w.serialize());
  assert.deepEqual(back.designs[0], base);
  assert.equal(back.designs[1], null);
  assert.deepEqual(back.skins().map(s => s?.id ?? null), ["design-0", null, null]);
  assert.deepEqual(Wardrobe.restore("{broken").designs, [null, null, null]);
  const bad = JSON.parse(w.serialize()); bad.designs[0].bodice = "#123456";
  assert.equal(Wardrobe.restore(JSON.stringify(bad)).designs[0], null, "a bad design is dropped, not the wardrobe");
});

test("the native skater indexes fabrics in this module's order", async () => {
  const { readFileSync } = await import("node:fs");
  const gd = readFileSync(new URL("../../../games/ice-run-godot/scripts/skater.gd", import.meta.url), "utf8");
  const listed = /const FABRICS := \[([^\]]*)\]/.exec(gd)![1].split(",").map(x => x.trim().replace(/"/g, ""));
  assert.deepEqual(listed, FABRICS.map(f => f.id));
});
