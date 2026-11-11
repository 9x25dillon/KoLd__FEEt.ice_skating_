// game/motion/expressions.ts — the arms, head and carriage: port de bras and dance expression.
//
// Each expression names only the trunk's carriage, the head and the arms, so it layers over
// whatever the legs and blades are doing: a glide, an edge, a spiral, a step sequence. Holds are
// static poses, phrases move through several. The classical vocabulary is the Cecchetti/Vaganova
// port de bras (bras bas, first through fifth, the arabesques, allongé); the rest is what each
// dance style in game/motion/dance.ts draws on: a tango's frame, a flamenco's braceo, a jazz
// hand, a street pop, a folk hand on the hip.
//
// What the arms do to the physics is game/armfocus.ts's and the sim's (arm carriage, armsL):
// this is how they look, never what they cost. AUTHORED shapes, judged by eye.

import { clip, dir, mirrorClip } from "./types.ts";
import type { Clip, Pose, Segment, Vec3 } from "./types.ts";

type Arms = Partial<Record<Segment, Vec3>>;
const pose = (a: Arms, trunk: Vec3 = dir(0, 90), head: Vec3 = dir(0, 88)): Pose => ({ seg: { trunk, head, ...a } });
/** Both arms by bearing/elevation pairs: [upper, fore] for each side. */
const both = (uL: [number, number], fL: [number, number], uR: [number, number], fR: [number, number]): Arms =>
  ({ upperArmL: dir(...uL), forearmL: dir(...fL), upperArmR: dir(...uR), forearmR: dir(...fR) });
const sym = (u: [number, number], f: [number, number]) => both([-u[0], u[1]], [-f[0], f[1]], u, f);

// ── the classical positions (holds) ──────────────────────────────────────────

export const POSITIONS = {
  brasBas: sym([150, -80], [100, -80]),
  first: sym([20, -30], [-40, -20]),
  second: sym([95, -12], [100, -18]),
  third: both([-40, 70], [10, 85], [95, -12], [100, -18]),
  fourthEnHaut: both([-20, 70], [20, 85], [40, -30], [-30, -20]),
  fifthEnHaut: sym([20, 70], [-30, 82]),
  demiSeconde: sym([110, -40], [110, -40]),
  allonge: sym([95, -5], [95, -5]),
  arabesque1: both([-10, 5], [-5, 10], [130, -5], [140, -8]),
  arabesque2: both([-120, -5], [-130, -8], [10, 5], [5, 10]),
  arabesque3: both([-20, 15], [-15, 18], [-5, 25], [0, 30]),
  attitudeArms: both([-95, 10], [-60, 30], [20, 70], [-25, 85]),
  vArms: sym([45, 55], [45, 60]),
  tArms: sym([90, 0], [90, 0]),
  lowV: sym([45, -45], [45, -50]),
  wingsBack: sym([150, -20], [160, -25]),
  hugSelf: sym([40, -40], [-80, 0]),
  prayer: sym([15, -20], [-70, 40]),
  handsOnHips: sym([110, -60], [-120, -10]),
  oneHandHip: both([-110, -60], [120, -10], [95, -12], [100, -18]),
  headCradle: sym([60, 60], [-110, 30]),
  reachUpOne: both([-10, 80], [-10, 85], [150, -80], [100, -80]),
  crossChest: sym([30, -20], [-90, 10]),
  sweepBack: sym([140, 10], [150, 15]),
} as const satisfies Record<string, Arms>;

const HOLD_NAMES: Record<keyof typeof POSITIONS, string> = {
  brasBas: "Bras bas", first: "First position", second: "Second position", third: "Third position",
  fourthEnHaut: "Fourth en haut", fifthEnHaut: "Fifth en haut", demiSeconde: "Demi-seconde", allonge: "Allongé",
  arabesque1: "First arabesque arms", arabesque2: "Second arabesque arms", arabesque3: "Third arabesque arms",
  attitudeArms: "Attitude arms", vArms: "Open V", tArms: "T line", lowV: "Low V", wingsBack: "Wings back",
  hugSelf: "Self-embrace", prayer: "Prayer hands", handsOnHips: "Hands on hips", oneHandHip: "One hand on hip",
  headCradle: "Cradled head", reachUpOne: "Reach to the roof", crossChest: "Crossed at the chest", sweepBack: "Swept back",
};

