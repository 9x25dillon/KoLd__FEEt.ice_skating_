// game/motion/dance.ts — dance styles for choreographing routines.
//
// The owner, 2026-11-11: "we're definitely going to need dancing styles for choreographing
// routines." A style is a vocabulary and a way of using it: which arm phrases and holds, which
// carriage, which free-leg lines and moves in the field, which turns and steps; its tempo, meter
// and feel; how it accents the music; how it opens and how it ends. choreograph() lays a style
// over a program's bars as cues a client plays (game/composer.ts already places the elements on
// the music; this dresses the time between and around them). styleFit() says how well a piece of
// music suits a style, for the Composer to suggest.
//
// Presentation, like every Composer timeline (owner, 2026-11-02: routines are shown, not scored).
// The PCS meter keeps reading what the sim sees. AUTHORED vocabularies, from each form's
// well-known movement language; nothing here claims to teach the form itself.

import type { Clip } from "./types.ts";

export type Feel = "sharp" | "fluid" | "percussive" | "sustained" | "bouncy";
export type Accent = "downbeat" | "offbeat" | "syncopated" | "phrase";

export interface DanceStyle {
  id: string;
  name: string;
  family: "classical" | "contemporary" | "jazz" | "ballroom" | "latin" | "spanish" | "street" | "folk" | "theatre";
  blurb: string;
  /** Tempo the style lives in, bpm, and its meter (beats to a bar). */
  tempo: { min: number; max: number };
  meter: 2 | 3 | 4;
  feel: Feel;
  accent: Accent;
  /** Clip ids from game/motion: arm phrases and holds, carriage, free-leg lines, moves in the field. */
  phrases: readonly string[];
  holds: readonly string[];
  carriage: readonly string[];
  freeLeg: readonly string[];
  moves: readonly string[];
  /** sim/stepLevel.ts STEP_TYPE keys a step sequence in this style leans on (toe steps and chassés are moves, not step types). */
  steps: readonly string[];
  opening: string;
  ending: string;
  /** game/atelier.ts fabric, and a costume note. */
  fabric: "satin" | "velvet" | "lycra" | "mesh";
  costume: string;
  music: string;
}

