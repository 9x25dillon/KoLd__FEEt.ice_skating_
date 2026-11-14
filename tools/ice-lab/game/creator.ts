// game/creator.ts — create a skater, and the Creation studio's shelves.
//
// The owner, 2026-11-11: "create a skater mode for career mode", and a creation
// mode "where costumes, routines, dance sequences and skate programs/tricks can
// be crafted and witnessed performed by the computer".
//
// A SkaterSheet is a created skater: a name, an origin (game/backstories.ts)
// whose stats the player may reshape point for point, a body, a style, a dance
// style and a costume. CareerState.fromSheet (game/career.ts) starts a career
// with it. The Studio holds what Creation mode makes besides costumes (those
// stay in game/atelier.ts's Wardrobe): created skaters, named programs, and
// dance sequences. Everything here is a save's shape and its checks; nothing
// in it moves the sim but what a sheet's stats and body bake through
// sim/profile.ts applyProfile, as any profile does.

import { makeProfile, overall, STAT_NAMES, type SkaterProfile, type Stats, type StatName } from "../sim/profile.ts";
import { STYLES } from "./styles.ts";
import { DANCE_STYLES } from "./motion/dance.ts";
import { ELEMENTS, type ElementId } from "./career.ts";
import { BUILDS, ORIGINS, ORIGIN_STAT, SHAPED_OVERALL, massFor, originById, type BuildId, type Origin } from "./backstories.ts";
import { SKINS } from "./appearance.ts";
import { MAX_DESIGNS } from "./atelier.ts";

export const NAME_LIMIT = 24;
/**
 * The body a build wears (games/ice-run-godot/assets/generated/<model>.glb, built by
 * tools/build_athlete.py --build=<id>), or null for the athlete herself: Athletic is her.
 * Presentation only: the sim's mass and height come from the sheet (massFor, heightM), not this.
 */
export function buildModel(build: BuildId): string | null {
  return build === "light" ? "skater-build-light" : build === "strong" ? "skater-build-strong" : null;
}
/** Heights a created skater may have, metres. AUTHORED: the cast's own span (1.50-1.68) and a little more. */
export const HEIGHT = { min: 1.48, max: 1.78, step: 0.01 } as const;
/** Shelf sizes. AUTHORED. */
export const MAX_SKATERS = 8, MAX_PROGRAMS = 8, MAX_DANCES = 8;
/** A program's length, as the Composer's (games/ice-run-godot/bridge/engine.mjs start). */
export const PROGRAM_MAX = 16;

export interface SkaterSheet {
  name: string;
  origin: string;
  heightM: number;
  build: BuildId;
  /** The origin's stats as the player reshaped them (tradePoint). */
  stats: Stats;
  /** game/styles.ts STYLES index, or -1 for none. */
  style: number;
  /** game/motion/dance.ts id, or "" for none. */
  dance: string;
  /** "preset:<SKINS id>" or "design:<Wardrobe slot>". */
  costume: string;
}

/** A fresh sheet from an origin, wearing the first preset. */
export function sheetFrom(origin: Origin, name = "New skater"): SkaterSheet {
  return {
    name, origin: origin.id, heightM: 1.6, build: origin.build, stats: { ...origin.stats },
    style: origin.style ? STYLES.findIndex(s => s.id === origin.style) : -1,
    dance: origin.dance, costume: `preset:${SKINS[0].id}`,
  };
}

export function sheetOverall(s: Pick<SkaterSheet, "stats">): number { return overall(makeProfile("", { stats: s.stats })); }

/**
 * Why one point can't move from `from` to `to`, or "" when it can. Points are
 * traded, never added: a stat stays within ORIGIN_STAT, and `overall` within
 * SHAPED_OVERALL, still under the second event's floor, so every created
 * skater meets the season's training gates as the neutral one does.
 */
export function tradeBlock(s: SkaterSheet, from: StatName, to: StatName): string {
  if (from === to) return "Pick two different stats.";
  if (s.stats[from] - 1 < ORIGIN_STAT.min) return `${from} is at its floor of ${ORIGIN_STAT.min}.`;
  if (s.stats[to] + 1 > ORIGIN_STAT.max) return `${to} is at its ceiling of ${ORIGIN_STAT.max}.`;
  const o = sheetOverall({ stats: { ...s.stats, [from]: s.stats[from] - 1, [to]: s.stats[to] + 1 } });
  if (o < SHAPED_OVERALL.min - 1e-9) return "That would leave your overall under where every skater starts.";
  if (o > SHAPED_OVERALL.max + 1e-9) return "That would start you past what the first weeks of training are for.";
  return "";
}
/** Move one point; returns the sheet unchanged when tradeBlock says no. */
export function tradePoint(s: SkaterSheet, from: StatName, to: StatName): SkaterSheet {
  if (tradeBlock(s, from, to)) return s;
  return { ...s, stats: { ...s.stats, [from]: s.stats[from] - 1, [to]: s.stats[to] + 1 } };
}

const costumeOk = (c: unknown): c is string => typeof c === "string" && (
  (c.startsWith("preset:") && SKINS.some(k => `preset:${k.id}` === c)) ||
  (/^design:\d+$/.test(c) && Number(c.slice(7)) < MAX_DESIGNS));