const holds: Clip[] = (Object.keys(POSITIONS) as (keyof typeof POSITIONS)[]).map(k =>
  clip(`expr.hold.${k}`, HOLD_NAMES[k], "expression", [{ t: 0, pose: pose(POSITIONS[k]) }], {
    loop: true, duration: 1, tags: ["hold", "arms"], note: "A held arm line, layered over any skating.",
  }));

// ── carriage and head (holds that also move the trunk) ───────────────────────

const carriage: Clip[] = [
  ["expr.carriage.proud", "Proud carriage", pose(POSITIONS.demiSeconde, dir(180, 85), dir(0, 95))],
  ["expr.carriage.cambre-back", "Cambré back", pose(POSITIONS.fifthEnHaut, dir(180, 65), dir(180, 55))],
  ["expr.carriage.cambre-side", "Cambré to the side", pose(POSITIONS.third, dir(-90, 72), dir(-80, 70))],
  ["expr.carriage.forward-bow", "Bow forward", pose(POSITIONS.brasBas, dir(0, 60), dir(0, 40))],
  ["expr.carriage.contraction", "Contraction", pose(POSITIONS.hugSelf, dir(0, 75), dir(0, 55))],
  ["expr.carriage.release", "Release", pose(POSITIONS.vArms, dir(180, 78), dir(180, 70))],
  ["expr.carriage.epaulement", "Épaulement", pose(POSITIONS.fourthEnHaut, dir(-15, 88), dir(-35, 92))],
  ["expr.carriage.gaze-down", "Gaze to the ice", pose(POSITIONS.lowV, dir(0, 85), dir(0, 50))],
].map(([id, name, p]) => clip(id as string, name as string, "expression", [{ t: 0, pose: p as Pose }], { loop: true, duration: 1, tags: ["hold", "carriage"], note: "A trunk and head line with its arms." }));

// ── phrases (arms moving through positions on the music) ─────────────────────

