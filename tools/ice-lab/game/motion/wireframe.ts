// edgework-wireframe/1 -> EDGEWORK Pose / Clip / Track.
// Presentation only: this module never reads or changes simulation state.

import { DEFAULT_RIG, RIGHT, TWIST_LIMIT, UP, clip, norm, onIce } from "./types.ts";
import type { Category, Clip, Key, Pose, Rig, Segment, Vec3 } from "./types.ts";
import { TRACK_FPS, bakeTrack } from "./track.ts";
import type { Track } from "./track.ts";

export const WIREFRAME_SCHEMA = "edgework-wireframe/1";
export const WIREFRAME_JOINTS = [
  "pelvis", "hipL", "hipR", "kneeL", "kneeR", "ankleL", "ankleR", "toeL", "toeR",
  "chest", "neck", "crown", "shoulderL", "shoulderR", "elbowL", "elbowR", "wristL", "wristR",
] as const;
export type WireframeJoint = (typeof WIREFRAME_JOINTS)[number];
export type CoordSpace = "skater-local" | "world-yup" | "world-zup";
export type MaskMode = "full" | "arms-head";
export type Mirrored = boolean | "unknown";

export interface WireframeMetaExt {
  readonly mirrored?: Mirrored;
  readonly [key: string]: unknown;
}
export interface WireframeSourceMeta {
  readonly fps: number;
  readonly coordSpace: CoordSpace;
  readonly extractor: string;
  readonly cameraCompensated: boolean;
  readonly provenance: string;
  readonly styleTag?: string;
  readonly note?: string;
  readonly ext?: WireframeMetaExt;
}
export interface WireframeFrameExt {
  /** Source pelvis height divided by source mean hip-to-ankle leg length. */
  readonly pelvisHeightRatio?: number;
  readonly [key: string]: unknown;
}
export interface WireframeFrame {
  readonly t: number;
  readonly joints: Partial<Record<WireframeJoint, Vec3>>;
  readonly confidence?: Partial<Record<WireframeJoint, number>>;
  readonly rootWorld?: Vec3;
  readonly rootYawRad?: number;
  readonly ext?: WireframeFrameExt;
}
export interface WireframeSequence {
  readonly schema: string;
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  readonly loop?: boolean;
  readonly tags?: readonly string[];
  readonly meta: WireframeSourceMeta;
  readonly frames: readonly WireframeFrame[];
}
export interface WireframeTranslateOptions {
  readonly mask?: MaskMode;
  readonly minConfidence?: number;
  /** Reject any present joint without an explicit score. Default false for old synthetic files. */
  readonly strictConfidence?: boolean;
  readonly mirrored?: Mirrored;
  readonly settleOnIce?: boolean;
  readonly rig?: Rig;
  readonly simplifyDeg?: number;
}
export type BasisSource = "local" | "hips" | "shoulders" | "held";
export interface FrameTranslation {
  readonly pose: Pose;
  readonly basis: BasisSource;
  readonly lrSwap: "none" | "corrected" | "suspected";
  readonly heading: number;
  readonly rejected?: "basis-degenerate" | "heading-ambiguous";
}

const SEGMENT_ENDPOINTS: Readonly<Record<Segment, readonly [WireframeJoint, WireframeJoint]>> = {
  trunk: ["pelvis", "chest"], head: ["neck", "crown"],
  upperArmL: ["shoulderL", "elbowL"], forearmL: ["elbowL", "wristL"],
  upperArmR: ["shoulderR", "elbowR"], forearmR: ["elbowR", "wristR"],
  thighL: ["hipL", "kneeL"], shinL: ["kneeL", "ankleL"], footL: ["ankleL", "toeL"],
  thighR: ["hipR", "kneeR"], shinR: ["kneeR", "ankleR"], footR: ["ankleR", "toeR"],
};
const FULL_SEGMENTS = Object.keys(SEGMENT_ENDPOINTS) as Segment[];
const ARMS_HEAD: readonly Segment[] = ["head", "upperArmL", "forearmL", "upperArmR", "forearmR"];
const LEFT_RIGHT: Readonly<Record<WireframeJoint, WireframeJoint>> = Object.fromEntries(
  WIREFRAME_JOINTS.map(j => [j, j.endsWith("L") ? `${j.slice(0, -1)}R` : j.endsWith("R") ? `${j.slice(0, -1)}L` : j]),
) as Readonly<Record<WireframeJoint, WireframeJoint>>;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const angularDelta = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export function toYUp(v: Vec3, space: CoordSpace): Vec3 {
  return space === "world-zup" ? [v[0], v[2], -v[1]] : [v[0], v[1], v[2]];
}

