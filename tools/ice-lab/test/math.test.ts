// The deterministic transcendentals — ADR-EDGE-007, delivered.
//
// Two different properties, tested separately because they fail differently.
// ACCURACY is about physics: within an ulp or two of the platform's libm, the
// solver cannot tell the difference (replayed through both, a 4,742-tick play
// clip's positions agree to 6.5e-12 m). IDENTITY is about replay: the bits must
// be the same in every engine, and the only way a test can hold that is to pin
// them. The golden checksum below was computed in Node and reproduced in
// headless Firefox 155, the engine whose recordings used to diverge.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { sin, cos, tan, asin, atan, atan2, log, crc32 } from "../sim/math.ts";

const bits = new DataView(new ArrayBuffer(16));
function ulps(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  if (a !== a || b !== b) return Infinity;
  bits.setFloat64(0, a); bits.setFloat64(8, b);
  const x = bits.getBigInt64(0), y = bits.getBigInt64(8);
  const fx = x < 0n ? -(x & 0x7fffffffffffffffn) : x;
  const fy = y < 0n ? -(y & 0x7fffffffffffffffn) : y;
  return Number(fx > fy ? fx - fy : fy - fx);
}

function worst(f: (x: number) => number, g: (x: number) => number, lo: number, hi: number, n = 50000): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * (i + 0.5)) / n;
    w = Math.max(w, ulps(f(x), g(x)));
  }
  return w;
}

test("within an ulp of the platform over the solver's range, tan within two", () => {
  // Measured over 400,000 samples each before these bounds were written.
  assert.ok(worst(sin, Math.sin, -20, 20) <= 1, "sin");
  assert.ok(worst(sin, Math.sin, -1e5, 1e5) <= 1, "sin, far from zero");
  assert.ok(worst(cos, Math.cos, -20, 20) <= 1, "cos");
  assert.ok(worst(tan, Math.tan, -1.5, 1.5) <= 2, "tan is a quotient of two kernels");
  assert.ok(worst(asin, Math.asin, -1, 1) <= 1, "asin");
  assert.ok(worst(atan, Math.atan, -30, 30) <= 1, "atan");
  assert.ok(worst((y) => atan2(y, 9.81), (y) => Math.atan2(y, 9.81), -60, 60) <= 1,
    "atan2 as equilibriumLean calls it");
  assert.ok(worst((x) => atan2(Math.sin(7 * x), x), (x) => Math.atan2(Math.sin(7 * x), x), -3, 3) <= 1,
    "atan2 in every quadrant");
  assert.ok(worst(log, Math.log, 1e-12, 10) <= 1, "log");
});

test("the special cases are IEEE's, signed zeros included", () => {
  for (const [y, x] of [[0, 1], [-0, 1], [0, -1], [-0, -1], [0, 0], [-0, 0], [0, -0], [-0, -0],
    [1, 0], [-1, 0], [1, -Infinity], [-1, Infinity], [Infinity, Infinity], [-Infinity, -Infinity],
    [Infinity, -3], [NaN, 1]]) {
    assert.ok(Object.is(atan2(y, x), Math.atan2(y, x)), `atan2(${y}, ${x})`);
  }
  assert.equal(asin(1), Math.PI / 2);
  assert.equal(asin(-1), -Math.PI / 2);
  assert.ok(Number.isNaN(asin(1 + 1e-15)), "asinClamped exists so the solver never asks");
  assert.ok(Object.is(sin(-0), -0));
  assert.equal(cos(0), 1);
  assert.equal(log(1), 0);
  assert.equal(log(0), -Infinity);
  assert.ok(Number.isNaN(log(-1)));
  assert.equal(log(5e-324), Math.log(5e-324), "subnormals are rescaled, not lost");
  assert.ok(Number.isNaN(sin(Infinity)) && Number.isNaN(cos(NaN)));
});

test("the bits are pinned: this checksum is the same in every engine", () => {
  // If this moves, every replay digest moves with it. That is a REPLAY_SOLVER
  // bump and a re-recorded fixture (sim/replay.ts), never an updated constant.
  const n = 4096, buf = new DataView(new ArrayBuffer(n * 8 * 6));
  for (let i = 0; i < n; i++) {
    const x = -40 + i * 0.019541, u = -1 + (2 * i) / (n - 1);
    const v = [sin(x), cos(x), tan(x * 0.03), asin(u), atan2(x, 9.81 - i * 0.004), log(0.001 + i * 0.37)];
    for (let k = 0; k < 6; k++) buf.setFloat64((i * 6 + k) * 8, v[k]);
  }
  assert.equal(crc32(new Uint8Array(buf.buffer)), 0x4dfe1b90);
});
