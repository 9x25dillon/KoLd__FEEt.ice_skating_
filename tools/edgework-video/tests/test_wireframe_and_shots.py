"""Gate A tests for Python `edgework-wireframe/1` translator and `shots` cut detection."""

from __future__ import annotations

import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PKG_ROOT = Path(__file__).resolve().parents[1]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

from edgework_video import EXIT_INVALID_INPUT, EXIT_OK, EdgeworkVideoError
from edgework_video.cli import main
from edgework_video.shots import build_shots_from_cuts
from edgework_video.wireframe import ARMS_HEAD_SEGMENTS, translate_wireframe


def _standing_joints(yaw_deg: float = 0.0, pelvis_y: float = 0.89, scale: float = 1.0) -> dict[str, list[float]]:
    """Build a synthetic upright skater in world +Y up rotated by `yaw_deg` around Y."""
    r = math.radians(yaw_deg)
    c, s = math.cos(r), math.sin(r)

    def rot(x: float, y: float, z: float) -> list[float]:
        return [round(x * c - z * s, 6), round(y, 6), round(x * s + z * c, 6)]

    return {
        "pelvis": rot(0.0, pelvis_y, 0.0),
        "hipL": rot(-0.105 * scale, pelvis_y, 0.0),
        "hipR": rot(0.105 * scale, pelvis_y, 0.0),
        "kneeL": rot(-0.105 * scale, pelvis_y - 0.41 * scale, 0.0),
        "kneeR": rot(0.105 * scale, pelvis_y - 0.41 * scale, 0.0),
        "ankleL": rot(-0.105 * scale, pelvis_y - 0.786 * scale, 0.0),
        "ankleR": rot(0.105 * scale, pelvis_y - 0.786 * scale, 0.0),
        "toeL": rot(-0.105 * scale, pelvis_y - 0.86 * scale, -0.22 * scale),
        "toeR": rot(0.105 * scale, pelvis_y - 0.86 * scale, -0.22 * scale),
        "chest": rot(0.0, pelvis_y + 0.44 * scale, 0.0),
        "neck": rot(0.0, pelvis_y + 0.52 * scale, 0.0),
        "crown": rot(0.0, pelvis_y + 0.74 * scale, 0.0),
        "shoulderL": rot(-0.185 * scale, pelvis_y + 0.40 * scale, 0.0),
        "shoulderR": rot(0.185 * scale, pelvis_y + 0.40 * scale, 0.0),
        "elbowL": rot(-0.46 * scale, pelvis_y + 0.40 * scale, 0.0),
        "elbowR": rot(0.46 * scale, pelvis_y + 0.45 * scale, -0.05 * scale),
        "wristL": rot(-0.66 * scale, pelvis_y + 0.40 * scale, 0.0),
        "wristR": rot(0.66 * scale, pelvis_y + 0.50 * scale, -0.10 * scale),
    }


