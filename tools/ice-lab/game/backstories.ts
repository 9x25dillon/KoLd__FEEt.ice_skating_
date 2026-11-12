// game/backstories.ts — where each skater comes from, and what that made of them.
//
// The owner, 2026-11-11: "write back stories for the characters that determine
// their style influence and statistics". A backstory here is not flavour text
// beside the numbers: it IS the numbers' reason. Each one carries
//   - stats      the five sim/profile.ts stats it left them with,
//   - body       height and build, which sim/profile.ts applyProfile bakes,
//   - style      the game/styles.ts style it leans toward,
//   - dance      the game/motion/dance.ts style their arms reach for,
// and the words that say why.
//
// Two kinds:
//   RIVAL_BACKSTORIES  the field (game/rivals.ts). Their stats give a rival a
//                      body to skate with where the computer skates them
//                      (arcade, exhibition, the Creation showcase). They never
//                      decide a medal: rivals.ts's measured BASELINE x level
//                      still does that, untouched. Each rival's `overall` is
//                      authored to sit at 50 + 20 x (level - 1), so the numbers
//                      tell the same story the scores do (test/backstories.test.ts).
//   ORIGINS            where YOUR skater comes from (game/creator.ts). Each
//                      origin trades points between stats, never adds them: its
//                      `overall` stays within ORIGIN_OVERALL of the neutral 50,
//                      so career.ts's EVENT_FLOORS ask every origin for the
//                      same training. An origin is a shape, not a head start.
//
// Every number here is AUTHORED (L3). No source says what six years of
// gymnastics buys in a jump. They are small on purpose, inside the stat curves'
// own spans, and are the levers a tuning pass moves.

import { makeProfile, overall, STAT_NAMES, type SkaterProfile, type Stats, type StatName } from "../sim/profile.ts";
import type { StyleId } from "./styles.ts";
import { RIVALS } from "./rivals.ts";
import { RIVAL_LOOKS } from "./cast.ts";

/** Build: a body-mass index, so mass follows height. AUTHORED, within an athletic skater's range. */
export const BUILDS = [
  { id: "light", name: "Light", bmi: 18.5, blurb: "Little to carry into the air; the push has less behind it." },
  { id: "athletic", name: "Athletic", bmi: 20, blurb: "The middle of the sport." },
  { id: "strong", name: "Strong", bmi: 21.5, blurb: "Holds speed against the air; the same legs lift more kilograms." },
] as const;
export type BuildId = (typeof BUILDS)[number]["id"];
export function massFor(heightM: number, build: BuildId): number {
  const b = BUILDS.find(x => x.id === build) ?? BUILDS[1];
  return Math.round(b.bmi * heightM * heightM * 10) / 10;
}

export interface Backstory {
  /** Where they come from, in a few words: the card's subtitle. */
  origin: string;
  /** The story, a paragraph, in the game's voice. */
  story: string;
  /** Why the numbers are what they are: one line a menu can show under the stats. */
  shaped: string;
  stats: Stats;
  build: BuildId;
  /** game/styles.ts STYLES id, or null for none. */
  style: Exclude<StyleId, "custom"> | null;
  /** game/motion/dance.ts DANCE_STYLES id. */
  dance: string;
  /** What they reach for in a program: game/career.ts ELEMENTS ids, for a menu and the arcade. */
  signature: readonly string[];
}

const st = (strength: number, spring: number, edgeControl: number, balance: number, stamina: number): Stats =>
  ({ strength, spring, edgeControl, balance, stamina });

/**
 * The field. Lio Tarrant's words name nobody's pronoun: whether Lio skates in
 * this women's field or a men's one is still the owner's call (Hand_off.md).
 */
