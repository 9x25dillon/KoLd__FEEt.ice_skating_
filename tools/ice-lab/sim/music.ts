// tools/ice-lab/sim/music.ts — the rhythm layer, design-bible.md §2.1, §2.6, §5.2.
//
// Two mechanics, two different grains. Every CROSSOVER PUSH lands in a beat
// window: on tempo it gets full impulse, off it gets `musicMissedPushScale`
// (the bible's 45%) and an audible chop (§2.6, "Each push has a beat
// window"). Separately, a TURN or a JUMP LANDING that lands within
// `musicAccentWindow` (the bible's ±80 ms) of a marked ACCENT earns musical
// credit, phrase-weighted (§2.1, §2.6).
//
// Accents are sparser than beats — hand-authored per track in the shipped
// game (§5.2: beats, downbeats, phrase boundaries, accent markers). This rig
// has no authored tracks, so every DOWNBEAT doubles as an accent until one
// does; a phrase's last downbeat is its climax, worth the bible's "roughly
// three times an arbitrary beat". Replace this the day a real beat grid
// exists — the query surface (onBeat / onAccent / accentCredit) does not
// need to change, only what feeds it.
//
// Pure functions of tick and Params: no wall clock, no engine dependency, so
// a replay lands on the same beat every time it is played back.

import type { Params } from "./params.ts";
import { SIM_DT } from "./params.ts";

const period = (bpm: number): number => 60 / bpm;

/**
 * Signed seconds from `tick`'s clock time to the nearest multiple of `span`
 * after `offset`; negative is early. `offset` is the track's lead-in
 * (`musicOffset`) — before it, every tick is maximally off the grid, not
 * accidentally on it at tick zero.
 */
function offsetWithin(span: number, offset: number, tick: number): number {
  const phase = (((tick * SIM_DT - offset) % span) + span) % span;
  return phase > span / 2 ? phase - span : phase;
}

/** Seconds to the nearest beat, signed. */
export function beatOffset(p: Params, tick: number): number {
  return offsetWithin(period(p.musicBpm), p.musicOffset, tick);
}

/** Within the crossover push's beat window (§2.6): full impulse when true. */
export function onBeat(p: Params, tick: number): boolean {
  return Math.abs(beatOffset(p, tick)) <= p.musicBeatWindow;
}

/** Seconds to the nearest accent — this rig's downbeats — signed. */
export function accentOffset(p: Params, tick: number): number {
  return offsetWithin(period(p.musicBpm) * p.musicBeatsPerBar, p.musicOffset, tick);
}

/** Within the accent window (§2.1, §2.6: ±80 ms) of a marked accent. */
export function onAccent(p: Params, tick: number): boolean {
  return Math.abs(accentOffset(p, tick)) <= p.musicAccentWindow;
}

/** 3 on a phrase's climax downbeat, else 1 (§2.6: "roughly three times an arbitrary beat"). */
export function phraseWeight(p: Params, tick: number): number {
  const barPeriod = period(p.musicBpm) * p.musicBeatsPerBar;
  const bar = Math.round((tick * SIM_DT - p.musicOffset) / barPeriod);
  return ((bar % p.musicBarsPerPhrase) + p.musicBarsPerPhrase) % p.musicBarsPerPhrase === p.musicBarsPerPhrase - 1 ? 3 : 1;
}

/** Musical credit for landing an accent-worthy moment (a turn's cusp, a jump's landing) at this tick; 0 if missed. */
export function accentCredit(p: Params, tick: number): number {
  return onAccent(p, tick) ? phraseWeight(p, tick) : 0;
}
