"""Gate A unit tests for `edgework-video intake` and M0 schemas.

Generates synthetic video fixtures at test time with `ffmpeg testsrc` inside a
temporary directory outside the repository:
  - constant 30 fps
  - broadcast 60000/1001 fps
  - variable frame rate (VFR)
  - rotation metadata tag
  - interlaced frame flags
  - missing authorization.basis -> exit 3
  - --takes-root inside a git worktree -> exit 3
  - byte-for-byte determinism across two runs (run log excluded)
  - M0 schema validation of Blueprint §10 wireframe/1 and evidence/1 examples
"""

from __future__ import annotations

from fractions import Fraction
import json
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
from edgework_video.schemas import (
    validate_evidence_sidecar,
    validate_frames_doc,
    validate_take_manifest,
    validate_wireframe_export,
)


def _ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {proc.stderr}")


def _write_manifest(path: Path, take_id: str = "take-0001", **overrides: object) -> Path:
    doc: dict[str, object] = {
        "takeId": take_id,
        "authorization": {
            "basis": "owner-self-filmed",
            "by": "owner",
            "date": "2026-11-23",
            "scope": "research-only",
        },
        "subject": {"id": "anon-01", "consent": "self"},
        "mirrored": False,
        "playback": "live",
        "venue": "practice-rink-01",
    }
    doc.update(overrides)
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


class TestIntakeFixtures(unittest.TestCase):
    def test_constant_30fps_and_determinism_and_verify(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            video = root / "cfr30.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.5:size=160x120:rate=30",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="cfr-30")
            takes_a = root / "takes-a"
            takes_b = root / "takes-b"

            rc_a = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes_a)])
            rc_b = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes_b)])
            self.assertEqual(rc_a, EXIT_OK)
            self.assertEqual(rc_b, EXIT_OK)

            dir_a = takes_a / "cfr-30"
            dir_b = takes_b / "cfr-30"

            # Never copy source video into take directory.
            self.assertFalse(any(p.suffix == ".mp4" for p in dir_a.rglob("*")))

            # Byte-for-byte determinism across runs (run logs excluded).
            for rel in ("manifest.json", "probe/streams.json", "probe/frames.json"):
                self.assertEqual((dir_a / rel).read_bytes(), (dir_b / rel).read_bytes(), f"{rel} must be deterministic")

            m_doc = json.loads((dir_a / "manifest.json").read_text(encoding="utf-8"))
            f_doc = json.loads((dir_a / "probe/frames.json").read_text(encoding="utf-8"))
            self.assertEqual(validate_take_manifest(m_doc), [])
            self.assertEqual(validate_frames_doc(f_doc), [])
            self.assertAlmostEqual(f_doc["nominalFps"], 30.0, places=3)
            self.assertFalse(f_doc["vfr"])
            self.assertEqual(f_doc["frameCount"], 15)
            # Check exact rational math on frame 5.
            tb = Fraction(f_doc["timeBase"])
            fr5 = f_doc["frames"][5]
            self.assertEqual(Fraction(fr5["tExact"]), Fraction(fr5["pts"]) * tb)

            # Verify subcommand passes.
            self.assertEqual(main(["verify", str(dir_a)]), EXIT_OK)

    def test_broadcast_60000_1001(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            video = root / "ntsc5994.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.4:size=160x120:rate=60000/1001",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="ntsc-5994")
            takes = root / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_OK)
            f_doc = json.loads((takes / "ntsc-5994/probe/frames.json").read_text(encoding="utf-8"))
            self.assertAlmostEqual(f_doc["nominalFps"], 60000 / 1001, places=2)
            self.assertFalse(f_doc["vfr"])
            self.assertGreaterEqual(f_doc["frameCount"], 20)

    def test_vfr_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # Synthesize an explicit VFR Matroska clip via concat demuxer (uneven frame durations).
            img = root / "frame.png"
            _ffmpeg(["-f", "lavfi", "-i", "testsrc=duration=0.04:size=160x120:rate=25", "-frames:v", "1", str(img)])
            concat = root / "vfr.txt"
            durations = [0.033, 0.033, 0.120, 0.033, 0.033, 0.080, 0.033, 0.033]
            lines = []
            for d in durations:
                lines.append(f"file '{img.name}'")
                lines.append(f"duration {d}")
            lines.append(f"file '{img.name}'")
            concat.write_text("\n".join(lines) + "\n", encoding="utf-8")

            video = root / "vfr.mkv"
            _ffmpeg([
                "-f", "concat", "-safe", "0", "-i", str(concat),
                "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="vfr-clip")
            takes = root / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_OK)
            f_doc = json.loads((takes / "vfr-clip/probe/frames.json").read_text(encoding="utf-8"))
            self.assertTrue(f_doc["vfr"], f"Expected vfr=True for uneven PTS deltas: {f_doc['frames']}")

    def test_rotation_metadata_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw_video = root / "raw.mp4"
            video = root / "rot90.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.3:size=160x120:rate=30",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(raw_video),
            ])
            _ffmpeg([
                "-display_rotation:v:0", "90", "-i", str(raw_video),
                "-c", "copy", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="rot-90")
            takes = root / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_OK)
            f_doc = json.loads((takes / "rot-90/probe/frames.json").read_text(encoding="utf-8"))
            self.assertEqual(abs(f_doc["rotationDeg"]), 90.0)

    def test_interlaced_flags_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            video = root / "interlaced.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.4:size=160x120:rate=60",
                "-vf", "tinterlace=interleave_top,setfield=tff",
                "-flags", "+ilme+ildct",
                "-c:v", "mpeg2video", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="interlaced-tff")
            takes = root / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_OK)
            f_doc = json.loads((takes / "interlaced-tff/probe/frames.json").read_text(encoding="utf-8"))
            self.assertTrue(f_doc["interlaced"])
            self.assertTrue(any(fr["interlacedFrame"] for fr in f_doc["frames"]))
            self.assertTrue(any(fr["topFieldFirst"] for fr in f_doc["frames"]))

    def test_missing_authorization_exits_3_and_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            video = root / "clip.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.2:size=160x120:rate=30",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(
                root / "no-auth.json",
                take_id="unauth",
                authorization={"basis": "", "by": "owner", "date": "2026-11-23", "scope": "research-only"},
            )
            takes = root / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_PRECONDITION_UNMET)
            self.assertFalse(takes.exists())

    def test_takes_root_inside_git_worktree_exits_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake_repo = root / "repo"
            (fake_repo / ".git").mkdir(parents=True)
            video = root / "clip.mp4"
            _ffmpeg([
                "-f", "lavfi", "-i", "testsrc=duration=0.2:size=160x120:rate=30",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
            ])
            manifest = _write_manifest(root / "in.json", take_id="inside-git")
            takes = fake_repo / "takes"
            rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
            self.assertEqual(rc, EXIT_PRECONDITION_UNMET)
            self.assertFalse(takes.exists())


