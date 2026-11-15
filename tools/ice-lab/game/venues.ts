// game/venues.ts — where you skate: a catalogue of rinks, each its own room around the same ice.
//
// PRESENTATION ONLY. Every venue stands around the same physical sheet (game/rink.ts RINK)
// and nothing here reaches sim/: the ice, the boards and the solver are identical in all
// of them. What changes is the room — how many people are in the seats, what the banners
// say, whether there is a roof, and how it is lit.
//
// EVERY NUMBER BELOW IS AUTHORED. Crowd fractions, colours and light levels are art
// direction, not measurements. Light levels are MULTIPLIERS on the Grand Prix arena as the
// clients built it before this file (Northlight: games/ice-run-godot/scripts/arena.gd,
// games/ice-run-unreal/Source/IceRun/IceRink.cpp), so each client keeps its own units
// (Godot energies, Unreal candelas) and "grand-prix" reproduces that look exactly.
//
// A client receives the whole catalogue once (the bridge's catalog().venues) and the
// venue in use with every snapshot (snapshot().venue), and builds the room from it.

import { CAREER_EVENTS } from "./career.ts";

export type Lighting = "dawn" | "club" | "arena" | "broadcast" | "night" | "gala";

/** How a venue is lit. Colours are "rrggbb" hex. Scales multiply the Grand Prix arena's levels. AUTHORED. */
export interface VenueLight {
  /** What you see past the stands (indoors) or overhead (outdoors). */
  sky: string;
  ambient: string;
  ambientScale: number;
  fog: string;
  fogScale: number;
  /** The directional key light: the arena's main light, the dawn windows, the moon. */
  key: string;
  keyScale: number;
  /** Fraction of the roof's fixture grid that is lit, 0..1, chosen evenly across the grid. */
  fixtures: number;
  fixtureColor: string;
  fixtureScale: number;
  /** Exposure, as a multiplier on the arena's. */
  exposure: number;
  /** Coloured spot washes on the ice (gala, broadcast accents); empty for none. */
  wash: readonly string[];
  /** Warm bulbs strung along the boards (the outdoor rink); 0 for none, else their colour's strength. */
  stringLights: number;
}

export interface Venue {
  id: string;
  name: string;
  /** One line, for a menu or a loading card. */
  description: string;
  /** Fraction of seats filled, 0..1. AUTHORED. */
  crowd: number;
  /** On the hanging banners ("\n" breaks a line). Empty: no banners. */
  banner: string;
  /** Along the stands' fascia. A column stands at its centre, so the text splits there on a
 *  wide "     /     " with balanced halves, as the Grand Prix's always has. */
  fascia: string;
  lighting: Lighting;
  /** No roof, no back walls, no centre-hung board: the sky. */
  outdoor: boolean;
  /** The Kiss & Cry booth is dressed rinkside. */
  kissAndCry: boolean;
  light: VenueLight;
}

