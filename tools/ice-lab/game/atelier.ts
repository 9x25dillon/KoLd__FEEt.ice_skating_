// game/atelier.ts — costumes made from parts, without any page attached.
//
// The owner's rule of 2026-09-18 was that players never have to design a
// costume, so appearance.ts's SKINS stay the default. On 2026-11-02 the owner
// added an optional atelier, built from curated swatches: every choice below
// is picked from a list, nothing is free-coloured or drawn. A design turns
// into the same Skin shape the presets have, plus `fabric` and `crystals`,
// which a renderer that does not know them simply ignores.
//
// All swatches, fabrics and crystal densities are AUTHORED, not measured.
import type { Skin } from "./appearance.ts";

export interface Swatch { id: string; name: string; hex: string }
const sw = (id: string, name: string, hex: string): Swatch => ({ id, name, hex });

/** Bodice, skirt and sleeve cloth. */
export const CLOTH: readonly Swatch[] = [
  sw("midnight", "Midnight", "#17364f"), sw("sapphire", "Sapphire", "#24439a"), sw("ice", "Ice blue", "#9cc3dd"),
  sw("teal", "Teal", "#186b70"), sw("seafoam", "Seafoam", "#48a6a3"), sw("emerald", "Emerald", "#1f6b4a"),
  sw("plum", "Plum", "#6953a0"), sw("lilac", "Lilac", "#a798ce"), sw("rose", "Rose", "#c26e93"),
  sw("blush", "Blush", "#e2b0b8"), sw("crimson", "Crimson", "#a3192f"), sw("garnet", "Garnet", "#7a2733"),
  sw("amber", "Amber", "#b5652a"), sw("sunflower", "Sunflower", "#d9a62e"), sw("champagne", "Champagne", "#d9c39a"),
  sw("ivory", "Ivory", "#efe6d6"), sw("mocha", "Mocha", "#97796f"), sw("silver", "Silver grey", "#9aa3ad"),
  sw("jet", "Jet", "#16161c"),
];
/** Trim and crystals. */
export const TRIM: readonly Swatch[] = [
  sw("champagne", "Champagne", "#e8cca0"), sw("gold", "Gold", "#f5d998"), sw("rosegold", "Rose gold", "#e6b8a2"),
  sw("silver", "Silver", "#dfe4ea"), sw("pearl", "Pearl", "#f4efe6"), sw("aurora", "Aurora", "#cfe8f0"),
  sw("lavender", "Lavender", "#e4d5f3"), sw("jet", "Jet", "#2a2a33"),
];
/** Tights: skin tones first, as most competition tights are, then dark. */
export const TIGHTS: readonly Swatch[] = [
  sw("light", "Light", "#e9c3a6"), sw("fair", "Fair", "#d4a68b"), sw("tan", "Tan", "#b28c75"),
  sw("bronze", "Bronze", "#8e6248"), sw("deep", "Deep", "#5e3d2c"), sw("navy", "Navy", "#253859"),
  sw("black", "Black", "#1b1b22"),
];
export const HAIR: readonly Swatch[] = [
  sw("black", "Black", "#1b1716"), sw("espresso", "Espresso", "#241d1b"), sw("plumbrown", "Plum brown", "#342e46"),
  sw("chestnut", "Chestnut", "#4a2a1c"), sw("auburn", "Auburn", "#7a3a20"), sw("honey", "Honey", "#a87a45"),
  sw("blonde", "Blonde", "#c9a66b"), sw("platinum", "Platinum", "#ddd3c0"),
];
export const SKIN_TONES: readonly Swatch[] = [
  sw("porcelain", "Porcelain", "#f0c7ab"), sw("light", "Light", "#e2b393"), sw("warm", "Warm", "#d4a68b"),
  sw("golden", "Golden", "#c98a5c"), sw("tan", "Tan", "#a8714a"), sw("brown", "Brown", "#7d5236"),
  sw("deep", "Deep", "#5a3a28"),
];
/** How the cloth takes light. Satin is what every preset has always worn. */
export const FABRICS = [
  { id: "satin", name: "Satin", description: "A soft broad sheen" },
  { id: "velvet", name: "Velvet", description: "Matte face, bright at the edges" },
  { id: "lycra", name: "Lycra", description: "Tight and glossy" },
  { id: "mesh", name: "Mesh", description: "Open weave, no shine" },
] as const;
/** Crystal coverage, 0..1 of where the renderer can place them. Presets have none. */
export const CRYSTALS = [
  { id: "none", name: "No crystals", density: 0 },
  { id: "dusting", name: "A dusting", density: 0.25 },
  { id: "bodice", name: "Crystal bodice", density: 0.55 },
  { id: "full", name: "Full crystals", density: 0.9 },
] as const;
export type FabricId = typeof FABRICS[number]["id"];
export type CrystalId = typeof CRYSTALS[number]["id"];

