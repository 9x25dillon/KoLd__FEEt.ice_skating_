import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_RIG } from "../game/motion/types.ts";
import {
  WIREFRAME_SCHEMA,
  parseWireframeJson,
  translateWireframeFrames,
  validateWireframeSequence,
  wireframeFrameToPose,
  wireframeToClip,
  wireframeToTrack,
} from "../game/motion/wireframe.ts";
import type { WireframeFrame, WireframeSequence } from "../game/motion/wireframe.ts";

const PARITY = JSON.parse(readFileSync(new URL("fixtures/wireframe-parity-v1.json", import.meta.url), "utf8")) as {
  schema: string;
  baseFrame: WireframeFrame;
  cases: readonly { id: string }[];
};

function frame(t = 0): WireframeFrame {
  assert.equal(PARITY.schema, "edgework-wireframe-parity/1");
  assert.equal(PARITY.cases.length, 6);
  return { ...structuredClone(PARITY.baseFrame), t };
}

function sequence(frames: readonly WireframeFrame[], mirrored: boolean | "unknown" = false): WireframeSequence {
  return { schema: WIREFRAME_SCHEMA, id: "parity", name: "Parity", category: "expression", frames,
    meta: { fps: 30, coordSpace: "world-yup", extractor: "fixture", cameraCompensated: true,
      provenance: "pose-3d", note: "test", ext: { mirrored } } };
}

test("strict confidence rejects a present joint without its explicit score", () => {
  const f = frame();
  const confidence = { ...f.confidence }; delete confidence.wristL;
  const seq = sequence([{ ...f, confidence }]);
  assert.deepEqual(validateWireframeSequence(seq), []);
  assert.match(validateWireframeSequence(seq, true)[0], /wristL/);
  assert.throws(() => translateWireframeFrames(seq, { strictConfidence: true }), /wristL/);
  assert.throws(() => parseWireframeJson(JSON.stringify(seq)), /wristL/);
});

test("mirrored input swaps anatomical labels and negates image/world x", () => {
  const f = frame();
  const plain = wireframeFrameToPose(f, "world-yup", { mask: "arms-head" });
  const mirrorRaw: WireframeFrame = { ...f, joints: Object.fromEntries(Object.entries(f.joints).map(([k, v]) => {
    const swapped = k.endsWith("L") ? `${k.slice(0, -1)}R` : k.endsWith("R") ? `${k.slice(0, -1)}L` : k;
    return [swapped, [-v![0], v![1], v![2]]];
  })) as WireframeFrame["joints"] };
  const corrected = wireframeFrameToPose(mirrorRaw, "world-yup", { mask: "arms-head", mirrored: true });
  assert.deepEqual(corrected.seg, plain.seg);
});

test("a one-frame L/R label flip is corrected by heading continuity", () => {
  const a = frame(0), b = frame(1 / 30), c = frame(2 / 30);
  const flip = (f: WireframeFrame): WireframeFrame => ({ ...f, joints: Object.fromEntries(Object.entries(f.joints).map(([k, v]) => [
    k.endsWith("L") ? `${k.slice(0, -1)}R` : k.endsWith("R") ? `${k.slice(0, -1)}L` : k, v,
  ])) as WireframeFrame["joints"] });
  const out = translateWireframeFrames(sequence([a, flip(b), c]), { strictConfidence: true });
  assert.equal(out[1].lrSwap, "corrected");
  assert.equal(out[1].rejected, undefined);
  assert.ok(Math.abs(out[1].heading - out[0].heading) < 1e-12);
});

test("a steep basis holds twice, then rejects until a valid frame returns", () => {
  const steep = (t: number): WireframeFrame => ({ ...frame(t), joints: { ...frame(t).joints,
    hipL: [0, 0.8, 0], hipR: [0.01, 1.0, 0], shoulderL: [0, 1.2, 0], shoulderR: [0.01, 1.5, 0] } });
  const out = translateWireframeFrames(sequence([frame(0), steep(1), steep(2), steep(3), frame(4)]));
  assert.deepEqual(out.map(x => [x.basis, x.rejected]), [
    ["hips", undefined], ["held", undefined], ["held", undefined], ["held", "basis-degenerate"], ["hips", undefined],
  ]);
});

test("arms-head is the only cosmetic mask and cannot drive trunk, twist, pelvis or legs", () => {
  const pose = wireframeFrameToPose(frame(), "world-yup", { mask: "arms-head" });
  assert.deepEqual(Object.keys(pose.seg ?? {}).sort(), ["forearmL", "forearmR", "head", "upperArmL", "upperArmR"]);
  assert.equal(pose.pelvis, undefined);
  assert.equal(pose.twist, undefined);
  assert.throws(() => wireframeFrameToPose(frame(), "world-yup", { mask: "upper-body" as never }), /Unsupported wireframe mask/);
});

test("pelvis ratio retargets to the destination leg length and builds Clip/Track", () => {
  const f = { ...frame(), ext: { pelvisHeightRatio: 1.1 } };
  const rig = { ...DEFAULT_RIG, thigh: 0.5, shin: 0.4 };
  const pose = wireframeFrameToPose(f, "world-yup", { rig, settleOnIce: false });
  assert.ok(Math.abs(pose.pelvis! - 0.99) < 1e-12);
  const seq = sequence([f, { ...f, t: 0.2 }]);
  const c = wireframeToClip(seq, { rig });
  const tr = wireframeToTrack(seq, { rig }, 30);
  assert.equal(c.keys.length, 2);
  assert.equal(tr.fps, 30);
  assert.ok(tr.poses.length >= 7);
});
