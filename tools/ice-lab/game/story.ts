// game/story.ts — The Season's story: a first season, told by a coach.
//
// The owner's ask, 2026-11-05: "the career mode and its story". The design
// bible sets its shape (§ Game modes, The Season): club → regionals →
// nationals and on, a coach relationship, injury and form arcs, rivals who
// progress on their own; and its one rule of tone (§ Anti-goals): no failure
// shaming — "falls are ordinary in this sport; the game frames them as
// narrative". This is the first season of that arc, over the five events
// game/career.ts already runs, with the rivals game/rivals.ts already scores.
//
// Everything here is AUTHORED words. Nothing in it changes a score, a medal,
// an unlock or a training cost: coachAdvice() only reads the career and says
// what the coach would point at first.

import { CAREER_EVENTS, type ElementId } from "./career.ts";
import { RIVALS } from "./rivals.ts";
import { BODY_REGIONS } from "./wear.ts";
import { JUMP_FAMILIES } from "./training.ts";
import { STAT_NAMES, type StatName } from "../sim/profile.ts";

export const COACH = { name: "Mara Ellison", role: "your coach since the first morning" } as const;

/** Each rival's part in the story, by game/rivals.ts's name. */
export const RIVAL_PARTS: Record<(typeof RIVALS)[number]["name"], string> = {
  "Ansa Merrow": "Two years younger and afraid of nothing. Skates like the ice owes her a jump.",
  "Lio Tarrant": "The club's crowd favourite. Jumps first and asks the program later.",
  "Katya Vell": "Your rinkmate at six in the morning. Runs her edges in the far corner while you run yours.",
  "Noor Ashdown": "Hasn't missed an element all season. Skates like a metronome.",
  "Remi Castellan": "The name the whole sport is saying. Waiting at the championship.",
};

/** One event's chapter: before you skate it, and after, by how it went. */
export interface Chapter {
  /** The briefing: where you are, who is there, what the coach says. */
  before: string;
  gold: string;
  silver: string;
  bronze: string;
  /** The music ran out before the program did. */
  short: string;
}

export const SEASON = {
  title: "Your first season",
  opening: "Six in the morning at the community rink. The ice is new and nobody is on it but you, Katya Vell running her edges in the far corner, and Mara Ellison with a coffee she isn't drinking. \"Five competitions this season,\" she says. \"We start where everyone starts: can you stand on it.\"",
  /** After the championship, by where you finished the season's table. */
  finale: {
    champion: "Season champion, in your first year. On the drive home Mara finally shows you the word she wrote in her notebook on the first morning: Patient. \"Next season the ice gets bigger.\"",
    podium: "On the season's podium in your first year. Remi Castellan knows your name now, and so does everyone who was in that arena. Mara: \"Next season the ice gets bigger. So do we.\"",
    field: "A first season, finished. Mara: \"Every skater you watched this year started exactly where you did. Next season we go further.\"",
  },
} as const;

/** By game/career.ts's CAREER_EVENTS, in order. */
export const CHAPTERS: readonly Chapter[] = [
  {
    before: "A community rink, a panel of three, and a program you could skate in your sleep: glide, carve, finish. Mara: \"Nobody here is watching for jumps. They're watching whether you trust your feet.\"",
    gold: "Clean from the first push to the pose. Mara writes one word in her notebook and won't show you. Katya, from the boards: \"Show-off.\" She's smiling.",
    silver: "A fall, and up again before the panel could look away. Mara: \"That's the skill. The rest comes later.\"",
    bronze: "You finished. Some of it was skating and some of it was getting up, and both count. Mara: \"Finishing is the first medal everyone wins. Now we earn the others.\"",
    short: "The music ran out before the program did. Mara doesn't mention it until the very end of the drive home: \"Same time tomorrow.\"",
  },
  {
    before: "The club's first competition of the year. Lio Tarrant warms up with jumps nobody asked for, and the crowd loves him for it. Your program adds crossovers. Mara: \"Speed you make yourself. Let them watch him leave the ice; you show them how you cover it.\"",
    gold: "Every crossover on the beat, every edge held. Lio finds you afterwards: \"How are you that fast without jumping?\" Mara answers for you: \"Feet.\"",
    silver: "A fall in the crossovers, and you skated the rest of it as if it never happened. The club notices that kind of thing.",
    bronze: "Rough in the middle, steady at the end. Mara circles the crossover phrase on the protocol sheet. \"This week, this.\"",
    short: "Not all of it made it onto the ice today. Mara books the early session for the whole week.",
  },
  {
    before: "A district exhibition, and the first program with a jump in it. Ansa Merrow, two years younger and fearless, skates just before you. Mara: \"Load it, let it go, and land on the same quiet knees you glide on. That's all a jump is.\"",
    gold: "You left the ice turning and came back to it standing, and the district crowd makes the noise it saves for that. Ansa, afterwards: \"Teach me the landing?\"",
    silver: "One jump went down and the rest stayed up. Mara: \"Now you know it's possible. Possible is most of it.\"",
    bronze: "The jump wasn't there today. The skating around it was. Mara: \"Rust doesn't care how talented you are. Drill it.\"",
    short: "The showcase ended before your program did. Mara: \"Air is the last thing we trust. We'll get there.\"",
  },
  {
    before: "The regional arena: real seats, a real scoreboard, and Noor Ashdown, who hasn't missed an element all season. Your program adds a spin. Mara: \"Noor skates like a metronome. You don't need to beat her. You need to skate your own time.\"",
    gold: "Above Noor on the board, for the first time anyone can remember. She shakes your hand as if she means it. Somewhere in the stands: \"Castellan's going to hear about this.\"",
    silver: "The spin wandered and the jump held. The second-best skating in the building isn't nothing. Mara: \"The championship is a few weeks out. Plenty.\"",
    bronze: "A fall where it cost the most, and a finish that held together anyway. Mara: \"Your body will remember this one. Rest it, then we go again.\"",
    short: "The regional panel saw half a program. Mara: \"Find the element that stopped you. That's the next few weeks.\"",
  },
  {
    before: "The championship arena, the full routine, and Remi Castellan, the skater the whole sport has been talking about since spring. Two and a half minutes of everything you've learned. Mara, at the boards: \"You trust the ice now. Go and show them.\"",
    gold: "No falls. The arena is on its feet before the pose finishes, and Remi is the first one to the boards. Mara doesn't say anything at all, which is how you know.",
    silver: "Almost everything. One fall in two and a half minutes on the biggest ice of the season, and you got up into the next element. Remi: \"See you next season.\" It sounds like a promise.",
    bronze: "Not the program you planned: the one you finished, on championship ice. Mara: \"A first season is for learning what the ice will give you. You learned it.\"",
    short: "The music ended with the program unfinished. The crowd's silence is kind; the sport is like that. Mara: \"Again. As many times as it takes.\"",
  },
];

