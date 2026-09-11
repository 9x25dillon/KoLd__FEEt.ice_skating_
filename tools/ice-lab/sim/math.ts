// tools/ice-lab/sim/math.ts — the deterministic math layer.
//
// Every transcendental the solver uses goes through here, for the reason
// ADR-EDGE-007 gives in the engineering package: when this model is ported to
// UE5 C++ the implementation has to be swappable for a bit-exact cross-platform
// library without touching solver code. Routing it through one module now means
// the port is a substitution rather than an audit.
//
// No DOM, no imports, no state. Everything here is a pure function so the whole
// simulation can run headlessly under `node --test`.

/** A point or vector in the ice plane. The rig is a vertical slice: z is the
 *  COM height and is carried on the body, not on a vector. */
export interface Vec2 { x: number; y: number }

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;

/**
 * Rotate 90 degrees toward the skater's LEFT.
 *
 * THIS IS THE FUNCTION THE EDGE NAMING HANGS ON, AND IT IS WHY IT IS NAMED
 * `perpLeft` RATHER THAN `right`. In a right-handed frame with +Z up, the 3-D
 * expression is n = Up x t, and for t = (1,0,0) that is (0,1,0) — which is +Y,
 * and +Y is to the LEFT of someone facing +X.
 *
 * The engineering package contains both readings: one half of it correctly
 * calls Up x t "to the skater's left", the other half calls the identical
 * expression "Right" and then derives every edge code from that. The two
 * disagree by a mirror, so one of them names an RFO where the other names an
 * RFI, and a takeoff-edge validator built on the wrong one would fail every
 * jump in data/jump-definitions.csv while looking self-consistent.
 *
 * Settled here, once, in the direction the geometry actually gives.
 */
export const perpLeft = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const normalizeOr = (a: Vec2, fallback: Vec2): Vec2 => {
  const l2 = a.x * a.x + a.y * a.y;
  if (l2 <= 1e-18) return fallback;
  const inv = 1 / Math.sqrt(l2);
  return { x: a.x * inv, y: a.y * inv };
};

// ── deterministic transcendentals ───────────────────────────────────────────
//
// ADR-EDGE-007 asked for the transcendentals to be swappable for a bit-exact
// library. This is that library, and it had to arrive before the C++ port did:
// the rig's first tester plays in Firefox, whose libm differs from V8's by an
// ulp here and there, and a one-ulp change to cos(0.65) at a first stroke was
// enough to make a Firefox recording diverge in Node at tick 1437. Everything a
// replay depends on was deterministic except these.
//
// They are fdlibm's algorithms (Sun, 1993; the same ones FreeBSD's libm and
// most JS engines descend from), written with nothing but + - * / and sqrt.
// Those five are correctly rounded by IEEE-754 in every engine and every C++
// compiler that does not contract to FMA, so the bits are the same everywhere.
// Accuracy is within an ulp or so of the platform's — test/math.test.ts
// measures it — which is all the solver needs; identical is what replay needs.
//
// Range reduction is Cody-Waite with pi/2 in three pieces, good to full
// precision while |x| < about 1.6e6 rad. The solver's angles are leans, tilts
// and headings, a few radians at most. Beyond that range the answers lose
// accuracy but stay deterministic, which is the property that matters here.
//
// No allocation: the reduction hands back its remainder through two module
// variables, because step() allocates nothing and these run inside it.

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

const PIO4 = 7.85398163397448278999e-01;
const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17;
const PI_HI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16;

/** sin on [-pi/4, pi/4], of x + y where y is the reduction's tail. */
function kSin(x: number, y: number): number {
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return y === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

/** cos on [-pi/4, pi/4], of x + y. */
function kCos(x: number, y: number): number {
  const z = x * x, w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z, q = 1 - hz;
  return q + (((1 - q) - hz) + (z * r - x * y));
}

let redHi = 0, redLo = 0;
/** x = n pi/2 + (redHi + redLo); returns n mod 4. */
function reduce(x: number): number {
  const fn = Math.round(x * INV_PIO2);
  let r = x - fn * PIO2_1, w = fn * PIO2_1T;
  let t = r;
  w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w);
  t = r;
  w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w);
  redHi = r - w;
  redLo = (r - redHi) - w;
  return (fn % 4 + 4) % 4;
}

/** Below 2^-27, sin and tan are x to the last bit — and -0 stays -0. */
const TINY = 7.450580596923828e-9;

export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < TINY) return x;
  if (Math.abs(x) <= PIO4) return kSin(x, 0);
  const n = reduce(x);
  if (n === 0) return kSin(redHi, redLo);
  if (n === 1) return kCos(redHi, redLo);
  if (n === 2) return -kSin(redHi, redLo);
  return -kCos(redHi, redLo);
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) <= PIO4) return kCos(x, 0);
  const n = reduce(x);
  if (n === 0) return kCos(redHi, redLo);
  if (n === 1) return -kSin(redHi, redLo);
  if (n === 2) return -kCos(redHi, redLo);
  return kSin(redHi, redLo);
}

export function tan(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) < TINY) return x;
  if (Math.abs(x) <= PIO4) return kSin(x, 0) / kCos(x, 0);
  const n = reduce(x);
  const s = kSin(redHi, redLo), c = kCos(redHi, redLo);
  return n % 2 === 0 ? s / c : -c / s;
}

const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01,
  9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17,
  1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT0 = 3.33333333333329318027e-01, AT1 = -1.99999999998764832476e-01;
