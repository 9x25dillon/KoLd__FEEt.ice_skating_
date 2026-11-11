// game/motion/types.ts — the motion library's pose and clip, and the forward kinematics that read them.
//
// The owner, 2026-11-11: "50+ different fall animations and dance expression, spinning and leg and
// skate transitions ... a dancing styles for choreographing routines." This is the format every one
// of those is written in, so any client (scripts/skater.gd, the Unreal AIceSkater, a Blender render)
// can play it on any model.
//
// A POSE is where each body segment points, not a joint angle: the pelvis's height and its
// right-hand and up axes, then a direction for the trunk, the head, and each upper arm, forearm,
// thigh, shin and foot. Directions are in the SKATER'S frame, Godot's body frame: x to her right,
// y up, z behind her (she faces -z). A client places each segment from the one before it with
// its own model's lengths, so the same pose fits a 1.50 m skater and a 1.68 m one, the way
// skater.gd already aims each bone from a head to a tail. A segment a pose leaves out is not
// driven by it: an arm expression names only arms and head, and layers over whatever skates.
//
// Presentation only. Nothing here moves the simulation: a fall happens in sim/solver.ts and a
// clip only says what it looks like; a spin position's inertia stays data/spin-positions.json's.

export type Vec3 = readonly [number, number, number];

export const SEGMENTS = [
  "trunk", "head",
  "upperArmL", "forearmL", "upperArmR", "forearmR",
  "thighL", "shinL", "footL", "thighR", "shinR", "footR",
] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface Pose {
  /** Pelvis height over the ice, metres. Omit to leave it to whatever is skating. */
  pelvis?: number;
  /** The pelvis's own right and up axes in the skater's frame (unit). Omit: upright and square. */
  pelvisRight?: Vec3;
  pelvisUp?: Vec3;
  /** Each segment's direction, from its root joint toward its far end (normalised on use). */
  seg?: Partial<Record<Segment, Vec3>>;
}

export type Ease = "linear" | "in" | "out" | "inOut" | "hold";
export interface Key { t: number; pose: Pose; ease?: Ease }

export type Category = "fall" | "expression" | "spin" | "transition" | "leg" | "recovery";

export interface Clip {
  id: string;
  name: string;
  category: Category;
  /** Seconds; a loop repeats from t = 0 after it. */
  duration: number;
  loop: boolean;
  keys: readonly Key[];
  tags: readonly string[];
  /** One line on what it is and where it is used. */
  note: string;
}

// ── directions ────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
/**
 * A unit direction from a compass bearing and an elevation, both degrees: bearing 0 is the way
 * she faces (-z), 90 her right (+x), 180 behind, -90 her left; elevation 90 straight up, -90 down.
 */
export function dir(bearing: number, elevation: number): Vec3 {
  const c = Math.cos(elevation * RAD);
  return [Math.sin(bearing * RAD) * c, Math.sin(elevation * RAD), -Math.cos(bearing * RAD) * c];
}
export const UP: Vec3 = [0, 1, 0];
export const DOWN: Vec3 = [0, -1, 0];
export const RIGHT: Vec3 = [1, 0, 0];
export const FORWARD: Vec3 = [0, 0, -1];

export function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
function slerp(a: Vec3, b: Vec3, u: number): Vec3 {
  const na = norm(a), nb = norm(b);
  const d = Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]));
  if (d > 0.9995) return norm([na[0] + (nb[0] - na[0]) * u, na[1] + (nb[1] - na[1]) * u, na[2] + (nb[2] - na[2]) * u]);
  const w = Math.acos(d), s = Math.sin(w);
  const ka = Math.sin((1 - u) * w) / s, kb = Math.sin(u * w) / s;
  return norm([na[0] * ka + nb[0] * kb, na[1] * ka + nb[1] * kb, na[2] * ka + nb[2] * kb]);
}

// ── mirroring and turning, for generating variants ───────────────────────────

