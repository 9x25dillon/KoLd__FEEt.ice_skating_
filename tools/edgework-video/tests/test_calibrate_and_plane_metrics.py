"""Gate A tests for `edgework-video calibrate` and calibrated O2 / O4 / O7 metrics.

Uses an exact synthetic pinhole-perspective camera projecting surveyed ice-plane
landmarks (x, z) -> (u, v) to verify:
  - < 6 matched landmarks rejected with exit 3 (never 4-point zero-RMSE illusion)
  - corrupted held-out landmark exceeding 0.10 m Gate B threshold rejected with exit 3
  - clean 6-landmark calibration passes with near-zero held-out residual
  - O2 `trace_radius_m` recovers a 4.0 m blade carve (>=90° arc) and rejects <90° arc
  - O4 `glide_decel_ms2` & `glide_loss_per_m` recover known deceleration on a held glide
  - O7 `stroke_gain_ms` recovers known +1.2 m/s speed gain across a stroke
"""

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

from edgework_video import EXIT_OK, EXIT_PRECONDITION_UNMET
from edgework_video.cli import main
from edgework_video.schemas import validate_evidence_sidecar


def _project_ice_to_image(x: float, z: float) -> tuple[float, float]:
    """Synthetic elevated camera at (0, 8, -14) looking toward (0, 0, 2) with focal 900 px."""
    # Exact projective transform of the Y=0 plane into 1280x720 image coordinates.
    # World -> camera: tilt down 30 deg around X, translate so ice is in front (+Z_cam > 0).
    cam_x = x
    cam_y_w = -8.0
    cam_z_w = z + 14.0
    pitch = math.radians(30.0)
    cp, sp = math.cos(pitch), math.sin(pitch)
    # Camera +y is down, +z is forward
    cy = -(cam_y_w * cp + cam_z_w * sp)
    cz = -cam_y_w * sp + cam_z_w * cp
    f = 900.0
    u = 640.0 + f * (cam_x / cz)
    v = 360.0 + f * (cy / cz)
    return (round(u, 4), round(v, 4))


def _make_take(root: Path, take_id: str, rate: str = "60", duration: str = "2.0") -> Path:
    video = root / f"{take_id}.mp4"
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=160x120:rate={rate}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    manifest = root / f"{take_id}-in.json"
    manifest.write_text(
        json.dumps({
            "takeId": take_id,
            "authorization": {"basis": "owner-self-filmed", "by": "owner", "date": "2026-11-23", "scope": "research-only"},
            "subject": {"id": "anon-01", "consent": "self"},
            "mirrored": False,
            "playback": "live",
            "venue": "practice-rink-01",
        }),
        encoding="utf-8",
    )
    takes = root / "takes"
    rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
    assert rc == EXIT_OK
    return takes / take_id


SURVEYED_LANDMARKS = {
    "L1": [-6.0, -4.0],
    "L2": [6.0, -4.0],
    "L3": [6.0, 6.0],
    "L4": [-6.0, 6.0],
    "L5": [0.0, -2.0],
    "L6": [0.0, 5.0],
}