export const RIVAL_BACKSTORIES: Record<(typeof RIVALS)[number]["name"], Backstory> = {
  "Ansa Merrow": {
    origin: "A frozen lake in the north",
    story: "Ansa learned to skate on a lake behind her grandparents' house, in hockey skates two sizes too big, chasing three older brothers who never once let her win. She jumped off snowbanks before anyone told her jumps had names. The club found her at eleven, already doing a single loop nobody had taught her, landing it on a toe pick she wasn't supposed to have.",
    shaped: "All spring and nerve. The edges came last and it shows in her entrances.",
    stats: st(52, 60, 36, 42, 45), build: "light", style: "power", dance: "swing",
    signature: ["jump", "combo"],
  },
  "Lio Tarrant": {
    origin: "A touring circus family",
    story: "Lio grew up in the back of a trailer between towns, the youngest of a family of acrobats, and learned to land before learning to walk properly. Skating came at nine, at a winter fair where the family's act was booked beside an ice rink. Lio was jumping by the end of the week. Six years of club coaching later, Lio still skates like there's a tent and a drum roll, and the crowd still gets one.",
    shaped: "Air and showmanship from the ring. Edges and balance were never what the act was about.",
    stats: st(58, 64, 38, 40, 44), build: "athletic", style: "power", dance: "broadway",
    signature: ["jump", "spin"],
  },
  "Katya Vell": {
    origin: "Her grandmother's figures",
    story: "Katya's grandmother skated compulsory figures for a country that no longer exists, and when the family moved she brought the habit with her: an hour of tracing circles on clean ice before a single jump, every morning since Katya was five. Katya complained for years. Now she's the one at the far end of the rink at six in the morning, running her edges while the ice is still new, and her grandmother still watches from the boards.",
    shaped: "Figures first: deep, quiet edges and patience. The jumps came later and lower.",
    stats: st(46, 42, 58, 54, 46), build: "athletic", style: "technician", dance: "character",
    signature: ["edge", "step"],
  },
  "Noor Ashdown": {
    origin: "A distance runner's lungs",
    story: "Noor ran cross-country until a knee said no, and took up skating because the physio said it was low impact. It wasn't, but she stayed. She brought a runner's habits: a training log for every session, the same warm-up to the second, and a program skated in her head a hundred times before she skates it once. She hasn't missed an element all season because she has never once improvised one.",
    shaped: "Built to last four minutes the same as the first ten seconds. Not the highest jump in the field; never the one that falls.",
    stats: st(50, 46, 56, 52, 58), build: "light", style: "endurance", dance: "neoclassical",
    signature: ["crossover", "spin"],
  },
  "Remi Castellan": {
    origin: "The ballet school that let her go",
    story: "Remi trained at a national ballet school until she was fourteen, when they told her she would be too tall for the corps. She took the line, the turnout and the épaulement to the ice instead, and the sport has been saying her name since spring. Judges say she skates the music before she skates the elements. Her jumps are good. Everything between them is what people come for.",
    shaped: "Line, balance and edges from the barre. Plenty of spring; less push than the power skaters.",
    stats: st(50, 54, 60, 64, 50), build: "light", style: "finesse", dance: "romantic",
    signature: ["spiral", "spin", "step"],
  },
  "Teodora Wynn": {
    origin: "Twice the national champion",
    story: "Teodora started at four, at a rink her mother managed, and has never been anywhere else in the sport but near the top of it. Two national titles, a Grand Prix medal, and an injury year she came back from stronger. She trains like the champion she is, and she is the only skater in the field who has nothing left to prove and skates as if she still does. Off the ice she teaches tango to the juniors on Sundays.",
    shaped: "Everything trained, nothing left to chance. The best of the field in every column.",
    stats: st(64, 62, 66, 64, 66), build: "athletic", style: "endurance", dance: "tango",
    signature: ["jump", "spin", "step", "combo"],
  },
};

/** A rival's `overall` aims at this, from their game/rivals.ts level. AUTHORED mapping. */
export function overallForLevel(level: number): number { return 50 + 20 * (level - 1); }

/** A rival as a skater the sim can bake: their backstory's stats on their model's height. */
export function rivalProfile(name: string): SkaterProfile | null {
  const b = (RIVAL_BACKSTORIES as Record<string, Backstory>)[name];
  if (!b) return null;
  // Lio has no model yet (game/cast.ts): the reference height until one is built.
  const heightM = (RIVAL_LOOKS as Record<string, { height: number | null }>)[name]?.height ?? 1.62;
  return makeProfile(name, { heightM, massKg: massFor(heightM, b.build), bladeWear: 0.1, stats: { ...b.stats } });
}

// ── your skater's origins ──────────────────────────────────────────────────

export interface Origin extends Backstory {
  id: string;
  /** Mara's first words to you, for the career's opening. */
  coach: string;
}

/** How far an origin's `overall` may sit from the neutral 50, upward only: EVENT_FLOORS stay the same ask. */
export const ORIGIN_OVERALL = { min: 50, max: 50.3 } as const;
/** Where a created skater may trade an origin to (game/creator.ts tradePoint): still under the second event's floor of 50.5. */
export const SHAPED_OVERALL = { min: 49.7, max: 50.3 } as const;
/** No origin or point trade takes a stat outside this. AUTHORED. */
export const ORIGIN_STAT = { min: 40, max: 60 } as const;
/** Mastery an origin's style starts at: one week of style drill (game/styles.ts STYLE_PER_WEEK). */
export const ORIGIN_STYLE_MASTERY = 0.25;