/** A sheet from a save or a page. Null when anything is off a list or a bound. */
export function parseSheet(value: unknown): SkaterSheet | null {
  const v = value as SkaterSheet | null;
  if (!v || typeof v !== "object" || typeof v.name !== "string") return null;
  const name = v.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, NAME_LIMIT);
  const origin = originById(v.origin);
  if (!name || !origin) return null;
  if (!(typeof v.heightM === "number" && v.heightM >= HEIGHT.min - 1e-9 && v.heightM <= HEIGHT.max + 1e-9)) return null;
  if (!BUILDS.some(b => b.id === v.build)) return null;
  if (!STAT_NAMES.every(n => Number.isInteger(v.stats?.[n]) && v.stats[n] >= ORIGIN_STAT.min && v.stats[n] <= ORIGIN_STAT.max)) return null;
  const o = sheetOverall(v);
  if (o < SHAPED_OVERALL.min - 1e-9 || o > SHAPED_OVERALL.max + 1e-9) return null;
  if (!(Number.isInteger(v.style) && (v.style === -1 || STYLES[v.style]))) return null;
  if (!(v.dance === "" || DANCE_STYLES.some(d => d.id === v.dance))) return null;
  if (!costumeOk(v.costume)) return null;
  const stats = Object.fromEntries(STAT_NAMES.map(n => [n, v.stats[n]])) as Stats;
  return { name, origin: origin.id, heightM: Math.round(v.heightM * 100) / 100, build: v.build, stats, style: v.style, dance: v.dance, costume: v.costume };
}

/** A sheet as the sim bakes it: its stats on its body, a fresh career's blade. */
export function sheetProfile(s: SkaterSheet, xp = 0): SkaterProfile {
  return makeProfile(s.name, { heightM: s.heightM, massKg: massFor(s.heightM, s.build), stats: { ...s.stats }, xp });
}

// ── the studio's shelves ───────────────────────────────────────────────────

/** A named program: the Composer's element list, kept. */
export interface Program { name: string; elements: ElementId[] }
/** A dance sequence: a style, the track it's danced to, and the seed game/motion/dance.ts choreograph() rolls. */
export interface DanceSequence { name: string; style: string; track: number; seed: number }

export function parseProgram(value: unknown): Program | null {
  const v = value as Program | null;
  if (!v || typeof v !== "object" || typeof v.name !== "string" || !Array.isArray(v.elements)) return null;
  const name = v.name.trim().slice(0, NAME_LIMIT);
  if (!name || v.elements.length < 1 || v.elements.length > PROGRAM_MAX) return null;
  if (!v.elements.every(e => typeof e === "string" && Object.hasOwn(ELEMENTS, e))) return null;
  return { name, elements: [...v.elements] };
}
export function parseDance(value: unknown, tracks: number): DanceSequence | null {
  const v = value as DanceSequence | null;
  if (!v || typeof v !== "object" || typeof v.name !== "string") return null;
  const name = v.name.trim().slice(0, NAME_LIMIT);
  if (!name || !DANCE_STYLES.some(d => d.id === v.style)) return null;
  if (!(Number.isInteger(v.track) && v.track >= 0 && v.track < tracks)) return null;
  if (!(Number.isInteger(v.seed) && v.seed >= 1 && v.seed <= 0x7fffffff)) return null;
  return { name, style: v.style, track: v.track, seed: v.seed };
}

/** Creation mode's saved work, besides costumes. Bad entries drop on restore; the rest stays. */
export class Studio {
  skaters: (SkaterSheet | null)[] = Array.from({ length: MAX_SKATERS }, () => null);
  programs: (Program | null)[] = Array.from({ length: MAX_PROGRAMS }, () => null);
  dances: (DanceSequence | null)[] = Array.from({ length: MAX_DANCES }, () => null);
  readonly tracks: number;
  constructor(tracks = 1) { this.tracks = tracks; }
  private put<T>(shelf: (T | null)[], slot: number, item: T | null): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= shelf.length || !item) return false;
    shelf[slot] = item;
    return true;
  }
  setSkater(slot: number, v: unknown) { return this.put(this.skaters, slot, parseSheet(v)); }
  setProgram(slot: number, v: unknown) { return this.put(this.programs, slot, parseProgram(v)); }
  setDance(slot: number, v: unknown) { return this.put(this.dances, slot, parseDance(v, this.tracks)); }
  /** Empty a slot: kept work is the player's to clear, one slot at a time. */
  clear(shelf: "skaters" | "programs" | "dances", slot: number): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this[shelf].length) return false;
    this[shelf][slot] = null;
    return true;
  }
  serialize() { return JSON.stringify({ version: 1, skaters: this.skaters, programs: this.programs, dances: this.dances }); }
  static restore(json: string | null, tracks = 1): Studio {
    const s = new Studio(tracks);
    try {
      const saved = JSON.parse(json ?? "null");
      if (saved?.version === 1) {
        const fill = <T>(into: (T | null)[], from: unknown, parse: (v: unknown) => T | null) =>
          Array.isArray(from) ? into.map((_, i) => from[i] == null ? null : parse(from[i])) : into;
        s.skaters = fill(s.skaters, saved.skaters, parseSheet);
        s.programs = fill(s.programs, saved.programs, parseProgram);
        s.dances = fill(s.dances, saved.dances, v => parseDance(v, tracks));
      }
    } catch { /* A missing or broken studio starts empty. */ }
    return s;
  }
}

/** For a menu: the origins with their overall, and the builds. */
export function creatorCatalog() {
  return {
    origins: ORIGINS.map(o => ({ ...o, overall: sheetOverall(o) })), builds: BUILDS, height: HEIGHT,
    limits: { name: NAME_LIMIT, skaters: MAX_SKATERS, programs: MAX_PROGRAMS, dances: MAX_DANCES, program: PROGRAM_MAX },
    statBounds: ORIGIN_STAT, overallBounds: SHAPED_OVERALL,
  };
}
