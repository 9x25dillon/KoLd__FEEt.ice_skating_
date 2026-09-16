import { bodyPoints } from "../app/draw.ts";
import type { V3 } from "../app/draw.ts";
import type { SkaterState } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Params } from "../sim/params.ts";

export const SKINS = [
  { id: "violet", name: "Violet", description: "Plum satin · rose skirt · ponytail",
    bodice: "#6953a0", highlight: "#a798ce", trim: "#e4d5f3", sleeve: "#9583c7", sleeveShade: "#7563a4",
    skirt: "#c26e93", skirtShade: "#8f4d6c", tights: "#3e5279", tightsShade: "#253859",
    hair: "#342e46", skin: "#f0c7ab", bun: false },
  { id: "aurora", name: "Aurora", description: "Deep teal · champagne gold · ballet bun",
    bodice: "#186b70", highlight: "#54b9b4", trim: "#f5d998", sleeve: "#54aaa9", sleeveShade: "#287a80",
    skirt: "#48a6a3", skirtShade: "#20666f", tights: "#283f50", tightsShade: "#1a2a3b",
    hair: "#302825", skin: "#f0c7ab", bun: true },
] as const;
export type Skin = typeof SKINS[number];
export function skinById(id: unknown): Skin { return SKINS.find(skin => skin.id === id) ?? SKINS[0]; }

/** Secondary motion on a fresh body pose. Blade contact and solver state stay intact. */
export function performancePose(s: SkaterState, p: Params, reducedMotion = false) {
  const body = bodyPoints(s, p);
  const speed = Math.hypot(s.vel.x, s.vel.y);
  const stroke = s.strokeTime > 0 ? Math.sin(Math.min(1, s.strokeTime / p.strokeDuration) * Math.PI) : 0;
  const glide = !s.fallen && s.move === MOVE.None && s.jump.phase === JUMP_PHASE.None;
  if (glide) {
    const settle = s.landed.tick < 0 || s.landed.fall ? 0 : Math.max(0, 1 - (s.tick - s.landed.tick) / 60);
    for (let i = 0; i < 2; i++) {
      const swing = (i === s.strokeFoot ? -1 : 1) * stroke * .24;
      body.hands[i].x += s.heading.x * swing;
      body.hands[i].y += s.heading.y * swing;
      body.hands[i].z += settle * .09 + (reducedMotion ? 0 : Math.sin(s.tick / 32 + i * Math.PI) * Math.min(.025, speed * .003));
    }
  }
  const elbows = body.hands.map((hand, i): V3 => {
    const shoulder = body.shoulders[i];
    return { x: shoulder.x * .5 + hand.x * .5 - s.heading.x * .06,
      y: shoulder.y * .5 + hand.y * .5 - s.heading.y * .06,
      z: shoulder.z * .5 + hand.z * .5 - .075 };
  });
  return { body, elbows };
}