function correctedFrame(frame: WireframeFrame, mirrored: Mirrored): WireframeFrame {
  if (mirrored !== true) return frame;
  const joints: Partial<Record<WireframeJoint, Vec3>> = {};
  const confidence: Partial<Record<WireframeJoint, number>> = {};
  for (const name of WIREFRAME_JOINTS) {
    const source = LEFT_RIGHT[name];
    const v = frame.joints[source];
    if (v) joints[name] = [-v[0], v[1], v[2]];
    const score = frame.confidence?.[source];
    if (score !== undefined) confidence[name] = score;
  }
  return { ...frame, joints, ...(frame.confidence ? { confidence } : {}),
    ...(frame.rootWorld ? { rootWorld: [-frame.rootWorld[0], frame.rootWorld[1], frame.rootWorld[2]] as Vec3 } : {}),
    ...(frame.rootYawRad === undefined ? {} : { rootYawRad: -frame.rootYawRad }) };
}

function point(frame: WireframeFrame, joint: WireframeJoint, space: CoordSpace, min: number, strict: boolean): Vec3 | null {
  const raw = frame.joints[joint];
  if (!raw) return null;
  const score = frame.confidence?.[joint];
  if (strict && score === undefined) throw new Error(`joint ${joint} has no confidence score`);
  if (score !== undefined && (!Number.isFinite(score) || score < min)) return null;
  if (!raw.every(Number.isFinite)) return null;
  return toYUp(raw, space);
}

interface Basis { right: Vec3; up: Vec3; back: Vec3; heading: number; source: BasisSource }
function measuredBasis(frame: WireframeFrame, space: CoordSpace, min: number, strict: boolean): Basis | null {
  if (space === "skater-local") return { right: RIGHT, up: UP, back: [0, 0, 1], heading: 0, source: "local" };
  const get = (j: WireframeJoint) => point(frame, j, space, min, strict);
  const hl = get("hipL"), hr = get("hipR"), sl = get("shoulderL"), sr = get("shoulderR");
  const line = hl && hr ? sub(hr, hl) : sl && sr ? sub(sr, sl) : null;
  const source: BasisSource = hl && hr ? "hips" : "shoulders";
  if (!line) return null;
  const horizontal: Vec3 = [line[0], 0, line[2]];
  // Blueprint rule: reject a hip/shoulder line steeper than 60 degrees from the ice.
  if (len(horizontal) < 0.5 * len(line) || len(horizontal) < 1e-8) return null;
  const right = norm(horizontal), up = UP, back = norm(cross(right, up));
  const det = dot(right, cross(up, back));
  if (Math.abs(det - 1) > 1e-6 || Math.abs(dot(right, up)) > 1e-6 || Math.abs(dot(right, back)) > 1e-6) {
    throw new Error("basis-invalid");
  }
  return { right, up, back, heading: Math.atan2(right[2], right[0]), source };
}

function local(v: Vec3, basis: Basis): Vec3 { return [dot(v, basis.right), dot(v, basis.up), dot(v, basis.back)]; }
function swapped(frame: WireframeFrame): WireframeFrame {
  const joints: Partial<Record<WireframeJoint, Vec3>> = {};
  const confidence: Partial<Record<WireframeJoint, number>> = {};
  for (const j of WIREFRAME_JOINTS) {
    joints[j] = frame.joints[LEFT_RIGHT[j]];
    const s = frame.confidence?.[LEFT_RIGHT[j]];
    if (s !== undefined) confidence[j] = s;
  }
  return { ...frame, joints, ...(frame.confidence ? { confidence } : {}) };
}

