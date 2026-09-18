import { bodyPoints } from "../app/draw.ts";
import type { V3 } from "../app/draw.ts";
import type { SkaterState } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import type { Params } from "../sim/params.ts";

/**
 * Preset costumes — never player-designed, always picked from this list (the
 * operator's own ask, 2026-09-18: "i dont want the players to have to design
 * thier own costumes"). Every field below is the whole cost of a new one: no
 * HTML, CSS or hand-drawn artwork to touch anywhere. `game/index.html`'s own
 * wardrobe dialog builds its buttons and SVG previews straight from this
 * array (`skinPreviewSvg` below), and `game/main.ts` wires them up
 * generically over `SKINS`, so "add a costume" really does mean add one
 * entry here — checked by adding Solstice, the third, and changing nothing
 * else. `game/scene.ts` reads every field to draw the skater; only `bun`
 * (ponytail vs. a pinned-up bun) changes the drawn silhouette itself, the
 * rest are pure colour.
 */
export const SKINS = [
  { id: "violet", name: "Violet", description: "Plum satin · rose skirt · ponytail",
    bodice: "#6953a0", highlight: "#a798ce", trim: "#e4d5f3", sleeve: "#9583c7", sleeveShade: "#7563a4",
    skirt: "#c26e93", skirtShade: "#8f4d6c", tights: "#3e5279", tightsShade: "#253859",
    hair: "#342e46", skin: "#f0c7ab", bun: false },
  { id: "aurora", name: "Aurora", description: "Deep teal · champagne gold · ballet bun",
    bodice: "#186b70", highlight: "#54b9b4", trim: "#f5d998", sleeve: "#54aaa9", sleeveShade: "#287a80",
    skirt: "#48a6a3", skirtShade: "#20666f", tights: "#283f50", tightsShade: "#1a2a3b",
    hair: "#302825", skin: "#f0c7ab", bun: true },
  { id: "solstice", name: "Solstice", description: "Amber bodice · garnet skirt · low ponytail",
    bodice: "#b5652a", highlight: "#e2a468", trim: "#f6dcb8", sleeve: "#c98a52", sleeveShade: "#96551f",
    skirt: "#7a2733", skirtShade: "#551a22", tights: "#3a2b22", tightsShade: "#241a15",
    hair: "#4a2a1c", skin: "#c98a5c", bun: false },
] as const;
export type Skin = typeof SKINS[number];
export function skinById(id: unknown): Skin { return SKINS.find(skin => skin.id === id) ?? SKINS[0]; }

/**
 * The wardrobe dialog's own preview bust, generated from a `Skin` rather
 * than hand-drawn per costume — every colour below is one of `Skin`'s own
 * fields; only the outline ink (#172039), the blade/leg lines, and the eye
 * whites are fixed, the same way `scene.ts`'s own skater drawing keeps its
 * line art fixed and re-colours the costume over it. `bun` swaps the hair
 * silhouette (a pinned-up bun and pin vs. a swept ponytail) rather than a
 * colour. Fixing this session's own found bug on the way: the two hand-
 * drawn previews it replaces both hard-coded Violet's `#342e46` hair for
 * the head-hair path, even Aurora's own, since nothing had ever generated
 * the second one from its own data to catch the copy-paste.
 */
export function skinPreviewSvg(skin: Skin): string {
  const hairTop = skin.bun
    ? `<circle cx="107" cy="25" r="8" fill="${skin.hair}"/><path d="M101 22 L110 23" stroke="${skin.trim}" stroke-width="3"/>`
    : `<path d="M104 36 Q130 48 119 82" fill="none" stroke="${skin.hair}" stroke-width="9" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="183" rx="48" ry="6" fill="#15263e20"/>
<path d="M94 114 L83 151 L78 177 M108 114 L117 145 L130 169" fill="none" stroke="#33435e" stroke-width="10" stroke-linecap="round"/>
<path d="M70 179 L84 179 M126 171 L138 175" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
<path d="M66 185 L88 185 M125 178 L140 181" stroke="#61768b" stroke-width="2"/>
<path d="M90 66 L65 89 L37 79 M108 66 L135 87 L162 72" fill="none" stroke="${skin.bodice}" stroke-width="8" stroke-linecap="round"/>
<circle cx="35" cy="78" r="4" fill="${skin.skin}"/><circle cx="164" cy="71" r="4" fill="${skin.skin}"/>
<path d="M86 58 Q100 65 113 58 L110 101 L90 101 Z" fill="${skin.bodice}"/>
<path d="M88 63 L100 78 L111 63 M90 99 L110 99" fill="none" stroke="${skin.trim}" stroke-width="2"/>
<path d="M90 101 L110 101 Q116 118 128 127 Q101 143 74 127 Z" fill="${skin.skirt}"/>
<path d="M74 127 Q101 143 128 127" fill="none" stroke="${skin.trim}" stroke-width="2"/>
${hairTop}<path d="M85 45 L86 32 L95 25 L109 29 L116 41 L111 56 L88 55 Z" fill="${skin.hair}" stroke="#172039" stroke-width="1.5"/><path d="M89 38 L109 38 L111 48 L105 56 L100 60 L92 54 Z" fill="${skin.skin}" stroke="#172039" stroke-width="1"/><path d="M91 44 L98 43 L97 48 L92 48 M102 43 L109 44 L107 48 L103 48" fill="#fff" stroke="#172039" stroke-width="1"/><path d="M95 44 L95 48 M105 44 L105 48" stroke="#8064a5" stroke-width="2"/><path d="M85 40 L89 30 L101 28 L111 33 L115 48 L107 37 L102 44 L100 36 L94 43 L94 36 L87 49 Z" fill="${skin.hair}" stroke="#172039" stroke-width="1"/>
</svg>`;
}

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