export const VENUES: readonly Venue[] = [
  {
    id: "dawn-practice", name: "Practice rink at dawn",
    description: "Empty stands and work lights; the resurfacer's lines are still wet.",
    crowd: 0, banner: "", fascia: "PUBLIC SKATE     /     LEARN TO SKATE", lighting: "dawn", outdoor: false, kissAndCry: false,
    light: { sky: "1a2230", ambient: "9fb4cc", ambientScale: 0.7, fog: "3b4a5c", fogScale: 0.6, key: "ffe3c8", keyScale: 0.5,
      fixtures: 0.2, fixtureColor: "f4f7ff", fixtureScale: 0.85, exposure: 0.95, wash: [], stringLights: 0 },
  },
  {
    id: "club", name: "Riverside club rink",
    description: "Club banners, parents in the front rows, a coffee urn somewhere behind the boards.",
    crowd: 0.12, banner: "RIVERSIDE\nFSC", fascia: "RIVERSIDE CLUB     /     FIGURE SKATING", lighting: "club", outdoor: false, kissAndCry: false,
    light: { sky: "1c1a1f", ambient: "d8c7b0", ambientScale: 0.9, fog: "40382f", fogScale: 0.7, key: "ffe2bc", keyScale: 0.8,
      fixtures: 0.6, fixtureColor: "fff1dc", fixtureScale: 0.9, exposure: 1.0, wash: [], stringLights: 0 },
  },
  {
    // Today's look, unchanged: every scale is 1 and the crowd is the 86% the stands always seated.
    id: "grand-prix", name: "Northlight Arena",
    description: "The Grand Prix: banners in the rafters and a full house that reacts to every landing.",
    crowd: 0.86, banner: "GRAND\nPRIX", fascia: "E D G E W O R K     /     GRAND PRIX", lighting: "arena", outdoor: false, kissAndCry: false,
    light: { sky: "101724", ambient: "bacddd", ambientScale: 1, fog: "34465b", fogScale: 1, key: "e5efff", keyScale: 1,
      fixtures: 1, fixtureColor: "eaf2ff", fixtureScale: 1, exposure: 1, wash: [], stringLights: 0 },
  },
  {
    id: "championship", name: "Nationals Coliseum",
    description: "Six thousand seats, broadcast lighting, and the Kiss & Cry dressed rinkside.",
    crowd: 0.97, banner: "NATIONALS", fascia: "THE NATIONALS     /     CHAMPIONSHIP", lighting: "broadcast", outdoor: false, kissAndCry: true,
    light: { sky: "0b1020", ambient: "c2d4ee", ambientScale: 0.85, fog: "2c3d58", fogScale: 1.1, key: "f2f6ff", keyScale: 1.2,
      fixtures: 1, fixtureColor: "f6f9ff", fixtureScale: 1.35, exposure: 1.1, wash: ["3d6bff"], stringLights: 0 },
  },
  {
    id: "outdoor-night", name: "Lakeside rink at night",
    // No crowd: the clients' spectators are seated figures, and outdoors there are no stands to seat them on.
    description: "Outdoors under a dark sky and the pines, bulbs strung along the boards, the whole rink to yourself.",
    crowd: 0, banner: "", fascia: "LAKESIDE WINTER RINK", lighting: "night", outdoor: true, kissAndCry: false,
    light: { sky: "060a14", ambient: "6a7ea8", ambientScale: 0.55, fog: "1a2438", fogScale: 0.5, key: "b9c8ff", keyScale: 0.45,
      fixtures: 0, fixtureColor: "ffd9a0", fixtureScale: 0, exposure: 1.05, wash: [], stringLights: 1 },
  },
  {
    id: "gala", name: "Exhibition gala",
    description: "Spotlights and a coloured wash on the ice; nobody is judging.",
    crowd: 0.9, banner: "GALA", fascia: "EXHIBITION     /     GALA NIGHT", lighting: "gala", outdoor: false, kissAndCry: false,
    light: { sky: "07060d", ambient: "8f86b8", ambientScale: 0.35, fog: "2a1f3d", fogScale: 1.3, key: "c9b8ff", keyScale: 0.35,
      fixtures: 0.25, fixtureColor: "fff4e6", fixtureScale: 1.6, exposure: 1.0, wash: ["8a4dff", "ff4d9a", "3dd6ff"], stringLights: 0 },
  },
];

export const DEFAULT_VENUE = "grand-prix";

const BY_ID = new Map(VENUES.map(v => [v.id, v]));
export function venueById(id: string): Venue | undefined { return BY_ID.get(id); }

/** Which venue each career event is skated in, by event id. AUTHORED. */
export const EVENT_VENUE: Readonly<Record<string, string>> = {
  "first-ice": "dawn-practice",
  "club-debut": "club",
  "jump-showcase": "club",
  "regional": "grand-prix",
  "finale": "championship",
  "sectionals": "grand-prix",
  "autumn-trophy": "grand-prix",
  "northern-cup": "grand-prix",
  "nationals": "championship",
  "gala": "gala",
};

/** Training happens on practice ice; free skating is outdoors; shows are galas. AUTHORED. */
export const MODE_VENUE: Readonly<Record<string, string>> = {
  free: "outdoor-night",
  rookie: "dawn-practice",
  lesson: "dawn-practice",
  armdrill: "dawn-practice",
  timed: "dawn-practice",
  composer: "dawn-practice",
  exhibition: "gala",
  showcase: "gala",
  pairs: "grand-prix",
};

/**
 * The venue a run is skated in. Career and arcade skate their event's venue (an arcade
 * round is a career event), given as its CAREER_EVENTS index or its id; every other mode
 * has its own. Anything unknown gets the arena.
 */
export function venueFor(mode: string, event: number | string | null = null): Venue {
  if ((mode === "career" || mode === "arcade") && event !== null) {
    const evId = typeof event === "number" ? CAREER_EVENTS[event]?.id : event;
    const id = evId ? EVENT_VENUE[evId] : undefined;
    if (id) return BY_ID.get(id)!;
  }
  return BY_ID.get(MODE_VENUE[mode] ?? DEFAULT_VENUE) ?? BY_ID.get(DEFAULT_VENUE)!;
}