function legRatio(frame: WireframeFrame, get: (j: WireframeJoint) => Vec3 | null, pelvis: Vec3): number | null {
  const explicit = frame.ext?.pelvisHeightRatio;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) return explicit;
  const lengths: number[] = [];
  for (const side of ["L", "R"] as const) {
    const hip = get(`hip${side}`), knee = get(`knee${side}`), ankle = get(`ankle${side}`);
    if (hip && knee && ankle) lengths.push(len(sub(knee, hip)) + len(sub(ankle, knee)));
  }
  if (lengths.length === 0) return null;
  const ankleY = [get("ankleL")?.[1], get("ankleR")?.[1]].filter((x): x is number => x !== undefined);
  if (ankleY.length === 0) return null;
  return (pelvis[1] - Math.min(...ankleY)) / (lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

function poseFrom(frame: WireframeFrame, space: CoordSpace, basis: Basis, opts: WireframeTranslateOptions): Pose {
  const min = opts.minConfidence ?? 0.35, strict = opts.strictConfidence ?? false;
  const get = (j: WireframeJoint) => point(frame, j, space, min, strict);
  const allowed = (opts.mask ?? "full") === "arms-head" ? ARMS_HEAD : FULL_SEGMENTS;
  const seg: Partial<Record<Segment, Vec3>> = {};
  for (const name of allowed) {
    const [aName, bName] = SEGMENT_ENDPOINTS[name], a = get(aName), b = get(bName);
    if (!a || !b) continue;
    const d = sub(b, a);
    if (len(d) < 1e-4) continue;
    seg[name] = norm(local(d, basis));
  }
  const out: Pose = { seg };
  if ((opts.mask ?? "full") === "full") {
    const hl = get("hipL"), hr = get("hipR");
    const sl = get("shoulderL"), sr = get("shoulderR");
    const pelvis = get("pelvis") ?? (hl && hr ? mid(hl, hr) : null);
    const chest = get("chest");
    if (pelvis) {
      const ratio = legRatio(frame, get, pelvis);
      if (ratio !== null) out.pelvis = ratio * ((opts.rig ?? DEFAULT_RIG).thigh + (opts.rig ?? DEFAULT_RIG).shin);
      if (hl && hr && len(sub(hr, hl)) >= 1e-4) out.pelvisRight = norm(local(sub(hr, hl), basis));
      if (chest && len(sub(chest, pelvis)) >= 1e-4) out.pelvisUp = norm(local(sub(chest, pelvis), basis));
    }
    if (hl && hr && sl && sr && seg.trunk) {
      const trunk = seg.trunk;
      const flatten = (v: Vec3): Vec3 => {
        const along = dot(v, trunk);
        return [v[0] - trunk[0] * along, v[1] - trunk[1] * along, v[2] - trunk[2] * along];
      };
      const hips = flatten(local(sub(hr, hl), basis)), shoulders = flatten(local(sub(sr, sl), basis));
      if (len(hips) >= 1e-4 && len(shoulders) >= 1e-4) {
        const h = norm(hips), s = norm(shoulders);
        const signed = -dot(cross(h, s), trunk);
        const degrees = Math.atan2(signed, Math.max(-1, Math.min(1, dot(h, s)))) * 180 / Math.PI;
        if (Math.abs(degrees) > 0.25) out.twist = Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, degrees));
      }
    }
  }
  return opts.settleOnIce === true ? onIce(out, opts.rig ?? DEFAULT_RIG) : out;
}

/** Stateful conversion applies heading continuity, L/R correction, alias detection and 2-frame basis hold. */
export function translateWireframeFrames(seq: WireframeSequence, opts: WireframeTranslateOptions = {}): FrameTranslation[] {
  if (opts.mask !== undefined && opts.mask !== "arms-head" && opts.mask !== "full") {
    throw new Error(`Unsupported wireframe mask ${String(opts.mask)}; expected arms-head or full`);
  }
  const issues = validateWireframeSequence(seq, opts.strictConfidence ?? false);
  if (issues.length) throw new Error(`Invalid wireframe sequence: ${issues.join("; ")}`);
  const mirrored = opts.mirrored ?? seq.meta.ext?.mirrored ?? false;
  let previous: Basis | null = null, previousPose: Pose | null = null, held = 0;
  return seq.frames.map(raw => {
    let frame = correctedFrame(raw, mirrored), basis = measuredBasis(frame, seq.meta.coordSpace, opts.minConfidence ?? 0.35, opts.strictConfidence ?? false);
    let lrSwap: FrameTranslation["lrSwap"] = "none";
    if (basis && previous) {
      const delta = Math.abs(angularDelta(basis.heading, previous.heading));
      if (delta > 120 * Math.PI / 180) {
        const alternativeFrame = swapped(frame);
        const alternative = measuredBasis(alternativeFrame, seq.meta.coordSpace, opts.minConfidence ?? 0.35, opts.strictConfidence ?? false);
        if (alternative && previousPose) {
          // The blueprint chooses by temporal segment continuity, not by heading alone: a real
          // rapid turn carries its limbs with it, while a label swap makes every L/R segment jump.
          const originalCost = angle(previousPose, poseFrom(frame, seq.meta.coordSpace, basis, opts));
          const swappedCost = angle(previousPose, poseFrom(alternativeFrame, seq.meta.coordSpace, alternative, opts));
          if (swappedCost + 1e-6 < originalCost) {
            frame = alternativeFrame; basis = alternative; lrSwap = "corrected";
          } else lrSwap = "suspected";
        } else lrSwap = "suspected";
      }
    }
    if (!basis) {
      if (previous && held < 2) {
        held++;
        basis = { ...previous, source: "held" };
      } else return { pose: { seg: {} }, basis: "held", lrSwap, heading: previous?.heading ?? 0, rejected: "basis-degenerate" };
    } else held = 0;
    if (previous && Math.abs(angularDelta(basis.heading, previous.heading)) > Math.PI / 2) {
      return { pose: { seg: {} }, basis: basis.source, lrSwap, heading: basis.heading, rejected: "heading-ambiguous" };
    }
    const pose = poseFrom(frame, seq.meta.coordSpace, basis, opts);
    previous = basis;
    previousPose = pose;
    return { pose, basis: basis.source, lrSwap, heading: basis.heading };
  });
}

