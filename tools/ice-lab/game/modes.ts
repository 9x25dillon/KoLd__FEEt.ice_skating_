// game/modes.ts — the game's modes, and the two that are new: Arcade and Exhibition.
//
// The owner, 2026-11-11: "career mode is still the intended main game mode, but
// arcade mode and exhibition/free skate and creation mode". Career stays first
// and is the only mode that trains, wears or pays: everything else here reads a
// skater and never writes to a career.
//
//   Arcade      a ladder of the career's own programs, one rival to beat at
//               each, three lives. Pick anyone: your career skater, a created
//               skater or a rival. Targets are game/rivals.ts's rivalScore at
//               that event: measured BASELINE x level, the same numbers the
//               career's field shows. No XP, no wear, no rust.
//   Exhibition  a gala: skated, scored for show, placed against nobody (the
//               design bible's Gala / Exhibition: no required elements). Free
//               skate, the quiet ice the game always had, sits beside it.
//   Creation    game/creator.ts's studio and game/pilot.ts's showcase.
//
// AUTHORED: the ladder, the lives and the points.

import { CAREER_EVENTS, type CareerEvent, type ElementId } from "./career.ts";
import { RIVALS, rivalScore } from "./rivals.ts";
import { RIVAL_BACKSTORIES, rivalProfile } from "./backstories.ts";
import { STYLES, styleParams } from "./styles.ts";
import { applyProfile, type SkaterProfile } from "../sim/profile.ts";
import type { Params } from "../sim/params.ts";
import { buildModel, parseSheet, sheetProfile, type SkaterSheet } from "./creator.ts";

export const MODES = [
  { id: "career", title: "Career", tagline: "The main game", blurb: "Your skater, your coach, two seasons from a community rink to the Nationals Coliseum. Train, drill, rest, and earn every medal." },
  { id: "arcade", title: "Arcade", tagline: "Beat the field", blurb: "Six programs, six rivals, three lives. Pick any skater and climb the ladder to Teodora Wynn." },
  { id: "exhibition", title: "Exhibition & Free skate", tagline: "Skate for the crowd", blurb: "A gala under the lights with nobody judging, or quiet ice with nothing on it but you." },
  { id: "creation", title: "Creation", tagline: "Make it, then watch it", blurb: "Create skaters, costumes, programs and dance sequences, then watch the computer skate them." },
] as const;

// ── who can skate outside the career ──────────────────────────────────────

/** A skater a mode can put on the ice: their profile and style, and where they come from. */
export interface Character {
  /** "career", "created:<slot>" or "rival:<name>". */
  id: string;
  name: string;
  origin: string;
  profile: SkaterProfile;
  /** game/styles.ts index, -1 none; at `mastery`. */
  style: number;
  mastery: number;
  dance: string;
  costume: string | null;
  /** The body to wear (game/creator.ts buildModel): a created skater's build; null for the athlete. A rival wears their look's own. */
  model?: string | null;
}

/** Rivals skate their style fully drilled: they have had years. AUTHORED. */
export const RIVAL_MASTERY = 1;

export function rivalCharacter(name: string): Character | null {
  const b = (RIVAL_BACKSTORIES as Record<string, (typeof RIVAL_BACKSTORIES)[keyof typeof RIVAL_BACKSTORIES]>)[name];
  const profile = rivalProfile(name);
  if (!b || !profile) return null;
  return { id: `rival:${name}`, name, origin: b.origin, profile, style: b.style ? STYLES.findIndex(s => s.id === b.style) : -1,
    mastery: RIVAL_MASTERY, dance: b.dance, costume: `rival:${name}` };
}
export function createdCharacter(slot: number, sheet: SkaterSheet): Character | null {
  const s = parseSheet(sheet);
  if (!s) return null;
  return { id: `created:${slot}`, name: s.name, origin: s.origin, profile: sheetProfile(s), style: s.style, mastery: 0.25, dance: s.dance, costume: s.costume, model: buildModel(s.build) };
}
/** A character's params on a base set: profile baked, then style, as a career run's are. */
export function characterParams(base: Params, c: Character): Params {
  const p = applyProfile(base, c.profile);
  return c.style >= 0 ? styleParams(p, c.style, c.mastery) : p;
}

// ── arcade ─────────────────────────────────────────────────────────────────

/** The ladder: an event's program and its rival to beat. Season one's five, then Nationals. */
export const ARCADE_LADDER = [
  { event: 0, rival: "Ansa Merrow" },
  { event: 1, rival: "Lio Tarrant" },
  { event: 2, rival: "Katya Vell" },
  { event: 3, rival: "Noor Ashdown" },
  { event: 4, rival: "Remi Castellan" },
  { event: 8, rival: "Teodora Wynn" },
] as const;
export const ARCADE_LIVES = 3;
/** Points: a won round pays its score x 10, and its margin over the target x 20. AUTHORED. */
export const ROUND_POINTS = 10, MARGIN_POINTS = 20;
export const BOARD_SIZE = 10;

