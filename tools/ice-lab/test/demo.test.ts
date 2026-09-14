// demo.mjs: every scripted run records, replays tick for tick, and lands as measured.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { parseReplay, verifyReplay } from "../sim/replay.ts";

test("the demos write clips that verify, and the wind-up is the only difference between two of them", () => {
  const out = mkdtempSync(join(tmpdir(), "ice-demos-"));
  try {
    const cli = new URL("../demo.mjs", import.meta.url).pathname;
    const r = spawnSync(process.execPath, [cli, "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const clips = readdirSync(out).filter((f) => f.endsWith(".json")).sort();
    assert.deepEqual(clips, [
      "carve-figure.json", "double-flick-only-assisted.json", "toe-loop-manual.json",
      "toe-loop-wound.json", "toe-loop-wrong-way.json",
    ]);
    for (const f of clips) {
      assert.equal(verifyReplay(parseReplay(readFileSync(join(out, f), "utf8"))).divergence, null, f);
      assert.ok(readFileSync(join(out, f.replace(".json", ".txt")), "utf8").includes("result:"));
    }
    assert.match(r.stdout, /toe-loop-manual\s+3T {2}3\.041 rev/);
    assert.match(r.stdout, /toe-loop-wound\s+3T {2}3\.000 rev .* wound/);
    assert.match(r.stdout, /toe-loop-wrong-way\s+3T {2}3\.041 rev/);
    assert.match(r.stdout, /double-flick-only-assisted\s+2T {2}2\.000 rev .* wound/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