const MIRROR_SEG: Record<Segment, Segment> = {
  trunk: "trunk", head: "head",
  upperArmL: "upperArmR", forearmL: "forearmR", upperArmR: "upperArmL", forearmR: "forearmL",
  thighL: "thighR", shinL: "shinR", footL: "footR", thighR: "thighL", shinR: "shinL", footR: "footL",
};
const flipX = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
/** Left for right: the same movement on the other side. */
export function mirrorPose(p: Pose): Pose {
  const seg: Partial<Record<Segment, Vec3>> = {};
  for (const [k, v] of Object.entries(p.seg ?? {}) as [Segment, Vec3][]) seg[MIRROR_SEG[k]] = flipX(v);
  return {
    ...(p.pelvis !== undefined ? { pelvis: p.pelvis } : {}),
    ...(p.pelvisRight ? { pelvisRight: [p.pelvisRight[0], -p.pelvisRight[1], -p.pelvisRight[2]] as Vec3 } : {}),
    ...(p.pelvisUp ? { pelvisUp: flipX(p.pelvisUp) } : {}),
    seg,
  };
}
export function mirrorClip(c: Clip, id: string, name: string): Clip {
  return { ...c, id, name, keys: c.keys.map(k => ({ ...k, pose: mirrorPose(k.pose) })), tags: c.tags.map(t => t === "left" ? "right" : t === "right" ? "left" : t) };
}

/** The whole pose turned about the vertical by `deg` (positive toward her right). */
export function turnPose(p: Pose, deg: number): Pose {
  const c = Math.cos(deg * Math.PI / 180), sn = Math.sin(deg * Math.PI / 180);
  const r = (v: Vec3): Vec3 => [v[0] * c - v[2] * sn, v[1], v[0] * sn + v[2] * c];
  const seg: Partial<Record<Segment, Vec3>> = {};
  for (const [k, v] of Object.entries(p.seg ?? {}) as [Segment, Vec3][]) seg[k] = r(v);
  return { ...p, ...(p.pelvisRight ? { pelvisRight: r(p.pelvisRight) } : {}), ...(p.pelvisUp ? { pelvisUp: r(p.pelvisUp) } : {}), seg };
}

// ── sampling ──────────────────────────────────────────────────────────────────

function eased(u: number, e: Ease = "inOut"): number {
  switch (e) {
    case "linear": return u;
    case "in": return u * u;
    case "out": return 1 - (1 - u) * (1 - u);
    case "hold": return u < 1 ? 0 : 1;
    default: return u * u * (3 - 2 * u);
  }
}
function blend(a: Pose, b: Pose, u: number): Pose {
  const seg: Partial<Record<Segment, Vec3>> = {};
  for (const s of SEGMENTS) {
    const va = a.seg?.[s], vb = b.seg?.[s];
    if (va && vb) seg[s] = slerp(va, vb, u);
    else if (va || vb) seg[s] = norm((va ?? vb)!);
  }
  const num = (x?: number, y?: number) => x !== undefined && y !== undefined ? x + (y - x) * u : x ?? y;
  const vec = (x?: Vec3, y?: Vec3) => x && y ? slerp(x, y, u) : x ?? y;
  const out: Pose = { seg };
  const pelvis = num(a.pelvis, b.pelvis), right = vec(a.pelvisRight, b.pelvisRight), up = vec(a.pelvisUp, b.pelvisUp);
  if (pelvis !== undefined) out.pelvis = pelvis;
  if (right) out.pelvisRight = right;
  if (up) out.pelvisUp = up;
  return out;
}
/**
 * The clip's pose at time t (seconds), eased between its keys; a loop wraps, a one-shot holds its
 * last. Settled onIce for the given body: easing between two poses on the ice can pass through it.
 */
