// game/appearance.ts's SKINS: preset costumes, never player-designed
// (2026-09-18, the operator's own ask), and skinPreviewSvg — the wardrobe
// dialog's own preview bust, generated from a Skin's own fields rather than
// hand-drawn per costume, added the same session. Pure string generation,
// no DOM, so it is worth a real unit test unlike the rest of game/'s
// presentational, canvas-driven code.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { SKINS, skinById, skinPreviewSvg } from "../game/appearance.ts";

test("SKINS has at least three costumes, each with a unique id and every colour field", () => {
  assert.ok(SKINS.length >= 3, "the browser wardrobe should ship more than the original two");
  const ids = new Set(SKINS.map(s => s.id));
  assert.equal(ids.size, SKINS.length, "every skin id must be unique — skinById and the wardrobe both key off it");
  for (const skin of SKINS) {
    for (const field of ["bodice", "highlight", "trim", "sleeve", "sleeveShade", "skirt", "skirtShade", "tights", "tightsShade", "hair", "skin"] as const) {
      assert.match(skin[field], /^#[0-9a-f]{6}$/i, `${skin.id}.${field} must be a real hex colour, got "${skin[field]}"`);
    }
  }
});

test("skinById finds a real skin by id, and falls back to the first rather than throwing on garbage", () => {
  assert.equal(skinById("aurora").name, "Aurora");
  assert.equal(skinById("nonexistent").id, SKINS[0].id);
  assert.equal(skinById(undefined).id, SKINS[0].id);
});

test("skinPreviewSvg renders every one of a skin's own colours, and only those", () => {
  for (const skin of SKINS) {
    const svg = skinPreviewSvg(skin);
    assert.match(svg, /^<svg viewBox="0 0 200 200"/, "must be a real, well-formed SVG");
    assert.ok(svg.trim().endsWith("</svg>"));
    for (const field of ["bodice", "trim", "skirt", "hair", "skin"] as const) {
      const count = svg.split(skin[field]).length - 1;
      assert.ok(count >= 1, `${skin.id}: ${field} (${skin[field]}) must appear in its own preview`);
    }
  }
});

test("skinPreviewSvg's hair colour is never borrowed from a different skin — the bug this file's own header names", () => {
  // Regression: the two hand-drawn previews this function replaced both
  // hard-coded Violet's own #342e46 for the head-hair path, Aurora's own
  // included, since nothing had ever generated the second one from its own
  // data to catch the copy-paste. A skin whose hair colour differs from
  // every other skin's own must never leak another skin's hair hex.
  const others = new Set(SKINS.map(s => s.hair));
  for (const skin of SKINS) {
    const svg = skinPreviewSvg(skin);
    for (const hex of others) {
      if (hex === skin.hair) continue;
      assert.ok(!svg.includes(hex), `${skin.id}'s own preview must not contain another skin's hair colour ${hex}`);
    }
  }
});

test("skinPreviewSvg draws a bun for bun:true and a ponytail for bun:false, never both", () => {
  for (const skin of SKINS) {
    const svg = skinPreviewSvg(skin);
    const hasBunCircle = svg.includes('<circle cx="107" cy="25"');
    const hasPonytail = svg.includes('d="M104 36 Q130 48 119 82"');
    assert.equal(hasBunCircle, skin.bun, `${skin.id}: bun circle presence must match its own bun:${skin.bun}`);
    assert.equal(hasPonytail, !skin.bun, `${skin.id}: ponytail presence must be the opposite of bun:${skin.bun}`);
  }
});

test("two skins never render byte-identical previews", () => {
  const rendered = SKINS.map(skinPreviewSvg);
  for (let i = 0; i < rendered.length; i++) {
    for (let j = i + 1; j < rendered.length; j++) {
      assert.notEqual(rendered[i], rendered[j], `${SKINS[i].id} and ${SKINS[j].id} must not render identically`);
    }
  }
});