const AT2 = 1.42857142725034663711e-01, AT3 = -1.11111104054623557880e-01;
const AT4 = 9.09088713343650656196e-02, AT5 = -7.69187620504482999495e-02;
const AT6 = 6.66107313738753120669e-02, AT7 = -5.83357013379057348645e-02;
const AT8 = 4.97687799461593236017e-02, AT9 = -3.65315727442169155270e-02;
const AT10 = 1.62858201153657823623e-02;

export function atan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = Math.abs(x);
  if (a >= 7.378697629483821e19) return neg ? -(ATAN_HI[3] + ATAN_LO[3]) : ATAN_HI[3] + ATAN_LO[3];
  if (a < 7.450580596923828e-9) return x;   // 2^-27: atan(x) is x to the last bit
  let id = -1;
  if (a < 0.4375) id = -1;
  else if (a < 0.6875) { id = 0; a = (2 * a - 1) / (2 + a); }
  else if (a < 1.1875) { id = 1; a = (a - 1) / (a + 1); }
  else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1 + 1.5 * a); }
  else { id = 3; a = -1 / a; }
  const z = a * a, w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) { const r = a - a * (s1 + s2); return neg ? -r : r; }
  const r = ATAN_HI[id] - ((a * (s1 + s2) - ATAN_LO[id]) - a);
  return neg ? -r : r;
}

/** Quadrant-correct atan(y / x), with the IEEE signed-zero and infinity cases. */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  const yNeg = y < 0 || (y === 0 && 1 / y < 0);
  const xNeg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) return xNeg ? (yNeg ? -PI_HI : PI_HI) : y;
  if (x === 0) return yNeg ? -PIO2_HI : PIO2_HI;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      const r = xNeg ? 3 * PIO4 : PIO4;
      return yNeg ? -r : r;
    }
    return xNeg ? (yNeg ? -PI_HI : PI_HI) : (yNeg ? -0 : 0);
  }
  if (y === Infinity || y === -Infinity) return yNeg ? -PIO2_HI : PIO2_HI;
  const z = atan(Math.abs(y / x));
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? (z - PI_LO) - PI_HI : PI_HI - (z - PI_LO);
}

const PIO4_HI = 7.85398163397448278999e-01;
const PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01;
const PS2 = 2.01212532134862925881e-01, PS3 = -4.00555345006794114027e-02;
const PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05;
const QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00;
const QS3 = -6.88283971605453293030e-01, QS4 = 7.70381505559019352791e-02;

// Big-endian by DataView's default on every platform, so word 0 is the high
// word whatever the machine is. A Float64Array alias would depend on it.
const BITS = new DataView(new ArrayBuffer(8));

export function asin(x: number): number {
  if (x !== x) return NaN;
  const a = Math.abs(x);
  if (a > 1) return NaN;
  if (a === 1) return x * PIO2_HI + x * PIO2_LO;
  if (a < 0.5) {
    if (a < 7.450580596923828e-9) return x;
    const t = x * x;
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    return x + x * (p / q);
  }
  const t = (1 - a) * 0.5;
  const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  const q = 1 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const s = Math.sqrt(t);
  let r: number;
  if (a >= 0.975) {
    r = PIO2_HI - (2 * (s + s * (p / q)) - PIO2_LO);
  } else {
    BITS.setFloat64(0, s); BITS.setUint32(4, 0);
    const w = BITS.getFloat64(0);
    const c = (t - w * w) / (s + w);
    const pp = 2 * s * (p / q) - (PIO2_LO - 2 * c);
    const qq = PIO4_HI - 2 * w;
    r = PIO4_HI - (pp - qq);
  }
  return x < 0 ? -r : r;
}

const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10;
const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01;
const LG3 = 2.857142874366239149e-01, LG4 = 2.222219843214978396e-01;
const LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01;
const LG7 = 1.479819860511658591e-01;

/** Natural log. Only the judges' noise uses it, but a replay re-scores too. */
export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; k = -54; }   // 2^54
  BITS.setFloat64(0, x);
  let hx = BITS.getUint32(0);
  k += (hx >>> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  BITS.setUint32(0, hx | (i ^ 0x3ff00000));   // m in [sqrt(2)/2, sqrt(2))
  k += i >>> 20;
  const f = BITS.getFloat64(0) - 1;
  const s = f / (2 + f), z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - ((hfsq - (s * (hfsq + t2 + t1) + k * LN2_LO)) - f);
}

export const rotate = (a: Vec2, ang: number): Vec2 => {
  const c = cos(ang), s = sin(ang);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const saturate = (x: number): number => clamp(x, 0, 1);

/** Hermite smoothstep, matching the one src/reference/SkateSolver.cpp assumes. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Zero returns zero, so a stationary blade picks no direction. */
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

export const wrapPi = (a: number): number => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

/** Signed smallest angle from `from` to `to`. */
export const deltaAngle = (from: number, to: number): number => wrapPi(to - from);

export const moveToward = (cur: number, target: number, maxDelta: number): number =>
  cur + clamp(target - cur, -maxDelta, maxDelta);

/** Asin that cannot return NaN on a value nudged past 1 by rounding. */
export const asinClamped = (x: number): number => asin(clamp(x, -1, 1));

// ── deterministic randomness ────────────────────────────────────────────────

/**
 * mulberry32 — seeded, so a session replays and a test can assert on it.
 * Carried over from SONIC DRIFTER (game/wave.ts), where it has eleven play
 * reports behind it.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── checksums ───────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Quantize by TRUNCATION, never rounding.
 *
 * Truncation of a float to an integer is exact in IEEE-754 and identical on
 * every target; rounding modes are not. This is what makes a checksum stream
 * comparable across machines even while the underlying libm is not.
 */
export const quantize = (x: number, scale: number): number => Math.trunc(x * scale) | 0;