export function sample(c: Clip, t: number, rig: Rig = DEFAULT_RIG): Pose { return onIce(sampleRaw(c, t), rig); }
function sampleRaw(c: Clip, t: number): Pose {
  const keys = c.keys;
  if (keys.length === 1) return keys[0].pose;
  const time = c.loop ? ((t % c.duration) + c.duration) % c.duration : Math.max(0, Math.min(c.duration, t));
  if (time <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      return blend(a.pose, b.pose, eased((time - a.t) / Math.max(1e-6, b.t - a.t), b.ease));
    }
  }
  return c.loop ? blend(keys[keys.length - 1].pose, keys[0].pose, eased((time - keys[keys.length - 1].t) / Math.max(1e-6, c.duration - keys[keys.length - 1].t))) : keys[keys.length - 1].pose;
}

// ── forward kinematics ───────────────────────────────────────────────────────

/** A model's proportions: scripts/skater.gd's measure_rig, and its defaults (tools/build_skater.py). */
export interface Rig {
  hipHalfWidth: number; trunk: number; neck: number; head: number; shoulderHalfWidth: number; shoulderDrop: number;
  upperArm: number; forearm: number; thigh: number; shin: number; foot: number; ankleHeight: number;
}
export const DEFAULT_RIG: Rig = {
  hipHalfWidth: 0.105, trunk: 0.44, neck: 0.08, head: 0.22, shoulderHalfWidth: 0.185, shoulderDrop: 0.04,
  upperArm: 0.29, forearm: 0.2074, thigh: 0.4105, shin: 0.3755, foot: 0.24, ankleHeight: 0.105,
};
/** The standing pose every clip's missing segments default to: upright, arms hanging a little away. */
export const STAND: Required<Pose> = {
  pelvis: DEFAULT_RIG.thigh + DEFAULT_RIG.shin + DEFAULT_RIG.ankleHeight,
  pelvisRight: RIGHT, pelvisUp: UP,
  seg: {
    trunk: UP, head: UP,
    upperArmL: dir(-90, -76), forearmL: dir(-90, -80), upperArmR: dir(90, -76), forearmR: dir(90, -80),
    thighL: DOWN, shinL: DOWN, footL: dir(0, -20), thighR: DOWN, shinR: DOWN, footR: dir(0, -20),
  },
};

export type Joints = Record<"pelvis" | "hipL" | "hipR" | "kneeL" | "kneeR" | "ankleL" | "ankleR" | "toeL" | "toeR"
  | "chest" | "neck" | "crown" | "shoulderL" | "shoulderR" | "elbowL" | "elbowR" | "wristL" | "wristR", Vec3>;

/** Every joint's place in the skater's frame (the pelvis over the origin), from a pose filled out by STAND. */
export function joints(pose: Pose, rig: Rig = DEFAULT_RIG): Joints {
  const s = { ...STAND.seg, ...pose.seg } as Record<Segment, Vec3>;
  const d = (k: Segment) => norm(s[k]);
  const right = norm(pose.pelvisRight ?? STAND.pelvisRight);
  const pelvis: Vec3 = [0, pose.pelvis ?? STAND.pelvis, 0];
  const hipL = add(pelvis, right, -rig.hipHalfWidth), hipR = add(pelvis, right, rig.hipHalfWidth);
  const kneeL = add(hipL, d("thighL"), rig.thigh), kneeR = add(hipR, d("thighR"), rig.thigh);
  const ankleL = add(kneeL, d("shinL"), rig.shin), ankleR = add(kneeR, d("shinR"), rig.shin);
  const toeL = add(ankleL, d("footL"), rig.foot), toeR = add(ankleR, d("footR"), rig.foot);
  const chest = add(pelvis, d("trunk"), rig.trunk);
  const neck = add(chest, d("trunk"), rig.neck);
  const crown = add(neck, d("head"), rig.head);
  // The shoulders ride the trunk: across it along the pelvis's right axis, made square to the trunk.
  const t = d("trunk"), dot = right[0] * t[0] + right[1] * t[1] + right[2] * t[2];
  const across = norm([right[0] - t[0] * dot, right[1] - t[1] * dot, right[2] - t[2] * dot]);
  const shoulderL = add(add(chest, across, -rig.shoulderHalfWidth), t, -rig.shoulderDrop);
  const shoulderR = add(add(chest, across, rig.shoulderHalfWidth), t, -rig.shoulderDrop);
  const elbowL = add(shoulderL, d("upperArmL"), rig.upperArm), elbowR = add(shoulderR, d("upperArmR"), rig.upperArm);
  const wristL = add(elbowL, d("forearmL"), rig.forearm), wristR = add(elbowR, d("forearmR"), rig.forearm);
  return { pelvis, hipL, hipR, kneeL, kneeR, ankleL, ankleR, toeL, toeR, chest, neck, crown, shoulderL, shoulderR, elbowL, elbowR, wristL, wristR };
}
/** The lowest point the pose puts below the blades' plane, metres (the blade under each ankle). */
export function lowestPoint(pose: Pose, rig: Rig = DEFAULT_RIG): number {
  const j = joints(pose, rig);
  const blades = Math.min(j.ankleL[1], j.ankleR[1]) - rig.ankleHeight;
  return Math.min(blades, ...Object.values(j).map(v => v[1]));
}

