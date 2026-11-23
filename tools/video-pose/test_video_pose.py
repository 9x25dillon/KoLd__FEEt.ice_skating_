"""Unit tests for tools/video-pose (schema, homography, spin-blur flagging, sidecar, and safe backend loading)."""

from __future__ import annotations

import importlib.util
import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

_HERE = Path(__file__).resolve().parent


def _ensure_pkg() -> None:
    if "edgework_video_pose" in sys.modules:
        return
    spec = importlib.util.spec_from_file_location(
        "edgework_video_pose",
        _HERE / "__init__.py",
        submodule_search_locations=[str(_HERE)],
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["edgework_video_pose"] = mod
    spec.loader.exec_module(mod)


_ensure_pkg()
from edgework_video_pose.backends import (  # type: ignore[import-not-found]
    extract_from_gvhmr_or_wham,
    extract_from_npz,
    generate_synthetic_sequence,
)
from edgework_video_pose.camera import (  # type: ignore[import-not-found]
    RINK_MARKINGS,
    fit_circle_radius,
    fit_homography,
    pixel_to_rink,
)
from edgework_video_pose.kinematics import (  # type: ignore[import-not-found]
    build_validation_metrics,
    flag_spin_blur_and_anomalies,
)
from edgework_video_pose.schema import (  # type: ignore[import-not-found]
    WIREFRAME_JOINTS,
    map_joints_frame,
    validate_sequence,
)


class VideoPoseTests(unittest.TestCase):
    def test_smpl24_and_coco17_mapping_produce_valid_edgework_joints(self) -> None:
        smpl = np.zeros((24, 3), dtype=np.float64)
        for i in range(24):
            smpl[i] = [0.1 * i, 0.9, -0.05 * i]
        joints, scores = map_joints_frame(smpl, "smpl24")
        self.assertEqual(set(joints.keys()), set(WIREFRAME_JOINTS))
        self.assertTrue(all(v == 1.0 for v in scores.values()))

        coco = np.zeros((17, 3), dtype=np.float64)
        coco[11], coco[12] = [-0.1, 0.9, 0.0], [0.1, 0.9, 0.0]
        coco[5], coco[6] = [-0.2, 1.4, 0.0], [0.2, 1.4, 0.0]
        c_joints, _ = map_joints_frame(coco, "coco17")
        self.assertIn("pelvis", c_joints)
        self.assertIn("chest", c_joints)
        self.assertAlmostEqual(c_joints["pelvis"][1], 0.9, places=4)

    def test_rink_homography_and_circle_fit_recover_exact_radii(self) -> None:
        # Synthetic overhead camera: 40 px/m centered at (640, 360)
        world = RINK_MARKINGS["center_circle"]["world_points_m"]
        pixels = [[640.0 + 40.0 * wx, 360.0 - 40.0 * wy] for wx, wy in world]
        cal = fit_homography(pixels, world, marking="center_circle")
        self.assertLess(cal.reprojection_rmse_m, 1e-6)
        wx, wy = pixel_to_rink(cal.homography, 640.0 + 40.0 * 4.5, 360.0)
        self.assertAlmostEqual(wx, 4.5, places=4)
        self.assertAlmostEqual(wy, 0.0, places=4)

        angles = np.linspace(0.0, math.pi * 0.75, 40)
        pts = [(6.0 * math.cos(a), 6.0 * math.sin(a)) for a in angles]
        fit = fit_circle_radius(pts)
        self.assertIsNotNone(fit)
        assert fit is not None
        self.assertAlmostEqual(fit["radius_m"], 6.0, places=3)
        self.assertLess(fit["residual_rmse_m"], 1e-3)

    def test_synthetic_carve_spin_jump_recover_ground_truth_metrics(self) -> None:
        carve = generate_synthetic_sequence("carve", fps=30.0)
        self.assertEqual(validate_sequence(carve), [])
        m_carve = build_validation_metrics(carve)
        # Two-foot stance places the inner support ankle 10.5 cm inside center, shifting blade->mid angle ~3.5 deg.
        self.assertAlmostEqual(m_carve["observables"]["O1_carve"]["median"], 18.5, delta=1.5)
        self.assertAlmostEqual(m_carve["observables"]["O2_tracing"]["value"], 6.0, delta=0.15)
        self.assertAlmostEqual(m_carve["observables"]["O4_glide"]["value"], 0.072, delta=0.02)

        spin = generate_synthetic_sequence("spin", fps=30.0)
        m_spin = build_validation_metrics(spin)
        self.assertLess(m_spin["observables"]["O6_inertia"]["arm_spread_ratio"], 0.45)
        self.assertGreater(m_spin["observables"]["O6_inertia"]["spin_up_ratio"], 1.5)

        jump = generate_synthetic_sequence("jump", fps=60.0)
        m_jump = build_validation_metrics(jump)
        self.assertAlmostEqual(m_jump["observables"]["O5_jump"]["value"], 0.60, delta=0.08)

    def test_camera_space_blocks_world_trajectory_observables(self) -> None:
        carve = generate_synthetic_sequence("carve", fps=30.0)
        carve["meta"]["cameraCompensated"] = False
        m = build_validation_metrics(carve)
        self.assertIsNone(m["observables"]["O2_tracing"]["value"])
        self.assertIsNone(m["observables"]["O4_glide"]["value"])

    def test_bone_stretch_and_camera_cut_lower_confidence(self) -> None:
        seq = generate_synthetic_sequence("spin", fps=30.0)
        # Corrupt wristR on frame 10 (impossible 2 m forearm stretch)
        seq["frames"][10]["joints"]["wristR"] = [5.0, 5.0, 5.0]
        flagged = flag_spin_blur_and_anomalies(seq, cut_frames=[5])
        self.assertIn("camera-cut", flagged["frames"][5]["flags"])
        self.assertLessEqual(flagged["frames"][5]["confidence"]["pelvis"], 0.15)
        self.assertIn("bone-stretch", flagged["frames"][10]["flags"])
        self.assertLessEqual(flagged["frames"][10]["confidence"]["wristR"], 0.25)

    def test_npz_safe_ingestion_and_pt_checkpoint_guard(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            p_npz = Path(td) / "world_clip.npz"
            arr = np.zeros((10, 24, 3), dtype=np.float64)
            arr[:, :, 1] = 1.0
            np.savez(p_npz, joints3d_global=arr, fps=np.array(30.0))
            seq = extract_from_npz(p_npz, layout="smpl24", coord_space="world-zup")
            self.assertEqual(validate_sequence(seq), [])
            self.assertEqual(len(seq["frames"]), 10)

            fake_pt = Path(td) / "hmr4d_results.pt"
            fake_pt.write_bytes(b"not-a-real-checkpoint")
            with self.assertRaises(PermissionError):
                extract_from_gvhmr_or_wham(fake_pt, "gvhmr", trust_checkpoint=False)


if __name__ == "__main__":
    unittest.main()
