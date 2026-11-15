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
  { id: "violet", name: "Violet", collection: "Signature", description: "Plum satin · rose skirt · ponytail",
    bodice: "#6953a0", highlight: "#a798ce", trim: "#e4d5f3", sleeve: "#9583c7", sleeveShade: "#7563a4",
    skirt: "#c26e93", skirtShade: "#8f4d6c", tights: "#3e5279", tightsShade: "#253859",
    hair: "#342e46", skin: "#f0c7ab", bun: false },
  { id: "aurora", name: "Aurora", collection: "Signature", description: "Deep teal · champagne gold · ballet bun",
    bodice: "#186b70", highlight: "#54b9b4", trim: "#f5d998", sleeve: "#54aaa9", sleeveShade: "#287a80",
    skirt: "#48a6a3", skirtShade: "#20666f", tights: "#283f50", tightsShade: "#1a2a3b",
    hair: "#302825", skin: "#f0c7ab", bun: true },
  { id: "solstice", name: "Solstice", collection: "Signature", description: "Amber bodice · garnet skirt · low ponytail",
    bodice: "#b5652a", highlight: "#e2a468", trim: "#f6dcb8", sleeve: "#c98a52", sleeveShade: "#96551f",
    skirt: "#7a2733", skirtShade: "#551a22", tights: "#3a2b22", tightsShade: "#241a15",
    hair: "#4a2a1c", skin: "#c98a5c", bun: false },
  { id: "northlight", name: "Northlight", collection: "Signature", description: "Midnight satin · champagne embroidery · competition bun",
    bodice: "#17364f", highlight: "#456b89", trim: "#e8cca0", sleeve: "#97796f", sleeveShade: "#69514d",
    skirt: "#26465f", skirtShade: "#182e43", tights: "#b28c75", tightsShade: "#89634f",
    hair: "#241d1b", skin: "#d4a68b", bun: true },
  // Collections below: the four above are always first, and saves store ids.
  { id: "paleswan", name: "Pale Swan", collection: "Ballet", description: "Ivory satin · silver feathering · crowned bun",
    bodice: "#efe6d6", highlight: "#f5efe4", trim: "#7f8a98", sleeve: "#dfe4ea", sleeveShade: "#9ca0a4",
    skirt: "#f4efe6", skirtShade: "#aba7a1", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#ddd3c0", skin: "#f0c7ab", bun: true },
  { id: "roseadagio", name: "Rose Adagio", collection: "Ballet", description: "Blush bodice · rose-gold edging · low bun",
    bodice: "#e2b0b8", highlight: "#ecccd1", trim: "#7a3d4e", sleeve: "#f0d4d8", sleeveShade: "#a89497",
    skirt: "#edc4cb", skirtShade: "#a6898e", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#342e46", skin: "#e2b393", bun: true },
  { id: "moonlitlake", name: "Moonlit Lake", collection: "Ballet", description: "Deep indigo · pearl · swept-up bun",
    bodice: "#20285a", highlight: "#6e7394", trim: "#f4efe6", sleeve: "#8f98c4", sleeveShade: "#646a89",
    skirt: "#2f3a78", skirtShade: "#212954", tights: "#253859", tightsShade: "#1a273e",
    hair: "#1b1716", skin: "#d4a68b", bun: true },
  { id: "sugarplum", name: "Sugarplum", collection: "Ballet", description: "Orchid satin · gold dusting · high bun",
    bodice: "#8e4f98", highlight: "#b68dbc", trim: "#f5d998", sleeve: "#c79bd0", sleeveShade: "#8b6d92",
    skirt: "#b873b8", skirtShade: "#815181", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#4a2a1c", skin: "#c98a5c", bun: true },
  { id: "rojoflamenco", name: "Rojo Flamenco", collection: "Spanish & Folk", description: "Scarlet ruffles · black lace · rose in the hair",
    bodice: "#b3141f", highlight: "#ce666d", trim: "#16161c", sleeve: "#16161c", sleeveShade: "#0f0f14",
    skirt: "#c4202b", skirtShade: "#89161e", tights: "#b28c75", tightsShade: "#7d6252",
    hair: "#1b1716", skin: "#c98a5c", bun: true },
  { id: "duende", name: "Duende", collection: "Spanish & Folk", description: "Black and crimson · gold comb · tight chignon",
    bodice: "#16161c", highlight: "#68686b", trim: "#f5d998", sleeve: "#a3192f", sleeveShade: "#721221",
    skirt: "#7a1325", skirtShade: "#550d1a", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#1b1716", skin: "#a8714a", bun: true },
  { id: "sevillagold", name: "Sevilla Gold", collection: "Spanish & Folk", description: "Saffron bodice · terracotta skirt · braid",
    bodice: "#d9a62e", highlight: "#e6c577", trim: "#5c3622", sleeve: "#e6c46a", sleeveShade: "#a1894a",
    skirt: "#b5502a", skirtShade: "#7f381d", tights: "#8e6248", tightsShade: "#634532",
    hair: "#241d1b", skin: "#7d5236", bun: false },
  { id: "nordicfolk", name: "Nordic Folk", collection: "Spanish & Folk", description: "Red wool · cream stitching · long braid",
    bodice: "#a3192f", highlight: "#c36a78", trim: "#efe6d6", sleeve: "#efe6d6", sleeveShade: "#a7a196",
    skirt: "#24439a", skirtShade: "#192f6c", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#c9a66b", skin: "#f0c7ab", bun: false },
  { id: "carpathian", name: "Carpathian", collection: "Spanish & Folk", description: "Forest green · embroidered gold · crown braid",
    bodice: "#1f6b4a", highlight: "#6d9f89", trim: "#f5d998", sleeve: "#efe6d6", sleeveShade: "#a7a196",
    skirt: "#7a2733", skirtShade: "#551b24", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#4a2a1c", skin: "#e2b393", bun: true },
  { id: "meadowstitch", name: "Meadow Stitch", collection: "Spanish & Folk", description: "Sunflower · leaf green · wildflower ribbon",
    bodice: "#d9a62e", highlight: "#e6c577", trim: "#2d5a3a", sleeve: "#efe6d6", sleeveShade: "#a7a196",
    skirt: "#48a67a", skirtShade: "#327455", tights: "#b28c75", tightsShade: "#7d6252",
    hair: "#7a3a20", skin: "#c98a5c", bun: false },
  { id: "decogold", name: "Deco Gold", collection: "Jazz Age", description: "Black satin · gold fans · finger-wave bob",
    bodice: "#16161c", highlight: "#68686b", trim: "#f5d998", sleeve: "#d9c39a", sleeveShade: "#98896c",
    skirt: "#2a2a33", skirtShade: "#1d1d24", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#1b1716", skin: "#d4a68b", bun: false },
  { id: "emeraldflapper", name: "Emerald Flapper", collection: "Jazz Age", description: "Emerald beading · silver fringe · cropped bob",
    bodice: "#1f6b4a", highlight: "#6d9f89", trim: "#dfe4ea", sleeve: "#48a67a", sleeveShade: "#327455",
    skirt: "#14513a", skirtShade: "#0e3929", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#241d1b", skin: "#e2b393", bun: false },
  { id: "speakeasy", name: "Speakeasy", collection: "Jazz Age", description: "Plum velvet · champagne · pinned curls",
    bodice: "#5a2a6e", highlight: "#9475a1", trim: "#e8cca0", sleeve: "#8e5ca0", sleeveShade: "#634070",
    skirt: "#3a1a4a", skirtShade: "#291234", tights: "#5e3d2c", tightsShade: "#422b1f",
    hair: "#1b1716", skin: "#5a3a28", bun: true },
  { id: "hoarfrost", name: "Hoarfrost", collection: "Winter", description: "Ice blue · silver crystal · frosted ponytail",
    bodice: "#9cc3dd", highlight: "#bfd8e9", trim: "#1f3a52", sleeve: "#cfe8f0", sleeveShade: "#91a2a8",
    skirt: "#7fa8c8", skirtShade: "#59768c", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#ddd3c0", skin: "#f0c7ab", bun: false },
  { id: "glacier", name: "Glacier", collection: "Winter", description: "Sapphire · pearl edge · tight blue-black bun",
    bodice: "#24439a", highlight: "#7185bd", trim: "#f4efe6", sleeve: "#7f9ad0", sleeveShade: "#596c92",
    skirt: "#17306f", skirtShade: "#10224e", tights: "#253859", tightsShade: "#1a273e",
    hair: "#1b1716", skin: "#d4a68b", bun: true },
  { id: "snowfall", name: "Snowfall", collection: "Winter", description: "Snow white · pale silver · soft side braid",
    bodice: "#efe6d6", highlight: "#f5efe4", trim: "#5f6f80", sleeve: "#f4f7fa", sleeveShade: "#abadaf",
    skirt: "#e4edf4", skirtShade: "#a0a6ab", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#c9a66b", skin: "#f0c7ab", bun: false },
  { id: "emberdusk", name: "Ember Dusk", collection: "Sunset", description: "Burnt orange · garnet · gold trim",
    bodice: "#b5502a", highlight: "#cf8d75", trim: "#f5d998", sleeve: "#d98a52", sleeveShade: "#986139",
    skirt: "#7a2733", skirtShade: "#551b24", tights: "#b28c75", tightsShade: "#7d6252",
    hair: "#4a2a1c", skin: "#c98a5c", bun: false },
  { id: "coralhour", name: "Coral Hour", collection: "Sunset", description: "Coral · peach shimmer · loose ponytail",
    bodice: "#d9644e", highlight: "#e69a8c", trim: "#fbe6d2", sleeve: "#f0a890", sleeveShade: "#a87665",
    skirt: "#e88a70", skirtShade: "#a2614e", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#7a3a20", skin: "#e2b393", bun: false },
  { id: "desertdusk", name: "Desert Dusk", collection: "Sunset", description: "Rose clay · dusty violet · copper pins",
    bodice: "#c26e60", highlight: "#d7a198", trim: "#f4dcc0", sleeve: "#a78ba8", sleeveShade: "#756176",
    skirt: "#6b4a78", skirtShade: "#4b3454", tights: "#8e6248", tightsShade: "#634532",
    hair: "#241d1b", skin: "#a8714a", bun: true },
  { id: "ink", name: "Ink", collection: "Monochrome", description: "All black · jet beads · slicked bun",
    bodice: "#16161c", highlight: "#68686b", trim: "#dfe4ea", sleeve: "#2a2a33", sleeveShade: "#1d1d24",
    skirt: "#101014", skirtShade: "#0b0b0e", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#1b1716", skin: "#d4a68b", bun: true },
  { id: "paper", name: "Paper", collection: "Monochrome", description: "White on white · silver thread · low ponytail",
    bodice: "#efe6d6", highlight: "#f5efe4", trim: "#6c7480", sleeve: "#f4f7fa", sleeveShade: "#abadaf",
    skirt: "#e8e0d0", skirtShade: "#a29d92", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#241d1b", skin: "#f0c7ab", bun: false },
  { id: "graphite", name: "Graphite", collection: "Monochrome", description: "Slate satin · steel · cropped hair",
    bodice: "#3a3f48", highlight: "#7f8288", trim: "#dfe5ee", sleeve: "#8c94a2", sleeveShade: "#626871",
    skirt: "#525a66", skirtShade: "#393f47", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#c9a66b", skin: "#7d5236", bun: false },
  { id: "warmupblack", name: "Warm-up Black", collection: "Practice", description: "Plain black · grey cuffs · ponytail",
    bodice: "#1b1b22", highlight: "#6b6b6f", trim: "#c8ced6", sleeve: "#1b1b22", sleeveShade: "#131318",
    skirt: "#26262e", skirtShade: "#1b1b20", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#342e46", skin: "#e2b393", bun: false },
  { id: "rinkgrey", name: "Rink Rat Grey", collection: "Practice", description: "Heather grey · red stripe · messy bun",
    bodice: "#7d8590", highlight: "#abb0b7", trim: "#f0d4d0", sleeve: "#9aa3ad", sleeveShade: "#6c7279",
    skirt: "#6a727d", skirtShade: "#4a5058", tights: "#5e3d2c", tightsShade: "#422b1f",
    hair: "#4a2a1c", skin: "#5a3a28", bun: true },
  { id: "morningskate", name: "Morning Skate", collection: "Practice", description: "Sky blue · white edge · high ponytail",
    bodice: "#5a9ac8", highlight: "#94bddb", trim: "#f4f7fa", sleeve: "#9cc3dd", sleeveShade: "#6d899b",
    skirt: "#3a78a8", skirtShade: "#295476", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#a87a45", skin: "#f0c7ab", bun: false },
  { id: "legwarmer", name: "Legwarmer Pink", collection: "Practice", description: "Rose sweatshirt · cream · scrunchie",
    bodice: "#c26e93", highlight: "#d7a1b9", trim: "#f4efe6", sleeve: "#d98fae", sleeveShade: "#98647a",
    skirt: "#a8527a", skirtShade: "#763955", tights: "#b28c75", tightsShade: "#7d6252",
    hair: "#241d1b", skin: "#c98a5c", bun: false },
  { id: "openingnight", name: "Opening Night", collection: "Gala", description: "Midnight velvet · gold crystals · polished bun",
    bodice: "#17224a", highlight: "#686f89", trim: "#f5d998", sleeve: "#3a4a8a", sleeveShade: "#293461",
    skirt: "#0f1736", skirtShade: "#0b1026", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#241d1b", skin: "#e2b393", bun: true },
  { id: "champagnegala", name: "Champagne Gala", collection: "Gala", description: "Champagne satin · rose gold crystal · waved hair",
    bodice: "#d9c39a", highlight: "#e6d8bd", trim: "#7a4a3a", sleeve: "#efe0c0", sleeveShade: "#a79d86",
    skirt: "#c4a874", skirtShade: "#897651", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#c9a66b", skin: "#f0c7ab", bun: false },
  { id: "jubilee", name: "Jubilee", collection: "Gala", description: "Sapphire and gold · full sparkle · crown plait",
    bodice: "#1f3a98", highlight: "#6d7fbc", trim: "#f5d998", sleeve: "#e6c46a", sleeveShade: "#a1894a",
    skirt: "#122470", skirtShade: "#0d194e", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#4a2a1c", skin: "#c98a5c", bun: true },
  { id: "waltzblue", name: "Waltz in Blue", collection: "Program Music", description: "Cornflower · silver lace · ringlets",
    bodice: "#4a78c8", highlight: "#89a7db", trim: "#f4f7fa", sleeve: "#a8c0e4", sleeveShade: "#7686a0",
    skirt: "#7a9ad8", skirtShade: "#556c97", tights: "#d4a68b", tightsShade: "#947461",
    hair: "#c9a66b", skin: "#f0c7ab", bun: false },
  { id: "tangonoir", name: "Tango Noir", collection: "Program Music", description: "Black and wine · slit skirt · slicked back",
    bodice: "#16161c", highlight: "#68686b", trim: "#e4adb5", sleeve: "#7a1325", sleeveShade: "#550d1a",
    skirt: "#5a0f1e", skirtShade: "#3f0b15", tights: "#1b1b22", tightsShade: "#131318",
    hair: "#1b1716", skin: "#a8714a", bun: true },
  { id: "nocturne", name: "Nocturne", collection: "Program Music", description: "Dusk violet · moon silver · loose waves",
    bodice: "#4a3a7a", highlight: "#897fa9", trim: "#dfe4ea", sleeve: "#8a7ab8", sleeveShade: "#615581",
    skirt: "#2f2458", skirtShade: "#21193e", tights: "#253859", tightsShade: "#1a273e",
    hair: "#241d1b", skin: "#7d5236", bun: false },
  { id: "allegrogreen", name: "Allegro Green", collection: "Program Music", description: "Spring green · white piping · quick ponytail",
    bodice: "#48a24a", highlight: "#88c389", trim: "#f4f7fa", sleeve: "#a8d4a0", sleeveShade: "#769470",
    skirt: "#2d7a3a", skirtShade: "#205529", tights: "#e9c3a6", tightsShade: "#a38974",
    hair: "#7a3a20", skin: "#e2b393", bun: false },
  { id: "rhapsodyrose", name: "Rhapsody Rose", collection: "Program Music", description: "Magenta · gold flourish · wide bun",
    bodice: "#b3286a", highlight: "#ce739e", trim: "#f5d998", sleeve: "#e08ab0", sleeveShade: "#9d617b",
    skirt: "#8a1a50", skirtShade: "#611238", tights: "#8e6248", tightsShade: "#634532",
    hair: "#1b1716", skin: "#5a3a28", bun: true },
] as const;
/** Wardrobe order: the menus group presets by this field, in this order. */
export const COLLECTIONS = ["Signature", "Ballet", "Spanish & Folk", "Jazz Age", "Winter", "Sunset", "Monochrome", "Practice", "Gala", "Program Music"] as const;
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