def _make_wireframe(frames: list[dict[str, object]], mirrored: object = False) -> dict[str, object]:
    return {
        "schema": "edgework-wireframe/1",
        "id": "test-wf-01",
        "name": "Test Wireframe",
        "category": "expression",
        "loop": False,
        "tags": ["subject:anon-01"],
        "meta": {
            "fps": 60.0,
            "coordSpace": "world-yup",
            "extractor": "synthetic-fixture",
            "cameraCompensated": True,
            "provenance": "synthetic",
            "ext": {
                "profile": "edgework-export/1",
                "time": {"t": "source pts, seconds", "streamTimeBase": "1/60", "vfr": False, "playback": "live"},
                "frames": {"world": "W", "from": "synthetic", "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "det": 1, "verified": "fixture"},
                "scale": {"status": "model", "source": "fixture"},
                "scoreKind": "fixture",
                "mirrored": mirrored,
                "worldGrounding": {"method": "fixture", "validated": False},
                "sidecar": "test-wf-01.evidence.json",
            },
        },
        "frames": frames,
    }


def _conf_all(joints: dict[str, list[float]], val: float = 0.95) -> dict[str, float]:
    return {k: val for k in joints}


class TestWireframeTranslator(unittest.TestCase):
    def test_arms_head_mask_isolates_cosmetic_fields_and_rejects_upper_body(self) -> None:
        j0 = _standing_joints(yaw_deg=0.0)
        j1 = _standing_joints(yaw_deg=10.0)
        wf = _make_wireframe([
            {"t": 0.0, "joints": j0, "confidence": _conf_all(j0)},
            {"t": 0.016667, "joints": j1, "confidence": _conf_all(j1)},
        ])
        res = translate_wireframe(wf, mask="arms-head")
        self.assertEqual(res["qa"]["acceptedFrames"], 2)
        for key in res["clip"]["keys"]:
            pose = key["pose"]
            self.assertNotIn("pelvis", pose)
            self.assertNotIn("twist", pose)
            self.assertTrue(set(pose["seg"].keys()).issubset(ARMS_HEAD_SEGMENTS))

        with self.assertRaises(EdgeworkVideoError) as ctx:
            translate_wireframe(wf, mask="upper-body")
        self.assertEqual(ctx.exception.exit_code, EXIT_INVALID_INPUT)

    def test_strict_confidence_rejects_missing_score(self) -> None:
        j0 = _standing_joints()
        c0 = _conf_all(j0)
        del c0["wristL"]
        wf = _make_wireframe([{"t": 0.0, "joints": j0, "confidence": c0}])
        with self.assertRaises(EdgeworkVideoError) as ctx:
            translate_wireframe(wf, mask="arms-head")
        self.assertEqual(ctx.exception.exit_code, EXIT_INVALID_INPUT)

    def test_mirrored_flips_x_and_swaps_lr(self) -> None:
        j0 = _standing_joints()
        wf_normal = _make_wireframe([{"t": 0.0, "joints": j0, "confidence": _conf_all(j0)}], mirrored=False)
        wf_mirror = _make_wireframe([{"t": 0.0, "joints": j0, "confidence": _conf_all(j0)}], mirrored=True)
        seg_n = translate_wireframe(wf_normal, mask="arms-head")["clip"]["keys"][0]["pose"]["seg"]
        seg_m = translate_wireframe(wf_mirror, mask="arms-head")["clip"]["keys"][0]["pose"]["seg"]
        # Right arm was raised slightly (+0.05 in y); after mirroring, upperArmL carries the raised arm!
        self.assertAlmostEqual(seg_m["upperArmL"][1], seg_n["upperArmR"][1], places=4)
        self.assertAlmostEqual(seg_m["upperArmL"][0], -seg_n["upperArmR"][0], places=4)

    def test_lr_swap_detected_and_corrected_on_180_jump(self) -> None:
        j0 = _standing_joints(yaw_deg=0.0)
        # Swap L/R joints on frame 1 -> hip vector flips 180 deg.
        j1 = dict(j0)
        for l_key, r_key in (("hipL", "hipR"), ("shoulderL", "shoulderR"), ("elbowL", "elbowR"), ("wristL", "wristR")):
            j1[l_key], j1[r_key] = j0[r_key], j0[l_key]
        wf = _make_wireframe([
            {"t": 0.0, "joints": j0, "confidence": _conf_all(j0)},
            {"t": 0.016667, "joints": j1, "confidence": _conf_all(j1)},
        ])
        res = translate_wireframe(wf, mask="arms-head")
        self.assertEqual(res["qa"]["acceptedFrames"], 2)
        self.assertEqual(res["qa"]["frames"][1].get("lrSwap"), "corrected")

    def test_degenerate_basis_holds_at_most_2_frames_then_rejects(self) -> None:
        j_ok = _standing_joints()
        j_deg = dict(j_ok)
        # Make hip line nearly vertical (|h_perp| < 0.5 |h|).
        j_deg["hipL"] = [0.0, 0.70, 0.0]
        j_deg["hipR"] = [0.01, 0.95, 0.0]
        frames = [
            {"t": 0.00, "joints": j_ok, "confidence": _conf_all(j_ok)},
            {"t": 0.02, "joints": j_deg, "confidence": _conf_all(j_deg)},  # held #1
            {"t": 0.04, "joints": j_deg, "confidence": _conf_all(j_deg)},  # held #2
            {"t": 0.06, "joints": j_deg, "confidence": _conf_all(j_deg)},  # rejected!
        ]
        res = translate_wireframe(_make_wireframe(frames), mask="arms-head")
        self.assertEqual(res["qa"]["acceptedFrames"], 3)
        self.assertEqual(res["qa"]["rejectedFrames"], 1)
        self.assertEqual(res["qa"]["frames"][3]["reason"], "basis-degenerate")

    def test_full_mask_retargets_pelvis_by_leg_ratio(self) -> None:
        # 1.2x taller source athlete (leg length = 1.2 * 0.786, pelvis_y = 1.2 * 0.89).
        j_tall = _standing_joints(pelvis_y=0.89 * 1.2, scale=1.2)
        wf = _make_wireframe([{"t": 0.0, "joints": j_tall, "confidence": _conf_all(j_tall)}])
        res = translate_wireframe(wf, mask="full")
        # Retargeted to DEFAULT_RIG leg length -> pelvis returns to ~0.89 m.
        self.assertAlmostEqual(res["clip"]["keys"][0]["pose"]["pelvis"], 0.89, places=2)


class TestShotsPartition(unittest.TestCase):
    def test_build_shots_splits_and_rejects_short_shot(self) -> None:
        frames_doc = {
            "sourceSha256": "a" * 64,
            "medianDurationSec": 0.1,
            "frames": [
                {"index": i, "pts": i * 100, "tSec": round(i * 0.1, 4), "durationSec": 0.1}
                for i in range(40)  # 4.0 s total
            ],
        }
        # Cut at 0.5 s -> shot 1 is 0.5 s (< 2.0 s, rejected), shot 2 is 3.5 s (accepted).
        doc = build_shots_from_cuts(frames_doc, [0.5], min_shot_s=2.0, playback="live")
        self.assertEqual(doc["shotCount"], 2)
        self.assertFalse(doc["shots"][0]["accepted"])
        self.assertTrue(doc["shots"][1]["accepted"])

    def test_export_cli_writes_clip_track_qa(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            j0 = _standing_joints()
            wf_path = root / "wf.json"
            wf_path.write_text(json.dumps(_make_wireframe([{"t": 0.0, "joints": j0, "confidence": _conf_all(j0)}])), encoding="utf-8")
            out_dir = root / "out"
            rc = main(["export", str(wf_path), "--out-dir", str(out_dir), "--mask", "arms-head"])
            self.assertEqual(rc, EXIT_OK)
            self.assertTrue((out_dir / "test-wf-01.clip.json").is_file())
            self.assertTrue((out_dir / "test-wf-01.track.json").is_file())
            self.assertTrue((out_dir / "test-wf-01.qa.json").is_file())

            preview_html = out_dir / "wireframe.html"
            rc_p = main(["preview", str(wf_path), "--out", str(preview_html)])
            self.assertEqual(rc_p, EXIT_OK)
            self.assertIn("edgework-export-sha256", preview_html.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
