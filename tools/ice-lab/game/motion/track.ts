// game/motion/track.ts — a clip baked into poses at a fixed rate, for a client that plays a clip
// with no sim state under it (the podium; later the kiss-and-cry): it steps through the poses by
// time and never samples or eases itself. sample() settles each pose on the ice (onIce), so a
// track stands where its clip says. Presentation only.

import { sample } from "./types.ts";
import type { Clip, Pose } from "./types.ts";

export interface Track { id: string; fps: number; duration: number; loop: boolean; poses: Pose[] }

/** Frames a second a track is baked at unless asked otherwise. AUTHORED: smooth at a podium's pace, small on the wire. */
export const TRACK_FPS = 30;

export function bakeTrack(c: Clip, fps = TRACK_FPS): Track {
  const n = Math.max(1, Math.round(c.duration * fps) + (c.loop ? 0 : 1));
  return { id: c.id, fps, duration: c.duration, loop: c.loop, poses: Array.from({ length: n }, (_, i) => sample(c, i / fps)) };
}

/** The pose a track shows `t` seconds in: looping, or held on its last frame. */
export function trackPose(tr: Track, t: number): Pose {
  const i = Math.floor(Math.max(0, t) * tr.fps);
  return tr.poses[tr.loop ? i % tr.poses.length : Math.min(i, tr.poses.length - 1)];
}
