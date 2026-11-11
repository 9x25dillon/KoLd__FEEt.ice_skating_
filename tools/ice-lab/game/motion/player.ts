// game/motion/player.ts — which clip plays now, from the sim's own state: what a client draws.
//
// Two things, never at once:
//  - a FALL: the moment sim/solver.ts says she has fallen, chooseFall() picks a clip from the sim's
//    own reason, side, speed and whether it came from a landing or a spin; it plays from that
//    moment while she is down. The sim alone decides the fall and when she is up.
//  - a DANCE STYLE's arms (game/motion/dance.ts choreograph): its arm and carriage cues on the
//    program's clock, only while the arms are hers to use: on the ice, out of any jump, spin or
//    formal move. In the air, a load or a spin, the sim's arm carriage (armsL) is physics and the
//    client draws that, as it always has.
// The client eases between "no clip" and a clip with `weight`, so nothing pops. Presentation only.

import type { SkaterState } from "../../sim/types.ts";
import { MOVE } from "../../sim/types.ts";
import { JUMP_PHASE } from "../../sim/jump.ts";
import { chooseFall } from "./falls.ts";
import { fallSide } from "../wear.ts";
import { choreograph, styleById } from "./dance.ts";
import type { ChoreoCue } from "./dance.ts";
import { CLIP_BY_ID } from "./library.ts";
import { sample } from "./types.ts";
import type { Clip, Pose } from "./types.ts";

export interface MotionFrame {
  layer: "full" | "arms";
  clip: string;
  /** Seconds into the clip. */
  t: number;
  pose: Pose;
}
export interface Music { bpm: number; beatsPerBar: number; offset: number }

/** Seconds a landing or a spin still counts as the cause of a fall that follows it. AUTHORED. */
const CAUSE_WINDOW = 0.6;

export class MotionPlayer {
  private fall: { clip: Clip; at: number } | null = null;
  private wasFallen = false;
  private lastLanding = -1;
  private lastLandingAt = -Infinity;
  private lastSpinAt = -Infinity;
  readonly cues: ChoreoCue[];
  private armCues: ChoreoCue[];

  /** `style`: a game/motion/dance.ts id, or null for none; `seconds`: how long the program runs. */
  constructor(style: string | null, music: Music | null, seconds: number, seed = 1) {
    const s = style ? styleById(style) : undefined;
    const bars = music ? Math.max(1, Math.floor((seconds - music.offset) / (60 / music.bpm * music.beatsPerBar))) : 0;
    this.cues = s && music ? choreograph(s, { bpm: music.bpm, beatsPerBar: music.beatsPerBar, offset: music.offset, bars }, seed) : [];
    this.armCues = this.cues.filter(c => c.layer === "arms");
  }

  /** The clip for this moment of the run, or null for the client's own sim-driven pose. */
  frame(s: SkaterState, elapsed: number): MotionFrame | null {
    if (s.landed.tick >= 0 && s.landed.tick !== this.lastLanding) { this.lastLanding = s.landed.tick; this.lastLandingAt = elapsed; }
    if (s.move === MOVE.Spin) this.lastSpinAt = elapsed;
    if (s.fallen && !this.wasFallen) {
      const { fall } = chooseFall({
        // game/wear.ts fallSide owns which hip takes it (+1 her left); chooseFall counts +1 as her right.
        reason: s.fallReason, side: -fallSide(s), speed: Math.hypot(s.vel.x, s.vel.y),
        jump: elapsed - this.lastLandingAt < CAUSE_WINDOW || s.jump.phase !== JUMP_PHASE.None,
        spin: elapsed - this.lastSpinAt < CAUSE_WINDOW, seed: s.tick,
      });
      this.fall = { clip: fall, at: elapsed };
    }
    this.wasFallen = s.fallen;
    if (s.fallen && this.fall) {
      const t = elapsed - this.fall.at;
      return { layer: "full", clip: this.fall.clip.id, t, pose: sample(this.fall.clip, t) };
    }
    this.fall = null;
    const free = s.jump.phase === JUMP_PHASE.None && s.move === MOVE.None;
    if (!free || this.armCues.length === 0) return null;
    let cue: ChoreoCue | undefined;
    for (const c of this.armCues) { if (c.at <= elapsed) cue = c; else break; }
    if (!cue) return null;
    const clip = CLIP_BY_ID.get(cue.clip);
    if (!clip) return null;
    const t = elapsed - cue.at;
    // Arms, head and carriage only: the legs and blades are the sim's.
    const p = sample(clip, t);
    const { upperArmL, forearmL, upperArmR, forearmR, head } = p.seg ?? {};
    return { layer: "arms", clip: clip.id, t, pose: { seg: { ...(upperArmL ? { upperArmL } : {}), ...(forearmL ? { forearmL } : {}), ...(upperArmR ? { upperArmR } : {}), ...(forearmR ? { forearmR } : {}), ...(head ? { head } : {}) } } };
  }
}