/** A costume as the atelier holds it: every colour a swatch id. */
export interface Design {
  name: string;
  bodice: string; skirt: string; sleeve: string; trim: string;
  tights: string; hair: string; skin: string;
  bun: boolean; fabric: FabricId; crystals: CrystalId;
}
/** The parts a page edits, each with its list. */
export const PARTS = [
  { id: "bodice", title: "Bodice", swatches: CLOTH },
  { id: "skirt", title: "Skirt", swatches: CLOTH },
  { id: "sleeve", title: "Sleeves", swatches: CLOTH },
  { id: "trim", title: "Trim & crystals", swatches: TRIM },
  { id: "tights", title: "Tights", swatches: TIGHTS },
  { id: "hair", title: "Hair colour", swatches: HAIR },
  { id: "skin", title: "Skin tone", swatches: SKIN_TONES },
] as const;
export type PartId = typeof PARTS[number]["id"];

/** Custom costumes a skater can keep at once. Authored. */
export const MAX_DESIGNS = 3;
export const NAME_LIMIT = 24;

/** A dressed design: a Skin, plus how its cloth and crystals render. */
export interface DesignSkin {
  id: string; name: string; description: string;
  bodice: string; highlight: string; trim: string; sleeve: string; sleeveShade: string;
  skirt: string; skirtShade: string; tights: string; tightsShade: string; hair: string; skin: string;
  bun: boolean; fabric: FabricId; crystals: number; custom: true;
}

const swatch = (list: readonly Swatch[], id: string) => list.find(s => s.id === id);

function mix(hex: string, toward: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(c + (toward - c) * amount));
  return "#" + ch.map(c => c.toString(16).padStart(2, "0")).join("");
}
/** The lit and shaded tones the presets author by hand, made from one colour. */
export const lighter = (hex: string) => mix(hex, 255, 0.35);
export const darker = (hex: string) => mix(hex, 0, 0.3);

/** A design's shape, from a save or a page. Null when anything is off a list. */
export function parseDesign(value: unknown): Design | null {
  const d = value as Design | null;
  if (!d || typeof d !== "object" || typeof d.name !== "string") return null;
  const name = d.name.trim().slice(0, NAME_LIMIT);
  if (!name) return null;
  if (!PARTS.every(p => typeof d[p.id] === "string" && swatch(p.swatches, d[p.id]))) return null;
  if (typeof d.bun !== "boolean" || !FABRICS.some(f => f.id === d.fabric) || !CRYSTALS.some(c => c.id === d.crystals)) return null;
  return { name, bodice: d.bodice, skirt: d.skirt, sleeve: d.sleeve, trim: d.trim, tights: d.tights, hair: d.hair, skin: d.skin, bun: d.bun, fabric: d.fabric, crystals: d.crystals };
}

