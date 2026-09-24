// The fore-aft pendulum's fingerprint (test/pitch-gain-sweep.ts), pinned at
// the default ankle gain. pitchGain is global: it moves the contact's lag and
// counter-movement under every lean, the dig, and through them the toe pick
// and the Experimental stroke — so any change to it, or to the pendulum,
// should fail here first. If it does, rerun the whole pendulum suite
// (pitch, toepick, dig, setups) and `node test/pitch-gain-sweep.ts`, and
// record the new row in docs/open-constants.md under pitchMode.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DEFAULT_PARAMS } from "../sim/params.ts";
import { fingerprint } from "./pitch-gain-sweep.ts";
import type { Fingerprint } from "./pitch-gain-sweep.ts";

// MEASURED 2026-09-24, pitchGain 1 (the sweep's row).
const PINNED: Fingerprint = {
  counter: 0.126, arrive: 1.300, windLate: -0.207, digLate: 0,
  windEarly: 1.005, digEarly: 5.085, plowLeanBack: -0.069, caughtDown: 0.392,
};
const TOL = 0.005;
const moved = (f: Fingerprint) => (Object.keys(PINNED) as (keyof Fingerprint)[])
  .filter(k => !(Math.abs(f[k] - PINNED[k]) < TOL));

test("the pendulum's fingerprint at the default ankle gain", () => {
  assert.equal(DEFAULT_PARAMS.pitchGain, 1);
  const f = fingerprint(DEFAULT_PARAMS.pitchGain);
  assert.deepEqual(moved(f), [], JSON.stringify(f));
});

test("the fingerprint notices a gain change: doubled, the lag, the counter-movement and the late dig all move", () => {
  // MEASURED at pitchGain 2: counter 0.000, arrive 0.742 s, late winding
  // -0.168, late dig L 0.52; the stops do not move with the gain.
  const m = moved(fingerprint(2));
  for (const k of ["counter", "arrive", "windLate", "digLate"] as const) assert.ok(m.includes(k), `${k} (moved: ${m.join(", ")})`);
});
