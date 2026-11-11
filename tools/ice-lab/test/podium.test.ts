import { strict as assert } from "node:assert";
import { test } from "node:test";
import { podium, PODIUM_BLOCKS, PODIUM_AT } from "../game/podium.ts";
import { standings, BASELINE } from "../game/rivals.ts";
import { setupParams } from "../game/setups.ts";

test("the podium: the top three standing still on their blocks, gold in the middle, upright", () => {
  const rows = podium(standings(4, BASELINE[4] * 3), setupParams("simulation"));
  assert.deepEqual(rows.map(r => r.place), [1, 2, 3]);
  assert.equal(rows[0].name, "You", "three times the baseline wins");
  rows.forEach(r => {
    assert.equal(r.height, PODIUM_BLOCKS[r.place - 1].height);
    assert.deepEqual(r.state.pos, { x: PODIUM_AT.x + PODIUM_BLOCKS[r.place - 1].x, y: PODIUM_AT.y });
    assert.equal(r.state.fallen, false, `${r.name} stands`);
    assert.ok(Math.abs(r.state.lean) < 0.05, `${r.name} upright: lean ${r.state.lean}`);
    // Facing the camera on sim -y, skates and all.
    assert.ok(r.state.heading.y < -0.99, `${r.name} faces -y`);
    for (const b of r.state.blade) {
      assert.ok(Math.abs(b.tangent.x) < 0.2, `${r.name}'s blades turned with her`);
      assert.ok(Math.hypot(b.contact.x - r.state.pos.x, b.contact.y - r.state.pos.y) < 0.4, "under her");
    }
  });
});