/** A phrase through named positions, one per beat at 120 bpm (0.5 s), looping back to its start. */
function phrase(id: string, name: string, steps: Arms[], o: { beat?: number; tags: string[]; note: string; trunks?: Vec3[]; heads?: Vec3[]; ease?: "linear" | "in" | "out" | "inOut" | "hold" }): Clip {
  const beat = o.beat ?? 0.5;
  return clip(id, name, "expression", steps.map((a, i) => ({ t: i * beat, pose: pose(a, o.trunks?.[i] ?? dir(0, 90), o.heads?.[i] ?? dir(0, 88)), ease: o.ease })),
    { loop: true, duration: steps.length * beat, tags: ["phrase", ...o.tags], note: o.note });
}
const P = POSITIONS;
const phrasesLeft: Clip[] = [
  // Classical
  phrase("expr.phrase.port-de-bras-1", "Port de bras, first", [P.brasBas, P.first, P.fifthEnHaut, P.second, P.demiSeconde, P.brasBas], { tags: ["classical", "ballet"], note: "Bras bas through first to fifth, open to second, down." }),
  phrase("expr.phrase.port-de-bras-2", "Port de bras, second", [P.first, P.second, P.allonge, P.arabesque1, P.first], { tags: ["classical", "ballet"], note: "Opening through second to an allongé and arabesque." }),
  phrase("expr.phrase.swan-wings", "Swan wings", [P.second, P.vArms, P.second, P.lowV, P.second], { beat: 0.75, tags: ["classical", "ballet", "lyrical"], note: "The arms ripple like wings, slow, from the back." }),
  phrase("expr.phrase.reverence", "Révérence", [P.second, P.demiSeconde, P.brasBas], { beat: 0.8, tags: ["classical", "bow", "ending"], note: "A closing bow: open, soften, lower.", trunks: [dir(0, 90), dir(0, 75), dir(0, 65)], heads: [dir(0, 88), dir(0, 70), dir(0, 45)] }),
  phrase("expr.phrase.circle-up", "Circle up and over", [P.brasBas, P.first, P.fifthEnHaut, P.vArms, P.second], { tags: ["classical", "lyrical"], note: "A full circle of the arms up the front and down the sides." }),
  // Lyrical / contemporary
  phrase("expr.phrase.reach-and-pull", "Reach and pull", [P.allonge, P.arabesque3, P.hugSelf, P.allonge], { beat: 0.6, tags: ["contemporary", "lyrical"], note: "Reach out to something, pull it to the chest.", trunks: [dir(0, 85), dir(0, 80), dir(0, 72), dir(0, 85)] }),
  phrase("expr.phrase.contract-release", "Contract and release", [P.hugSelf, P.vArms, P.hugSelf, P.sweepBack], { beat: 0.6, tags: ["contemporary"], note: "Graham-style: curl in from the centre, spill open.", trunks: [dir(0, 72), dir(180, 78), dir(0, 72), dir(180, 80)], heads: [dir(0, 50), dir(180, 70), dir(0, 50), dir(180, 75)] }),
  phrase("expr.phrase.wave", "Body wave", [P.allonge, P.second, P.lowV, P.second], { beat: 0.4, tags: ["contemporary", "street"], note: "A wave through the arms, shoulder to fingertip.", trunks: [dir(0, 85), dir(180, 86), dir(0, 84), dir(180, 86)] }),
  phrase("expr.phrase.spiral-reach", "Spiralling reach", [P.reachUpOne, P.third, P.arabesque2, P.reachUpOne], { beat: 0.6, tags: ["contemporary", "lyrical"], note: "One arm spirals up through the others' lines.", trunks: [dir(20, 88), dir(-20, 86), dir(-40, 84), dir(20, 88)] }),
  phrase("expr.phrase.melt", "Melt", [P.fifthEnHaut, P.headCradle, P.crossChest, P.brasBas], { beat: 0.7, tags: ["lyrical", "slow"], note: "Everything softens down from above the head.", trunks: [dir(0, 90), dir(0, 82), dir(0, 74), dir(0, 70)], heads: [dir(0, 95), dir(0, 70), dir(0, 55), dir(0, 45)] }),
  // Jazz / Broadway / swing
  phrase("expr.phrase.jazz-hands", "Jazz hands", [P.vArms, P.lowV, P.vArms, P.tArms], { beat: 0.25, tags: ["jazz", "broadway"], note: "Sharp, on every beat, splayed hands out to the house.", ease: "out" }),
  phrase("expr.phrase.broadway-sell", "Broadway sell", [P.tArms, P.fifthEnHaut, P.vArms, P.oneHandHip], { beat: 0.5, tags: ["broadway", "jazz"], note: "Big, open and to the back row.", ease: "out" }),
  phrase("expr.phrase.charleston", "Charleston arms", [both([-40, -30], [-60, -40], [140, -30], [150, -40]), both([-140, -30], [-150, -40], [40, -30], [60, -40])], { beat: 0.25, tags: ["swing", "charleston"], note: "Arms swinging in opposition, quick.", ease: "out" }),
  phrase("expr.phrase.fosse", "Fosse isolation", [P.oneHandHip, both([-110, -60], [120, -10], [60, -40], [-30, -60]), P.oneHandHip], { beat: 0.5, tags: ["jazz", "broadway"], note: "Hunched, turned-in, one hand doing all the talking.", trunks: [dir(0, 82), dir(0, 80), dir(0, 82)], ease: "hold" }),
  // Tango / ballroom
  phrase("expr.phrase.tango-frame", "Tango frame", [both([-80, 5], [-20, 30], [40, -10], [-60, 5])], { beat: 1, tags: ["tango", "ballroom"], note: "Held as if in a partner's frame: left arm up and out, right around a back.", trunks: [dir(-10, 88)], heads: [dir(-60, 90)] }),
  phrase("expr.phrase.tango-snap", "Tango head snap", [both([-80, 5], [-20, 30], [40, -10], [-60, 5]), both([-80, 5], [-20, 30], [40, -10], [-60, 5])], { beat: 0.5, tags: ["tango"], note: "The frame holds; the head snaps from one side to the other.", heads: [dir(-70, 90), dir(60, 90)], ease: "hold" }),
  phrase("expr.phrase.waltz-sway", "Waltz sway", [P.second, P.demiSeconde, P.second], { beat: 0.6667, tags: ["waltz", "ballroom"], note: "Down-up-up in the arms on three-four time.", trunks: [dir(-90, 86), dir(0, 90), dir(90, 86)] }),
  phrase("expr.phrase.paso-cape", "Paso doble cape", [both([-90, 40], [-60, 60], [90, -20], [60, -10]), both([-90, -20], [-60, -10], [90, 40], [60, 60])], { beat: 0.5, tags: ["paso doble", "latin"], note: "The matador's cape swept from one side to the other.", trunks: [dir(180, 82), dir(180, 82)], ease: "out" }),
  // Latin
  phrase("expr.phrase.rumba-arms", "Rumba arms", [both([-100, 10], [-100, 20], [60, -40], [40, -50]), both([-60, -40], [-40, -50], [100, 10], [100, 20])], { beat: 0.5, tags: ["latin", "rumba"], note: "One arm extends while the other draws in, slow-quick-quick.", trunks: [dir(-10, 88), dir(10, 88)] }),
  phrase("expr.phrase.samba-roll", "Samba roll", [P.lowV, P.second, P.vArms, P.second], { beat: 0.25, tags: ["latin", "samba"], note: "Quick rolling arms on a bouncing two.", trunks: [dir(0, 86), dir(180, 86), dir(0, 86), dir(180, 86)], ease: "out" }),
  phrase("expr.phrase.cha-cha-hips", "Cha-cha check", [P.oneHandHip, P.second, P.oneHandHip], { beat: 0.25, tags: ["latin", "cha-cha"], note: "A sharp check out to the side on the cha-cha-cha.", ease: "hold" }),
  // Flamenco
  phrase("expr.phrase.braceo", "Braceo", [P.fifthEnHaut, both([-60, 75], [20, 80], [60, 65], [-20, 75]), P.fifthEnHaut, both([-60, 65], [20, 75], [60, 75], [-20, 80])], { beat: 0.5, tags: ["flamenco"], note: "Flamenco arms: slow spirals above the head, wrists turning.", trunks: [dir(180, 84), dir(180, 82), dir(180, 84), dir(180, 82)] }),
  phrase("expr.phrase.flamenco-desplante", "Desplante", [both([-110, -60], [120, -10], [20, 70], [-30, 82]), both([-110, -60], [120, -10], [20, 70], [-30, 82])], { beat: 0.5, tags: ["flamenco"], note: "Proud stop: one hand on the hip, the other raised, chin up.", trunks: [dir(180, 82), dir(180, 82)], heads: [dir(-40, 100), dir(40, 100)], ease: "hold" }),
  // Street / hip-hop
  phrase("expr.phrase.pop", "Pop and lock", [P.tArms, both([-90, 0], [0, 0], [90, 0], [0, 0]), both([-90, 0], [0, 90], [90, 0], [0, 90]), P.tArms], { beat: 0.25, tags: ["street", "hip-hop"], note: "Hits on the beat, frozen between.", ease: "hold" }),
  phrase("expr.phrase.tutting", "Tutting", [both([-90, 0], [0, 0], [90, 0], [0, 0]), both([-40, -40], [60, 0], [40, -40], [-60, 0]), both([-90, 0], [0, 90], [90, 0], [0, 90])], { beat: 0.25, tags: ["street", "hip-hop"], note: "Right angles at the elbows, box shapes in front of the body.", ease: "hold" }),
  phrase("expr.phrase.groove", "Groove", [P.lowV, P.crossChest, P.lowV], { beat: 0.5, tags: ["street", "hip-hop"], note: "Loose, bounced, arms riding the down-beat.", trunks: [dir(0, 84), dir(0, 80), dir(0, 84)], heads: [dir(0, 80), dir(0, 70), dir(0, 80)] }),
  // Folk / character
  phrase("expr.phrase.slavic-hands", "Slavic hands", [P.handsOnHips, P.tArms, P.handsOnHips], { beat: 0.5, tags: ["folk", "character"], note: "Hands on hips, then flung open: a character-dance flourish.", ease: "out" }),
  phrase("expr.phrase.russian-shawl", "Shawl", [both([-60, 20], [-90, 10], [60, 20], [90, 10]), P.second], { beat: 0.75, tags: ["folk", "character"], note: "As if holding a shawl spread behind the shoulders." }),
  phrase("expr.phrase.irish-still", "Held still", [sym([170, -88], [175, -88])], { beat: 1, tags: ["folk", "irish"], note: "Arms straight and still at the sides; all of it is in the feet." }),
  phrase("expr.phrase.bollywood", "Bollywood light bulb", [both([-30, 70], [-10, 85], [30, -30], [60, -20]), both([-30, -30], [-60, -20], [30, 70], [10, 85])], { beat: 0.25, tags: ["bollywood"], note: "Screw in the bulb, pat the dog: quick, joyful, alternating.", ease: "out" }),
  // Gestures
  phrase("expr.phrase.heart", "Hand to heart", [P.second, sym([20, -40], [-80, 20]), P.allonge], { beat: 0.75, tags: ["gesture", "lyrical"], note: "Open, a hand to the heart, give it to the audience." }),
  phrase("expr.phrase.beckon", "Beckon", [P.arabesque1, P.first, P.arabesque1], { beat: 0.5, tags: ["gesture"], note: "Reach toward the judges and draw them in." }),
  phrase("expr.phrase.push-away", "Push away", [P.crossChest, sym([10, 0], [10, 0]), P.crossChest], { beat: 0.5, tags: ["gesture", "contemporary"], note: "Both palms push something away from the chest." }),
  phrase("expr.phrase.salute", "Salute to the judges", [P.second, both([-95, -12], [-100, -18], [40, 60], [-20, 80]), P.second], { beat: 0.75, tags: ["gesture", "opening", "ending"], note: "A raised hand to the panel at the start or the finish." }),
  phrase("expr.phrase.final-pose", "Final pose", [P.vArms], { beat: 1, tags: ["ending"], note: "Arms flung up and held: the music's last note.", trunks: [dir(180, 80)], heads: [dir(180, 80)] }),
  phrase("expr.phrase.opening-pose", "Opening pose", [P.crossChest], { beat: 1, tags: ["opening"], note: "Gathered and still, waiting for the first note.", trunks: [dir(0, 82)], heads: [dir(0, 60)] }),
];

/** Every expression: the holds, the carriages, the phrases and their mirrors (one-sided ones only). */
export const EXPRESSIONS: readonly Clip[] = [
  ...holds, ...carriage, ...phrasesLeft,
  ...phrasesLeft.filter(c => ["expr.phrase.spiral-reach", "expr.phrase.tango-frame", "expr.phrase.fosse", "expr.phrase.flamenco-desplante", "expr.phrase.salute", "expr.phrase.cha-cha-hips"].includes(c.id))
    .map(c => mirrorClip(c, `${c.id}.mirror`, `${c.name} (other side)`)),
  ...(["third", "fourthEnHaut", "arabesque1", "arabesque2", "attitudeArms", "oneHandHip", "reachUpOne"] as const)
    .map(k => mirrorClip(holds.find(h => h.id === `expr.hold.${k}`)!, `expr.hold.${k}.mirror`, `${HOLD_NAMES[k]} (other side)`)),
];
