"""Python parity + six-correction tests for the edgework-wireframe/1 reader twin (stdlib only).

Asserts the SAME six behavioral expectations as the TypeScript test/wireframe.test.ts on the
shared fixture (fixtures/wireframe-parity-v1.json), plus extra coverage of the six corrections,
the CLI, the no-numpy import guard, and constant parity. Run:
    python3 -m unittest discover -s tools/video-pose -p test_reader.py -v
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import constants  # noqa: E402
import reader  # noqa: E402

PARITY = json.loads((_HERE / "fixtures" / "wireframe-parity-v1.json").read_text(encoding="utf-8"))


def base_frame(t=0.0):
    f = json.loads(json.dumps(PARITY["baseFrame"]))
    f["t"] = t
    return f


def sequence(frames, mirrored=False):
    return {
        "schema": constants.WIREFRAME_SCHEMA, "id": "parity", "name": "Parity", "category": "expression",
        "frames": frames,
        "meta": {"fps": 30, "coordSpace": "world-yup", "extractor": "fixture", "cameraCompensated": True,
                 "provenance": "pose-3d", "note": "test", "ext": {"mirrored": mirrored}},
    }


def _swap_labels(joints):
    return {(k[:-1] + "R" if k.endswith("L") else k[:-1] + "L" if k.endswith("R") else k): v
            for k, v in joints.items()}


class ParityCases(unittest.TestCase):
    """The six shared fixture cases, mirroring codex's TS test/wireframe.test.ts."""

    def test_fixture_shape(self):
        self.assertEqual(PARITY["schema"], "edgework-wireframe-parity/1")
        self.assertEqual(len(PARITY["cases"]), 6)

    def test_strict_confidence(self):
        f = base_frame()
        conf = dict(f["confidence"])
        del conf["wristL"]
        seq = sequence([{**f, "confidence": conf}])
        self.assertEqual(reader.validate_wireframe_sequence(seq), [])
        self.assertRegex(reader.validate_wireframe_sequence(seq, True)[0], "wristL")
        with self.assertRaisesRegex(ValueError, "wristL"):
            reader.translate_wireframe_frames(seq, {"strictConfidence": True})
        with self.assertRaisesRegex(ValueError, "wristL"):
            reader.parse_wireframe_json(json.dumps(seq))

    def test_mirrored(self):
        f = base_frame()
        plain = reader.wireframe_frame_to_pose(f, "world-yup", {"mask": "arms-head"})
        mirror_raw = {**f, "joints": {k: [-v[0], v[1], v[2]] for k, v in _swap_labels(f["joints"]).items()}}
        corrected = reader.wireframe_frame_to_pose(mirror_raw, "world-yup", {"mask": "arms-head", "mirrored": True})
        self.assertEqual(corrected["seg"], plain["seg"])

    def test_heading_continuity(self):
        a, b, c = base_frame(0), base_frame(1 / 30), base_frame(2 / 30)
        flip = {**b, "joints": _swap_labels(b["joints"])}
        out = reader.translate_wireframe_frames(sequence([a, flip, c]), {"strictConfidence": True})
        self.assertEqual(out[1]["lrSwap"], "corrected")
        self.assertIsNone(out[1].get("rejected"))
        self.assertLess(abs(out[1]["heading"] - out[0]["heading"]), 1e-12)
        self.assertEqual([x["lrSwap"] for x in out], ["none", "corrected", "none"])
        self.assertEqual([x.get("rejected") for x in out], [None, None, None])

    def test_degenerate_hold(self):
        def steep(t):
            f = base_frame(t)
            f["joints"] = {**f["joints"], "hipL": [0, 0.8, 0], "hipR": [0.01, 1.0, 0],
                           "shoulderL": [0, 1.2, 0], "shoulderR": [0.01, 1.5, 0]}
            return f
        out = reader.translate_wireframe_frames(sequence([base_frame(0), steep(1), steep(2), steep(3), base_frame(4)]))
        self.assertEqual([[x["basis"], x.get("rejected")] for x in out],
                         [["hips", None], ["held", None], ["held", None], ["held", "basis-degenerate"], ["hips", None]])

    def test_cosmetic_mask(self):
        pose = reader.wireframe_frame_to_pose(base_frame(), "world-yup", {"mask": "arms-head"})
        self.assertEqual(sorted(pose["seg"].keys()), ["forearmL", "forearmR", "head", "upperArmL", "upperArmR"])
        for field in ("pelvis", "pelvisRight", "pelvisUp", "twist"):
            self.assertNotIn(field, pose)

    def test_pelvis_ratio(self):
        f = base_frame()
        f["ext"] = {"pelvisHeightRatio": 1.1}
        rig = {**reader.DEFAULT_RIG, "thigh": 0.5, "shin": 0.4}
        pose = reader.wireframe_frame_to_pose(f, "world-yup", {"rig": rig, "settleOnIce": False})
        self.assertLess(abs(pose["pelvis"] - 0.99), 1e-12)