/** Readable stat names for the coach and the menus. */
export const STAT_TITLES: Record<StatName, string> = {
  strength: "Strength", spring: "Spring", edgeControl: "Edge control", balance: "Balance", stamina: "Stamina",
};

/** A chapter's words for a finished run, by game/career.ts's medal index (0 when the program ran out). */
export function outcome(event: number, medal: number, complete: boolean): string {
  const c = CHAPTERS[event];
  if (!c) return "";
  if (!complete) return c.short;
  return medal >= 3 ? c.gold : medal === 2 ? c.silver : c.bronze;
}

/** The season's last words, by your place in game/rivals.ts's season table. */
export function finale(place: number): string {
  return place === 1 ? SEASON.finale.champion : place <= 3 ? SEASON.finale.podium : SEASON.finale.field;
}

/** What the career knows that the coach reads: the snapshot's own fields. */
export interface CareerView {
  xp: number;
  weeks: number;
  unlocked: number;
  stats: Record<StatName, number>;
  costs: Record<StatName, number>;
  rust: Record<string, number>;
  wear: Record<string, number>;
  injured: Record<string, boolean>;
}

/** AUTHORED: rust a coach would send you to drill before a program with a jump in it; wear she would rest. */
export const RUSTY = 0.25, WORN = 0.5;

/**
 * What Mara points at first, at most two things, for the next event you can skate: an injury
 * before anything, then a lock, then rust before a program with a jump, then wear, then your
 * weakest stat you can afford. Reads the career; changes nothing.
 */
export function coachAdvice(c: CareerView): string[] {
  const out: string[] = [];
  const next = Math.min(c.unlocked, CAREER_EVENTS.length - 1);
  const event = CAREER_EVENTS[next];
  for (const r of BODY_REGIONS) if (c.injured[r.id]) out.push(`"Rest the ${r.title.toLowerCase()} before anything else. It costs you every time until you do."`);
  const jumps = (event.routine as readonly ElementId[]).includes("jump");
  if (out.length < 2 && jumps) {
    const rusty = JUMP_FAMILIES.map(f => ({ f, rust: c.rust[f.id] ?? 0 })).filter(x => x.rust >= RUSTY).sort((a, b) => b.rust - a.rust)[0];
    if (rusty) out.push(c.weeks >= 1
      ? `"Your ${rusty.f.title.toLowerCase()} have gone rusty, ${Math.round(rusty.rust * 100)}%. ${event.title} has a jump in it. A week of drills wins it back."`
      : `"Your ${rusty.f.title.toLowerCase()} have gone rusty. Skate for a better medal: it buys the weeks to drill them."`);
  }
  if (out.length < 2) {
    const worn = BODY_REGIONS.map(r => ({ r, wear: c.wear[r.id] ?? 0 })).filter(x => x.wear >= WORN && !c.injured[x.r.id]).sort((a, b) => b.wear - a.wear)[0];
    if (worn && c.weeks >= 1) out.push(`"Your ${worn.r.title.toLowerCase()} are carrying a lot of falls. A week's rest before it becomes an injury."`);
  }
  if (out.length < 2) {
    const weakest = [...STAT_NAMES].sort((a, b) => c.stats[a] - c.stats[b])[0];
    const cost = c.costs[weakest];
    // Level stats have no weakest: say so rather than pick one by list order.
    const level = STAT_NAMES.every(n => c.stats[n] === c.stats[weakest]);
    const what = level ? `Your stats are level, at ${c.stats[weakest]}.` : `${STAT_TITLES[weakest]} is your weakest, at ${c.stats[weakest]}.`;
    if (c.weeks < 1) out.push(`"No weeks left to train. Skate for a better medal: each tier buys two."`);
    else if (c.xp >= cost) out.push(level ? `"${what} Raise the one your next program leans on: a week and ${cost} XP."` : `"${what} Spend a week on it: ${cost} XP."`);
    else out.push(`"${what} A better medal pays the ${cost} XP to train ${level ? "one" : "it"}."`);
  }
  return out.slice(0, 2);
}

/** Who you'll meet at an event: the field's rivals, with their parts, best first. */
export function cast(): { name: string; part: string }[] {
  return [...RIVALS].sort((a, b) => b.level - a.level).map(r => ({ name: r.name, part: RIVAL_PARTS[r.name] }));
}