export const DANCE_STYLES: readonly DanceStyle[] = [
  {
    id: "classical", name: "Classical ballet", family: "classical", blurb: "Turnout, line and épaulement: every position placed, nothing wasted.",
    tempo: { min: 60, max: 130 }, meter: 3, feel: "sustained", accent: "phrase",
    phrases: ["expr.phrase.port-de-bras-1", "expr.phrase.port-de-bras-2", "expr.phrase.circle-up", "expr.phrase.swan-wings"],
    holds: ["expr.hold.fifthEnHaut", "expr.hold.second", "expr.hold.arabesque1", "expr.hold.arabesque2", "expr.hold.attitudeArms", "expr.hold.allonge", "expr.hold.fourthEnHaut"],
    carriage: ["expr.carriage.epaulement", "expr.carriage.proud", "expr.carriage.cambre-back"],
    freeLeg: ["leg.free.arabesque", "leg.free.attitude-back", "leg.free.passe", "leg.free.developpe-side", "leg.free.coupe"],
    moves: ["move.spiral.forward", "move.spread-eagle.outside", "move.ina-bauer", "move.charlotte"],
    steps: ["ThreeTurn", "Bracket", "Rocker", "Counter", "ChangeOfEdge"],
    opening: "expr.phrase.opening-pose", ending: "expr.phrase.reverence",
    fabric: "satin", costume: "Pale satin and crystal, a romantic skirt; nothing to break the line.", music: "Tchaikovsky, Delibes, Minkus: waltzes and adagios.",
  },
  {
    id: "neoclassical", name: "Neoclassical", family: "classical", blurb: "Balanchine's speed and angles on a classical frame: fast feet, off-centre lines.",
    tempo: { min: 100, max: 160 }, meter: 4, feel: "sharp", accent: "downbeat",
    phrases: ["expr.phrase.port-de-bras-2", "expr.phrase.spiral-reach", "expr.phrase.reach-and-pull"],
    holds: ["expr.hold.arabesque3", "expr.hold.allonge", "expr.hold.tArms", "expr.hold.reachUpOne", "expr.hold.third"],
    carriage: ["expr.carriage.cambre-side", "expr.carriage.epaulement"],
    freeLeg: ["leg.free.developpe-side", "leg.free.arabesque", "leg.free.flexed-foot"],
    moves: ["move.spiral.y", "move.spread-eagle.inside", "move.lunge"],
    steps: ["Twizzle", "Choctaw", "Counter", "Rocker", "ThreeTurn"],
    opening: "expr.hold.reachUpOne", ending: "expr.phrase.final-pose",
    fabric: "lycra", costume: "A plain leotard-cut dress, one strong colour.", music: "Stravinsky, Bach, Hindemith: driving, rhythmic.",
  },
  {
    id: "romantic", name: "Romantic", family: "classical", blurb: "Giselle and La Sylphide: soft arms, forward-tilted heads, floating.",
    tempo: { min: 50, max: 100 }, meter: 3, feel: "sustained", accent: "phrase",
    phrases: ["expr.phrase.swan-wings", "expr.phrase.melt", "expr.phrase.heart"],
    holds: ["expr.hold.demiSeconde", "expr.hold.brasBas", "expr.hold.prayer", "expr.hold.headCradle", "expr.hold.lowV"],
    carriage: ["expr.carriage.gaze-down", "expr.carriage.forward-bow"],
    freeLeg: ["leg.free.attitude-back", "leg.free.coupe", "leg.free.extended-back"],
    moves: ["move.spiral.forward", "move.spiral.back", "move.ina-bauer"],
    steps: ["ThreeTurn", "Mohawk", "ChangeOfEdge"],
    opening: "expr.hold.prayer", ending: "expr.phrase.reverence",
    fabric: "mesh", costume: "Long tulle, soft colours, sleeves that drift.", music: "Adam, Chopin nocturnes, Massenet's Méditation.",
  },
  {
    id: "contemporary", name: "Contemporary", family: "contemporary", blurb: "Weight, release and the floor: movement from the centre outward.",
    tempo: { min: 60, max: 120 }, meter: 4, feel: "fluid", accent: "phrase",
    phrases: ["expr.phrase.contract-release", "expr.phrase.reach-and-pull", "expr.phrase.spiral-reach", "expr.phrase.push-away", "expr.phrase.wave"],
    holds: ["expr.hold.hugSelf", "expr.hold.wingsBack", "expr.hold.sweepBack", "expr.hold.reachUpOne", "expr.hold.crossChest"],
    carriage: ["expr.carriage.contraction", "expr.carriage.release", "expr.carriage.cambre-back"],
    freeLeg: ["leg.free.tuck", "leg.free.attitude-front", "leg.free.flexed-foot"],
    moves: ["move.hydroblade", "move.choreo-slide", "move.cantilever", "move.lunge"],
    steps: ["Choctaw", "Rocker", "Loop", "ChangeOfEdge", "Twizzle"],
    opening: "expr.phrase.opening-pose", ending: "expr.carriage.contraction",
    fabric: "mesh", costume: "Bare-legged or nude mesh, muted colours, nothing glittering.", music: "Max Richter, Ólafur Arnalds, film scores.",
  },
  {
    id: "lyrical", name: "Lyrical", family: "contemporary", blurb: "Ballet technique telling the song's story: big reaches, held breaths.",
    tempo: { min: 55, max: 110 }, meter: 4, feel: "fluid", accent: "phrase",
    phrases: ["expr.phrase.melt", "expr.phrase.heart", "expr.phrase.spiral-reach", "expr.phrase.circle-up", "expr.phrase.swan-wings"],
    holds: ["expr.hold.vArms", "expr.hold.headCradle", "expr.hold.allonge", "expr.hold.reachUpOne"],
    carriage: ["expr.carriage.release", "expr.carriage.cambre-back", "expr.carriage.gaze-down"],
    freeLeg: ["leg.free.arabesque", "leg.free.attitude-back", "leg.free.developpe-side"],
    moves: ["move.spiral.catch-foot", "move.ina-bauer", "move.hydroblade", "move.spiral.biellmann"],
    steps: ["ThreeTurn", "Choctaw", "Loop", "ChangeOfEdge"],
    opening: "expr.hold.headCradle", ending: "expr.phrase.melt",
    fabric: "mesh", costume: "Flowing chiffon in one colour, long sleeves.", music: "Ballads, piano covers, slow pop.",
  },
  {
    id: "modern", name: "Modern (Graham)", family: "contemporary", blurb: "Contraction and spiral: the pelvis drives, the arms answer.",
    tempo: { min: 60, max: 110 }, meter: 4, feel: "percussive", accent: "downbeat",
    phrases: ["expr.phrase.contract-release", "expr.phrase.push-away"],
    holds: ["expr.hold.hugSelf", "expr.hold.wingsBack", "expr.hold.tArms", "expr.hold.lowV"],
    carriage: ["expr.carriage.contraction", "expr.carriage.release", "expr.carriage.forward-bow"],
    freeLeg: ["leg.free.flexed-foot", "leg.free.tuck", "leg.free.kick-back"],
    moves: ["move.lunge", "move.cantilever", "move.shoot-the-duck"],
    steps: ["Choctaw", "Bracket", "Counter"],
    opening: "expr.carriage.contraction", ending: "expr.carriage.release",
    fabric: "lycra", costume: "A long jersey dress, dark, wrapped.", music: "Copland, Barber's Adagio, percussion.",
  },
  {
    id: "jazz", name: "Jazz", family: "jazz", blurb: "Isolations, attack and style: shoulders, hips and hands on the accents.",
    tempo: { min: 100, max: 180 }, meter: 4, feel: "sharp", accent: "syncopated",
    phrases: ["expr.phrase.jazz-hands", "expr.phrase.fosse", "expr.phrase.broadway-sell", "expr.phrase.wave"],
    holds: ["expr.hold.oneHandHip", "expr.hold.vArms", "expr.hold.tArms", "expr.hold.handsOnHips"],
    carriage: ["expr.carriage.proud", "expr.carriage.cambre-side"],
    freeLeg: ["leg.free.kick-back", "leg.free.flexed-foot", "leg.free.passe"],
    moves: ["move.split-jump-pose", "move.stag-pose", "move.lunge", "move.bunny-hop"],
    steps: ["Twizzle", "Mohawk", "Crossover"],
    opening: "expr.hold.oneHandHip", ending: "expr.phrase.final-pose",
    fabric: "lycra", costume: "Black with sequins and fringe, a bowler hat in spirit.", music: "Big band, Gershwin, All That Jazz.",
  },
  {
    id: "broadway", name: "Broadway", family: "theatre", blurb: "Sell it to the back row: big lines, a grin, a character.",
    tempo: { min: 100, max: 170 }, meter: 4, feel: "sharp", accent: "downbeat",
    phrases: ["expr.phrase.broadway-sell", "expr.phrase.jazz-hands", "expr.phrase.salute", "expr.phrase.beckon"],
    holds: ["expr.hold.vArms", "expr.hold.oneHandHip", "expr.hold.tArms"],
    carriage: ["expr.carriage.proud", "expr.carriage.release"],
    freeLeg: ["leg.free.kick-back", "leg.free.attitude-front", "leg.free.flexed-foot"],
    moves: ["move.split-jump-pose", "move.spread-eagle.outside", "move.bunny-hop", "move.toe-step"],
    steps: ["Twizzle", "ThreeTurn"],
    opening: "expr.phrase.salute", ending: "expr.phrase.final-pose",
    fabric: "satin", costume: "Show colours: red, gold, sequins, a character's dress.", music: "Show tunes: Chicago, West Side Story, Cats.",
  },
  {
    id: "swing", name: "Swing and Charleston", family: "jazz", blurb: "Bounce, kicks and swivels: the 1920s on ice.",
    tempo: { min: 140, max: 220 }, meter: 4, feel: "bouncy", accent: "offbeat",
    phrases: ["expr.phrase.charleston", "expr.phrase.jazz-hands"],
    holds: ["expr.hold.handsOnHips", "expr.hold.vArms", "expr.hold.lowV"],
    carriage: ["expr.carriage.proud"],
    freeLeg: ["leg.free.kick-back", "leg.free.flexed-foot", "leg.free.tuck"],
    moves: ["move.bunny-hop", "move.toe-step", "move.swizzle"],
    steps: ["Twizzle", "Crossover"],
    opening: "expr.hold.handsOnHips", ending: "expr.phrase.jazz-hands",
    fabric: "satin", costume: "A dropped-waist flapper dress with fringe.", music: "Sing Sing Sing, the Charleston, electro-swing.",
  },
  {
    id: "tango", name: "Argentine tango", family: "ballroom", blurb: "Held as if in an embrace: sharp heads, slow walks, sudden stops.",
    tempo: { min: 55, max: 70 }, meter: 4, feel: "percussive", accent: "syncopated",
    phrases: ["expr.phrase.tango-frame", "expr.phrase.tango-snap", "expr.phrase.tango-frame.mirror"],
    holds: ["expr.hold.tArms", "expr.hold.crossChest", "expr.hold.oneHandHip"],
    carriage: ["expr.carriage.proud", "expr.carriage.epaulement"],
    freeLeg: ["leg.free.crossed-behind", "leg.free.passe", "leg.free.kick-back"],
    moves: ["move.lunge", "move.ina-bauer", "move.shoot-the-duck"],
    steps: ["Choctaw", "Mohawk", "Rocker", "Counter", "ChangeOfEdge"],
    opening: "expr.phrase.tango-frame", ending: "expr.phrase.tango-snap",
    fabric: "velvet", costume: "Black and red, a high slit, a rose in spirit.", music: "Piazzolla: Libertango, Oblivion.",
  },
  {
    id: "waltz", name: "Viennese waltz", family: "ballroom", blurb: "One-two-three, rise and fall, turning and turning.",
    tempo: { min: 150, max: 186 }, meter: 3, feel: "fluid", accent: "downbeat",
    phrases: ["expr.phrase.waltz-sway", "expr.phrase.port-de-bras-1"],
    holds: ["expr.hold.second", "expr.hold.demiSeconde", "expr.hold.allonge"],
    carriage: ["expr.carriage.proud", "expr.carriage.epaulement"],
    freeLeg: ["leg.free.extended-back", "leg.free.extended-front"],
    moves: ["move.spread-eagle.outside", "move.spiral.forward"],
    steps: ["ThreeTurn", "Mohawk", "Choctaw", "Crossover"],
    opening: "expr.hold.second", ending: "expr.phrase.reverence",
    fabric: "satin", costume: "A ball gown cut short: full skirt, one jewel colour.", music: "Strauss: The Blue Danube, Emperor Waltz.",
  },
  {
    id: "paso", name: "Paso doble", family: "latin", blurb: "The matador and the cape: proud chest, stamped accents, held shapes.",
    tempo: { min: 112, max: 124 }, meter: 2, feel: "percussive", accent: "downbeat",
    phrases: ["expr.phrase.paso-cape", "expr.phrase.flamenco-desplante"],
    holds: ["expr.hold.tArms", "expr.hold.oneHandHip", "expr.hold.reachUpOne"],
    carriage: ["expr.carriage.proud", "expr.carriage.cambre-back"],
    freeLeg: ["leg.free.flexed-foot", "leg.free.crossed-behind"],
    moves: ["move.lunge", "move.spread-eagle.outside", "move.toe-step"],
    steps: ["Choctaw", "Twizzle", "Crossover"],
    opening: "expr.phrase.flamenco-desplante", ending: "expr.phrase.final-pose",
    fabric: "velvet", costume: "Red and black, a cape's sweep in the skirt.", music: "España Cañí, Carmen.",
  },
  {
    id: "latin", name: "Rumba, samba, cha-cha", family: "latin", blurb: "Hips, rolls and checks: slow-quick-quick, the cha-cha-cha.",
    tempo: { min: 96, max: 128 }, meter: 4, feel: "bouncy", accent: "syncopated",
    phrases: ["expr.phrase.rumba-arms", "expr.phrase.samba-roll", "expr.phrase.cha-cha-hips"],
    holds: ["expr.hold.oneHandHip", "expr.hold.allonge", "expr.hold.handsOnHips"],
    carriage: ["expr.carriage.cambre-side", "expr.carriage.proud"],
    freeLeg: ["leg.free.passe", "leg.free.extended-front", "leg.free.crossed-behind"],
    moves: ["move.toe-step", "move.chasse", "move.lunge"],
    steps: ["Twizzle", "Mohawk"],
    opening: "expr.hold.oneHandHip", ending: "expr.phrase.final-pose",
    fabric: "lycra", costume: "Fringe that swings, bright colour, open back.", music: "Rumba, samba, Latin pop.",
  },
  {
    id: "flamenco", name: "Flamenco", family: "spanish", blurb: "Braceo above, zapateado below: proud, fierce, slow then sudden.",
    tempo: { min: 80, max: 180 }, meter: 3, feel: "percussive", accent: "syncopated",
    phrases: ["expr.phrase.braceo", "expr.phrase.flamenco-desplante", "expr.phrase.flamenco-desplante.mirror"],
    holds: ["expr.hold.fifthEnHaut", "expr.hold.oneHandHip", "expr.hold.third"],
    carriage: ["expr.carriage.proud", "expr.carriage.cambre-back"],
    freeLeg: ["leg.free.flexed-foot", "leg.free.crossed-behind", "leg.free.passe"],
    moves: ["move.toe-step", "move.lunge", "move.ina-bauer"],
    steps: ["Twizzle", "Choctaw", "Counter"],
    opening: "expr.phrase.flamenco-desplante", ending: "expr.phrase.flamenco-desplante",
    fabric: "velvet", costume: "Ruffles at the hem, polka dots or deep red, a high bun.", music: "Bulerías, Malagueña, guitar.",
  },
  {
    id: "street", name: "Hip-hop and street", family: "street", blurb: "Grooves, hits and freezes: the body as the drum kit.",
    tempo: { min: 85, max: 110 }, meter: 4, feel: "percussive", accent: "downbeat",
    phrases: ["expr.phrase.pop", "expr.phrase.tutting", "expr.phrase.groove", "expr.phrase.wave"],
    holds: ["expr.hold.crossChest", "expr.hold.lowV", "expr.hold.tArms"],
    carriage: ["expr.carriage.forward-bow", "expr.carriage.gaze-down"],
    freeLeg: ["leg.free.tuck", "leg.free.flexed-foot", "leg.free.kick-back"],
    moves: ["move.shoot-the-duck", "move.hockey-stop", "move.choreo-slide", "move.toe-step"],
    steps: ["Twizzle", "Mohawk", "Crossover"],
    opening: "expr.carriage.gaze-down", ending: "expr.phrase.pop",
    fabric: "lycra", costume: "Street cut: joggers-look trousers and a cropped top.", music: "Hip-hop, funk, breakbeat.",
  },
  {
    id: "character", name: "Slavic character", family: "folk", blurb: "Russian and Polish character dance: hands on hips, flung arms, stamped heels.",
    tempo: { min: 100, max: 180 }, meter: 2, feel: "bouncy", accent: "downbeat",
    phrases: ["expr.phrase.slavic-hands", "expr.phrase.russian-shawl"],
    holds: ["expr.hold.handsOnHips", "expr.hold.tArms", "expr.hold.wingsBack"],
    carriage: ["expr.carriage.proud"],
    freeLeg: ["leg.free.flexed-foot", "leg.free.kick-back", "leg.free.passe"],
    moves: ["move.shoot-the-duck", "move.toe-step", "move.split-jump-pose"],
    steps: ["Twizzle", "ThreeTurn", "Crossover"],
    opening: "expr.hold.handsOnHips", ending: "expr.phrase.slavic-hands",
    fabric: "velvet", costume: "Embroidered bodice, a kokoshnik in spirit, red boots.", music: "Kalinka, Khachaturian, Hungarian dances.",
  },
  {
    id: "irish", name: "Irish step", family: "folk", blurb: "Arms still at the sides, everything in the feet: quick, crossed, high.",
    tempo: { min: 110, max: 140 }, meter: 2, feel: "sharp", accent: "downbeat",
    phrases: ["expr.phrase.irish-still"],
    holds: ["expr.hold.brasBas"],
    carriage: ["expr.carriage.proud"],
    freeLeg: ["leg.free.crossed-behind", "leg.free.kick-back", "leg.free.passe"],
    moves: ["move.toe-step", "move.bunny-hop", "move.chasse"],
    steps: ["Twizzle", "ThreeTurn", "Crossover"],
    opening: "expr.phrase.irish-still", ending: "expr.phrase.irish-still",
    fabric: "velvet", costume: "A stiff embroidered dress, Celtic knots.", music: "Reels and jigs: Riverdance.",
  },
  {
    id: "bollywood", name: "Bollywood", family: "theatre", blurb: "Joy, hands and hips: storytelling gestures at speed.",
    tempo: { min: 100, max: 150 }, meter: 4, feel: "bouncy", accent: "downbeat",
    phrases: ["expr.phrase.bollywood", "expr.phrase.samba-roll", "expr.phrase.beckon"],
    holds: ["expr.hold.vArms", "expr.hold.reachUpOne", "expr.hold.prayer"],
    carriage: ["expr.carriage.proud", "expr.carriage.cambre-side"],
    freeLeg: ["leg.free.flexed-foot", "leg.free.passe", "leg.free.kick-back"],
    moves: ["move.toe-step", "move.chasse", "move.spread-eagle.outside"],
    steps: ["Twizzle", "ThreeTurn", "Crossover"],
    opening: "expr.hold.prayer", ending: "expr.phrase.final-pose",
    fabric: "satin", costume: "Jewel colours, gold trim, a lehenga's swing in the skirt.", music: "Filmi songs, bhangra beats.",
  },
];

