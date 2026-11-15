import assert from "node:assert/strict";
import { test } from "node:test";
import { COLLECTIONS, SKINS } from "../game/appearance.ts";
import { CLOTH, HAIR, SKIN_TONES, TIGHTS, TRIM, FABRICS } from "../game/atelier.ts";

const HEX = /^#[0-9a-f]{6}$/;
const COLOUR_FIELDS = ["bodice", "highlight", "trim", "sleeve", "sleeveShade", "skirt", "skirtShade", "tights", "tightsShade", "hair", "skin"] as const;
const channel = (c: number) => (c /= 255) <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return .2126 * channel(n >> 16) + .7152 * channel((n >> 8) & 255) + .0722 * channel(n & 255);
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test("the original four come first, in order (saves store ids)", () => {
  assert.deepEqual(SKINS.slice(0, 4).map(s => s.id), ["violet", "aurora", "solstice", "northlight"]);
  assert.equal(SKINS[3].bodice, "#17364f");
});

test("there are at least 24 presets, with unique ids and names", () => {
  assert.ok(SKINS.length >= 24);
  assert.equal(new Set(SKINS.map(s => s.id)).size, SKINS.length);
  assert.equal(new Set(SKINS.map(s => s.name)).size, SKINS.length);
  for (const s of SKINS) { assert.match(s.id, /^[a-z]+$/); assert.ok(s.description.length > 8, s.id); }
});

test("every preset carries every field, every colour a valid hex", () => {
  const keys = Object.keys(SKINS[0]).sort();
  for (const s of SKINS) {
    assert.deepEqual(Object.keys(s).sort(), keys, s.id);
    for (const f of COLOUR_FIELDS) assert.match(s[f], HEX, `${s.id}.${f}`);
    assert.equal(typeof s.bun, "boolean");
  }
});

test("trim stays readable against the bodice", () => {
  for (const s of SKINS) assert.ok(contrast(s.bodice, s.trim) >= 2.5, `${s.id}: ${contrast(s.bodice, s.trim).toFixed(2)}`);
});

test("collections are listed, non-empty, and every preset is in one", () => {
  for (const c of COLLECTIONS) assert.ok(SKINS.some(s => s.collection === c), c);
  for (const s of SKINS) assert.ok((COLLECTIONS as readonly string[]).includes(s.collection), s.id);
  assert.equal(SKINS.filter(s => s.collection === "Signature").length, 4);
});

test("the presets vary: skin tones, hair and buns", () => {
  assert.ok(new Set(SKINS.map(s => s.skin)).size >= 6);
  assert.ok(new Set(SKINS.map(s => s.hair)).size >= 8);
  assert.ok(SKINS.some(s => s.bun) && SKINS.some(s => !s.bun));
});

test("atelier swatches stay unique per list and valid", () => {
  for (const list of [CLOTH, TRIM, TIGHTS, HAIR, SKIN_TONES]) {
    assert.equal(new Set(list.map(s => s.id)).size, list.length);
    for (const s of list) assert.match(s.hex, HEX, s.id);
  }
  assert.ok(FABRICS.length >= 5);
});