export interface ArcadeRound { event: number; rival: string; target: number; program: CareerEvent }

/** The rounds a character climbs: a rival never skates against themself. */
export function arcadeRounds(characterId: string): ArcadeRound[] {
  return ARCADE_LADDER.filter(r => characterId !== `rival:${r.rival}`).map(r => {
    const i = RIVALS.findIndex(x => x.name === r.rival);
    const e = CAREER_EVENTS[r.event];
    return { event: r.event, rival: r.rival, target: rivalScore(i, r.event), program: { ...e, id: `arcade-${e.id}` } };
  });
}

export interface RoundResult { won: boolean; points: number; lifeLost: boolean; over: boolean; cleared: boolean }

/** One climb up the ladder. Pure: a client feeds it each round's segment score. */
export class ArcadeRun {
  readonly rounds: ArcadeRound[];
  round = 0;
  lives = ARCADE_LIVES;
  points = 0;
  log: { event: number; score: number; won: boolean }[] = [];
  readonly character: string;
  constructor(character: string) { this.character = character; this.rounds = arcadeRounds(character); }
  get current(): ArcadeRound | undefined { return this.rounds[this.round]; }
  get over() { return this.lives <= 0 || this.round >= this.rounds.length; }
  get cleared() { return this.round >= this.rounds.length; }
  /** A finished program: `complete` when it ran its whole time. */
  record(score: number, complete: boolean): RoundResult {
    const r = this.current;
    if (!r || this.over) return { won: false, points: 0, lifeLost: false, over: true, cleared: this.cleared };
    const won = complete && Number.isFinite(score) && score > r.target;
    let points = 0;
    if (won) {
      points = Math.round(score * ROUND_POINTS + (score - r.target) * MARGIN_POINTS);
      this.points += points;
      this.round++;
    } else this.lives--;
    this.log.push({ event: r.event, score, won });
    return { won, points, lifeLost: !won, over: this.over, cleared: this.cleared };
  }
}

export interface BoardEntry { name: string; character: string; points: number; rounds: number; cleared: boolean }

/** The arcade's high scores, best first. */
export class ArcadeBoard {
  entries: BoardEntry[] = [];
  /** Where a run would place, 1-based, or 0 when it would not make the board. */
  placeOf(points: number): number {
    const at = this.entries.findIndex(e => points > e.points);
    const place = at < 0 ? this.entries.length + 1 : at + 1;
    return place <= BOARD_SIZE ? place : 0;
  }
  add(run: ArcadeRun, name: string): number {
    if (run.points <= 0) return 0;
    const place = this.placeOf(run.points);
    if (!place) return 0;
    this.entries.splice(place - 1, 0, { name: name.trim().slice(0, 24) || "Skater", character: run.character, points: run.points, rounds: run.round, cleared: run.cleared });
    this.entries = this.entries.slice(0, BOARD_SIZE);
    return place;
  }
  serialize() { return JSON.stringify({ version: 1, entries: this.entries }); }
  static restore(json: string | null): ArcadeBoard {
    const b = new ArcadeBoard();
    try {
      const saved = JSON.parse(json ?? "null");
      if (saved?.version === 1 && Array.isArray(saved.entries))
        b.entries = saved.entries.filter((e: BoardEntry) => e && typeof e.name === "string" && typeof e.character === "string" &&
          Number.isSafeInteger(e.points) && e.points > 0 && Number.isInteger(e.rounds) && typeof e.cleared === "boolean")
          .sort((x: BoardEntry, y: BoardEntry) => y.points - x.points).slice(0, BOARD_SIZE);
    } catch { /* A missing board starts empty. */ }
    return b;
  }
}

// ── exhibition ─────────────────────────────────────────────────────────────

/** The gala's own program (game/career.ts's last event), when the player brings none. */
export const GALA_ROUTINE: readonly ElementId[] = CAREER_EVENTS.find(e => e.exhibition)?.routine ?? ["glide", "edge", "spin", "pose"];
export const EXHIBITION_SECONDS = 180;

/** An exhibition as an event: no floor, no field, no medal that pays. */
export function exhibitionEvent(elements: readonly ElementId[] | null, title = "Exhibition"): CareerEvent {
  return { id: "exhibition", title, venue: "Under the lights · nobody judging", seconds: EXHIBITION_SECONDS,
    routine: elements && elements.length ? [...elements] : [...GALA_ROUTINE], discipline: "women", segment: "short", exhibition: true };
}