/**
 * The ice as a contact: walks each limb out from the body and turns any segment that would end
 * below the ice (less a clearance: a boot lies on its side, a hand rests flat) up toward level,
 * keeping its bearing. A pose written for "down on the ice" then lies ON the ice for any body,
 * not through it. Poses that leave the pelvis to the skating are left alone.
 */
export function onIce(pose: Pose, rig: Rig = DEFAULT_RIG): Pose {
  if (pose.pelvis === undefined) return pose;
  const s = { ...STAND.seg, ...pose.seg } as Record<Segment, Vec3>;
  const out: Partial<Record<Segment, Vec3>> = { ...pose.seg };
  const clamp = (seg: Segment, from: number, length: number, floor: number): number => {
    const d = norm(s[seg]);
    let y = d[1];
    if (from + y * length < floor) {
      y = Math.max(-1, Math.min(1, (floor - from) / length));
      // A segment pointing straight down has no bearing of its own: it lies forward.
      const h = Math.hypot(d[0], d[2]), k = h > 1e-6 ? Math.sqrt(Math.max(0, 1 - y * y)) / h : 0;
      const fixed: Vec3 = norm(h > 1e-6 ? [d[0] * k, y, d[2] * k] : [0, y, -Math.sqrt(1 - y * y)]);
      s[seg] = fixed;
      if (pose.seg?.[seg] || from + d[1] * length < floor) out[seg] = fixed;
    }
    return from + y * length;
  };
  const j = joints(pose, rig);
  for (const side of ["L", "R"] as const) {
    const knee = clamp(`thigh${side}`, j[`hip${side}`][1], rig.thigh, 0.05);
    const ankle = clamp(`shin${side}`, knee, rig.shin, 0.06);
    clamp(`foot${side}`, ankle, rig.foot, 0.02);
  }
  const chest = clamp("trunk", pose.pelvis, rig.trunk, 0.1);
  clamp("head", chest + rig.neck * norm(s.trunk)[1], rig.head, 0.08);
  const placed = joints({ ...pose, seg: { ...pose.seg, ...out } }, rig);
  for (const side of ["L", "R"] as const) {
    const elbow = clamp(`upperArm${side}`, placed[`shoulder${side}`][1], rig.upperArm, 0.04);
    clamp(`forearm${side}`, elbow, rig.forearm, 0.02);
  }
  return { ...pose, seg: out };
}

/** A clip from keys, with its duration taken from the last key unless given; every key settled onIce. */
export function clip(id: string, name: string, category: Category, keys: Key[], o: { loop?: boolean; tags?: string[]; note: string; duration?: number }): Clip {
  return { id, name, category, loop: o.loop ?? false, duration: o.duration ?? Math.max(...keys.map(k => k.t), 0.01), keys: keys.map(k => ({ ...k, pose: onIce(k.pose) })), tags: o.tags ?? [], note: o.note };
}
