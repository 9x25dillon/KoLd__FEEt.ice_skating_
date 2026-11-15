// The forward-takeoff validation cases carry the script test/axel-case-scripts.ts
// derives from test/entries.test.ts's axel entry. A solver change that moves the
// entry (where the frame flips, so where the mirrored stick changes sign) makes
// a case's script stale; rederive it with `node test/axel-case-scripts.ts --write`
// and say why in the commit. The verdicts are the validator's, not this file's.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkCases } from "./axel-case-scripts.ts";

test("each forward-takeoff case's script is the one its entry derives", () => {
  for (const { id, state } of checkCases(false)) assert.equal(state, "current", `${id}: rerun node test/axel-case-scripts.ts --write`);
});
