"""Offline Video-to-Wireframe extraction, rink calibration, kinematics sidecars, and wireframe rendering.

Outputs `edgework-wireframe/1` JSON (consumed by `tools/ice-lab/game/motion/wireframe.ts`)
and `edgework-validation-sidecar/1` candidate metrics (for human-reviewed entry into
`data/validation/cases/`). Strictly offline and decoupled from `sim/solver.ts` and `/39` replays.
"""

from .schema import WIREFRAME_BONES, WIREFRAME_JOINTS, WIREFRAME_SCHEMA

__all__ = ["WIREFRAME_SCHEMA", "WIREFRAME_JOINTS", "WIREFRAME_BONES"]
