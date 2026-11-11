// game/cast.ts — how the career's rivals look: a model each and the costume they skate in.
//
// The owner, 2026-11-11: "the five rivals" first among the character models. Each model
// is games/ice-run-godot/tools/build_athlete.py with --rival=<id>: their own build,
// height, skin and hair on the athlete's rig and material names, so a client poses and
// dresses them as it does the player. Their costumes are game/appearance.ts Skin fields,
// so the same recolouring applies; nothing here changes a score or a medal.
//
// AUTHORED looks. A model is null where none is built yet: Lio Tarrant is written "him"
// in season one's chapters while the field is women's singles (decision for the owner).

import { RIVALS } from "./rivals.ts";
import { SKINS } from "./appearance.ts";
import type { Skin } from "./appearance.ts";

/** A Skin's fields, any colour: SKINS is a const list, so Skin itself only admits its presets'. */
export type Costume = { [K in keyof Skin]: Skin[K] extends string ? string : Skin[K] };

export interface RivalLook {
  /** games/ice-run-godot/assets/generated/<model>.glb, or null for none yet. */
  model: string | null;
  /** Height in metres, crown to sole, as build_athlete.py solved it. */
  height: number | null;
  costume: Costume;
}

const dress = (id: string, name: string, description: string, c: Omit<Costume, "id" | "name" | "description" | "bun">): Costume =>
  ({ id, name, description, ...c, bun: false });

export const RIVAL_LOOKS: Record<(typeof RIVALS)[number]["name"], RivalLook> = {
  "Ansa Merrow": { model: "skater-rival-ansa", height: 1.5, costume: dress("rival-ansa", "Ansa Merrow", "Electric cyan · white crystals · platinum ponytail", {
    bodice: "#0f8fb0", highlight: "#62d0e8", trim: "#f2fbff", sleeve: "#8fd6e6", sleeveShade: "#4fa8bd",
    skirt: "#1ab0cf", skirtShade: "#0b6f86", tights: "#e4c3ad", tightsShade: "#b8987f", hair: "#efe6d4", skin: "#f0c7ab" }) },
  "Lio Tarrant": { model: null, height: null, costume: dress("rival-lio", "Lio Tarrant", "Signal red · black · gold", {
    bodice: "#b3202a", highlight: "#e05a5f", trim: "#e8c46a", sleeve: "#1c1a1e", sleeveShade: "#0e0d10",
    skirt: "#1c1a1e", skirtShade: "#0e0d10", tights: "#1c1a1e", tightsShade: "#0e0d10", hair: "#3a2a1e", skin: "#e9bc9c" }) },
  "Katya Vell": { model: "skater-rival-katya", height: 1.57, costume: dress("rival-katya", "Katya Vell", "Forest velvet · antique gold · black braid", {
    bodice: "#1d4a35", highlight: "#4f8a6a", trim: "#d8b46a", sleeve: "#6f8f7c", sleeveShade: "#46634f",
    skirt: "#2a6046", skirtShade: "#163a2a", tights: "#d9b49a", tightsShade: "#ad8c73", hair: "#17120f", skin: "#f0c7ab" }) },
  "Noor Ashdown": { model: "skater-rival-noor", height: 1.58, costume: dress("rival-noor", "Noor Ashdown", "Graphite · silver · a sharp bob", {
    bodice: "#3a3f48", highlight: "#7b8494", trim: "#dfe5ee", sleeve: "#8c94a2", sleeveShade: "#5c6370",
    skirt: "#525a66", skirtShade: "#2d323a", tights: "#7a4e36", tightsShade: "#553422", hair: "#1a1310", skin: "#8a5a3c" }) },
  "Remi Castellan": { model: "skater-rival-remi", height: 1.65, costume: dress("rival-remi", "Remi Castellan", "Crimson · rose gold · gold ponytail", {
    bodice: "#8e1630", highlight: "#cf4a66", trim: "#f0c3a0", sleeve: "#c98c8f", sleeveShade: "#965c61",
    skirt: "#a81f3c", skirtShade: "#661225", tights: "#e8c2a8", tightsShade: "#bb9780", hair: "#c9a160", skin: "#f0c7ab" }) },
  "Teodora Wynn": { model: "skater-rival-teodora", height: 1.68, costume: dress("rival-teodora", "Teodora Wynn", "Black velvet · champion's gold · cropped", {
    bodice: "#121116", highlight: "#3a3742", trim: "#e6c25a", sleeve: "#4a4452", sleeveShade: "#2a2630",
    skirt: "#1b1a21", skirtShade: "#0b0a0e", tights: "#8c5a3c", tightsShade: "#5f3b26", hair: "#2a1a12", skin: "#9a6646" }) },
};

/** The look for a rival by name; every RIVALS entry has one (test/cast.test.ts). */
export function rivalLook(name: string): RivalLook | null {
  return (RIVAL_LOOKS as Record<string, RivalLook>)[name] ?? null;
}

/** The costume fields a Skin carries, for checking a look is complete. */
export const SKIN_FIELDS = Object.keys(SKINS[0]) as (keyof Skin)[];