export function styleById(id: string): DanceStyle | undefined { return DANCE_STYLES.find(s => s.id === id); }

/** Every clip id a style names, for checking they all exist. */
export function styleClipIds(s: DanceStyle): string[] {
  return [...s.phrases, ...s.holds, ...s.carriage, ...s.freeLeg, ...s.moves, s.opening, s.ending];
}

/**
 * How well music suits a style, 0..1: its tempo inside the style's range (or a half or double of
 * it, which dancers count in all the time), and its meter. AUTHORED weights.
 */
export function styleFit(s: DanceStyle, bpm: number, beatsPerBar: number): number {
  const inRange = (t: number) => t >= s.tempo.min && t <= s.tempo.max;
  const centre = (s.tempo.min + s.tempo.max) / 2, half = (s.tempo.max - s.tempo.min) / 2 || 1;
  const near = (t: number) => Math.max(0, 1 - Math.abs(t - centre) / (half * 2));
  const tempo = inRange(bpm) ? 1 : inRange(bpm * 2) || inRange(bpm / 2) ? 0.7 : Math.max(near(bpm), near(bpm * 2), near(bpm / 2)) * 0.6;
  const meter = beatsPerBar === s.meter ? 1 : (s.meter === 2 && beatsPerBar === 4) || (s.meter === 4 && beatsPerBar === 2) ? 0.85 : 0.4;
  return Math.round(tempo * meter * 100) / 100;
}

