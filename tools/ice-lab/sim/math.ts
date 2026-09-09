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

export const rotate = (a: Vec2, ang: number): Vec2 => {
  const c = Math.cos(ang), s = Math.sin(ang);
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
export const asinClamped = (x: number): number => Math.asin(clamp(x, -1, 1));

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