export function wireframeFrameToPose(frame: WireframeFrame, space: CoordSpace = "world-yup", opts: WireframeTranslateOptions = {}): Pose {
  const seq: WireframeSequence = { schema: WIREFRAME_SCHEMA, id: "frame", name: "frame", category: "expression",
    meta: { fps: 1, coordSpace: space, extractor: "single-frame", cameraCompensated: false,
      provenance: "synthetic-roundtrip", note: "single frame", ext: { mirrored: opts.mirrored ?? false } }, frames: [frame] };
  const result = translateWireframeFrames(seq, opts)[0];
  if (result.rejected) throw new Error(result.rejected);
  return result.pose;
}

/** Runtime reader for untrusted JSON. Unknown extension fields are deliberately preserved. */
export function readWireframe(value: unknown, strictConfidence = true): WireframeSequence {
  const fail = (message: string): never => { throw new Error(`Invalid ${WIREFRAME_SCHEMA}: ${message}`); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const seq = value as Record<string, unknown>;
  if (seq.schema !== WIREFRAME_SCHEMA) fail(`expected schema ${WIREFRAME_SCHEMA}`);
  if (typeof seq.id !== "string" || !seq.id) fail("missing sequence id");
  if (typeof seq.name !== "string" || !seq.name) fail("missing sequence name");
  const categories = new Set<Category>(["fall", "expression", "spin", "transition", "leg", "recovery", "step", "ceremony", "idle"]);
  if (typeof seq.category !== "string" || !categories.has(seq.category as Category)) fail("invalid category");
  if (!seq.meta || typeof seq.meta !== "object" || Array.isArray(seq.meta)) fail("meta must be an object");
  const meta = seq.meta as Record<string, unknown>;
  if (typeof meta.fps !== "number" || !Number.isFinite(meta.fps) || meta.fps <= 0) fail("meta.fps must be positive");
  if (!new Set(["skater-local", "world-yup", "world-zup"]).has(String(meta.coordSpace))) fail("invalid meta.coordSpace");
  if (typeof meta.extractor !== "string" || !meta.extractor) fail("meta.extractor must be a non-empty string");
  if (typeof meta.cameraCompensated !== "boolean") fail("meta.cameraCompensated must be boolean");
  if (typeof meta.provenance !== "string" || !meta.provenance) fail("meta.provenance must be a non-empty string");
  if (meta.note !== undefined && typeof meta.note !== "string") fail("meta.note must be a string");
  if (seq.loop !== undefined && typeof seq.loop !== "boolean") fail("loop must be boolean");
  if (seq.tags !== undefined && (!Array.isArray(seq.tags) || !seq.tags.every(x => typeof x === "string"))) fail("tags must be strings");
  const mirrored = (meta.ext as Record<string, unknown> | undefined)?.mirrored;
  if (mirrored !== undefined && mirrored !== true && mirrored !== false && mirrored !== "unknown") fail("meta.ext.mirrored must be true, false, or unknown");
  if (!Array.isArray(seq.frames) || seq.frames.length === 0) fail("frames must be non-empty");
  let previous = -Infinity;
  for (let i = 0; i < seq.frames.length; i++) {
    const raw = seq.frames[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`frame ${i} must be an object`);
    const frame = raw as Record<string, unknown>;
    if (typeof frame.t !== "number" || !Number.isFinite(frame.t) || frame.t <= previous) fail(`frame ${i} timestamp must be finite and strictly increasing`);
    previous = frame.t;
    for (const rootName of ["rootWorld"] as const) {
      const root = frame[rootName];
      if (root !== undefined && (!Array.isArray(root) || root.length !== 3 || !root.every(x => typeof x === "number" && Number.isFinite(x)))) fail(`frame ${i} ${rootName} must be a finite vec3`);
    }
    if (frame.rootYawRad !== undefined && (typeof frame.rootYawRad !== "number" || !Number.isFinite(frame.rootYawRad))) fail(`frame ${i} rootYawRad must be finite`);
    const ratio = (frame.ext as Record<string, unknown> | undefined)?.pelvisHeightRatio;
    if (ratio !== undefined && (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0)) fail(`frame ${i} pelvisHeightRatio must be positive`);
    if (!frame.joints || typeof frame.joints !== "object" || Array.isArray(frame.joints)) fail(`frame ${i} joints must be an object`);
    const jointsMap = frame.joints as Record<string, unknown>, scores = frame.confidence;
    if (scores !== undefined && (!scores || typeof scores !== "object" || Array.isArray(scores))) fail(`frame ${i} confidence must be an object`);
    for (const [joint, rawPoint] of Object.entries(jointsMap)) {
      if (!(WIREFRAME_JOINTS as readonly string[]).includes(joint)) fail(`frame ${i} has unknown joint ${joint}`);
      if (!Array.isArray(rawPoint) || rawPoint.length !== 3 || !rawPoint.every(x => typeof x === "number" && Number.isFinite(x))) fail(`frame ${i} joint ${joint} must be a finite vec3`);
      const score = (scores as Record<string, unknown> | undefined)?.[joint];
      if (strictConfidence && score === undefined) fail(`frame ${i} joint ${joint} has no confidence score`);
      if (score !== undefined && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1)) fail(`frame ${i} joint ${joint} has invalid confidence`);
    }
  }
  return value as WireframeSequence;
}

