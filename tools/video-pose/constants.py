"""Shared edgework-wireframe/1 constants and authored reader thresholds (stdlib only).

Byte-for-byte parity with `tools/ice-lab/game/motion/wireframe.ts` (joint names, bone edges,
segment endpoints) and the blueprint's authored thresholds (`EDGEWORK Video Motion Blueprint.md`
§3.3-§3.6, §4.3). `schema.py` re-exports the three name constants so the writer/CLI/kinematics/
render keep working; `reader.py` imports this module directly and never pulls numpy.

The neutral reader output contract is `edgework-wireframe-read/1` (see reader.py header).
"""

from __future__ import annotations

WIREFRAME_SCHEMA = "edgework-wireframe/1"
WIREFRAME_READ_SCHEMA = "edgework-wireframe-read/1"

WIREFRAME_JOINTS: tuple[str, ...] = (
    "pelvis", "hipL", "hipR", "kneeL", "kneeR", "ankleL", "ankleR", "toeL", "toeR",
    "chest", "neck", "crown", "shoulderL", "shoulderR", "elbowL", "elbowR", "wristL", "wristR",
)

WIREFRAME_BONES: tuple[tuple[str, str], ...] = (
    ("pelvis", "hipL"), ("hipL", "kneeL"), ("kneeL", "ankleL"), ("ankleL", "toeL"),
    ("pelvis", "hipR"), ("hipR", "kneeR"), ("kneeR", "ankleR"), ("ankleR", "toeR"),
    ("pelvis", "chest"), ("chest", "neck"), ("neck", "crown"),
    ("chest", "shoulderL"), ("shoulderL", "elbowL"), ("elbowL", "wristL"),
    ("chest", "shoulderR"), ("shoulderR", "elbowR"), ("elbowR", "wristR"),
)

# The 12 motion segments in types.ts SEGMENTS order, each driven by a wireframe bone (a -> b).
SEGMENTS: tuple[str, ...] = (
    "trunk", "head",
    "upperArmL", "forearmL", "upperArmR", "forearmR",
    "thighL", "shinL", "footL", "thighR", "shinR", "footR",
)
SEGMENT_ENDPOINTS: tuple[tuple[str, str, str], ...] = (
    ("trunk", "pelvis", "chest"),
    ("head", "neck", "crown"),
    ("upperArmL", "shoulderL", "elbowL"),
    ("forearmL", "elbowL", "wristL"),
    ("upperArmR", "shoulderR", "elbowR"),
    ("forearmR", "elbowR", "wristR"),
    ("thighL", "hipL", "kneeL"),
    ("shinL", "kneeL", "ankleL"),
    ("footL", "ankleL", "toeL"),
    ("thighR", "hipR", "kneeR"),
    ("shinR", "kneeR", "ankleR"),
    ("footR", "ankleR", "toeR"),
)

# Cosmetic (arms) layer owns exactly these five fields; a wider pose is not a cosmetic pose.
COSMETIC_SEGMENTS: tuple[str, ...] = ("upperArmL", "forearmL", "upperArmR", "forearmR", "head")
# Body layer: trunk, head, legs (no arms, no twist — twist is physics in spins/moves).
BODY_SEGMENTS: tuple[str, ...] = ("trunk", "head", "thighL", "shinL", "footL", "thighR", "shinR", "footR")

# Left/right joint pairs swapped by the mirror correction and the L/R-swap test.
LR_PAIRS: tuple[tuple[str, str], ...] = (
    ("hipL", "hipR"), ("kneeL", "kneeR"), ("ankleL", "ankleR"), ("toeL", "toeR"),
    ("shoulderL", "shoulderR"), ("elbowL", "elbowR"), ("wristL", "wristR"),
)

# Authored reader thresholds (blueprint §3.3-§3.6). Parity-checked against wireframe.ts.
SWAP_TEST_DEG = 120.0          # heading jump above this triggers the L/R-swap test
AMBIGUOUS_STEP_DEG = 90.0      # both-neighbour yaw step above this => heading-ambiguous
DEGENERATE_RATIO = 0.5         # |h_perp| < this * |h| => degenerate hip line (>60 deg from level)
ORTHO_TOL = 1e-6               # max |R^T R - I| and |det - 1| tolerance
DET_TOL = 1e-6
ZERO_LEN_ABS_M = 1e-4          # absolute zero-length floor
ZERO_LEN_MEDIAN_FRAC = 0.1     # fraction of the segment's median length
HOLD_MAX_FRAMES = 2            # hold last valid heading at most this many degenerate frames
UP_CHECK_MIN_Y = 0.95          # standing mean pelvis->neck y must exceed this
DEFAULT_MIN_CONFIDENCE = 0.35
BASIS_MIN_CONFIDENCE = 0.25
TWIST_LIMIT_DEG = 60.0
TWIST_DEADBAND_DEG = 0.25

# Closed flag vocabulary, sorted alphabetically in neutral output for determinism.
FLAG_VOCAB: tuple[str, ...] = (
    "basis:shoulders",
    "heading-ambiguous",
    "heading-held",
    "lr-swap:corrected",
    "lr-swap:suspected",
    "mirror-unknown",
    "mirrored-corrected",
    "pelvis-ratio-derived",
    "score-missing",
    "single-frame-read",
    "up-axis-suspect",
    "up-axis-unverified",
)

REJECT_REASONS: tuple[str, ...] = (
    "no-basis-joints",
    "basis-degenerate",
    "basis-invalid",
    "heading-ambiguous",
    "heading-hold-expired",
    "up-axis-invalid",
)
