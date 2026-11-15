// game/skates.ts — the skates a skater wears, picked from a curated list.
//
// Like the costume, this is cosmetic only: nothing here imports the simulation,
// and nothing here is read by Params, the physics, a score or a replay. A choice
// is five ids (boot colour, boot finish, blade, laces, heel). A client turns it
// into colours and surface values with `lookOf`, and paints the boot, blade,
// laces and heel materials of its skater model with them.
//
// Every colour, roughness and name below is AUTHORED, not measured. The default
// choice (white leather boots, chrome blade, white laces, natural heel) is
// today's look: its parts are marked `native`, which tells a client to leave
// the model's own material alone rather than repaint it.

export interface Colour { id: string; name: string; hex: string }
const c = (id: string, name: string, hex: string): Colour => ({ id, name, hex });

/** Boot leather colours. White is the model's own boot. */
export const BOOT_COLOURS: readonly Colour[] = [
  c("white", "White", "#e6e0d1"), c("ivory", "Ivory", "#eadcb9"), c("black", "Black", "#18181d"),
  c("midnight", "Midnight blue", "#16263f"), c("tan", "Tan", "#b58a63"), c("skin", "Tan to the tights", "#c9a086"),
  c("blush", "Blush pink", "#e5bcc0"), c("rose", "Rose", "#c26e93"), c("red", "Competition red", "#a3192f"),
  c("burgundy", "Burgundy", "#5a1a2a"), c("forest", "Forest green", "#1f4a38"), c("ice", "Ice blue", "#aac8de"),
  c("lilac", "Lilac", "#a898cc"), c("grey", "Practice grey", "#8b9097"),
];
/** How the boot leather takes light. `roughness` 0 (mirror) to 1 (chalk); `clearcoat` is a lacquer layer. */
export interface BootFinish { id: string; name: string; description: string; roughness: number; clearcoat: number }
export const BOOT_FINISHES: readonly BootFinish[] = [
  { id: "leather", name: "Leather", description: "The ordinary soft sheen of a competition boot", roughness: 0.27, clearcoat: 0 },
  { id: "patent", name: "Patent", description: "Lacquered and glossy; shows every scuff", roughness: 0.1, clearcoat: 1 },
  { id: "matte", name: "Matte", description: "Flat and quiet", roughness: 0.7, clearcoat: 0 },
  { id: "suede", name: "Suede", description: "Soft nap, no shine at all", roughness: 0.92, clearcoat: 0 },
];

/** A blade finish: `metallic` 0..1, `roughness` as above. Chrome is the model's own steel. */
export interface BladeFinish { id: string; name: string; description: string; hex: string; metallic: number; roughness: number }
export const BLADES: readonly BladeFinish[] = [
  { id: "chrome", name: "Chrome", description: "Polished steel, the way blades come", hex: "#9eadb8", metallic: 0.95, roughness: 0.14 },
  { id: "brushed", name: "Brushed steel", description: "Satin steel, worn in from sharpening", hex: "#9aa2a8", metallic: 0.9, roughness: 0.42 },
  { id: "black", name: "Black coated", description: "A dark coating over the steel", hex: "#1c1d22", metallic: 0.7, roughness: 0.3 },
  { id: "gold", name: "Gold-plated", description: "Gold over the steel", hex: "#d9ac3c", metallic: 1, roughness: 0.18 },
  { id: "rosegold", name: "Rose gold", description: "A pink-gold plating", hex: "#d9958a", metallic: 1, roughness: 0.2 },
  { id: "blue", name: "Blue titanium", description: "The oil-slick blue of heat-treated titanium", hex: "#3d6fa8", metallic: 0.95, roughness: 0.22 },
  { id: "bronze", name: "Aged bronze", description: "Warm and dulled", hex: "#a8703c", metallic: 0.9, roughness: 0.38 },
];