export function parseWireframeJson(text: string, strictConfidence = true): WireframeSequence {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { throw new Error(`Invalid ${WIREFRAME_SCHEMA} JSON: ${String(error)}`); }
  return readWireframe(value, strictConfidence);
}

export function validateWireframeSequence(seq: WireframeSequence, strictConfidence = false): string[] {
  const issues: string[] = [];
  if (!seq || seq.schema !== WIREFRAME_SCHEMA) issues.push(`expected schema ${WIREFRAME_SCHEMA}`);
  if (!seq?.id) issues.push("missing sequence id");
  if (!seq?.meta || !(seq.meta.fps > 0)) issues.push("meta.fps must be positive");
  if (!Array.isArray(seq?.frames) || seq.frames.length === 0) issues.push("frames must be non-empty");
  for (let i = 0; i < (seq?.frames?.length ?? 0); i++) {
    const f = seq.frames[i];
    if (i > 0 && f.t <= seq.frames[i - 1].t) { issues.push(`frame ${i} timestamp must be strictly increasing`); break; }
    if (strictConfidence) for (const j of WIREFRAME_JOINTS) {
      if (f.joints[j] && f.confidence?.[j] === undefined) issues.push(`frame ${i} joint ${j} has no confidence score`);
    }
  }
  return issues;
}

function angle(a: Pose, b: Pose): number {
  let worst = 0;
  for (const k of FULL_SEGMENTS) {
    const av = a.seg?.[k], bv = b.seg?.[k];
    if (av && bv) worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot(norm(av), norm(bv))))) * 180 / Math.PI);
  }
  return worst;
}

export function wireframeToClip(seq: WireframeSequence, opts: WireframeTranslateOptions = {}): Clip {
  const translated = translateWireframeFrames(seq, opts);
  const accepted = translated.map((x, i) => ({ x, i })).filter(({ x }) => !x.rejected);
  if (!accepted.length) throw new Error("wireframe sequence has no usable frames");
  const t0 = seq.frames[0].t, threshold = opts.simplifyDeg ?? 0, keys: Key[] = [];
  for (let n = 0; n < accepted.length; n++) {
    const { x, i } = accepted[n], edge = n === 0 || n === accepted.length - 1;
    if (edge || threshold <= 0 || angle(keys[keys.length - 1].pose, x.pose) >= threshold) keys.push({ t: seq.frames[i].t - t0, pose: x.pose, ease: "linear" });
  }
  return clip(seq.id, seq.name, seq.category, keys, { loop: seq.loop ?? false,
    tags: [...(seq.tags ?? []), `wireframe:${seq.meta.provenance}`, ...(seq.meta.styleTag ? [`style:${seq.meta.styleTag}`] : [])],
    note: `${seq.meta.note ?? "Translated from edgework-wireframe/1."} [${seq.meta.extractor}, mask=${opts.mask ?? "full"}]` });
}

export function wireframeToTrack(seq: WireframeSequence, opts: WireframeTranslateOptions = {}, fps = TRACK_FPS): Track {
  return bakeTrack(wireframeToClip(seq, opts), fps);
}