/** The line a picker shows under the name. */
export function describeDesign(d: Design): string {
  const fabric = FABRICS.find(f => f.id === d.fabric)!, crystals = CRYSTALS.find(c => c.id === d.crystals)!;
  return [`${swatch(CLOTH, d.bodice)!.name} ${fabric.name.toLowerCase()}`, `${swatch(CLOTH, d.skirt)!.name.toLowerCase()} skirt`,
    d.bun ? "bun" : "ponytail", ...(crystals.density > 0 ? [crystals.name.toLowerCase()] : [])].join(" · ");
}

/** The design as a renderer reads it. `slot` keeps its id apart from the presets'. */
export function designSkin(d: Design, slot: number): DesignSkin {
  const c = (list: readonly Swatch[], id: string) => swatch(list, id)!.hex;
  const bodice = c(CLOTH, d.bodice), sleeve = c(CLOTH, d.sleeve), skirt = c(CLOTH, d.skirt), tights = c(TIGHTS, d.tights);
  return {
    id: `design-${slot}`, name: d.name, description: describeDesign(d),
    bodice, highlight: lighter(bodice), trim: c(TRIM, d.trim), sleeve, sleeveShade: darker(sleeve),
    skirt, skirtShade: darker(skirt), tights, tightsShade: darker(tights),
    hair: c(HAIR, d.hair), skin: c(SKIN_TONES, d.skin), bun: d.bun,
    fabric: d.fabric, crystals: CRYSTALS.find(x => x.id === d.crystals)!.density, custom: true,
  };
}

function nearest(list: readonly Swatch[], hex: string): string {
  const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const [r, g, b] = rgb(hex);
  let best = list[0], far = Infinity;
  for (const s of list) {
    const [r2, g2, b2] = rgb(s.hex), d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < far) { far = d; best = s; }
  }
  return best.id;
}

/** A starting design from a preset: each colour moved to its nearest swatch. Satin, no crystals. */
export function designFromPreset(preset: Skin, name = `My ${preset.name}`): Design {
  return {
    name: name.slice(0, NAME_LIMIT), bodice: nearest(CLOTH, preset.bodice), skirt: nearest(CLOTH, preset.skirt),
    sleeve: nearest(CLOTH, preset.sleeve), trim: nearest(TRIM, preset.trim), tights: nearest(TIGHTS, preset.tights),
    hair: nearest(HAIR, preset.hair), skin: nearest(SKIN_TONES, preset.skin), bun: preset.bun, fabric: "satin", crystals: "none",
  };
}

/** Swatch `id` of part `part` one step along its list, wrapping. For pads: left and right. */
export function cyclePart(d: Design, part: PartId, by: number): Design {
  const list = PARTS.find(p => p.id === part)!.swatches;
  const at = list.findIndex(s => s.id === d[part]);
  return { ...d, [part]: list[((at + by) % list.length + list.length) % list.length].id };
}

/** The skater's own costumes, kept apart from the career so a career reset never takes them. */
export class Wardrobe {
  designs: (Design | null)[] = Array.from({ length: MAX_DESIGNS }, () => null);
  /** Saves a design to a slot. Returns whether it was allowed. */
  set(slot: number, value: unknown): boolean {
    const d = parseDesign(value);
    if (!d || !Number.isInteger(slot) || slot < 0 || slot >= MAX_DESIGNS) return false;
    this.designs[slot] = d;
    return true;
  }
  /** Every saved design as a renderer reads it, slot by slot; null for an empty slot. */
  skins(): (DesignSkin | null)[] { return this.designs.map((d, i) => d && designSkin(d, i)); }
  serialize() { return JSON.stringify({ version: 1, designs: this.designs }); }
  static restore(json: string | null): Wardrobe {
    const w = new Wardrobe();
    try {
      const saved = JSON.parse(json ?? "null");
      if (saved?.version === 1 && Array.isArray(saved.designs))
        w.designs = w.designs.map((_, i) => saved.designs[i] == null ? null : parseDesign(saved.designs[i]));
    } catch { /* A missing or broken wardrobe starts empty; the presets are always there. */ }
    return w;
  }
}