class TestCalibrateAndPlaneMetrics(unittest.TestCase):
    def test_fewer_than_6_landmarks_rejected_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "cal-few", duration="0.5")
            four = dict(list(SURVEYED_LANDMARKS.items())[:4])
            venue = root / "venue.json"
            picks = root / "picks.json"
            venue.write_text(json.dumps({"venueId": "r1", "scaleStatus": "surveyed", "scaleSource": "tape", "landmarks": four}), encoding="utf-8")
            picks.write_text(json.dumps({"frameIndex": 0, "picks": {k: list(_project_ice_to_image(*v)) for k, v in four.items()}}), encoding="utf-8")
            rc = main(["calibrate", str(take_dir), "--shot", "S01", "--venue", str(venue), "--landmarks", str(picks)])
            self.assertEqual(rc, EXIT_PRECONDITION_UNMET)

    def test_corrupted_holdout_rejected_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "cal-bad", duration="0.5")
            venue = root / "venue.json"
            picks = root / "picks.json"
            venue.write_text(json.dumps({"venueId": "r1", "scaleStatus": "surveyed", "scaleSource": "tape", "landmarks": SURVEYED_LANDMARKS}), encoding="utf-8")
            p_map = {k: list(_project_ice_to_image(*v)) for k, v in SURVEYED_LANDMARKS.items()}
            # Corrupt held-out landmark L6 by 40 px (~> 0.5 m error on ice).
            p_map["L6"][0] += 40.0
            picks.write_text(json.dumps({"frameIndex": 0, "picks": p_map}), encoding="utf-8")
            rc = main(["calibrate", str(take_dir), "--shot", "S01", "--venue", str(venue), "--landmarks", str(picks)])
            self.assertEqual(rc, EXIT_PRECONDITION_UNMET)
            calib = json.loads((take_dir / "shots/S01/calib/camera.json").read_text(encoding="utf-8"))
            self.assertEqual(calib["status"], "rejected")

    def test_calibrated_o2_o4_o7_reconstructed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "plane-60", rate="60", duration="2.0")
            venue = root / "venue.json"
            picks = root / "picks.json"
            venue.write_text(json.dumps({"venueId": "r1", "scaleStatus": "surveyed", "scaleSource": "laser tape", "landmarks": SURVEYED_LANDMARKS}), encoding="utf-8")
            p_map = {k: list(_project_ice_to_image(*v)) for k, v in SURVEYED_LANDMARKS.items()}
            picks.write_text(json.dumps({"frameIndex": 0, "picks": p_map}), encoding="utf-8")

            rc = main(["calibrate", str(take_dir), "--shot", "S01", "--venue", str(venue), "--landmarks", str(picks)])
            self.assertEqual(rc, EXIT_OK)
            calib = json.loads((take_dir / "shots/S01/calib/camera.json").read_text(encoding="utf-8"))
            self.assertEqual(calib["status"], "accepted")
            self.assertLess(calib["maxHoldoutResidualM"], 0.005)

            rows = ["event,frame_index,phase,value,note"]
            # O2: 6 points along a 4.0 m radius circle spanning 120 deg (center (0, 2)).
            for k in range(6):
                ang = math.radians(-60.0 + k * 24.0)
                x = 4.0 * math.sin(ang)
                z = 2.0 + 4.0 * (1.0 - math.cos(ang))
                u, v = _project_ice_to_image(x, z)
                rows.append(f"blade_contact,{5 + k * 4},carve,\"{u},{v}\",")

            # O4: glide along x(t) = v0*t - 0.5*a*t^2 with v0=5.0 m/s, a=0.40 m/s^2 over 1.0 s (frames 30..90).
            for f_idx in (30, 45, 60, 75, 90):
                t = (f_idx - 30) / 60.0
                x = -2.5 + 5.0 * t - 0.5 * 0.40 * t * t
                u, v = _project_ice_to_image(x, 1.0)
                rows.append(f"blade_contact,{f_idx},glide,\"{u},{v}\",")

            # O7: stroke_before at 3.0 m/s (frames 92..98), stroke_after at 4.2 m/s (frames 104..110) -> +1.2 m/s.
            for f_idx in (92, 98):
                t = (f_idx - 92) / 60.0
                u, v = _project_ice_to_image(-1.0 + 3.0 * t, 3.0)
                rows.append(f"blade_contact,{f_idx},stroke_before,\"{u},{v}\",")
            for f_idx in (104, 110):
                t = (f_idx - 104) / 60.0
                u, v = _project_ice_to_image(0.0 + 4.2 * t, 3.0)
                rows.append(f"blade_contact,{f_idx},stroke_after,\"{u},{v}\",")

            csv_text = "\n".join(rows) + "\n"
            a1 = root / "a1.csv"
            a2 = root / "a2.csv"
            a1.write_text(csv_text, encoding="utf-8")
            a2.write_text(csv_text, encoding="utf-8")

            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a1), "--annotator", "A1"]), EXIT_OK)
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2), "--annotator", "A2"]), EXIT_OK)
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O2,O4,O7", "--clip", "plane1"]), EXIT_OK)

            ev = json.loads((take_dir / "shots/S01/evidence/plane1.evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(validate_evidence_sidecar(ev), [])
            self.assertEqual(ev["frames"]["plane"], "P")
            self.assertEqual(ev["frames"]["scale"]["status"], "surveyed")
            by_name = {m["name"]: m for m in ev["metrics"]}

            self.assertEqual(by_name["trace_radius_m"]["status"], "reconstructed")
            self.assertAlmostEqual(by_name["trace_radius_m"]["value"], 4.0, places=2)

            self.assertEqual(by_name["glide_decel_ms2"]["status"], "reconstructed")
            self.assertAlmostEqual(by_name["glide_decel_ms2"]["value"], 0.40, places=2)

            self.assertEqual(by_name["stroke_gain_ms"]["status"], "reconstructed")
            self.assertAlmostEqual(by_name["stroke_gain_ms"]["value"], 1.20, places=2)

    def test_o2_rejects_arc_under_90_deg(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "arc-short", rate="60", duration="1.0")
            venue = root / "venue.json"
            picks = root / "picks.json"
            venue.write_text(json.dumps({"venueId": "r1", "scaleStatus": "surveyed", "scaleSource": "laser tape", "landmarks": SURVEYED_LANDMARKS}), encoding="utf-8")
            picks.write_text(json.dumps({"frameIndex": 0, "picks": {k: list(_project_ice_to_image(*v)) for k, v in SURVEYED_LANDMARKS.items()}}), encoding="utf-8")
            self.assertEqual(main(["calibrate", str(take_dir), "--shot", "S01", "--venue", str(venue), "--landmarks", str(picks)]), EXIT_OK)

            rows = ["event,frame_index,phase,value,note"]
            # Only 40 deg of arc -> must be unavailable!
            for k in range(5):
                ang = math.radians(k * 10.0)
                u, v = _project_ice_to_image(4.0 * math.sin(ang), 2.0 + 4.0 * (1.0 - math.cos(ang)))
                rows.append(f"blade_contact,{5 + k * 3},carve,\"{u},{v}\",")
            csv_text = "\n".join(rows) + "\n"
            for ann in ("A1", "A2"):
                p = root / f"{ann}.csv"
                p.write_text(csv_text, encoding="utf-8")
                self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(p), "--annotator", ann]), EXIT_OK)
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O2", "--clip", "short"]), EXIT_OK)
            ev = json.loads((take_dir / "shots/S01/evidence/short.evidence.json").read_text(encoding="utf-8"))
            o2 = {m["name"]: m for m in ev["metrics"]}["trace_radius_m"]
            self.assertEqual(o2["status"], "unavailable")
            self.assertIn("90°", o2["reason"])


if __name__ == "__main__":
    unittest.main()
