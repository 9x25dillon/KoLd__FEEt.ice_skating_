// Presentation only: the routine supplies the element, the sim supplies the foot and clock.
import { FOOT, MOVE } from '../../sim/types.ts';
import type { SkaterState } from '../../sim/types.ts';
import { JUMP_PHASE } from '../../sim/jump.ts';
import { SIM_DT } from '../../sim/params.ts';
import { CLIP_BY_ID } from './library.ts';
import { sample, DEFAULT_RIG } from './types.ts';
import type { Pose, Vec3 } from './types.ts';
import type { MotionFrame } from './player.ts';
import type { performancePose } from '../appearance.ts';

/** Authored presentation mapping, not an assertion that the sim executed a swing roll. */
export function stepClipFrame(s: SkaterState, element: string | null | undefined): MotionFrame | null {
  if (element !== 'step' || s.fallen || s.jump.phase !== JUMP_PHASE.None || (s.move !== MOVE.None && s.move !== MOVE.Turn && s.move !== MOVE.Twizzle)) return null;
  const id = s.strokeFoot === FOOT.Right ? 'step.swing-roll.mirror' : 'step.swing-roll';
  const clip = CLIP_BY_ID.get(id)!;
  // Absolute sim time makes repeated snapshots and skipped render frames immaterial.
  const t = (s.tick * SIM_DT) % clip.duration;
  const { upperArmL, forearmL, upperArmR, forearmR } = sample(clip, t).seg!;
  return { layer: 'arms', clip: id, t, pose: { seg: { upperArmL, forearmL, upperArmR, forearmR } } };
}

/** Browser equivalent of skater.gd's arm overlay. Only fresh render elbows/hands are written. */
export class StepArmBlend {
  private pose: Pose | null = null;
  private weight = 0;
  private tick: number | null = null;
  reset(): void { this.pose = null; this.weight = 0; this.tick = null; }
  apply(render: ReturnType<typeof performancePose>, s: SkaterState, frame: MotionFrame | null): void {
    if (this.tick !== null && s.tick < this.tick) this.reset();
    const dt = this.tick === null ? 0 : (s.tick - this.tick) * SIM_DT;
    this.tick = s.tick;
    if (frame) this.pose = frame.pose;
    // Authored 0.2 s ease, using simulation time so pause holds the pose.
    this.weight = frame ? Math.min(1, this.weight + dt * 5) : Math.max(0, this.weight - dt * 5);
    if (!this.pose || this.weight === 0) return;
    const w = this.weight * this.weight * (3 - 2 * this.weight);
    const offset = (v: Vec3, length: number) => ({
      x: (s.heading.y * v[0] + s.heading.x * v[2]) * length,
      y: (-s.heading.x * v[0] + s.heading.y * v[2]) * length,
      z: v[1] * length,
    });
    for (const [i, side] of ['L', 'R'].entries()) {
      const a = this.pose.seg?.[side === 'L' ? 'upperArmL' : 'upperArmR'];
      const b = this.pose.seg?.[side === 'L' ? 'forearmL' : 'forearmR'];
      if (!a || !b) continue;
      const shoulder = render.body.shoulders[i], upper = offset(a, DEFAULT_RIG.upperArm), fore = offset(b, DEFAULT_RIG.forearm);
      const elbow = { x: shoulder.x + upper.x, y: shoulder.y + upper.y, z: shoulder.z + upper.z };
      const hand = { x: elbow.x + fore.x, y: elbow.y + fore.y, z: elbow.z + fore.z };
      for (const axis of ['x', 'y', 'z'] as const) {
        render.elbows[i][axis] += (elbow[axis] - render.elbows[i][axis]) * w;
        render.body.hands[i][axis] += (hand[axis] - render.body.hands[i][axis]) * w;
      }
    }
  }
}