export interface Lace { id: string; name: string; hex: string; roughness: number }
const lace = (id: string, name: string, hex: string, roughness = 0.7): Lace => ({ id, name, hex, roughness });
/** Laces. White is the model's own. Not every skater model draws laces as their own surface. */
export const LACES: readonly Lace[] = [
  lace("white", "White", "#b8b8b3"), lace("black", "Black", "#1a1a1e"), lace("cream", "Cream", "#e2d6b4"),
  lace("red", "Red", "#b3202f"), lace("navy", "Navy", "#1c2f58"), lace("pink", "Pink", "#e096b4"),
  lace("gold", "Gold", "#d8b04a", 0.35), lace("silver", "Silver", "#cfd4da", 0.3), lace("lime", "Lime", "#9fcf3d"),
];

/** The extra: the stacked heel under the boot. */
export interface Heel { id: string; name: string; hex: string | null }
export const HEELS: readonly Heel[] = [
  { id: "natural", name: "Natural brown", hex: null },
  { id: "match", name: "Matches the boot", hex: null },
  { id: "black", name: "Black", hex: "#1a1a1e" },
  { id: "white", name: "White", hex: "#e6e0d1" },
  { id: "gold", name: "Gold", hex: "#c99a3a" },
];

/** What a skater wears: one id from each list. */
export interface SkatesChoice { boot: string; finish: string; blade: string; laces: string; heel: string }
export const DEFAULT_SKATES: SkatesChoice = { boot: "white", finish: "leather", blade: "chrome", laces: "white", heel: "natural" };

export interface SkatesPreset { id: string; name: string; description: string; choice: SkatesChoice }
const p = (id: string, name: string, description: string, boot: string, finish: string, blade: string, laces: string, heel: string): SkatesPreset =>
  ({ id, name, description, choice: { boot, finish, blade, laces, heel } });
export const SKATE_PRESETS: readonly SkatesPreset[] = [
  p("competition", "Competition white", "White leather, chrome blades, white laces: how skates come", "white", "leather", "chrome", "white", "natural"),
  p("midnight", "Midnight black", "Black patent, black-coated blades, black laces", "black", "patent", "black", "black", "black"),
  p("tights", "Tan to the tights", "Boots the colour of the tights, so the leg runs on unbroken", "skin", "leather", "chrome", "cream", "match"),
  p("gold", "Gold-plated blade", "White patent boots on gold blades, gold laces", "white", "patent", "gold", "gold", "gold"),
  p("practice", "Practice greys", "Worn-in grey suede, brushed steel, grey-white laces. No soaker covers are drawn: the blades are bare", "grey", "suede", "brushed", "white", "natural"),
  p("rose", "Rose and pink", "Blush boots, rose-gold blades, pink laces", "blush", "leather", "rosegold", "pink", "match"),
  p("crimson", "Crimson stage", "Red patent boots with black blades, for a dark costume", "red", "patent", "black", "black", "black"),
  p("ice", "Ice and titanium", "Ice-blue leather over blue titanium blades", "ice", "leather", "blue", "silver", "white"),
  p("forest", "Forest and bronze", "Deep green matte boots on aged bronze", "forest", "matte", "bronze", "cream", "natural"),
  p("lilac", "Lilac dusk", "Lilac leather, chrome blades, silver laces", "lilac", "leather", "chrome", "silver", "match"),
  p("burgundy", "Burgundy velvet", "Burgundy suede, rose-gold blades, gold laces", "burgundy", "suede", "rosegold", "gold", "match"),
  p("navy", "Navy blazer", "Midnight leather, brushed steel, white laces", "midnight", "leather", "brushed", "white", "black"),
];