class TestM0SchemaExamples(unittest.TestCase):
    def test_blueprint_wireframe_and_evidence_examples_validate(self) -> None:
        wireframe_example = {
            "schema": "edgework-wireframe/1",
            "id": "take-0001-s01-armsweep",
            "name": "Arm sweep, take 0001",
            "category": "expression",
            "loop": False,
            "tags": ["subject:anon-07", "shot:S01"],
            "meta": {
                "fps": 59.94,
                "coordSpace": "world-yup",
                "extractor": "gvhmr+vitpose-h (illustrative)",
                "cameraCompensated": True,
                "provenance": "pose-3d",
                "styleTag": "lyrical",
                "ext": {
                    "profile": "edgework-export/1",
                    "time": {"t": "source pts, seconds", "streamTimeBase": "1/60000", "vfr": False, "playback": "live"},
                    "frames": {"world": "W", "from": "backend", "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "det": 1, "verified": "standing-frame test"},
                    "scale": {"status": "model", "source": "SMPL-X mean shape"},
                    "scoreKind": "2D heatmap maximum, uncalibrated",
                    "mirrored": False,
                    "worldGrounding": {"method": "backend camera estimate", "validated": False},
                    "sidecar": "take-0001-s01-armsweep.evidence.json",
                },
            },
            "frames": [
                {
                    "t": 12.4124,
                    "joints": {"pelvis": [0.0, 0.89, 0.0], "wristL": [-0.66, 1.39, -0.11]},
                    "confidence": {"pelvis": 0.90, "wristL": 0.71},
                },
                {
                    "t": 12.429083,
                    "joints": {"pelvis": [0.001, 0.889, -0.004]},
                    "confidence": {"pelvis": 0.90},
                },
            ],
        }
        self.assertEqual(validate_wireframe_export(wireframe_example), [])

        # Missing confidence for a written joint must fail writer rule (§4.3).
        bad_wf = json.loads(json.dumps(wireframe_example))
        del bad_wf["frames"][0]["confidence"]["wristL"]
        self.assertTrue(len(validate_wireframe_export(bad_wf)) > 0)

        evidence_example = {
            "schema": "edgework-evidence/1",
            "take": "take-0001",
            "shot": "S01",
            "clip": "take-0001-s01-jump",
            "inputs": {"manifestSha256": "0" * 64, "sourceSha256": "1" * 64, "exportSha256": None, "annotations": ["A1", "A2"]},
            "time": {"base": "source pts, seconds", "fps": 59.94, "playback": "live", "eventTimeStatus": "assumed-live"},
            "frames": {"image": "I", "plane": None, "scale": {"status": "unknown", "reason": "no surveyed landmarks"}},
            "metrics": [
                {"name": "air_time_s", "observable": "O5", "status": "observed", "value": 0.542, "unit": "s", "promotable": True},
                {"name": "trace_radius_m", "observable": "O2", "status": "unavailable", "reason": "scale unknown"},
                {"name": "wrist_spread_ratio", "observable": None, "status": "model-derived", "value": 0.41, "promotable": False},
            ],
            "rejectedIntervals": [
                {"ptsStart": 29.9963, "ptsEnd": 30.4134, "reason": "identity-ambiguous", "detail": "skater passes coach"},
            ],
            "checks": {"performed": ["schema", "pts-monotonic"], "planned": ["reference-camera-240fps"]},
            "review": {"status": "unreviewed"},
        }
        self.assertEqual(validate_evidence_sidecar(evidence_example), [])

        # model-derived metric marked promotable must fail.
        bad_ev = json.loads(json.dumps(evidence_example))
        bad_ev["metrics"][2]["promotable"] = True
        self.assertTrue(len(validate_evidence_sidecar(bad_ev)) > 0)


if __name__ == "__main__":
    unittest.main()