export const ORIGINS: readonly Origin[] = [
  {
    id: "rink-rat", origin: "Raised at the rink",
    story: "Your mother drove the ice resurfacer at the community rink, and you did your homework in the stands and your skating in the gaps between public sessions. Nobody coached you for years; you just watched the coaches coach everyone else, and copied the edges when the ice was empty.",
    shaped: "Thousands of hours of quiet edges. Nobody ever made you jump.",
    coach: "\"I've watched you on this ice for years. You already trust it. Now let's teach you to leave it.\"",
    stats: st(44, 44, 56, 52, 50), build: "athletic", style: "technician", dance: "waltz", signature: ["edge", "step"],
  },
  {
    id: "gymnast", origin: "A gymnast who switched",
    story: "Eight years of gymnastics, a vault you still dream about, and a wrist that ended it. You walked into the rink at twelve because the floor coach said figure skaters were the only other people who understood rotation. You were right about the rotation. Nobody warned you about the edges.",
    shaped: "Air sense and a strong core from the gym. The edges and the long programs are new.",
    coach: "\"You know how to turn in the air better than half the seniors here. On the ice you have to earn the takeoff first.\"",
    stats: st(50, 58, 44, 54, 45), build: "light", style: "power", dance: "jazz", signature: ["jump", "spin"],
  },
  {
    id: "ballet", origin: "From the ballet studio",
    story: "Ballet since you were four: barre every morning, pointe at eleven, and a teacher who said you moved like you were already somewhere else. You found the rink on a school trip and the glide felt like the rest of a phrase you'd been dancing your whole life without an end.",
    shaped: "Line, turnout and balance from the barre. The push and the jump are what the ice will have to give you.",
    coach: "\"You already know where your arms go. On the ice, they also have to keep you standing.\"",
    stats: st(42, 44, 54, 56, 50), build: "light", style: "finesse", dance: "classical", signature: ["spiral", "spin"],
  },
  {
    id: "hockey", origin: "A hockey kid",
    story: "Hockey from five to thirteen, the only one on the team who stayed after practice to try spins. You still skate like you're going to the net: hard crossovers, everything at speed. Your old teammates came to your first competition and banged on the glass when you landed.",
    shaped: "Push and legs from the boards. Toe picks are new, and the air is the strangest part.",
    coach: "\"You're the fastest skater in this club and you've never used a toe pick. Let's fix one of those.\"",
    stats: st(58, 46, 47, 50, 54), build: "strong", style: "power", dance: "street", signature: ["crossover", "jump"],
  },
  {
    id: "speed", origin: "A speed skater's lungs",
    story: "Long track every winter weekend, a family of speed skaters, and lungs built on 3,000-metre races. You came to figure skating because you liked the turns more than the straights. You can skate a four-minute program and still have breath for the bow.",
    shaped: "Legs and wind for days. Springing up, rather than forward, is the new thing.",
    coach: "\"Four minutes won't scare you. The first jump will. We start there.\"",
    stats: st(56, 44, 50, 46, 58), build: "athletic", style: "endurance", dance: "contemporary", signature: ["crossover", "glide"],
  },
  {
    id: "roller", origin: "The roller rink",
    story: "Friday nights at the roller disco your aunt ran: rhythm skating, backwards in a line to the music, and a crowd that cheered anyone who tried something. Ice is faster and colder and less forgiving, but the music still lives in your feet.",
    shaped: "Rhythm and balance on wheels. Ice edges cut deeper than wheels ever did.",
    coach: "\"You skate on the music already. Most people take years to learn that. Let's teach you the ice under it.\"",
    stats: st(48, 50, 46, 56, 51), build: "athletic", style: "finesse", dance: "latin", signature: ["step", "spin"],
  },
  {
    id: "late-starter", origin: "A late starter",
    story: "No background, no shortcuts. You stood on the ice for the first time later than anyone in this club, holding the boards, and came back the next morning, and the morning after that. Nobody ever had to ask you twice.",
    shaped: "Level everywhere: nothing given, nothing in the way.",
    coach: "\"Five competitions this season. We start where everyone starts: can you stand on it.\"",
    stats: st(50, 50, 50, 50, 50), build: "athletic", style: null, dance: "lyrical", signature: ["glide", "edge"],
  },
];

export function originById(id: unknown): Origin | undefined { return ORIGINS.find(o => o.id === id); }

/** An origin's `overall`, for the menu and the tests. */
export function originOverall(o: Pick<Origin, "stats">): number { return overall(makeProfile("", { stats: o.stats })); }

/** The stats an origin leans on and away from, biggest first: for a card's "+ Spring, - Edges" line. */
export function leanOf(stats: Stats): { up: StatName[]; down: StatName[] } {
  const by = (sign: number) => STAT_NAMES.filter(n => Math.sign(stats[n] - 50) === sign).sort((a, b) => sign * (stats[b] - stats[a]));
  return { up: by(1), down: by(-1) };
}