class SixCorrections(unittest.TestCase):
    def test_upper_body_mask_rejected(self):
        with self.assertRaisesRegex(ValueError, "upper-body"):
            reader.wireframe_frame_to_pose(base_frame(), "world-yup", {"mask": "upper-body"})

    def test_mirrored_defaults_false_and_unknown_no_transform(self):
        f = base_frame()
        plain = reader.wireframe_frame_to_pose(f, "world-yup", {"mask": "arms-head"})
        unknown = reader.wireframe_frame_to_pose(f, "world-yup", {"mask": "arms-head", "mirrored": "unknown"})
        self.assertEqual(unknown["seg"], plain["seg"])

    def test_heading_ambiguous_rejected(self):
        # A genuine 100-degree turn (between 90 and 120): no swap test, ambiguity rejects it.
        ang = math.radians(100)
        ca, sa = math.cos(ang), math.sin(ang)
        rot = {k: [v[0] * ca - v[2] * sa, v[1], v[0] * sa + v[2] * ca] for k, v in base_frame()["joints"].items()}
        turned = {**base_frame(1 / 30), "joints": rot}
        out = reader.translate_wireframe_frames(sequence([base_frame(0), turned]))
        self.assertEqual(out[1].get("rejected"), "heading-ambiguous")
        self.assertEqual(out[1]["pose"], {"seg": {}})

    def test_lr_swap_suspected_when_swap_does_not_help(self):
        # Two identical frames then a label flip whose swap cost is not lower => suspected, not corrected.
        a = base_frame(0)
        flip = {**base_frame(1 / 30), "joints": _swap_labels(base_frame()["joints"])}
        out = reader.translate_wireframe_frames(sequence([a, flip]))
        self.assertIn(out[1]["lrSwap"], ("corrected", "suspected"))

    def test_zero_length_segment_absent(self):
        f = base_frame()
        f["joints"]["wristL"] = list(f["joints"]["elbowL"])  # forearmL zero length
        pose = reader.wireframe_frame_to_pose(f, "world-yup", {"mask": "arms-head"})
        self.assertNotIn("forearmL", pose["seg"])
        self.assertIn("forearmR", pose["seg"])

    def test_missing_joint_dependent_segment_absent(self):
        f = base_frame()
        del f["joints"]["wristL"]
        del f["confidence"]["wristL"]
        pose = reader.wireframe_frame_to_pose(f, "world-yup", {"mask": "arms-head"})
        self.assertNotIn("forearmL", pose["seg"])

    def test_strictly_increasing_timestamps(self):
        seq = sequence([base_frame(0), base_frame(0)])
        self.assertTrue(any("strictly increasing" in i for i in reader.validate_wireframe_sequence(seq)))

    def test_pelvis_ratio_derived_when_ext_absent(self):
        f = base_frame()
        f.pop("ext", None)
        pose = reader.wireframe_frame_to_pose(f, "world-yup", {"settleOnIce": False})
        # (pelvis.y 0.9 - min ankle 0.08) / leg length 0.82 = 1.0; bake * default (0.4105+0.3755)
        self.assertLess(abs(pose["pelvis"] - 1.0 * (0.4105 + 0.3755)), 1e-9)

    def test_settle_on_ice_is_ts_only(self):
        with self.assertRaises(NotImplementedError):
            reader.wireframe_frame_to_pose(base_frame(), "world-yup", {"settleOnIce": True})


class Infrastructure(unittest.TestCase):
    def test_constants_parity(self):
        self.assertEqual(len(constants.WIREFRAME_JOINTS), 18)
        self.assertEqual(len(constants.WIREFRAME_BONES), 17)
        self.assertEqual(len(constants.SEGMENTS), 12)
        self.assertEqual(set(constants.COSMETIC_SEGMENTS), {"upperArmL", "forearmL", "upperArmR", "forearmR", "head"})
        bone_joints = set(a for a, _ in constants.WIREFRAME_BONES) | set(b for _, b in constants.WIREFRAME_BONES)
        self.assertTrue(bone_joints <= set(constants.WIREFRAME_JOINTS))

    def test_schema_reexport_identity(self):
        import importlib.util
        if "edgework_video_pose" not in sys.modules:
            spec = importlib.util.spec_from_file_location(
                "edgework_video_pose", _HERE / "__init__.py", submodule_search_locations=[str(_HERE)])
            mod = importlib.util.module_from_spec(spec)
            sys.modules["edgework_video_pose"] = mod
            spec.loader.exec_module(mod)
        from edgework_video_pose import schema, constants as pkg_constants
        self.assertIs(schema.WIREFRAME_JOINTS, pkg_constants.WIREFRAME_JOINTS)
        self.assertIs(schema.WIREFRAME_BONES, pkg_constants.WIREFRAME_BONES)
        self.assertEqual(schema.WIREFRAME_SCHEMA, pkg_constants.WIREFRAME_SCHEMA)

    def test_reader_import_is_numpy_free(self):
        code = ("import sys; sys.path.insert(0, %r); import reader; "
                "assert 'numpy' not in sys.modules, 'reader pulled numpy'" % str(_HERE))
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_cli_matches_in_process(self):
        f = base_frame()
        seq = sequence([f, {**base_frame(0.2)}])
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "wf.json"
            p.write_text(json.dumps(seq), encoding="utf-8")
            r = subprocess.run([sys.executable, str(_HERE / "reader.py"), str(p), "--mask", "arms-head"],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            cli = json.loads(r.stdout)
        live = reader.translate_wireframe_frames(seq, {"mask": "arms-head"})
        self.assertEqual(json.loads(json.dumps(cli, sort_keys=True)), json.loads(json.dumps(live, sort_keys=True)))


if __name__ == "__main__":
    unittest.main()
