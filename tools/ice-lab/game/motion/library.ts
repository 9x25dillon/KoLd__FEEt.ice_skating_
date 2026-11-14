// game/motion/library.ts — every clip in the motion library, by id and by category.
import { FALLS, RECOVERIES } from "./falls.ts";
import { EXPRESSIONS } from "./expressions.ts";
import { SPINS } from "./spins.ts";
import { TRANSITIONS, LEGS } from "./transitions.ts";
import { FOOTWORK } from "./footwork.ts";
import { CEREMONY, IDLES } from "./ceremony.ts";
import { DANCE_STYLES } from "./dance.ts";
import type { Category, Clip } from "./types.ts";

export const CLIPS: readonly Clip[] = [...FALLS, ...RECOVERIES, ...EXPRESSIONS, ...SPINS, ...TRANSITIONS, ...LEGS, ...FOOTWORK, ...CEREMONY, ...IDLES];
export const CLIP_BY_ID: ReadonlyMap<string, Clip> = new Map(CLIPS.map(c => [c.id, c]));
export function clipsIn(category: Category): Clip[] { return CLIPS.filter(c => c.category === category); }

/** For a client's catalog: counts, and each clip's id, name, category, tags and length (not its keys). */
export function libraryIndex() {
  const counts = Object.fromEntries((["fall", "recovery", "expression", "spin", "transition", "leg", "step", "ceremony", "idle"] as Category[]).map(c => [c, clipsIn(c).length]));
  return {
    counts: { ...counts, total: CLIPS.length, styles: DANCE_STYLES.length },
    clips: CLIPS.map(c => ({ id: c.id, name: c.name, category: c.category, tags: c.tags, duration: c.duration, loop: c.loop })),
    styles: DANCE_STYLES.map(s => ({ id: s.id, name: s.name, family: s.family, blurb: s.blurb, tempo: s.tempo, meter: s.meter, feel: s.feel, fabric: s.fabric, costume: s.costume, music: s.music })),
  };
}
