// game/cast.ts: every rival has a look, every look a full costume, and every model named is built.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { RIVALS } from "../game/rivals.ts";
import { RIVAL_LOOKS, SKIN_FIELDS, rivalLook } from "../game/cast.ts";

test("every rival has a look: a full costume, and a built model with a skater's height, or none yet", () => {
  for (const r of RIVALS) {
    const look = rivalLook(r.name);
    assert.ok(look, r.name);
    for (const f of SKIN_FIELDS) assert.notEqual(look.costume[f], undefined, `${r.name}: ${String(f)}`);
    for (const f of SKIN_FIELDS) if (typeof look.costume[f] === "string" && f !== "id" && f !== "name" && f !== "description") assert.match(look.costume[f] as string, /^#[0-9a-f]{6}$/, `${r.name}: ${String(f)}`);
    if (look.model === null) { assert.equal(look.height, null); continue; }
    assert.ok(existsSync(new URL(`../../../games/ice-run-godot/assets/generated/${look.model}.glb`, import.meta.url)), look.model);
    assert.ok(look.height! >= 1.45 && look.height! <= 1.75, `${r.name} ${look.height} m`);
  }
  assert.equal(Object.keys(RIVAL_LOOKS).length, RIVALS.length);
  assert.equal(rivalLook("Nobody"), null);
  // Who is built (2026-11-11): all but Lio Tarrant, whose part is an open question.
  assert.deepEqual(RIVALS.filter(r => rivalLook(r.name)!.model === null).map(r => r.name), ["Lio Tarrant"]);
});