/** Styles ranked for a piece of music, best first. */
export function suggestStyles(bpm: number, beatsPerBar: number): { style: DanceStyle; fit: number }[] {
  return DANCE_STYLES.map(style => ({ style, fit: styleFit(style, bpm, beatsPerBar) })).sort((a, b) => b.fit - a.fit);
}

export interface ChoreoCue {
  /** Bar index from the program's start, and the beat within it. */
  bar: number; beat: number;
  /** Seconds from the program's start. */
  at: number;
  clip: string;
  /** What the clip drives: the arms and carriage, the free leg, or a whole move in the field. */
  layer: "arms" | "leg" | "move";
  /** Seconds it plays before the next cue on its layer. */
  seconds: number;
}

/**
 * A style over a program's bars: the opening on the first bar, then arm phrases and holds by the
 * style's feel (fluid and sustained styles hold longer and phrase in fours; sharp and percussive
 * ones change every bar), a free-leg line and a move in the field at the end of each phrase, and
 * the ending on the last bar. Deterministic in its seed; the same music and style lay the same.
 */
export function choreograph(style: DanceStyle, music: { bpm: number; beatsPerBar: number; offset?: number; bars: number }, seed = 1): ChoreoCue[] {
  const beat = 60 / music.bpm, bar = beat * music.beatsPerBar, off = music.offset ?? 0;
  let x = (seed * 2654435761) >>> 0;
  const rand = (n: number) => { x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0; return x % n; };
  const pick = (list: readonly string[]) => list[rand(list.length)];
  const span = style.feel === "fluid" || style.feel === "sustained" ? 2 : 1;
  const phraseBars = style.feel === "fluid" || style.feel === "sustained" ? 4 : 2;
  const out: ChoreoCue[] = [];
  const cue = (b: number, beatIn: number, clip: string, layer: ChoreoCue["layer"], bars: number) =>
    out.push({ bar: b, beat: beatIn, at: off + b * bar + beatIn * beat, clip, layer, seconds: bars * bar });
  if (music.bars < 1) return out;
  cue(0, 0, style.opening, "arms", 1);
  for (let b = 1; b < music.bars - 1; b += span) {
    const endOfPhrase = (b + span) % phraseBars === 0 || b + span >= music.bars - 1;
    // Syncopated and offbeat styles come in on the "and"; the rest on the downbeat.
    const beatIn = style.accent === "offbeat" || (style.accent === "syncopated" && rand(2) === 0) ? 0.5 : 0;
    const usePhrase = style.feel === "sustained" ? rand(3) > 0 : rand(2) === 0;
    cue(b, beatIn, usePhrase ? pick(style.phrases) : pick([...style.holds, ...style.carriage]), "arms", Math.min(span, music.bars - 1 - b));
    if (endOfPhrase) {
      cue(b, music.beatsPerBar - 1, pick(style.freeLeg), "leg", 1);
      if (rand(2) === 0) cue(b + Math.max(0, span - 1), 0, pick(style.moves), "move", 1);
    }
  }
  if (music.bars > 1) cue(music.bars - 1, 0, style.ending, "arms", 1);
  return out.sort((a, b) => a.at - b.at);
}

/** A clip the style's cues name, resolved against a library; undefined if the library lacks it. */
export function resolve(cue: ChoreoCue, library: ReadonlyMap<string, Clip>): Clip | undefined { return library.get(cue.clip); }
