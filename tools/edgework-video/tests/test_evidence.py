"""Gate A unit tests for `edgework-video annotate` and `edgework-video metrics` (O5/O6).

Uses synthetic `ffmpeg testsrc` clips inside temporary directories outside the repo:
  - 60 fps O5 air_time_s + revolutions_turned (two agreeing annotators -> observed, promotable)
  - 30 fps O5 air_time_s -> observed, promotable=False (um > ±0.05 s band)
  - Annotator disagreement > 1 frame -> status='unavailable'
  - Single annotator only -> status='unavailable'
  - Slow-motion playback -> timing metrics status='unavailable'
  - O6 spin_rate_rps, pull_in_ratio (omega_tucked / omega_open), spin_decay_per_s
  - Uncalibrated O2 request -> status='unavailable' with reason
  - Rejected intervals carried into sidecar + byte-for-byte determinism
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PKG_ROOT = Path(__file__).resolve().parents[1]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

from edgework_video import EXIT_INVALID_INPUT, EXIT_OK
from edgework_video.cli import main
from edgework_video.schemas import validate_evidence_sidecar


def _ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {proc.stderr}")


def _make_take(root: Path, take_id: str, rate: str, duration: str, playback: str = "live") -> Path:
    video = root / f"{take_id}.mp4"
    _ffmpeg([
        "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=160x120:rate={rate}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video),
    ])
    manifest = root / f"{take_id}-in.json"
    manifest.write_text(
        json.dumps({
            "takeId": take_id,
            "authorization": {"basis": "owner-self-filmed", "by": "owner", "date": "2026-11-23", "scope": "research-only"},
            "subject": {"id": "anon-01", "consent": "self"},
            "mirrored": False,
            "playback": playback,
            "venue": "practice-rink-01",
        }),
        encoding="utf-8",
    )
    takes = root / "takes"
    rc = main(["intake", str(video), "--manifest", str(manifest), "--takes-root", str(takes)])
    assert rc == EXIT_OK
    return takes / take_id


class TestEvidenceO5O6(unittest.TestCase):
    def test_o5_60fps_promotable_and_deterministic_and_rejected_interval(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "jump-60", rate="60", duration="1.0")

            # A1: blade_off=10, touchdown=42 (0.5333 s); 2 full passes + 0->18 deg = 2.05 rev
            a1 = root / "a1.csv"
            a1.write_text(
                "event,frame_index,phase,value,note\n"
                "reject_start,2,,identity-ambiguous,passes coach\n"
                "reject_end,5,,identity-ambiguous,clear\n"
                "blade_off,10,,,\n"
                "takeoff_heading_deg,10,,0,\n"
                "rev_pass,24,jump,,\n"
                "rev_pass,38,jump,,\n"
                "touchdown,42,,,\n"
                "landing_heading_deg,42,,18,\n",
                encoding="utf-8",
            )
            # A2: agrees within 1 frame on touchdown (43 -> 0.5500 s) and within 0.125 rev (27 deg = 2.075 rev)
            a2 = root / "a2.csv"
            a2.write_text(
                "event,frame_index,phase,value,note\n"
                "blade_off,10,,,\n"
                "takeoff_heading_deg,10,,0,\n"
                "rev_pass,24,jump,,\n"
                "rev_pass,39,jump,,\n"
                "touchdown,43,,,\n"
                "landing_heading_deg,43,,27,\n",
                encoding="utf-8",
            )

            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a1), "--annotator", "A1"]), EXIT_OK)
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2), "--annotator", "A2"]), EXIT_OK)

            rc1 = main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O5,O2", "--clip", "jump-1"])
            self.assertEqual(rc1, EXIT_OK)
            ev_path = take_dir / "shots/S01/evidence/jump-1.evidence.json"
            bytes_1 = ev_path.read_bytes()

            rc2 = main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O5,O2", "--clip", "jump-1"])
            self.assertEqual(rc2, EXIT_OK)
            self.assertEqual(bytes_1, ev_path.read_bytes(), "evidence sidecar must be byte-for-byte deterministic")

            doc = json.loads(bytes_1.decode("utf-8"))
            self.assertEqual(validate_evidence_sidecar(doc), [])
            by_name = {m["name"]: m for m in doc["metrics"]}

            air = by_name["air_time_s"]
            self.assertEqual(air["status"], "observed")
            self.assertTrue(air["promotable"])
            self.assertAlmostEqual(air["value"], 0.541667, places=3)
            self.assertLessEqual(air["uncertainty"]["halfWidth_s"], 0.05)

            rev = by_name["revolutions_turned"]
            self.assertEqual(rev["status"], "observed")
            self.assertTrue(rev["promotable"])
            self.assertAlmostEqual(rev["value"], 2.0625, places=3)

            o2 = by_name["trace_radius_m"]
            self.assertEqual(o2["status"], "unavailable")
            self.assertIn("homography", o2["reason"])

            self.assertEqual(len(doc["rejectedIntervals"]), 1)
            self.assertEqual(doc["rejectedIntervals"][0]["reason"], "identity-ambiguous")

    def test_o5_30fps_not_promotable_and_disagreement_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "jump-30", rate="30", duration="1.0")
            a1 = root / "a1.csv"
            a1.write_text("event,frame_index\nblade_off,5\ntouchdown,20\n", encoding="utf-8")
            a2 = root / "a2.csv"
            a2.write_text("event,frame_index\nblade_off,5\ntouchdown,20\n", encoding="utf-8")
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a1), "--annotator", "A1"]), EXIT_OK)
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2), "--annotator", "A2"]), EXIT_OK)
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O5", "--clip", "j30"]), EXIT_OK)
            doc = json.loads((take_dir / "shots/S01/evidence/j30.evidence.json").read_text(encoding="utf-8"))
            air = {m["name"]: m for m in doc["metrics"]}["air_time_s"]
            self.assertEqual(air["status"], "observed")
            self.assertFalse(air["promotable"], "30 fps yields um=0.0667s > 0.05s O5 band")

            # Now replace A2 with a 3-frame disagreement -> unavailable.
            a2_bad = root / "a2_bad.csv"
            a2_bad.write_text("event,frame_index\nblade_off,5\ntouchdown,23\n", encoding="utf-8")
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2_bad), "--annotator", "A2"]), EXIT_OK)
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O5", "--clip", "j30-dis"]), EXIT_OK)
            doc2 = json.loads((take_dir / "shots/S01/evidence/j30-dis.evidence.json").read_text(encoding="utf-8"))
            air2 = {m["name"]: m for m in doc2["metrics"]}["air_time_s"]
            self.assertEqual(air2["status"], "unavailable")
            self.assertIn("disagree", air2["reason"])

    def test_slowmo_blocks_timing_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "slow-60", rate="60", duration="1.0", playback="slowmo")
            a1 = root / "a1.csv"
            a1.write_text("event,frame_index\nblade_off,10\ntouchdown,40\n", encoding="utf-8")
            a2 = root / "a2.csv"
            a2.write_text("event,frame_index\nblade_off,10\ntouchdown,40\n", encoding="utf-8")
            main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a1), "--annotator", "A1"])
            main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2), "--annotator", "A2"])
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O5", "--clip", "sm"]), EXIT_OK)
            doc = json.loads((take_dir / "shots/S01/evidence/sm.evidence.json").read_text(encoding="utf-8"))
            air = {m["name"]: m for m in doc["metrics"]}["air_time_s"]
            self.assertEqual(air["status"], "unavailable")
            self.assertIn("slowmo", air["reason"])

    def test_o6_spin_rate_pull_in_ratio_and_decay(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # 2.0 s @ 60 fps = 120 frames
            take_dir = _make_take(root, "spin-60", rate="60", duration="2.0")
            # Open spin: passes at frames 10, 40 (period 0.50 s -> 2.0 rev/s)
            # Tucked spin: passes at frames 50, 65, 81, 98 (periods 0.25s, 0.2667s, 0.2833s -> ~3.75 rev/s, decaying)
            csv_text = (
                "event,frame_index,phase,value,note\n"
                "rev_pass,10,open,,\n"
                "rev_pass,40,open,,\n"
                "rev_pass,50,tucked,,\n"
                "rev_pass,65,tucked,,\n"
                "rev_pass,81,tucked,,\n"
                "rev_pass,98,tucked,,\n"
            )
            a1 = root / "a1.csv"
            a2 = root / "a2.csv"
            a1.write_text(csv_text, encoding="utf-8")
            a2.write_text(csv_text, encoding="utf-8")
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a1), "--annotator", "A1"]), EXIT_OK)
            self.assertEqual(main(["annotate", str(take_dir), "--shot", "S01", "--events", str(a2), "--annotator", "A2"]), EXIT_OK)
            self.assertEqual(main(["metrics", str(take_dir), "--shot", "S01", "--observables", "O6", "--clip", "spin1"]), EXIT_OK)

            doc = json.loads((take_dir / "shots/S01/evidence/spin1.evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(validate_evidence_sidecar(doc), [])
            by_name = {m["name"]: m for m in doc["metrics"]}

            self.assertEqual(by_name["spin_rate_rps"]["status"], "observed")
            self.assertAlmostEqual(by_name["spin_rate_rps"]["value"], 3.75, places=2)
            self.assertEqual(by_name["pull_in_ratio"]["status"], "observed")
            self.assertAlmostEqual(by_name["pull_in_ratio"]["value"], 1.875, places=2)
            self.assertEqual(by_name["spin_decay_per_s"]["status"], "observed")
            self.assertGreater(by_name["spin_decay_per_s"]["value"], 0.0)

    def test_out_of_range_frame_index_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            take_dir = _make_take(root, "oob-30", rate="30", duration="0.5")
            bad = root / "bad.csv"
            bad.write_text("event,frame_index\nblade_off,999\n", encoding="utf-8")
            rc = main(["annotate", str(take_dir), "--shot", "S01", "--events", str(bad), "--annotator", "A1"])
            self.assertEqual(rc, EXIT_INVALID_INPUT)


if __name__ == "__main__":
    unittest.main()