const has = (list: readonly { id: string }[], id: unknown) => typeof id === "string" && list.some(x => x.id === id);
export const skatesAreValid = (v: unknown): v is SkatesChoice => {
  const s = v as SkatesChoice | null;
  return !!s && typeof s === "object" && has(BOOT_COLOURS, s.boot) && has(BOOT_FINISHES, s.finish)
    && has(BLADES, s.blade) && has(LACES, s.laces) && has(HEELS, s.heel);
};
/** A choice from a save or a page. Anything off a list gives today's look. A preset id string also works. */
export function parseSkates(value: unknown): SkatesChoice {
  if (typeof value === "string") return { ...(SKATE_PRESETS.find(x => x.id === value)?.choice ?? DEFAULT_SKATES) };
  if (skatesAreValid(value)) { const s = value; return { boot: s.boot, finish: s.finish, blade: s.blade, laces: s.laces, heel: s.heel }; }
  return { ...DEFAULT_SKATES };
}

/** The colour and surface of one part. `native` means: keep the model's own material. */
export interface PartLook { native: boolean; hex: string; roughness: number; metallic: number; clearcoat: number }
/** The skates as a client paints them. Plain numbers and hex strings: no engine type. */
export interface SkatesLook { name: string; description: string; choice: SkatesChoice; boot: PartLook; blade: PartLook; laces: PartLook; heel: PartLook }

/** The line a picker shows. */
export function describeSkates(s: SkatesChoice): string {
  const boot = BOOT_COLOURS.find(x => x.id === s.boot)!, finish = BOOT_FINISHES.find(x => x.id === s.finish)!;
  const blade = BLADES.find(x => x.id === s.blade)!, laces = LACES.find(x => x.id === s.laces)!;
  return `${boot.name} ${finish.name.toLowerCase()} · ${blade.name.toLowerCase()} blades · ${laces.name.toLowerCase()} laces`;
}

/** Choice → the colours and surface values a client applies. Pure; the same choice always gives the same look. */
export function lookOf(value: unknown): SkatesLook {
  const s = parseSkates(value);
  const boot = BOOT_COLOURS.find(x => x.id === s.boot)!, finish = BOOT_FINISHES.find(x => x.id === s.finish)!;
  const blade = BLADES.find(x => x.id === s.blade)!, laces = LACES.find(x => x.id === s.laces)!, heel = HEELS.find(x => x.id === s.heel)!;
  const preset = SKATE_PRESETS.find(x => JSON.stringify(x.choice) === JSON.stringify(s));
  return {
    name: preset?.name ?? "Your own skates", description: preset?.description ?? describeSkates(s), choice: s,
    boot: { native: s.boot === "white" && s.finish === "leather", hex: boot.hex, roughness: finish.roughness, metallic: 0, clearcoat: finish.clearcoat },
    blade: { native: s.blade === "chrome", hex: blade.hex, roughness: blade.roughness, metallic: blade.metallic, clearcoat: 0 },
    laces: { native: s.laces === "white", hex: laces.hex, roughness: laces.roughness, metallic: 0, clearcoat: 0 },
    heel: { native: s.heel === "natural", hex: heel.hex ?? boot.hex, roughness: s.heel === "match" ? finish.roughness : 0.6, metallic: heel.id === "gold" ? 0.8 : 0, clearcoat: 0 },
  };
}

/** One step along a part's list, wrapping. For pads: left and right. */
export function cycleSkates(s: SkatesChoice, part: keyof SkatesChoice, by: number): SkatesChoice {
  const list: readonly { id: string }[] = { boot: BOOT_COLOURS, finish: BOOT_FINISHES, blade: BLADES, laces: LACES, heel: HEELS }[part];
  const at = list.findIndex(x => x.id === s[part]);
  return { ...s, [part]: list[((at + by) % list.length + list.length) % list.length].id };
}

/** Everything a picker shows, for the bridge's catalog. */
export const SKATES_CATALOG = {
  boots: BOOT_COLOURS, finishes: BOOT_FINISHES, blades: BLADES, laces: LACES, heels: HEELS,
  presets: SKATE_PRESETS, default: DEFAULT_SKATES,
  parts: [
    { id: "boot", title: "Boot colour" }, { id: "finish", title: "Boot finish" }, { id: "blade", title: "Blade" },
    { id: "laces", title: "Laces" }, { id: "heel", title: "Heel" },
  ],
} as const;
